-- Atomic, property-scoped calendar import; no external credentials in migrations.
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS last_ical_sync timestamptz;

CREATE OR REPLACE FUNCTION public.sync_ical_reservations(p_property_id uuid,p_source text,p_events jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE
  v_owner uuid; e jsonb; v_key text; v_uid text; v_start timestamptz; v_end timestamptz;
  v_name text; old_row public.reservations%ROWTYPE; inserted integer:=0; updated integer:=0;
BEGIN
  IF p_source NOT IN ('airbnb','booking') OR p_source IS NULL OR jsonb_typeof(p_events) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Invalid calendar input';
  END IF;
  IF jsonb_array_length(p_events)>3000 THEN RAISE EXCEPTION 'Calendar too large'; END IF;
  -- Serialize imports for one property, including concurrent user/cron requests.
  SELECT owner_id INTO v_owner FROM public.properties WHERE id=p_property_id FOR UPDATE;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'Property unavailable'; END IF;
  FOR e IN SELECT value FROM jsonb_array_elements(p_events) LOOP
    v_uid:=e->>'uid';
    IF v_uid IS NULL OR length(v_uid) NOT BETWEEN 1 AND 1000
      OR (e->>'dtstart') IS NULL OR (e->>'dtend') IS NULL THEN RAISE EXCEPTION 'Invalid calendar event'; END IF;
    v_key:=p_source || ':' || v_uid;
    v_start:=((e->>'dtstart')::date)::timestamp AT TIME ZONE 'UTC';
    v_end:=((e->>'dtend')::date)::timestamp AT TIME ZONE 'UTC';
    IF v_end<=v_start THEN RAISE EXCEPTION 'Invalid stay dates'; END IF;
    v_name:=left(coalesce(nullif(e->>'summary',''),'Réservation'),500);
    SELECT * INTO old_row FROM public.reservations WHERE property_id=p_property_id
      AND (ical_uid=v_key OR (source=p_source AND (ical_uid=v_uid OR (ical_uid IS NULL AND external_id=v_uid))))
      ORDER BY (ical_uid=v_key) DESC NULLS LAST LIMIT 1 FOR UPDATE;
    IF FOUND THEN
      IF old_row.ical_uid IS DISTINCT FROM v_key OR old_row.guest_name IS DISTINCT FROM v_name
        OR old_row.check_in IS DISTINCT FROM v_start OR old_row.check_out IS DISTINCT FROM v_end THEN
        UPDATE public.reservations SET ical_uid=v_key,guest_name=v_name,check_in=v_start,check_out=v_end
          WHERE id=old_row.id;
        updated:=updated+1;
      END IF;
    ELSE
      -- external_id is intentionally not used: its legacy uniqueness is global,
      -- so equal vendor UIDs from different properties must not move reservations.
      INSERT INTO public.reservations(property_id,owner_id,source,ical_uid,guest_name,check_in,check_out)
        VALUES(p_property_id,v_owner,p_source,v_key,v_name,v_start,v_end);
      inserted:=inserted+1;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('inserted',inserted,'updated',updated);
END; $$;
REVOKE ALL ON FUNCTION public.sync_ical_reservations(uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sync_ical_reservations(uuid,text,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.dispatch_ical_sync(p_check boolean DEFAULT false)
RETURNS SETOF bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u text; k text; p record;
BEGIN
  SELECT decrypted_secret INTO u FROM vault.decrypted_secrets WHERE name='project_url';
  SELECT decrypted_secret INTO k FROM vault.decrypted_secrets WHERE name='completion_worker_key';
  IF nullif(u,'') IS NULL OR nullif(k,'') IS NULL THEN RAISE EXCEPTION 'Internal worker configuration missing'; END IF;
  IF p_check THEN
    RETURN NEXT net.http_post(url:=u || '/functions/v1/sync-ical?check=configuration',
      headers:=jsonb_build_object('Content-Type','application/json','x-service-key',k),body:='{}'::jsonb,timeout_milliseconds:=10000);
    RETURN;
  END IF;
  FOR p IN SELECT id FROM public.properties WHERE nullif(trim(ical_airbnb_url),'') IS NOT NULL
    OR nullif(trim(ical_booking_url),'') IS NOT NULL OR nullif(trim(ical_url),'') IS NOT NULL LOOP
    RETURN NEXT net.http_post(url:=u || '/functions/v1/sync-ical',
      headers:=jsonb_build_object('Content-Type','application/json','x-service-key',k),
      body:=jsonb_build_object('property_id',p.id),timeout_milliseconds:=45000);
  END LOOP;
END; $$;
REVOKE ALL ON FUNCTION public.dispatch_ical_sync(boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_ical_sync(boolean) TO service_role;
SELECT cron.schedule('sync-ical-hourly','0 * * * *','select public.dispatch_ical_sync()');
