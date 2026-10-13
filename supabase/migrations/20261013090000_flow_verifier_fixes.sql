-- Corrections issues de la vérification des parcours (flow-verifier, 2026-10-12).
BEGIN;

-- M2 : la fonction de notification d'offre existait sans trigger versionné.
-- On ne l'attache que si aucun trigger de la base distante ne l'utilise déjà.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
    WHERE t.tgrelid = 'public.emergency_bids'::regclass AND NOT t.tgisinternal
      AND p.proname = 'notify_owner_on_emergency_bid'
  ) THEN
    CREATE TRIGGER notify_owner_on_emergency_bid AFTER INSERT ON public.emergency_bids
      FOR EACH ROW EXECUTE FUNCTION public.notify_owner_on_emergency_bid();
  END IF;
END $$;

-- m6 : chaque offre refusée (choix d'une autre offre ou refus explicite) prévient son prestataire.
CREATE OR REPLACE FUNCTION public.notify_provider_on_bid_rejected() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NEW.status = 'rejected' AND OLD.status = 'pending' THEN
    PERFORM public._send_push_event(NEW.provider_id, '❌ Offre non retenue',
      'Le propriétaire n''a pas retenu votre offre pour cette urgence.',
      NEW.emergency_request_id, 'emergency', 'emergency-bid-rejected:' || NEW.id::text);
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.notify_provider_on_bid_rejected() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS notify_provider_on_bid_rejected ON public.emergency_bids;
CREATE TRIGGER notify_provider_on_bid_rejected AFTER UPDATE OF status ON public.emergency_bids
  FOR EACH ROW EXECUTE FUNCTION public.notify_provider_on_bid_rejected();

-- m7 : acceptation d'une offre en une seule transaction (offre retenue, autres refusées, urgence attribuée).
CREATE OR REPLACE FUNCTION public.accept_emergency_bid(p_emergency uuid, p_bid uuid, p_payment text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE e public.emergency_requests; b public.emergency_bids;
BEGIN
  SELECT * INTO e FROM public.emergency_requests WHERE id = p_emergency FOR UPDATE;
  IF e.id IS NULL OR e.owner_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Seul le propriétaire peut accepter une offre.' USING errcode = '42501';
  END IF;
  IF e.status <> 'bids_open' OR e.accepted_provider_id IS NOT NULL THEN
    RAISE EXCEPTION 'Cette offre a déjà été traitée.';
  END IF;
  SELECT * INTO b FROM public.emergency_bids WHERE id = p_bid AND emergency_request_id = e.id FOR UPDATE;
  IF b.id IS NULL OR b.status <> 'pending' THEN RAISE EXCEPTION 'Cette offre a déjà été traitée.'; END IF;
  UPDATE public.emergency_bids SET status = 'accepted' WHERE id = b.id;
  UPDATE public.emergency_bids SET status = 'rejected'
    WHERE emergency_request_id = e.id AND id <> b.id AND status = 'pending';
  -- displacement_paid means "authorization accepted"; settlement lives in emergency_completion_steps.
  UPDATE public.emergency_requests SET status = 'displacement_paid', accepted_provider_id = b.provider_id,
    displacement_fee = b.travel_cost, diagnostic_fee = b.diagnostic_cost,
    displacement_payment_id = coalesce(p_payment, displacement_payment_id)
    WHERE id = e.id;
END; $$;
REVOKE ALL ON FUNCTION public.accept_emergency_bid(uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.accept_emergency_bid(uuid,uuid,text) TO authenticated;

-- m1 + m2 : seul le propriétaire conteste une étape ; une étape déjà payée garde son statut « paid ».
CREATE OR REPLACE FUNCTION public.emergency_completion_action(p_emergency uuid,p_phase text,p_action text,p_actor uuid,
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
    IF p_actor IS DISTINCT FROM e.owner_id THEN RAISE EXCEPTION 'Seul le propriétaire peut contester une étape'; END IF;
    IF s.id IS NULL OR length(trim(coalesce(p_reason,''))) NOT BETWEEN 5 AND 2000 THEN RAISE EXCEPTION 'Décrivez le problème (5 à 2000 caractères)'; END IF;
    UPDATE public.emergency_completion_steps SET disputed_at=coalesce(disputed_at,now()),
      dispute_reason=p_reason,status=CASE WHEN paid_at IS NULL THEN 'disputed' ELSE status END WHERE id=s.id RETURNING * INTO s;
    PERFORM public._send_push(e.accepted_provider_id,
      'Contestation : ' || CASE WHEN p_phase='visit' THEN 'diagnostic' ELSE 'réparation' END,
      CASE WHEN s.paid_at IS NULL THEN 'Un problème a été signalé. La validation automatique est suspendue ; le support doit examiner le dossier.'
      ELSE 'Un problème a été signalé après paiement. Le support doit examiner le dossier.' END,e.id,'emergency');
  ELSE RAISE EXCEPTION 'Action invalide'; END IF;
  RETURN s;
END; $$;
REVOKE ALL ON FUNCTION public.emergency_completion_action(uuid,text,text,uuid,text,integer,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.emergency_completion_action(uuid,text,text,uuid,text,integer,text,boolean) TO service_role;

-- m1 : une réclamation sur une étape payée l'annote sans effacer le statut « paid ».
CREATE OR REPLACE FUNCTION public.freeze_completion_on_complaint() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NEW.emergency_id IS NOT NULL AND NEW.status NOT IN ('resolved','closed') THEN
    UPDATE public.emergency_completion_steps SET status=CASE WHEN paid_at IS NULL THEN 'disputed' ELSE status END,
      disputed_at=coalesce(disputed_at,now()),dispute_reason=left(NEW.description,2000)
    WHERE emergency_id=NEW.emergency_id AND NEW.user_id IN (owner_id,provider_id);
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.freeze_completion_on_complaint() FROM PUBLIC,anon,authenticated;

-- Le règlement d'une étape contestée pendant la capture garde aussi « paid » (disputed_at reste renseigné).
CREATE OR REPLACE FUNCTION public.settle_emergency_completion(p_id uuid,p_payment text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE s public.emergency_completion_steps;
BEGIN
  SELECT * INTO s FROM public.emergency_completion_steps WHERE id=p_id FOR UPDATE;
  IF s.id IS NULL OR s.payment_intent_id IS DISTINCT FROM p_payment THEN RAISE EXCEPTION 'Paiement incohérent'; END IF;
  UPDATE public.emergency_completion_steps SET paid_at=coalesce(paid_at,now()),
    status='paid',payment_error=NULL WHERE id=s.id;
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

-- Remet « paid » sur les étapes payées que l'ancienne règle avait passées en « disputed ».
UPDATE public.emergency_completion_steps SET status='paid' WHERE paid_at IS NOT NULL AND status='disputed';

-- M3 : « validated » ne promet plus un paiement en cours ; m4 : missions combinées.
CREATE OR REPLACE FUNCTION public.notify_mission_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_owner_id uuid;
  v_provider_id uuid;
  v_provider_name text;
  v_owner_name text;
  v_mission_type text;
  v_prop_name text;
  v_label text;
  v_prov RECORD;
  v_prop_lat double precision;
  v_prop_lng double precision;
  v_has_application boolean;
  v_services text[];
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;

  v_owner_id := NEW.owner_id;
  v_provider_id := NEW.assigned_provider_id;
  v_mission_type := COALESCE(NEW.mission_type, 'service');
  -- Same rule as the app: a combined mission needs a provider covering every service.
  v_services := ARRAY(SELECT DISTINCT s FROM jsonb_array_elements_text(
    CASE WHEN jsonb_typeof(NEW.services) = 'array' THEN NEW.services ELSE '[]'::jsonb END) AS s);
  IF coalesce(array_length(v_services, 1), 0) = 0 THEN v_services := ARRAY[v_mission_type]; END IF;

  SELECT name INTO v_provider_name FROM public.users WHERE id = v_provider_id;
  SELECT name INTO v_owner_name FROM public.users WHERE id = v_owner_id;
  SELECT p.name, p.latitude, p.longitude
    INTO v_prop_name, v_prop_lat, v_prop_lng
    FROM public.properties p WHERE p.id = NEW.property_id;

  v_label := public.localize_service_codes(v_mission_type);
  IF v_prop_name IS NOT NULL THEN
    v_label := v_label || ' — ' || v_prop_name;
  END IF;

  CASE NEW.status

    WHEN 'pending_provider_approval' THEN
      -- === FIX A : MISSION DIRECTE → notifier UNIQUEMENT le prestataire ciblé ===
      IF NEW.assigned_provider_id IS NOT NULL THEN
        PERFORM public._send_push(
          NEW.assigned_provider_id,
          '📋 Nouvelle mission pour vous',
          'Un propriétaire vous confie une mission de ' || v_label || '. Consultez et acceptez.',
          NEW.id
        );
      END IF;
      -- NE PAS broadcaster aux autres prestataires

    WHEN 'pending' THEN
      -- MISSION OUVERTE : broadcaster aux prestataires dans la zone
      IF NEW.assigned_provider_id IS NULL THEN
        FOR v_prov IN
          SELECT pp.provider_id FROM public.provider_profiles pp
          WHERE (pp.specialties IS NULL OR array_length(pp.specialties, 1) IS NULL
                 OR v_services <@ pp.specialties::text[])
            AND pp.latitude IS NOT NULL AND pp.longitude IS NOT NULL
            AND v_prop_lat IS NOT NULL AND v_prop_lng IS NOT NULL
            AND (6371 * 2 * asin(sqrt(
              sin(radians(v_prop_lat - pp.latitude) / 2) ^ 2 +
              cos(radians(pp.latitude)) * cos(radians(v_prop_lat)) *
              sin(radians(v_prop_lng - pp.longitude) / 2) ^ 2
            )) <= COALESCE(pp.radius_km, 50))
        LOOP
          PERFORM public._send_push(v_prov.provider_id,
            '📋 Nouvelle mission disponible',
            'Une mission de ' || v_label || ' est disponible près de chez vous.',
            NEW.id);
        END LOOP;
      END IF;

    WHEN 'assigned' THEN
      -- === FIX B : distinguer candidature acceptée vs assignation directe ===
      IF v_provider_id IS NOT NULL THEN
        SELECT EXISTS (
          SELECT 1 FROM public.mission_applications
          WHERE mission_id = NEW.id AND provider_id = v_provider_id AND status = 'accepted'
        ) INTO v_has_application;

        IF v_has_application THEN
          -- Le prestataire a candidaté → "Candidature acceptée"
          PERFORM public._send_push(v_provider_id,
            '✅ Candidature acceptée !',
            'Votre candidature pour ' || v_label || ' a été retenue.',
            NEW.id);
        ELSE
          -- Assignation directe confirmée → "Mission confirmée"
          PERFORM public._send_push(v_provider_id,
            '✅ Mission confirmée',
            'Votre mission de ' || v_label || ' est confirmée. Préparez-vous !',
            NEW.id);
        END IF;
      END IF;
      -- Notifier le proprio
      PERFORM public._send_push(v_owner_id,
        '👷 Prestataire confirmé',
        COALESCE(v_provider_name, 'Un prestataire') || ' va intervenir pour votre mission de ' || v_label || '.',
        NEW.id);

    WHEN 'in_progress' THEN
      PERFORM public._send_push(v_owner_id,
        '🔧 Intervention commencée',
        COALESCE(v_provider_name, 'Le prestataire') || ' a commencé l''intervention — ' || v_label || '.',
        NEW.id);

    WHEN 'awaiting_payment' THEN
      PERFORM public._send_push(v_owner_id,
        '✅ Mission terminée',
        'La mission de ' || v_label || ' est terminée. Validez le paiement.',
        NEW.id);

    WHEN 'validated' THEN
      IF v_provider_id IS NOT NULL THEN
        PERFORM public._send_push(v_provider_id,
          '✅ Mission validée',
          'Le propriétaire a validé votre mission de ' || v_label || '. Vous serez notifié dès que le paiement sera confirmé.',
          NEW.id);
      END IF;

    WHEN 'paid' THEN
      IF v_provider_id IS NOT NULL THEN
        PERFORM public._send_push(v_provider_id,
          '💸 Paiement reçu',
          'Le paiement pour ' || v_label || ' a été transféré sur votre compte.',
          NEW.id);
      END IF;

    WHEN 'cancelled' THEN
      IF v_provider_id IS NOT NULL THEN
        PERFORM public._send_push(v_provider_id,
          '❌ Mission annulée',
          'La mission de ' || v_label || ' a été annulée.',
          NEW.id);
      END IF;
      PERFORM public._send_push(v_owner_id,
        '❌ Mission annulée',
        'Votre mission de ' || v_label || ' a été annulée.',
        NEW.id);

    ELSE NULL;
  END CASE;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.notify_mission_status_change() FROM PUBLIC,anon,authenticated;

COMMIT;
