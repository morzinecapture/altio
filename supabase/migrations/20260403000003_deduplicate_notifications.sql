-- ============================================================================
-- Deduplicate notifications:
-- 1. Delete duplicate notifications (keep oldest per group)
-- 2. Add anti-duplicate guard to _send_push (5-minute window)
-- ============================================================================

-- Step 1: Delete duplicates, keep the oldest notification per (user_id, title, reference_id) group
DELETE FROM notifications
WHERE id NOT IN (
  SELECT DISTINCT ON (user_id, title, reference_id) id
  FROM notifications
  ORDER BY user_id, title, reference_id, created_at ASC
)
AND (user_id, title, reference_id) IN (
  SELECT user_id, title, reference_id
  FROM notifications
  GROUP BY user_id, title, reference_id
  HAVING COUNT(*) > 1
);

-- Step 2: Replace _send_push with anti-duplicate guard
CREATE OR REPLACE FUNCTION _send_push(
  p_user_id uuid,
  p_title text,
  p_body text,
  p_reference_id uuid DEFAULT NULL,
  p_ref_type text DEFAULT 'mission'
) RETURNS void AS $$
DECLARE
  v_url text;
  v_anon_key text;
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

  v_url := current_setting('app.settings.supabase_url', true);
  v_anon_key := current_setting('app.settings.service_role_key', true);

  IF v_url IS NULL THEN
    v_url := current_setting('supabase.url', true);
  END IF;
  IF v_anon_key IS NULL THEN
    v_anon_key := current_setting('supabase.service_role_key', true);
  END IF;

  -- Always insert in-app notification (even without push config)
  INSERT INTO notifications (user_id, type, title, body, reference_id)
  VALUES (p_user_id, p_ref_type, p_title, p_body, p_reference_id);

  -- If push config not available, skip device push silently (dev environment)
  IF v_url IS NULL OR v_anon_key IS NULL THEN
    RETURN;
  END IF;

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

  -- Fire-and-forget push via http_post
  BEGIN
    PERFORM extensions.http_post(
      url := v_url || '/functions/v1/send-push',
      body := v_payload::text,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_anon_key
      )::jsonb
    );
  EXCEPTION WHEN OTHERS THEN
    -- Push failed but in-app notification is already saved
    NULL;
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
