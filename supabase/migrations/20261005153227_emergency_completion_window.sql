BEGIN;
CREATE TABLE public.emergency_completion_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  emergency_id uuid NOT NULL REFERENCES public.emergency_requests(id),
  phase text NOT NULL CHECK (phase IN ('visit','repair')),
  owner_id uuid NOT NULL REFERENCES public.users(id),
  provider_id uuid NOT NULL REFERENCES public.users(id),
  payment_intent_id text NOT NULL UNIQUE,
  amount_cents integer NOT NULL CHECK (amount_cents >= 50),
  declared_at timestamptz NOT NULL DEFAULT now(),
  due_at timestamptz NOT NULL DEFAULT now() + interval '48 hours',
  reminder_at timestamptz,
  approved_at timestamptz,
  disputed_at timestamptz,
  dispute_reason text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','paid','disputed','payment_required')),
  claim_token uuid,
  claimed_at timestamptz,
  paid_at timestamptz,
  payment_error text,
  finish_emergency boolean NOT NULL DEFAULT false,
  UNIQUE(emergency_id, phase)
);
ALTER TABLE public.emergency_completion_steps ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.emergency_completion_steps FROM anon, authenticated;
GRANT SELECT ON public.emergency_completion_steps TO authenticated;
GRANT ALL ON public.emergency_completion_steps TO service_role;
CREATE POLICY completion_participants ON public.emergency_completion_steps FOR SELECT TO authenticated
  USING ((select auth.uid()) IN (owner_id,provider_id) OR public.is_admin());
CREATE INDEX completion_due ON public.emergency_completion_steps(status,due_at);

-- Service-only API: the Edge Function supplies a verified auth user, never a body user id.
CREATE FUNCTION public.emergency_completion_action(p_emergency uuid,p_phase text,p_action text,p_actor uuid,
  p_payment text DEFAULT NULL,p_amount integer DEFAULT NULL,p_reason text DEFAULT NULL,p_finish boolean DEFAULT false)
RETURNS public.emergency_completion_steps LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE e public.emergency_requests; s public.emergency_completion_steps; payment text;
BEGIN
  SELECT * INTO e FROM public.emergency_requests WHERE id=p_emergency FOR UPDATE;
  IF e.id IS NULL OR p_actor IS NULL OR p_actor NOT IN (e.owner_id,e.accepted_provider_id) THEN
    RAISE EXCEPTION 'Accès interdit'; END IF;
  IF p_phase NOT IN ('visit','repair') THEN RAISE EXCEPTION 'Étape invalide'; END IF;
  SELECT * INTO s FROM public.emergency_completion_steps WHERE emergency_id=e.id AND phase=p_phase FOR UPDATE;
  IF p_action='declare' THEN
    IF p_actor IS DISTINCT FROM e.accepted_provider_id THEN RAISE EXCEPTION 'Prestataire requis'; END IF;
    IF s.id IS NOT NULL THEN
      IF p_finish AND p_phase='visit' AND e.status IN ('on_site','quote_refused') THEN
        UPDATE public.emergency_completion_steps SET finish_emergency=true WHERE id=s.id RETURNING * INTO s;
      END IF;
      RETURN s;
    END IF;
    IF p_phase='visit' AND e.status NOT IN ('on_site','quote_sent','quote_submitted','quote_refused','quote_accepted','in_progress') THEN
      RAISE EXCEPTION 'Visite non commencée'; END IF;
    IF p_phase='repair' AND e.status NOT IN ('quote_accepted','in_progress') THEN RAISE EXCEPTION 'Réparation non acceptée'; END IF;
    IF p_phase='repair' AND NOT EXISTS (SELECT 1 FROM public.emergency_completion_steps WHERE emergency_id=e.id AND phase='visit') THEN
      RAISE EXCEPTION 'Déclarez d’abord la fin du diagnostic'; END IF;
    payment := CASE WHEN p_phase='visit' THEN e.displacement_payment_id ELSE e.quote_payment_id END;
    IF payment IS NULL OR payment IS DISTINCT FROM p_payment THEN RAISE EXCEPTION 'Paiement non confirmé'; END IF;
    INSERT INTO public.emergency_completion_steps(emergency_id,phase,owner_id,provider_id,payment_intent_id,amount_cents,finish_emergency)
      VALUES(e.id,p_phase,e.owner_id,e.accepted_provider_id,p_payment,p_amount,p_phase='repair' OR p_finish) RETURNING * INTO s;
    IF EXISTS (SELECT 1 FROM public.reclamations WHERE emergency_id=e.id AND user_id IN (e.owner_id,e.accepted_provider_id) AND status NOT IN ('resolved','closed')) THEN
      UPDATE public.emergency_completion_steps SET status='disputed',disputed_at=now(),dispute_reason='Réclamation déjà ouverte pour cette urgence' WHERE id=s.id RETURNING * INTO s;
    END IF;
    PERFORM public._send_push(e.owner_id,'Validation : ' || CASE WHEN p_phase='visit' THEN 'diagnostic' ELSE 'réparation' END,
      CASE WHEN s.disputed_at IS NOT NULL THEN 'Étape terminée déclarée ; une réclamation bloque le paiement automatique.'
      ELSE 'Le prestataire a déclaré cette étape terminée. Validez ou signalez un problème. Sans réponse, le paiement sera déclenché dans 48 heures.' END,e.id,'emergency');
  ELSIF p_action='approve' THEN
    IF p_actor IS DISTINCT FROM e.owner_id OR s.id IS NULL THEN RAISE EXCEPTION 'Validation propriétaire requise'; END IF;
    IF s.disputed_at IS NOT NULL THEN RAISE EXCEPTION 'Contestation en cours'; END IF;
    UPDATE public.emergency_completion_steps SET approved_at=coalesce(approved_at,now())
      WHERE id=s.id RETURNING * INTO s;
  ELSIF p_action='dispute' THEN
    IF s.id IS NULL OR length(trim(coalesce(p_reason,''))) NOT BETWEEN 5 AND 2000 THEN RAISE EXCEPTION 'Décrivez le problème (5 à 2000 caractères)'; END IF;
    UPDATE public.emergency_completion_steps SET disputed_at=coalesce(disputed_at,now()),
      dispute_reason=p_reason,status='disputed' WHERE id=s.id RETURNING * INTO s;
    PERFORM public._send_push(CASE WHEN p_actor=e.owner_id THEN e.accepted_provider_id ELSE e.owner_id END,
      'Contestation : ' || CASE WHEN p_phase='visit' THEN 'diagnostic' ELSE 'réparation' END,'Un problème a été signalé. La validation automatique est suspendue ; le support doit examiner le dossier.',e.id,'emergency');
  ELSE RAISE EXCEPTION 'Action invalide'; END IF;
  RETURN s;
