-- ============================================================================
-- Push notification to emergency owner when a provider submits a bid
--
-- Previously handled client-side via sendPushNotification() in
-- src/api/emergencies.ts, which silently failed (Path 2 of notifications.ts
-- is wrapped in try/catch that only logs in __DEV__). Moving it to a DB
-- trigger makes it independent of the client path and consistent with
-- status-change notifications already handled by trg_notify_emergency_status.
-- ============================================================================

CREATE OR REPLACE FUNCTION notify_owner_on_emergency_bid()
RETURNS TRIGGER AS $$
DECLARE
  v_owner_id uuid;
  v_service_type text;
BEGIN
  SELECT owner_id, service_type
    INTO v_owner_id, v_service_type
    FROM emergency_requests
    WHERE id = NEW.emergency_request_id;

  IF v_owner_id IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM _send_push(
    v_owner_id,
    '🔔 Nouvelle candidature',
    'Un prestataire a postulé à votre urgence ' || COALESCE(v_service_type, ''),
    NEW.emergency_request_id,
    'emergency'
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_notify_owner_on_emergency_bid ON emergency_bids;
CREATE TRIGGER trg_notify_owner_on_emergency_bid
  AFTER INSERT ON emergency_bids
  FOR EACH ROW
  EXECUTE FUNCTION notify_owner_on_emergency_bid();
