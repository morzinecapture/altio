alter table public.reservations add column ical_cancelled_at timestamptz;
CREATE OR REPLACE FUNCTION public.sync_ical_reservations(p_property_id uuid,p_source text,p_events jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE
  v_owner uuid; e jsonb; v_key text; v_uid text; v_start timestamptz; v_end timestamptz;
  v_name text; old_row public.reservations%ROWTYPE; inserted integer:=0; updated integer:=0; cancelled integer:=0;
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
    IF e->>'cancelled'='true' THEN
      IF v_uid IS NULL OR length(v_uid) NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'Invalid cancelled event'; END IF;
      UPDATE public.reservations SET ical_cancelled_at=now() WHERE property_id=p_property_id AND source=p_source
       AND (ical_uid=p_source||':'||v_uid OR ical_uid=v_uid OR (ical_uid IS NULL AND external_id=v_uid)) AND ical_cancelled_at IS NULL;
      IF FOUND THEN cancelled:=cancelled+1; END IF;
      CONTINUE;
    END IF;
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
      IF old_row.ical_cancelled_at IS NOT NULL OR old_row.ical_uid IS DISTINCT FROM v_key OR old_row.guest_name IS DISTINCT FROM v_name
        OR old_row.check_in IS DISTINCT FROM v_start OR old_row.check_out IS DISTINCT FROM v_end THEN
        UPDATE public.reservations SET ical_cancelled_at=null,ical_uid=v_key,guest_name=v_name,check_in=v_start,check_out=v_end
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
  RETURN jsonb_build_object('inserted',inserted,'updated',updated,'cancelled',cancelled);
END; $$;
REVOKE ALL ON FUNCTION public.sync_ical_reservations(uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sync_ical_reservations(uuid,text,jsonb) TO service_role;

-- A missing event in a rolling vendor feed is NOT evidence of cancellation.
-- Only explicit CANCELLED events remove a stay from the active calendar.
create or replace function public.reconcile_reservation_missions()
returns trigger language plpgsql security definer set search_path='' as $$
declare m public.missions; changed_date boolean; cancelled boolean; restored boolean;
begin
 changed_date:=old.check_out is distinct from new.check_out;
 cancelled:=old.ical_cancelled_at is null and new.ical_cancelled_at is not null;
 restored:=old.ical_cancelled_at is not null and new.ical_cancelled_at is null;
 if restored then
  perform public._send_push(new.owner_id,'Réservation rétablie — ménage à vérifier',
   'Le séjour est de nouveau présent au calendrier. Vérifiez son ménage : une mission annulée n’est pas réengagée automatiquement.',
   (select id from public.missions where reservation_id=new.id limit 1),'mission');
 end if;
 if not changed_date and not cancelled then return new;end if;
 for m in select * from public.missions where reservation_id=new.id and status not in ('completed','cancelled','expired','rejected') for update loop
  if m.mission_type='cleaning' and m.status='pending' and m.assigned_provider_id is null and coalesce(m.applications_count,0)=0
   and not exists(select 1 from public.mission_applications where mission_id=m.id)
   and (cancelled or m.scheduled_date=old.check_out) and m.payment_intent_id is null and m.stripe_payment_intent_id is null and m.started_at is null then
   if cancelled then update public.missions set status='cancelled',cancelled_at=now() where id=m.id;
   else update public.missions set scheduled_date=new.check_out where id=m.id;end if;
  else
   perform public._send_push(new.owner_id,'Réservation modifiée — mission à vérifier',
    case when cancelled then 'Le calendrier indique une annulation. Vérifiez la mission avec le prestataire : son engagement et les paiements restent à traiter.' else 'La date de départ a changé. Confirmez la nouvelle date avec le prestataire avant de modifier sa mission.' end,m.id,'mission');
   if m.assigned_provider_id is not null then
    perform public._send_push(m.assigned_provider_id,'Réservation modifiée',
     'Le calendrier du logement a changé. Contactez le propriétaire pour confirmer le maintien et la date de votre mission.',m.id,'mission');
   end if;
  end if;
 end loop;
 return new;
end $$;
revoke all on function public.reconcile_reservation_missions() from public,anon,authenticated;
create trigger reconcile_reservation_missions after update of check_out,ical_cancelled_at on public.reservations
for each row execute function public.reconcile_reservation_missions();
create or replace function public.guard_cancelled_reservation_mission()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.reservation_id is not null and exists(select 1 from public.reservations where id=new.reservation_id and ical_cancelled_at is not null) then
 raise exception 'Reservation cancelled: cannot create a new mission';end if;return new;
end $$;
revoke all on function public.guard_cancelled_reservation_mission() from public,anon,authenticated;
create trigger guard_cancelled_reservation_mission before insert on public.missions for each row execute function public.guard_cancelled_reservation_mission();