END; $$;
REVOKE ALL ON FUNCTION public.emergency_completion_action(uuid,text,text,uuid,text,integer,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.emergency_completion_action(uuid,text,text,uuid,text,integer,text,boolean) TO service_role;

CREATE FUNCTION public.settle_emergency_completion(p_id uuid,p_payment text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE s public.emergency_completion_steps;
BEGIN
  SELECT * INTO s FROM public.emergency_completion_steps WHERE id=p_id FOR UPDATE;
  IF s.id IS NULL OR s.payment_intent_id IS DISTINCT FROM p_payment THEN RAISE EXCEPTION 'Paiement incohérent'; END IF;
  UPDATE public.emergency_completion_steps SET paid_at=coalesce(paid_at,now()),
    status=CASE WHEN disputed_at IS NULL THEN 'paid' ELSE 'disputed' END,payment_error=NULL WHERE id=s.id;
  IF s.paid_at IS NULL THEN
    PERFORM public._send_push(s.owner_id,'Paiement confirmé : ' || CASE WHEN s.phase='visit' THEN 'diagnostic' ELSE 'réparation' END,
      'Le paiement de cette étape est confirmé. Vos recours restent ouverts ; une contestation existante reste à examiner.',s.emergency_id,'emergency');
    PERFORM public._send_push(s.provider_id,'Paiement confirmé : ' || CASE WHEN s.phase='visit' THEN 'diagnostic' ELSE 'réparation' END,
      'Le paiement a été encaissé. La disponibilité et le virement des fonds suivent les délais Stripe.',s.emergency_id,'emergency');
  END IF;
  IF EXISTS (SELECT 1 FROM public.emergency_completion_steps WHERE emergency_id=s.emergency_id AND finish_emergency AND paid_at IS NOT NULL)
    AND s.disputed_at IS NULL AND NOT EXISTS (
    SELECT 1 FROM public.emergency_completion_steps WHERE emergency_id=s.emergency_id AND id<>s.id AND (paid_at IS NULL OR disputed_at IS NOT NULL)
  ) THEN
    UPDATE public.emergency_requests SET status='completed',completed_at=now()
      WHERE id=s.emergency_id AND status NOT IN ('cancelled','refunded','completed')
        AND (status IN ('on_site','quote_refused') OR EXISTS (SELECT 1 FROM public.emergency_completion_steps WHERE emergency_id=s.emergency_id AND phase='repair' AND paid_at IS NOT NULL));
  END IF;
END; $$;
REVOKE ALL ON FUNCTION public.settle_emergency_completion(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.settle_emergency_completion(uuid,text) TO service_role;

CREATE FUNCTION public.claim_emergency_completion(p_id uuid,p_token uuid)
RETURNS SETOF public.emergency_completion_steps LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
  UPDATE public.emergency_completion_steps SET status='processing',claim_token=p_token,claimed_at=now()
  WHERE id=p_id AND disputed_at IS NULL AND paid_at IS NULL
    AND EXISTS (SELECT 1 FROM public.emergency_requests e WHERE e.id=emergency_id AND e.status NOT IN ('cancelled','refunded')
      AND e.owner_id=emergency_completion_steps.owner_id AND e.accepted_provider_id=emergency_completion_steps.provider_id
      AND CASE WHEN phase='visit' THEN e.displacement_payment_id ELSE e.quote_payment_id END=payment_intent_id)
    AND (approved_at IS NOT NULL OR due_at<=now())
    AND (status='pending' OR (status='processing' AND claimed_at<now()-interval '5 minutes'))
  RETURNING *;
$$;
REVOKE ALL ON FUNCTION public.claim_emergency_completion(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_emergency_completion(uuid,uuid) TO service_role;

CREATE FUNCTION public.remind_emergency_completions()
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE s public.emergency_completion_steps;
BEGIN
  FOR s IN UPDATE public.emergency_completion_steps SET reminder_at=now()
    WHERE status='pending' AND approved_at IS NULL AND disputed_at IS NULL AND reminder_at IS NULL
      AND declared_at<=now()-interval '24 hours' AND due_at>now() RETURNING *
  LOOP
    PERFORM public._send_push(s.owner_id,'Rappel de validation : ' || CASE WHEN s.phase='visit' THEN 'diagnostic' ELSE 'réparation' END,
      'Validez la prestation ou signalez un problème avant le ' || to_char(s.due_at AT TIME ZONE 'Europe/Paris','DD/MM/YYYY HH24:MI') || ' (heure de Paris). Sans réponse, le paiement sera déclenché.',s.emergency_id,'emergency');
  END LOOP;
END; $$;
REVOKE ALL ON FUNCTION public.remind_emergency_completions() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.remind_emergency_completions() TO service_role;

CREATE FUNCTION public.freeze_completion_on_complaint() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NEW.emergency_id IS NOT NULL AND NEW.status NOT IN ('resolved','closed') THEN
    UPDATE public.emergency_completion_steps SET status='disputed',disputed_at=coalesce(disputed_at,now()),dispute_reason=left(NEW.description,2000)
    WHERE emergency_id=NEW.emergency_id AND NEW.user_id IN (owner_id,provider_id);
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.freeze_completion_on_complaint() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER freeze_completion_on_complaint AFTER INSERT ON public.reclamations
FOR EACH ROW EXECUTE FUNCTION public.freeze_completion_on_complaint();

-- Do not let old clients mark an unpaid emergency completed directly.
CREATE FUNCTION public.guard_emergency_completion() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF current_user NOT IN ('postgres','service_role') AND NEW.status='completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
    RAISE EXCEPTION 'Utilisez la validation des étapes' USING errcode='42501';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER guard_emergency_completion BEFORE UPDATE ON public.emergency_requests
FOR EACH ROW EXECUTE FUNCTION public.guard_emergency_completion();
REVOKE ALL ON FUNCTION public.guard_emergency_completion() FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.freeze_completion_on_cancel() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NEW.status IN ('cancelled','refunded') AND OLD.status IS DISTINCT FROM NEW.status THEN
    UPDATE public.emergency_completion_steps SET status='disputed',disputed_at=coalesce(disputed_at,now()),dispute_reason=coalesce(dispute_reason,'Urgence annulée ou remboursée — examen du support nécessaire')
      WHERE emergency_id=NEW.id AND paid_at IS NULL;
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.freeze_completion_on_cancel() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER freeze_completion_on_cancel AFTER UPDATE ON public.emergency_requests
FOR EACH ROW EXECUTE FUNCTION public.freeze_completion_on_cancel();

-- Store project_url and completion_worker_key in Vault before enabling the job.
-- completion_worker_key must match COMPLETION_WORKER_KEY in the Edge Function.
CREATE FUNCTION public.dispatch_completion_worker() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u text; k text;
BEGIN
 SELECT decrypted_secret INTO u FROM vault.decrypted_secrets WHERE name='project_url';
 SELECT decrypted_secret INTO k FROM vault.decrypted_secrets WHERE name='completion_worker_key';
 IF u IS NULL OR k IS NULL THEN RAISE EXCEPTION 'Completion worker Vault configuration missing'; END IF;
 PERFORM net.http_post(url:=u || '/functions/v1/process-completion-steps',
   headers:=jsonb_build_object('Content-Type','application/json','x-service-key',k),body:='{}'::jsonb);
END; $$;
REVOKE ALL ON FUNCTION public.dispatch_completion_worker() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_completion_worker() TO service_role;
SELECT cron.schedule('altio-completion-steps','* * * * *','select public.dispatch_completion_worker()');
-- Disabled until deployment/secret checks are done; no real payments from this migration alone.
SELECT cron.alter_job(jobid,active:=false) FROM cron.job WHERE jobname='altio-completion-steps';
COMMIT;
