create table altio_private.account_erasure_jobs (
 id uuid primary key default gen_random_uuid(), subject_id uuid unique not null,
 state text not null default 'processing' check(state in ('processing','completed')),
 lease_token uuid,lease_until timestamptz,created_at timestamptz not null default now(),
 google_revoked_at timestamptz,resources_cleared_at timestamptz,completed_at timestamptz,
 last_error text,attempts integer not null default 0
);
create table altio_private.account_erasure_objects (
 job_id uuid not null references altio_private.account_erasure_jobs(id) on delete cascade,
 bucket_id text not null,name text not null,removed_at timestamptz,
 primary key(job_id,bucket_id,name)
);
alter table altio_private.account_erasure_jobs enable row level security;
alter table altio_private.account_erasure_objects enable row level security;
revoke all on altio_private.account_erasure_jobs,altio_private.account_erasure_objects from public,anon,authenticated;

create or replace function altio_private.erasure_files(p_user_id uuid)
returns table(bucket_id text,name text) language sql stable security definer set search_path='' as $$
 select o.bucket_id,o.name from storage.objects o where
 o.owner=p_user_id or o.owner_id=p_user_id::text or
 (o.bucket_id in ('avatars','insurance-documents','emergency-photos') and split_part(o.name,'/',1)=p_user_id::text) or
 (o.bucket_id='property-photos' and exists(select 1 from public.properties p where p.owner_id=p_user_id and p.id::text=split_part(o.name,'/',1))) or
 (o.bucket_id='mission_proofs' and split_part(o.name,'/',2)=p_user_id::text);
$$;
revoke all on function altio_private.erasure_files(uuid) from public,anon,authenticated;

