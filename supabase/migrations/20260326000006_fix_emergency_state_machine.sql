-- Fix emergency state machine trigger to match actual app behavior.
-- The original trigger was too strict — the app uses valid shortcuts:
--   bids_open → displacement_paid (payment done immediately on bid accept)
--   on_site → completed (no repair quote needed, diagnostic was enough)
--   quote_accepted → completed (shortcut when work is done quickly)

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
      allowed := ARRAY['bids_open', 'provider_accepted', 'displacement_paid'];
    WHEN 'bids_open' THEN
      allowed := ARRAY['bid_accepted', 'displacement_paid'];
    WHEN 'provider_accepted' THEN
      allowed := ARRAY['bid_accepted', 'displacement_paid'];
    WHEN 'bid_accepted' THEN
      allowed := ARRAY['displacement_paid'];
    WHEN 'displacement_paid' THEN
      allowed := ARRAY['on_site'];
    WHEN 'on_site' THEN
      allowed := ARRAY['quote_submitted', 'completed'];
    WHEN 'quote_submitted' THEN
      allowed := ARRAY['quote_sent'];
    WHEN 'quote_sent' THEN
      allowed := ARRAY['quote_accepted', 'quote_refused'];
    WHEN 'quote_accepted' THEN
      allowed := ARRAY['in_progress', 'completed'];
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
