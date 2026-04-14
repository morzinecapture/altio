-- ============================================================================
-- Push notification to message receiver when a new message is sent
--
-- Same pattern as 20260414180000_notify_owner_on_emergency_bid.sql: moves
-- the client-side sendPushNotification() call from src/api/messaging.ts
-- into a DB trigger so real APNs push notifications are actually delivered
-- (the client-side try/catch was silently swallowing errors in production).
-- ============================================================================

CREATE OR REPLACE FUNCTION notify_on_new_message()
RETURNS TRIGGER AS $$
DECLARE
  v_sender_name text;
  v_title text := '💬 Nouveau message';
  v_body text;
  v_ref_id uuid;
  v_ref_type text;
BEGIN
  -- Resolve sender name for the notification body
  SELECT COALESCE(name, 'Quelqu''un')
    INTO v_sender_name
    FROM users
    WHERE id = NEW.sender_id;

  v_body := v_sender_name || ' vous a envoyé un message.';

  -- Reference the mission OR emergency the message is attached to
  IF NEW.emergency_id IS NOT NULL THEN
    v_ref_id := NEW.emergency_id;
    v_ref_type := 'emergency';
  ELSE
    v_ref_id := NEW.mission_id;
    v_ref_type := 'mission';
  END IF;

  PERFORM _send_push(
    NEW.receiver_id,
    v_title,
    v_body,
    v_ref_id,
    v_ref_type
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_notify_on_new_message ON messages;
CREATE TRIGGER trg_notify_on_new_message
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION notify_on_new_message();
