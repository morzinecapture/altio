-- Transactional notifications must work without optional app.settings secrets.
-- pg_net dispatches only after commit, so rolled-back assignments never send pushes.
CREATE OR REPLACE FUNCTION public._send_push(
  p_user_id uuid, p_title text, p_body text,
  p_reference_id uuid DEFAULT NULL, p_ref_type text DEFAULT 'mission'
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_url text;
  v_service_key text;
  v_token text;
  v_data jsonb;
  v_request_id bigint;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.notifications n
    WHERE n.user_id = p_user_id AND n.title = p_title
      AND n.reference_id IS NOT DISTINCT FROM p_reference_id
      AND n.created_at > now() - interval '5 minutes'
  ) THEN RETURN; END IF;

  INSERT INTO public.notifications(user_id, type, title, body, reference_id)
  VALUES (p_user_id, p_ref_type, p_title, p_body, p_reference_id);

  BEGIN
  v_data := jsonb_build_object(
    CASE p_ref_type WHEN 'emergency' THEN 'emergencyId'
      WHEN 'intervention' THEN 'interventionId' ELSE 'missionId' END,
    p_reference_id
  );
  v_url := coalesce(nullif(current_setting('app.settings.supabase_url', true), ''),
                    nullif(current_setting('supabase.url', true), ''));
  v_service_key := coalesce(nullif(current_setting('app.settings.service_role_key', true), ''),
                            nullif(current_setting('supabase.service_role_key', true), ''));

  IF v_url IS NOT NULL AND v_service_key IS NOT NULL THEN
    SELECT net.http_post(
      url := v_url || '/functions/v1/send-push',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_service_key),
      body := jsonb_build_object('userId', p_user_id, 'title', p_title, 'body', p_body,
        'skipDbInsert', true, 'notifType', p_ref_type, 'referenceId', p_reference_id, 'data', v_data)
    ) INTO v_request_id;
  ELSE
    -- Expo's push endpoint requires the device token, not a Supabase service key.
    -- Keep tokens inside the privileged server function; never return or log them.
    SELECT nullif(u.expo_push_token, '') INTO v_token FROM public.users u WHERE u.id = p_user_id;
    IF v_token IS NULL THEN
      SELECT pt.token INTO v_token FROM public.push_tokens pt
      WHERE pt.user_id = p_user_id ORDER BY pt.updated_at DESC LIMIT 1;
    END IF;
    IF v_token IS NULL THEN RETURN; END IF;
    SELECT net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      headers := '{"Content-Type":"application/json","Accept":"application/json"}'::jsonb,
      body := jsonb_build_object('to', v_token, 'title', p_title, 'body', p_body,
        'sound', 'default', 'priority', 'high', 'channelId', 'default', 'data', v_data),
      timeout_milliseconds := 10000
    ) INTO v_request_id;
  END IF;
  RAISE LOG 'Altio push queued: request_id=%', v_request_id;
EXCEPTION WHEN OTHERS THEN
  -- Preserve the business transition; surface delivery failures for diagnosis.
  RAISE WARNING 'Altio push dispatch failed: SQLSTATE=%', SQLSTATE;
  END;
END;
$$;
REVOKE ALL ON FUNCTION public._send_push(uuid,text,text,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._send_push(uuid,text,text,uuid,text) TO service_role;