create or replace function altio_private.erasure_preflight(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare blockers text[];
begin
 blockers:=array_remove(array_remove(altio_private.account_deletion_blockers(p_user_id),'stored_files'),'external_data');
 if exists(select 1 from altio_private.erasure_files(p_user_id) where bucket_id not in ('avatars','insurance-documents','property-photos','mission_proofs','emergency-photos')) then
 blockers:=array_append(blockers,'unclassified_storage');end if;
 return jsonb_build_object('protocol',1,'ready',cardinality(blockers)=0,'blockers',to_jsonb(blockers));
end $$;
revoke all on function altio_private.erasure_preflight(uuid) from public,anon,authenticated;
grant execute on function altio_private.erasure_preflight(uuid) to service_role;
create or replace function public.check_account_deletion(p_user_id uuid)
returns jsonb language sql security invoker set search_path='' as $$select altio_private.erasure_preflight(p_user_id);$$;

create or replace function altio_private.begin_account_erasure(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare job altio_private.account_erasure_jobs;
begin
 perform 1 from public.users where id=p_user_id for update;
 if not found then raise exception 'Account unavailable';end if;
 if not (altio_private.erasure_preflight(p_user_id)->>'ready')::boolean then raise exception 'Account requires related-data processing';end if;
 insert into altio_private.account_erasure_jobs(subject_id) values(p_user_id) on conflict(subject_id) do nothing;
 select * into job from altio_private.account_erasure_jobs where subject_id=p_user_id for update;
 insert into altio_private.account_erasure_objects(job_id,bucket_id,name)
 select job.id,f.bucket_id,f.name from altio_private.erasure_files(p_user_id) f on conflict do nothing;
 return jsonb_build_object('id',job.id,'state',job.state);
end $$;

create or replace function altio_private.claim_account_erasure(p_job_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare job altio_private.account_erasure_jobs; files jsonb; token text;
begin
 select * into job from altio_private.account_erasure_jobs where id=p_job_id for update skip locked;
 if not found or job.state='completed' or job.lease_until>now() then return null;end if;
 update altio_private.account_erasure_jobs set lease_token=gen_random_uuid(),lease_until=now()+interval '2 minutes',attempts=attempts+1
 where id=p_job_id returning * into job;
 -- Discover objects created by a server operation that raced the initial request.
 insert into altio_private.account_erasure_objects(job_id,bucket_id,name)
 select job.id,f.bucket_id,f.name from altio_private.erasure_files(job.subject_id) f
 on conflict(job_id,bucket_id,name) do update set removed_at=null;
 select coalesce(jsonb_agg(to_jsonb(f)),'[]') into files from
 (select bucket_id,name from altio_private.account_erasure_objects where job_id=p_job_id and removed_at is null order by bucket_id,name limit 100) f;
 select coalesce(nullif(google_calendar_refresh_token,''),nullif(google_calendar_token,'')) into token from public.users where id=job.subject_id;
 return jsonb_build_object('id',job.id,'subjectId',job.subject_id,'leaseToken',job.lease_token,'files',files,
 'googleToken',case when job.google_revoked_at is null then token else null end,'resourcesCleared',job.resources_cleared_at is not null);
end $$;

create or replace function altio_private.check_erasure_lease(p_job_id uuid,p_lease uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare target uuid;
begin
 select subject_id into target from altio_private.account_erasure_jobs where id=p_job_id and lease_token=p_lease and lease_until>now() and state='processing' for update;
 if not found then raise exception 'Erasure lease unavailable';end if;return target;
end $$;

create or replace function altio_private.checkpoint_account_erasure(p_job_id uuid,p_lease uuid,p_step text,p_bucket text default null,p_names text[] default null)
returns boolean language plpgsql security definer set search_path='' as $$
declare target uuid;
begin
 target:=altio_private.check_erasure_lease(p_job_id,p_lease);
 if p_step='files' then
  update altio_private.account_erasure_objects set removed_at=now() where job_id=p_job_id and bucket_id=p_bucket and name=any(p_names);
 elsif p_step='google' then
  update public.users set google_calendar_token=null,google_calendar_refresh_token=null where id=target;
  update altio_private.account_erasure_jobs set google_revoked_at=now() where id=p_job_id;
 elsif p_step='resources' then
  if exists(select 1 from altio_private.account_erasure_objects where job_id=p_job_id and removed_at is null) or
    exists(select 1 from altio_private.erasure_files(target)) then return false;end if;
  if exists(select 1 from public.users where id=target and (nullif(google_calendar_token,'') is not null or nullif(google_calendar_refresh_token,'') is not null)) then return false;end if;
  insert into altio_private.retained_account_documents(kind,record_id,subject_id,payload,retention_review_after)
   select 'stripe_account',target,target,jsonb_build_object('stripe_account_id',stripe_account_id),(now()+interval '11 years')::date
   from public.provider_profiles where provider_id=target and nullif(stripe_account_id,'') is not null on conflict do nothing;
  update public.users set picture=null where id=target;
  update public.provider_profiles set stripe_account_id=null,rc_pro_doc_url=null,decennale_doc_url=null where provider_id=target;
  update altio_private.account_erasure_jobs set resources_cleared_at=now() where id=p_job_id;
 elsif p_step='complete' then
  if exists(select 1 from auth.users where id=target) then return false;end if;
  update altio_private.account_erasure_jobs set state='completed',completed_at=now(),lease_token=null,lease_until=null,last_error=null where id=p_job_id;
 elsif p_step='retry' then
  update altio_private.account_erasure_jobs set lease_token=null,lease_until=null,last_error='retry_required' where id=p_job_id;
 else raise exception 'Unknown erasure step';end if;
 return true;
end $$;

create or replace function altio_private.pending_account_erasures()
returns jsonb language sql security definer set search_path='' as $$
 select coalesce(jsonb_agg(id),'[]') from (select id from altio_private.account_erasure_jobs where state='processing' and (lease_until is null or lease_until<now()) order by created_at limit 3) jobs;
$$;

-- Publish only service-role wrappers. No credentials or object paths are exposed
-- to end users. The code receives these only after server-side authentication.
do $wrappers$
declare f record; args text;
begin
 for f in select p.oid,p.proname,pg_get_function_identity_arguments(p.oid) signature,pg_get_function_arguments(p.oid) declaration,
 pg_get_function_result(p.oid) result,p.proargnames from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='altio_private' and p.proname in ('begin_account_erasure','claim_account_erasure','checkpoint_account_erasure','pending_account_erasures')
 loop
  args:=array_to_string(f.proargnames,',');
  execute format('revoke all on function altio_private.%I(%s) from public,anon,authenticated',f.proname,f.signature);
  execute format('grant execute on function altio_private.%I(%s) to service_role',f.proname,f.signature);
  execute format('create or replace function public.%I(%s) returns %s language sql security invoker set search_path='''' as $body$ select altio_private.%I(%s); $body$',f.proname,f.declaration,f.result,f.proname,coalesce(args,''));
  execute format('revoke all on function public.%I(%s) from public,anon,authenticated',f.proname,f.signature);
  execute format('grant execute on function public.%I(%s) to service_role',f.proname,f.signature);
 end loop;
end $wrappers$;
revoke all on function altio_private.check_erasure_lease(uuid,uuid) from public,anon,authenticated,service_role;

-- Freeze the user's authenticated access while external cleanup is in progress.
create or replace function altio_private.has_active_session()
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.sessions s join auth.users u on u.id=s.user_id
 where s.user_id=auth.uid() and s.id::text=auth.jwt()->>'session_id' and u.deleted_at is null
 and not exists(select 1 from altio_private.account_erasure_jobs j where j.subject_id=u.id and j.state='processing'));
$$;
create or replace function altio_private.is_auth_session_active(p_user_id uuid,p_session_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.sessions s join auth.users u on u.id=s.user_id
 where s.id=p_session_id and s.user_id=p_user_id and u.deleted_at is null
 and not exists(select 1 from altio_private.account_erasure_jobs j where j.subject_id=u.id and j.state='processing'));
$$;

-- Background service jobs must not create new operational work after the
-- deletion request froze client access. Financial reconciliation stays allowed.
create or replace function altio_private.guard_erasure_writes()
returns trigger language plpgsql security definer set search_path='' as $$
declare field text; subject uuid; row_data jsonb:=to_jsonb(new);
begin
 foreach field in array array['user_id','owner_id','provider_id','assigned_provider_id','accepted_provider_id','target_provider_id','sender_id','receiver_id','accepted_by'] loop
  if row_data ? field and row_data->>field is not null then
   subject:=(row_data->>field)::uuid;
   if exists(select 1 from altio_private.account_erasure_jobs where subject_id=subject and state='processing')
    and not (coalesce(current_setting('altio.erasure_subject',true),'')=subject::text and current_setting('role',true) in ('service_role','supabase_auth_admin','none')) then
    raise exception 'Account erasure in progress' using errcode='42501';
   end if;
  end if;
 end loop;
 return new;
end $$;
revoke all on function altio_private.guard_erasure_writes() from public,anon,authenticated;
do $guards$
declare t record;
begin
 for t in select distinct c.relname from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relkind='r' and a.attnum>0 and not a.attisdropped and a.atttypid='uuid'::regtype
 and a.attname in ('user_id','owner_id','provider_id','assigned_provider_id','accepted_provider_id','target_provider_id','sender_id','receiver_id','accepted_by')
 and c.relname not in ('invoices','credit_note_jobs','stripe_refund_events','payments')
 loop
 execute format('create trigger guard_erasure_writes before insert or update on public.%I for each row execute function altio_private.guard_erasure_writes()',t.relname);
 end loop;
end $guards$;
-- Mark only privileged cleanup transactions as erasure writes. The marker
-- alone is insufficient: authenticated role writes are still rejected.
do $context$
declare f record; body text;
begin
 for f in select oid,prosrc from pg_proc where oid in
 ('altio_private.erase_closed_account_data(uuid)'::regprocedure,'altio_private.checkpoint_account_erasure(uuid,uuid,text,text,text[])'::regprocedure)
 loop
 if f.oid='altio_private.erase_closed_account_data(uuid)'::regprocedure then
 body:=replace(f.prosrc,' select * into old', ' perform set_config(''altio.erasure_subject'',p_user_id::text,true); select * into old');
 else
 body:=replace(f.prosrc,' target:=altio_private.check_erasure_lease(p_job_id,p_lease);',' target:=altio_private.check_erasure_lease(p_job_id,p_lease); perform set_config(''altio.erasure_subject'',target::text,true);');
 end if;
 if body=f.prosrc then raise exception 'Erasure context insertion failed';end if;
 execute replace(pg_get_functiondef(f.oid),f.prosrc,body);
 end loop;
end $context$;
