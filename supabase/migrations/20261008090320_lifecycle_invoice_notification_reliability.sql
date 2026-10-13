-- Qualify legacy trigger dependencies: settlement runs with an empty search_path.
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS event_key text;
CREATE UNIQUE INDEX IF NOT EXISTS notifications_event_key_unique ON public.notifications(user_id,event_key) WHERE event_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public._send_push_event(p_user_id uuid, p_title text, p_body text, p_reference_id uuid, p_ref_type text, p_event_key text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_url text;
  v_service_key text;
  v_token text;
  v_data jsonb;
  v_request_id bigint;
BEGIN
  p_title := public.localize_service_codes(p_title);
  p_body := public.localize_service_codes(p_body);
  -- Serialize retries for one event without hiding a different candidate/message.
  PERFORM pg_advisory_xact_lock(hashtextextended(concat_ws(':',p_user_id,coalesce(p_event_key,concat_ws(':',p_reference_id,p_title,p_body))),0));
  IF EXISTS (
    SELECT 1 FROM public.notifications n
    WHERE n.user_id = p_user_id AND ((p_event_key IS NOT NULL AND n.event_key=p_event_key) OR
      (p_event_key IS NULL AND n.title = p_title AND n.body = p_body
      AND n.reference_id IS NOT DISTINCT FROM p_reference_id
      AND n.created_at > now() - interval '5 minutes'))
  ) THEN RETURN; END IF;

  INSERT INTO public.notifications(user_id, type, title, body, reference_id, event_key)
  VALUES (p_user_id, p_ref_type, p_title, p_body, p_reference_id, p_event_key);

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
$function$;
REVOKE ALL ON FUNCTION public._send_push_event(uuid,text,text,uuid,text,text) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public._send_push(p_user_id uuid,p_title text,p_body text,p_reference_id uuid DEFAULT NULL,p_ref_type text DEFAULT 'mission')
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT public._send_push_event(p_user_id,p_title,p_body,p_reference_id,p_ref_type,null);
$$;
REVOKE ALL ON FUNCTION public._send_push(uuid,text,text,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public._send_push(uuid,text,text,uuid,text) TO service_role;




CREATE OR REPLACE FUNCTION public.notify_owner_on_emergency_bid()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_owner_id uuid;
  v_service_type text;
BEGIN
  SELECT owner_id, service_type
    INTO v_owner_id, v_service_type
    FROM public.emergency_requests
    WHERE id = NEW.emergency_request_id;

  IF v_owner_id IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM public._send_push_event(
    v_owner_id,
    '🔔 Nouvelle candidature',
    'Un prestataire a postulé à votre urgence ' || public.localize_service_codes(COALESCE(v_service_type, 'service')),
    NEW.emergency_request_id,
    'emergency',
    'emergency-bid:' || NEW.id::text
  );

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.notify_owner_on_emergency_bid() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.notify_on_new_message()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
SET search_path TO ''
AS $function$
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
    FROM public.users
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

  PERFORM public._send_push_event(
    NEW.receiver_id,
    v_title,
    v_body,
    v_ref_id,
    v_ref_type,
    'message:' || NEW.id::text
  );

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.notify_on_new_message() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.notify_emergency_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_owner_id uuid;
  v_provider_id uuid;
  v_provider_name text;
  v_service_type text;
  v_prop_name text;
  v_label text;
BEGIN
  -- Only fire on actual status changes
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  v_owner_id := NEW.owner_id;
  v_provider_id := NEW.accepted_provider_id;
  v_service_type := COALESCE(NEW.service_type, 'service');

  -- Fetch names
  SELECT name INTO v_provider_name FROM public.users WHERE id = v_provider_id;
  SELECT p.name INTO v_prop_name FROM public.properties p WHERE p.id = NEW.property_id;

  v_label := public.localize_service_codes(v_service_type);
  IF v_prop_name IS NOT NULL THEN
    v_label := v_label || ' — ' || v_prop_name;
  END IF;

  -- ── Notification matrix by emergency status ──
  CASE NEW.status
    WHEN 'displacement_paid' THEN
      -- Provider selected + displacement paid → notify provider to go on-site
      IF v_provider_id IS NOT NULL THEN
        PERFORM public._send_push(
          v_provider_id,
          '✅ Candidature acceptée !',
          'Le propriétaire a choisi votre offre et autorisé le paiement. Consultez les détails de l’intervention.',
          NEW.id,
          'emergency'
        );
      END IF;

    WHEN 'on_site' THEN
      -- Provider arrived → notify owner
      PERFORM public._send_push(
        v_owner_id,
        '📍 Prestataire sur place',
        COALESCE(v_provider_name, 'Le technicien') || ' est arrivé sur place — diagnostic en cours.',
        NEW.id,
        'emergency'
      );

    WHEN 'quote_submitted' THEN
      -- Quote submitted — intermediate state, no notification (auto-advances to quote_sent)
      NULL;

    WHEN 'quote_sent' THEN
      -- Quote ready for owner review
      PERFORM public._send_push(
        v_owner_id,
        '📋 Devis reçu',
        'Le prestataire a soumis un devis pour votre urgence de ' || v_label || '. Consultez et décidez.',
        NEW.id,
        'emergency'
      );

    WHEN 'quote_accepted' THEN
      -- Owner accepted quote → notify provider to start work
      IF v_provider_id IS NOT NULL THEN
        PERFORM public._send_push(
          v_provider_id,
          '✅ Devis accepté !',
          'Le propriétaire a accepté votre devis. Vous pouvez démarrer les travaux.',
          NEW.id,
          'emergency'
        );
      END IF;

    WHEN 'quote_refused' THEN
      -- Owner refused quote → notify provider
      IF v_provider_id IS NOT NULL THEN
        PERFORM public._send_push(
          v_provider_id,
          '❌ Devis refusé',
          'Le propriétaire a refusé votre devis. Vous pouvez soumettre une nouvelle proposition.',
          NEW.id,
          'emergency'
        );
      END IF;

    WHEN 'in_progress' THEN
      -- Work started → notify owner
      PERFORM public._send_push(
        v_owner_id,
        '🔧 Travaux en cours',
        COALESCE(v_provider_name, 'Le prestataire') || ' a commencé les travaux — ' || v_label || '.',
        NEW.id,
        'emergency'
      );

    WHEN 'completed' THEN
      -- Emergency completed → notify both parties
      PERFORM public._send_push(
        v_owner_id,
        '🏠 Intervention terminée',
        'L''urgence de ' || v_label || ' est résolue. Le paiement a été traité.',
        NEW.id,
        'emergency'
      );
      IF v_provider_id IS NOT NULL THEN
        PERFORM public._send_push(
          v_provider_id,
          '💰 Mission terminée',
          'L''intervention de ' || v_label || ' est terminée. Consultez le suivi du règlement.',
          NEW.id,
          'emergency'
        );
      END IF;

    ELSE
      NULL;
  END CASE;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.notify_emergency_status_change() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.notify_mission_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_owner_id uuid;
  v_provider_id uuid;
  v_provider_name text;
  v_owner_name text;
  v_mission_type text;
  v_prop_name text;
  v_label text;
  v_prov RECORD;
  v_prop_lat double precision;
  v_prop_lng double precision;
  v_has_application boolean;
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;

  v_owner_id := NEW.owner_id;
  v_provider_id := NEW.assigned_provider_id;
  v_mission_type := COALESCE(NEW.mission_type, 'service');

  SELECT name INTO v_provider_name FROM public.users WHERE id = v_provider_id;
  SELECT name INTO v_owner_name FROM public.users WHERE id = v_owner_id;
  SELECT p.name, p.latitude, p.longitude
    INTO v_prop_name, v_prop_lat, v_prop_lng
    FROM public.properties p WHERE p.id = NEW.property_id;

  v_label := public.localize_service_codes(v_mission_type);
  IF v_prop_name IS NOT NULL THEN
    v_label := v_label || ' — ' || v_prop_name;
  END IF;

  CASE NEW.status

    WHEN 'pending_provider_approval' THEN
      -- === FIX A : MISSION DIRECTE → notifier UNIQUEMENT le prestataire ciblé ===
      IF NEW.assigned_provider_id IS NOT NULL THEN
        PERFORM public._send_push(
          NEW.assigned_provider_id,
          '📋 Nouvelle mission pour vous',
          'Un propriétaire vous confie une mission de ' || v_label || '. Consultez et acceptez.',
          NEW.id
        );
      END IF;
      -- NE PAS broadcaster aux autres prestataires

    WHEN 'pending' THEN
      -- MISSION OUVERTE : broadcaster aux prestataires dans la zone
      IF NEW.assigned_provider_id IS NULL THEN
        FOR v_prov IN
          SELECT pp.provider_id FROM public.provider_profiles pp
          WHERE (pp.specialties IS NULL OR array_length(pp.specialties, 1) IS NULL
                 OR v_mission_type = ANY(pp.specialties))
            AND pp.latitude IS NOT NULL AND pp.longitude IS NOT NULL
            AND v_prop_lat IS NOT NULL AND v_prop_lng IS NOT NULL
            AND (6371 * 2 * asin(sqrt(
              sin(radians(v_prop_lat - pp.latitude) / 2) ^ 2 +
              cos(radians(pp.latitude)) * cos(radians(v_prop_lat)) *
              sin(radians(v_prop_lng - pp.longitude) / 2) ^ 2
            )) <= COALESCE(pp.radius_km, 50))
        LOOP
          PERFORM public._send_push(v_prov.provider_id,
            '📋 Nouvelle mission disponible',
            'Une mission de ' || v_label || ' est disponible près de chez vous.',
            NEW.id);
        END LOOP;
      END IF;

    WHEN 'assigned' THEN
      -- === FIX B : distinguer candidature acceptée vs assignation directe ===
      IF v_provider_id IS NOT NULL THEN
        SELECT EXISTS (
          SELECT 1 FROM public.mission_applications
          WHERE mission_id = NEW.id AND provider_id = v_provider_id AND status = 'accepted'
        ) INTO v_has_application;

        IF v_has_application THEN
          -- Le prestataire a candidaté → "Candidature acceptée"
          PERFORM public._send_push(v_provider_id,
            '✅ Candidature acceptée !',
            'Votre candidature pour ' || v_label || ' a été retenue.',
            NEW.id);
        ELSE
          -- Assignation directe confirmée → "Mission confirmée"
          PERFORM public._send_push(v_provider_id,
            '✅ Mission confirmée',
            'Votre mission de ' || v_label || ' est confirmée. Préparez-vous !',
            NEW.id);
        END IF;
      END IF;
      -- Notifier le proprio
      PERFORM public._send_push(v_owner_id,
        '👷 Prestataire confirmé',
        COALESCE(v_provider_name, 'Un prestataire') || ' va intervenir pour votre mission de ' || v_label || '.',
        NEW.id);

    WHEN 'in_progress' THEN
      PERFORM public._send_push(v_owner_id,
        '🔧 Intervention commencée',
        COALESCE(v_provider_name, 'Le prestataire') || ' a commencé l''intervention — ' || v_label || '.',
        NEW.id);

    WHEN 'awaiting_payment' THEN
      PERFORM public._send_push(v_owner_id,
        '✅ Mission terminée',
        'La mission de ' || v_label || ' est terminée. Validez le paiement.',
        NEW.id);

    WHEN 'validated' THEN
      IF v_provider_id IS NOT NULL THEN
        PERFORM public._send_push(v_provider_id,
          '💰 Paiement validé',
          'Le propriétaire a validé votre mission de ' || v_label || '. Paiement en cours.',
          NEW.id);
      END IF;

    WHEN 'paid' THEN
      IF v_provider_id IS NOT NULL THEN
        PERFORM public._send_push(v_provider_id,
          '💸 Paiement reçu',
          'Le paiement pour ' || v_label || ' a été transféré sur votre compte.',
          NEW.id);
      END IF;

    WHEN 'cancelled' THEN
      IF v_provider_id IS NOT NULL THEN
        PERFORM public._send_push(v_provider_id,
          '❌ Mission annulée',
          'La mission de ' || v_label || ' a été annulée.',
          NEW.id);
      END IF;
      PERFORM public._send_push(v_owner_id,
        '❌ Mission annulée',
        'Votre mission de ' || v_label || ' a été annulée.',
        NEW.id);

    ELSE NULL;
  END CASE;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.notify_mission_status_change() FROM PUBLIC,anon,authenticated;


ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS completion_step_id uuid REFERENCES public.emergency_completion_steps(id);
DROP INDEX IF EXISTS public.idx_invoices_emergency_type;
CREATE UNIQUE INDEX idx_invoices_emergency_type ON public.invoices(emergency_id,invoice_type)
 WHERE emergency_id IS NOT NULL AND completion_step_id IS NULL;
CREATE UNIQUE INDEX idx_invoices_completion_type ON public.invoices(completion_step_id,invoice_type)
 WHERE completion_step_id IS NOT NULL;
ALTER TABLE public.emergency_completion_steps
 ADD COLUMN IF NOT EXISTS invoiced_at timestamptz,
 ADD COLUMN IF NOT EXISTS invoice_error text,
 ADD COLUMN IF NOT EXISTS invoice_retry_at timestamptz;

CREATE OR REPLACE FUNCTION public.insert_notification_for_user(p_user_id uuid,p_type text,p_title text,p_body text,p_reference_id text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT coalesce(public.can_send_notification(p_user_id,p_reference_id::uuid),false) THEN
   RAISE EXCEPTION 'Notification non autorisée' USING errcode='42501';
 END IF;
 IF length(p_title)>200 OR length(p_body)>2000 THEN RAISE EXCEPTION 'Notification trop longue'; END IF;
 PERFORM public._send_push(p_user_id,p_title,p_body,p_reference_id::uuid,p_type);
END; $$;
REVOKE ALL ON FUNCTION public.insert_notification_for_user(uuid,text,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.insert_notification_for_user(uuid,text,text,text,text) TO authenticated,service_role;

-- Publication membership is independent of RLS. Only participants can receive rows.
DO $$
BEGIN
 IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') THEN
   IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='emergency_completion_steps') THEN
     ALTER PUBLICATION supabase_realtime ADD TABLE public.emergency_completion_steps;
   END IF;
   IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='invoices') THEN
     ALTER PUBLICATION supabase_realtime ADD TABLE public.invoices;
   END IF;
 END IF;
END; $$;
