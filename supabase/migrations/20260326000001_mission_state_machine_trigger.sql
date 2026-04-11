-- ============================================================================
-- Mission state machine enforcement trigger
-- Prevents any invalid status transition at the database level.
-- ============================================================================

CREATE OR REPLACE FUNCTION check_mission_status_transition()
RETURNS TRIGGER AS $$
DECLARE
  allowed text[];
BEGIN
  -- Only check when status actually changes
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  -- Define valid transitions
  CASE OLD.status
    WHEN 'pending' THEN
      allowed := ARRAY['pending_provider_approval', 'cancelled', 'expired'];
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
      -- Unknown status — block transition
      RAISE EXCEPTION 'Statut mission inconnu: %', OLD.status;
  END CASE;

  IF NOT (NEW.status = ANY(allowed)) THEN
    RAISE EXCEPTION 'Transition invalide: % → % (autorisés: %)',
      OLD.status, NEW.status, array_to_string(allowed, ', ');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop if exists to allow re-run
DROP TRIGGER IF EXISTS enforce_mission_status_transition ON missions;

CREATE TRIGGER enforce_mission_status_transition
  BEFORE UPDATE OF status ON missions
  FOR EACH ROW
  EXECUTE FUNCTION check_mission_status_transition();

-- ============================================================================
-- Emergency state machine enforcement trigger
-- ============================================================================

CREATE OR REPLACE FUNCTION check_emergency_status_transition()
RETURNS TRIGGER AS $$
DECLARE
  allowed text[];
BEGIN
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  CASE OLD.status
    WHEN 'open' THEN
      allowed := ARRAY['bids_open', 'provider_accepted'];
    WHEN 'bids_open' THEN
      allowed := ARRAY['bid_accepted'];
    WHEN 'provider_accepted' THEN
      allowed := ARRAY['bid_accepted'];
    WHEN 'bid_accepted' THEN
      allowed := ARRAY['displacement_paid'];
    WHEN 'displacement_paid' THEN
      allowed := ARRAY['on_site'];
    WHEN 'on_site' THEN
      allowed := ARRAY['quote_submitted'];
    WHEN 'quote_submitted' THEN
      allowed := ARRAY['quote_sent'];
    WHEN 'quote_sent' THEN
      allowed := ARRAY['quote_accepted', 'quote_refused'];
    WHEN 'quote_accepted' THEN
      allowed := ARRAY['in_progress'];
    WHEN 'quote_refused' THEN
      allowed := ARRAY['quote_submitted'];
    WHEN 'in_progress' THEN
      allowed := ARRAY['completed'];
    WHEN 'completed' THEN
      allowed := ARRAY[]::text[];
    ELSE
      RAISE EXCEPTION 'Statut urgence inconnu: %', OLD.status;
  END CASE;

  IF NOT (NEW.status = ANY(allowed)) THEN
    RAISE EXCEPTION 'Transition invalide urgence: % → % (autorisés: %)',
      OLD.status, NEW.status, array_to_string(allowed, ', ');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS enforce_emergency_status_transition ON emergency_requests;

CREATE TRIGGER enforce_emergency_status_transition
  BEFORE UPDATE OF status ON emergency_requests
  FOR EACH ROW
  EXECUTE FUNCTION check_emergency_status_transition();
