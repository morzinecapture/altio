-- ============================================================================
-- Fix _send_push: hardcode Supabase URL + anon key
--
-- Previous version relied on `current_setting('app.settings.supabase_url')`
-- and `current_setting('app.settings.service_role_key')` — Postgres GUCs
-- that were never configured on the production database, causing the
-- function to silently exit before invoking the send-push Edge Function.
-- Result: in-app notifications (bell badge) worked, but real APNs/FCM
-- push notifications were never fired for mission/emergency status
-- transitions.
--
-- Hardcoding the anon key is acceptable here: it is a public JWT already
-- embedded in the mobile app bundle via EXPO_PUBLIC_SUPABASE_ANON_KEY.
-- RLS still protects all data; the anon key only authorizes the Edge
-- Function gateway to accept the request.
-- ============================================================================

CREATE OR REPLACE FUNCTION _send_push(
  p_user_id uuid,
  p_title text,
  p_body text,
  p_reference_id uuid DEFAULT NULL,
  p_ref_type text DEFAULT 'mission'
) RETURNS void AS $$
DECLARE
  v_url text := 'https://vtybccqqbyjbmhkpliyn.supabase.co';
  v_anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ0eWJjY3FxYnlqYm1oa3BsaXluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzODMyMTQsImV4cCI6MjA4Nzk1OTIxNH0.pfO-UP1Qu81tNEz3-3gREaHvkzc3U9BK33XboYBk-KU';
  v_payload jsonb;
BEGIN
  -- Anti-duplicate: skip if identical notification exists within last 5 minutes
  IF EXISTS (
    SELECT 1 FROM notifications
    WHERE user_id = p_user_id
      AND title = p_title
      AND reference_id = p_reference_id
      AND created_at > now() - interval '5 minutes'
  ) THEN
    RETURN;
  END IF;

  -- Always insert in-app notification first (bell badge)
  INSERT INTO notifications (user_id, type, title, body, reference_id)
  VALUES (p_user_id, p_ref_type, p_title, p_body, p_reference_id);

  v_payload := jsonb_build_object(
    'userId', p_user_id,
    'title', p_title,
    'body', p_body,
    'skipDbInsert', true,
    'data', jsonb_build_object(
      CASE WHEN p_ref_type = 'emergency' THEN 'emergencyId' ELSE 'missionId' END,
      p_reference_id
    )
  );

  -- Fire-and-forget device push via pg_net
  BEGIN
    PERFORM net.http_post(
      url := v_url || '/functions/v1/send-push',
      body := v_payload,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_anon_key
      )
    );
  EXCEPTION WHEN OTHERS THEN
    -- Push failed but in-app notification is already saved
    NULL;
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
