-- Fix _send_push: INSERT in-app notification BEFORE checking push config.
-- Previously, if Supabase URL/key settings were null, the function returned
-- early WITHOUT inserting the notification row, causing silent notification loss.

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
  -- Always insert in-app notification first (regardless of push config)
  INSERT INTO notifications (user_id, type, title, body, reference_id)
  VALUES (p_user_id, p_ref_type, p_title, p_body, p_reference_id::text);

  -- Try to get push config
  v_url := current_setting('app.settings.supabase_url', true);
  v_anon_key := current_setting('app.settings.service_role_key', true);

  IF v_url IS NULL THEN
    v_url := current_setting('supabase.url', true);
  END IF;
  IF v_anon_key IS NULL THEN
    v_anon_key := current_setting('supabase.service_role_key', true);
  END IF;

  -- If push config not available, skip device push (in-app notif already saved)
  IF v_url IS NULL OR v_anon_key IS NULL THEN
    RETURN;
  END IF;

  v_payload := jsonb_build_object(
    'userId', p_user_id,
    'title', p_title,
    'body', p_body,
    'data', jsonb_build_object(
      CASE WHEN p_ref_type = 'emergency' THEN 'emergencyId' ELSE 'missionId' END,
      p_reference_id
    )
  );

  -- Fire-and-forget push via pg_net (wrapped in exception handler)
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
    -- Push delivery failed but in-app notification is already saved
    NULL;
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
