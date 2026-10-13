-- Repair functions reported as invalid by `supabase db lint --linked`.

CREATE OR REPLACE FUNCTION public.debug_rls_quals()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
BEGIN
  SELECT json_agg(t)
  INTO result
  FROM (
    SELECT tablename AS tbl, policyname AS name, cmd, roles, qual, with_check
    FROM pg_policies
    WHERE tablename IN ('emergency_bids', 'emergency_requests')
    ORDER BY tablename, policyname
  ) AS t;

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public._send_push(
  p_user_id uuid,
  p_title text,
  p_body text,
  p_reference_id uuid DEFAULT NULL,
  p_ref_type text DEFAULT 'mission'
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, net
AS $$
DECLARE
  v_url text;
  v_service_key text;
  v_payload jsonb;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.notifications n
    WHERE n.user_id = p_user_id
      AND n.title = p_title
      AND n.reference_id IS NOT DISTINCT FROM p_reference_id
      AND n.created_at > now() - interval '5 minutes'
  ) THEN
    RETURN;
  END IF;

  INSERT INTO public.notifications (user_id, type, title, body, reference_id)
  VALUES (p_user_id, p_ref_type, p_title, p_body, p_reference_id);

  v_url := COALESCE(
    current_setting('app.settings.supabase_url', true),
    current_setting('supabase.url', true)
  );
  v_service_key := COALESCE(
    current_setting('app.settings.service_role_key', true),
    current_setting('supabase.service_role_key', true)
  );

  IF NULLIF(v_url, '') IS NULL OR NULLIF(v_service_key, '') IS NULL THEN
    RETURN;
  END IF;

  v_payload := jsonb_build_object(
    'userId', p_user_id,
    'title', p_title,
    'body', p_body,
    'skipDbInsert', true,
    'notifType', p_ref_type,
    'referenceId', p_reference_id,
    'data', jsonb_build_object(
      CASE WHEN p_ref_type IN ('emergency', 'intervention') THEN 'interventionId' ELSE 'missionId' END,
      p_reference_id
    )
  );

  BEGIN
    PERFORM net.http_post(
      url := v_url || '/functions/v1/send-push',
      body := v_payload,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_service_key
      )
    );
  EXCEPTION WHEN OTHERS THEN
    -- The in-app notification is durable even when the push provider is down.
    NULL;
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public.expire_pending_missions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    UPDATE public.missions
    SET status = 'expired', expired_at = now()
    WHERE status = 'pending'
      AND created_at < now() - interval '7 days'
    RETURNING id, owner_id, mission_type
  LOOP
    PERFORM public._send_push(
      rec.owner_id,
      'Mission expirée',
      'Aucun prestataire disponible pour votre mission de ' || COALESCE(rec.mission_type, 'service') || '. Vous pouvez la republier.',
      rec.id,
      'mission'
    );
  END LOOP;
END;
$$;

-- Release targeted scheduled interventions after the favorite-provider window
-- when that provider has not submitted or accepted a bid. Qualifying every
-- column avoids the legacy intervention_id output-variable ambiguity.
ALTER FUNCTION public.process_favorites_timeouts()
  RENAME TO process_favorites_timeouts_legacy_broken;

CREATE FUNCTION public.process_favorites_timeouts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.interventions AS i
  SET target_provider_id = NULL,
      favorites_only_until = NULL,
      updated_at = now()
  WHERE i.phase = 'visit_pending'
    AND i.target_provider_id IS NOT NULL
    AND i.favorites_only_until IS NOT NULL
    AND i.favorites_only_until <= now()
    AND NOT EXISTS (
      SELECT 1
      FROM public.intervention_bids AS ib
      WHERE ib.intervention_id = i.id
        AND ib.provider_id = i.target_provider_id
        AND ib.status IN ('pending', 'accepted')
    );
END;
$$;

DROP FUNCTION public.process_favorites_timeouts_legacy_broken();
