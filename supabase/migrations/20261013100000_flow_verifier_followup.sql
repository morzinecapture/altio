-- Suite de la revérification des parcours (flow-verifier, 2026-10-13).
BEGIN;

-- 1. Un litige reste possible après validation tant que le paiement n'est pas confirmé.
CREATE OR REPLACE FUNCTION public.check_mission_status_transition()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  allowed text[];
BEGIN
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  CASE OLD.status
    WHEN 'pending' THEN
      allowed := ARRAY['pending_provider_approval', 'assigned', 'cancelled', 'expired'];
    WHEN 'pending_provider_approval' THEN
      allowed := ARRAY['assigned', 'rejected', 'cancelled', 'expired'];
    WHEN 'assigned' THEN
      allowed := ARRAY['in_progress', 'cancelled'];
    WHEN 'in_progress' THEN
      allowed := ARRAY['awaiting_payment', 'cancelled'];
    WHEN 'awaiting_payment' THEN
      allowed := ARRAY['validated', 'dispute', 'cancelled'];
    WHEN 'validated' THEN
      allowed := CASE WHEN OLD.paid_at IS NULL THEN ARRAY['paid', 'dispute'] ELSE ARRAY['paid'] END;
    WHEN 'completed' THEN
      allowed := ARRAY['paid'];
    WHEN 'dispute' THEN
      allowed := ARRAY['validated', 'cancelled'];
    WHEN 'expired' THEN
      allowed := ARRAY['pending'];
    WHEN 'rejected' THEN
      allowed := ARRAY['pending'];
    WHEN 'quote_submitted' THEN
      allowed := ARRAY['quote_sent', 'cancelled'];
    WHEN 'quote_sent' THEN
      allowed := ARRAY['quote_accepted', 'quote_refused', 'cancelled'];
    WHEN 'quote_accepted' THEN
      allowed := ARRAY['assigned', 'cancelled'];
    WHEN 'quote_refused' THEN
      allowed := ARRAY['pending', 'cancelled'];
    WHEN 'paid' THEN
      allowed := ARRAY[]::text[];
    WHEN 'cancelled' THEN
      allowed := ARRAY[]::text[];
    ELSE
      RAISE EXCEPTION 'Statut mission inconnu: %', OLD.status;
  END CASE;

  IF NOT (NEW.status = ANY(allowed)) THEN
    RAISE EXCEPTION 'Transition invalide: % → % (autorisés: %)',
      OLD.status, NEW.status, array_to_string(allowed, ', ');
  END IF;

  RETURN NEW;
END;
$function$;

-- 2. Empreintes de déplacement créées par create-payment-intent (écriture serveur uniquement).
CREATE TABLE IF NOT EXISTS public.emergency_bid_payments (
  payment_intent_id text PRIMARY KEY,
  emergency_id uuid NOT NULL REFERENCES public.emergency_requests(id) ON DELETE CASCADE,
  bid_id uuid NOT NULL REFERENCES public.emergency_bids(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  amount_cents integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.emergency_bid_payments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.emergency_bid_payments FROM PUBLIC, anon, authenticated;

-- L'offre n'est attribuée qu'avec une empreinte émise par Altio pour cette offre et ce propriétaire.
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
  IF p_payment IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.emergency_bid_payments
    WHERE payment_intent_id = p_payment AND emergency_id = e.id AND bid_id = b.id AND owner_id = e.owner_id
  ) THEN
    RAISE EXCEPTION 'Paiement non reconnu pour cette offre. Réessayez le paiement.';
  END IF;
  UPDATE public.emergency_bids SET status = 'accepted' WHERE id = b.id;
  UPDATE public.emergency_bids SET status = 'rejected'
    WHERE emergency_request_id = e.id AND id <> b.id AND status = 'pending';
  -- displacement_paid means "authorization accepted"; settlement lives in emergency_completion_steps.
  UPDATE public.emergency_requests SET status = 'displacement_paid', accepted_provider_id = b.provider_id,
    displacement_fee = b.travel_cost, diagnostic_fee = b.diagnostic_cost,
    displacement_payment_id = p_payment
    WHERE id = e.id;
END; $$;
REVOKE ALL ON FUNCTION public.accept_emergency_bid(uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.accept_emergency_bid(uuid,uuid,text) TO authenticated;

-- 3. Le prestataire est prévenu de l'ouverture d'un litige sur sa mission.
CREATE OR REPLACE FUNCTION public.notify_mission_dispute() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NEW.status = 'dispute' AND OLD.status IS DISTINCT FROM 'dispute' AND NEW.assigned_provider_id IS NOT NULL THEN
    PERFORM public._send_push(NEW.assigned_provider_id,
      '⚠️ Litige ouvert',
      'Le propriétaire a signalé un problème sur cette mission. Le paiement est suspendu pendant l''examen par le support.',
      NEW.id);
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.notify_mission_dispute() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS trg_notify_mission_dispute ON public.missions;
CREATE TRIGGER trg_notify_mission_dispute AFTER UPDATE OF status ON public.missions
  FOR EACH ROW EXECUTE FUNCTION public.notify_mission_dispute();

COMMIT;
