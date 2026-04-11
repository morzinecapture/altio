-- Fix: restrict notifications INSERT to prevent any user from creating
-- notifications for other users. Only allow:
-- 1. Service role (Edge Functions) — bypasses RLS automatically
-- 2. Users inserting notifications for themselves (edge case: self-notification)
-- 3. Admin users

DROP POLICY IF EXISTS "Authenticated users can insert notifications" ON notifications;

CREATE POLICY "Restricted notifications insert"
  ON notifications FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    OR is_admin()
  );
