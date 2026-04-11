-- ============================================================================
-- Fix notifications RLS INSERT policy
--
-- Problem: the INSERT policy on notifications was WITH CHECK (true), allowing
-- any authenticated user to insert notifications for ANY other user.
-- A previous fix (20260326000003) restricted to user_id = auth.uid() OR is_admin(),
-- but is_admin() is still too broad — admin client-side code should not bypass
-- RLS for inserts. Admin notifications should go through SECURITY DEFINER RPCs.
--
-- Solution:
--   - Client-side: users can only insert notifications for THEMSELVES
--     (WITH CHECK user_id = auth.uid())
--   - Server-side: triggers and RPC functions (_send_push, notify_mission_status_change,
--     notify_emergency_status_change, insert_notification_for_user) are all
--     SECURITY DEFINER, running as postgres (superuser) which bypasses RLS.
--     This means they can insert notifications for any user — no policy needed.
--
-- This does NOT break the server notification flow because:
--   1. _send_push() is SECURITY DEFINER → bypasses RLS
--   2. notify_mission_status_change() is SECURITY DEFINER → bypasses RLS
--   3. notify_emergency_status_change() is SECURITY DEFINER → bypasses RLS
--   4. insert_notification_for_user() is SECURITY DEFINER → bypasses RLS
--   5. Edge Functions use service_role key → bypasses RLS
-- ============================================================================

-- Drop both possible existing INSERT policies (original + previous fix)
DROP POLICY IF EXISTS "Authenticated users can insert notifications" ON notifications;
DROP POLICY IF EXISTS "Restricted notifications insert" ON notifications;

-- Strict policy: authenticated users can only insert notifications for themselves.
-- All cross-user notifications go through SECURITY DEFINER functions which bypass RLS.
CREATE POLICY "Users insert own notifications"
  ON notifications FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());
