-- ============================================================================
-- Trigger: notify owner on new reservation (iCal sync or manual insert)
-- Fires AFTER INSERT on reservations — one notification per reservation.
-- ============================================================================

CREATE OR REPLACE FUNCTION notify_owner_on_new_reservation()
RETURNS TRIGGER AS $$
DECLARE
  v_body text;
BEGIN
  -- Build body: "Guest Name — DD/MM → DD/MM"
  v_body := COALESCE(NEW.guest_name, 'Réservation')
    || ' — '
    || to_char(NEW.check_in::date, 'DD/MM')
    || ' → '
    || to_char(NEW.check_out::date, 'DD/MM');

  -- Insert in-app notification + send push via _send_push
  -- (owner_id is directly on the reservations row — no join needed)
  PERFORM _send_push(
    NEW.owner_id,
    'Nouvelle réservation détectée',
    v_body,
    NEW.id,
    'new_reservation'
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop if exists (idempotent re-run)
DROP TRIGGER IF EXISTS on_new_reservation_notify_owner ON reservations;

CREATE TRIGGER on_new_reservation_notify_owner
  AFTER INSERT ON reservations
  FOR EACH ROW
  EXECUTE FUNCTION notify_owner_on_new_reservation();

-- ============================================================================
-- Notes:
-- • _send_push (defined in 20260326000002_server_side_notifications.sql)
--   inserts into the `notifications` table AND fires the send-push Edge
--   Function via pg_net — the push cascade is therefore automatic.
-- • The sync-ical Edge Function already sends a summary push for the batch;
--   this trigger adds one individual notification per new reservation so the
--   owner sees each reservation detail in the in-app bell.
-- • reference_id = NEW.id (reservation UUID) links the notification to the
--   reservation row.  The notifications table has no `data` jsonb column;
--   use reference_id for the link.
-- ============================================================================
