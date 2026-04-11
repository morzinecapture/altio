-- Fix: allow pending → assigned transition in mission state machine trigger
-- The frontend (mission-state-machine.ts) allows this transition but the DB trigger blocked it.

CREATE OR REPLACE FUNCTION check_mission_status_transition()
RETURNS TRIGGER AS $$
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
      allowed := ARRAY['paid'];
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
$$ LANGUAGE plpgsql;
