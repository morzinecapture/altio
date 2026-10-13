-- A still-unexpired JWT must not retain database/storage access after sign-out
-- or deletion. Keep ownership policies: this restrictive policy only narrows them.
create schema if not exists altio_private;
revoke all on schema altio_private from public, anon;
grant usage on schema altio_private to authenticated, service_role;
create or replace function altio_private.has_active_session()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from auth.sessions s join auth.users u on u.id=s.user_id
    where s.user_id=auth.uid() and s.id::text=auth.jwt()->>'session_id'
      and u.deleted_at is null
  );
$$;
revoke all on function altio_private.has_active_session() from public, anon;
grant execute on function altio_private.has_active_session() to authenticated, service_role;

do $migration$
declare t record;
begin
  for t in select n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where c.relkind in ('r','p') and c.relrowsecurity
      and (n.nspname='public' or (n.nspname='storage' and c.relname='objects'))
  loop
    execute format('create policy require_active_session on %I.%I as restrictive for all to authenticated using ((select altio_private.has_active_session())) with check ((select altio_private.has_active_session()))',t.nspname,t.relname);
  end loop;
end $migration$;

-- Directory views intentionally expose a reduced set of fields; their owner
-- bypasses base-table RLS, so apply the session check to the view itself.
do $migration$
declare v record; definition text;
begin
  for v in select c.oid,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='v'
      and c.relname in ('public_profiles','public_provider_profiles','admin_dashboard_stats')
  loop
    definition:=regexp_replace(pg_get_viewdef(v.oid,true),'[;[:space:]]+$','');
    execute format('create or replace view public.%I with (security_barrier=true) as select * from (%s) directory where (select altio_private.has_active_session())',v.relname,definition);
  end loop;
end $migration$;

-- Privileged RPCs bypass table RLS too. Guard the current user-facing set and
-- remove direct client EXECUTE from trigger-only functions (triggers still run).
do $migration$
declare f record; body text; definition text; gate text;
begin
  gate := '(current_setting(''role'',true) = ''service_role'' OR (select altio_private.has_active_session()))';
  for f in select p.oid,p.proname,p.prosrc,p.prorettype,l.lanname from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace join pg_language l on l.oid=p.prolang
    where n.nspname='public' and p.prosecdef and has_function_privilege('authenticated',p.oid,'execute')
  loop
    if f.prorettype='trigger'::regtype then
      execute format('revoke execute on function %s from public, anon, authenticated',f.oid::regprocedure);
    elsif f.proname in ('_provider_has_bid_on_emergency','_provider_eligible_for_intervention_broadcast',
      'is_admin','is_mission_owner','_provider_has_bid_on_intervention','insert_notification_for_user',
      '_intervention_has_capacity_for_bids','can_send_notification','get_intervention_property_preview') then
      if f.lanname='sql' then
        body:=format('SELECT CASE WHEN %s THEN (%s) ELSE NULL END;',gate,regexp_replace(f.prosrc,'[;[:space:]]+$',''));
      elsif f.lanname='plpgsql' then
        body:=regexp_replace(f.prosrc,'\mBEGIN\M',format('BEGIN IF NOT %s THEN RAISE EXCEPTION ''Session inactive'' USING ERRCODE=''42501''; END IF;',gate),'i');
        if body=f.prosrc then raise exception 'Cannot guard function %',f.proname; end if;
      else raise exception 'Unsupported privileged function language: %',f.proname;
      end if;
      definition:=pg_get_functiondef(f.oid);
      execute replace(definition,f.prosrc,body);
      execute format('alter function %s set search_path = pg_catalog, public, pg_temp',f.oid::regprocedure);
    else
      raise exception 'Review unexpected privileged RPC before enabling session guard: %',f.proname;
    end if;
  end loop;
end $migration$;

-- Edge Functions use a trusted service client after auth.getUser(token).
create or replace function altio_private.is_auth_session_active(p_user_id uuid,p_session_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.sessions s join auth.users u on u.id=s.user_id
   where s.id=p_session_id and s.user_id=p_user_id and u.deleted_at is null);
$$;
revoke all on function altio_private.is_auth_session_active(uuid,uuid) from public,anon,authenticated;
grant execute on function altio_private.is_auth_session_active(uuid,uuid) to service_role;
create or replace function public.is_auth_session_active(p_user_id uuid,p_session_id uuid)
returns boolean language sql stable security invoker set search_path='' as $$
 select altio_private.is_auth_session_active(p_user_id,p_session_id);
$$;
revoke all on function public.is_auth_session_active(uuid,uuid) from public,anon,authenticated;
grant execute on function public.is_auth_session_active(uuid,uuid) to service_role;
