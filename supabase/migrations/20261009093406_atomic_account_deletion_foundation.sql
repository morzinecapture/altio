-- LOCAL VALIDATION ONLY: historical/financial accounts remain unsupported.
-- Auth Admin deleteUser is the single mutation. Its FK cascade and this trigger
-- run in one PostgreSQL transaction, including sessions and identities.
create schema if not exists altio_private;
revoke all on schema altio_private from public, anon, authenticated;

create or replace function altio_private.account_deletion_blockers(p_user_id uuid)
returns text[] language plpgsql security definer set search_path = '' as $$
declare
  v_blockers text[] := '{}';
  v_column record;
  v_found boolean;
  v_profile jsonb;
begin
  if p_user_id is null then raise exception 'Missing account identifier'; end if;
  select to_jsonb(u) into v_profile from public.users u where u.id = p_user_id;
  if v_profile is null then return array['profile_missing']::text[]; end if;
  if coalesce(v_profile->>'picture','') <> '' or
     coalesce(v_profile->>'google_calendar_token','') <> '' or
     coalesce(v_profile->>'google_calendar_refresh_token','') <> '' then
    v_blockers := array_append(v_blockers,'external_data');
  end if;
  if exists (select 1 from public.provider_profiles p where p.provider_id=p_user_id and
    (coalesce(p.stripe_account_id,'')<>'' or coalesce(p.rc_pro_doc_url,'')<>'' or coalesce(p.decennale_doc_url,'')<>'')) then
    v_blockers := array_append(v_blockers,'external_data');
  end if;
  if exists (select 1 from storage.objects o where o.owner=p_user_id or o.owner_id=p_user_id::text
      or split_part(o.name,'/',1)=p_user_id::text) then
    v_blockers := array_append(v_blockers,'stored_files');
  end if;
  -- Inspect UUID references, including legacy columns with no FK. Unknown
  -- relationships block deletion instead of being silently cascaded away.
  for v_column in
    select c.relname as table_name, a.attname as column_name
    from pg_catalog.pg_attribute a
    join pg_catalog.pg_class c on c.oid=a.attrelid
    join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in ('r','p') and a.attnum>0 and not a.attisdropped
      and a.atttypid='uuid'::regtype
      and not (c.relname='users' and a.attname='id')
      and not (c.relname in ('notifications','push_tokens','rate_limit_log') and a.attname='user_id')
      and not (c.relname in ('provider_profiles','provider_schedule') and a.attname='provider_id')
      and not (c.relname='favorite_providers' and a.attname in ('owner_id','provider_id'))
      and not (c.relname='blocked_users' and a.attname in ('blocker_id','blocked_id'))
  loop
    execute format('select exists(select 1 from public.%I where %I=$1)',v_column.table_name,v_column.column_name)
      into v_found using p_user_id;
    if v_found then v_blockers:=array_append(v_blockers,'related_records'); exit; end if;
  end loop;
  return v_blockers;
end $$;
revoke all on function altio_private.account_deletion_blockers(uuid) from public, anon, authenticated;

grant usage on schema altio_private to service_role;
grant execute on function altio_private.account_deletion_blockers(uuid) to service_role;

create or replace function public.check_account_deletion(p_user_id uuid)
returns jsonb language sql security invoker set search_path = '' as $$
  select jsonb_build_object('protocol',1,'ready',cardinality(b)=0,'blockers',to_jsonb(b))
  from (select altio_private.account_deletion_blockers(p_user_id) b) s;
$$;
revoke all on function public.check_account_deletion(uuid) from public, anon, authenticated;
grant execute on function public.check_account_deletion(uuid) to service_role;

create or replace function altio_private.cleanup_deleted_account()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_blockers text[];
begin
  -- Direct profile deletion would leave a usable Auth account behind. Only the
  -- parent Auth deletion (whose row is no longer visible here) may cascade.
  if exists(select 1 from auth.users where id=old.id) then
    raise exception 'Delete the authentication account, not the profile';
  end if;
  v_blockers := altio_private.account_deletion_blockers(old.id);
  if cardinality(v_blockers)>0 then
    raise exception 'Account deletion requires related-data processing' using errcode='P0001';
  end if;
  delete from public.notifications where user_id=old.id;
  delete from public.push_tokens where user_id=old.id;
  delete from public.rate_limit_log where user_id=old.id;
  delete from public.provider_schedule where provider_id=old.id;
  delete from public.favorite_providers where owner_id=old.id or provider_id=old.id;
  delete from public.blocked_users where blocker_id=old.id or blocked_id=old.id;
  delete from public.provider_profiles where provider_id=old.id;
  return old;
end $$;
revoke all on function altio_private.cleanup_deleted_account() from public, anon, authenticated;

alter table public.users drop constraint users_id_fkey;
alter table public.users add constraint users_id_fkey foreign key (id) references auth.users(id) on delete cascade;
create trigger cleanup_deleted_account before delete on public.users
for each row execute function altio_private.cleanup_deleted_account();

-- Check BEFORE any Auth child cascade can erase evidence of related records.
create or replace function altio_private.guard_auth_account_deletion()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.users where id=old.id for update;
  if not found then raise exception 'Account profile requires reconciliation'; end if;
  if cardinality(altio_private.account_deletion_blockers(old.id))>0 then
    raise exception 'Account deletion requires related-data processing';
  end if;
  return old;
end $$;
revoke all on function altio_private.guard_auth_account_deletion() from public, anon, authenticated;
create trigger altio_guard_account_deletion before delete on auth.users
for each row execute function altio_private.guard_auth_account_deletion();
