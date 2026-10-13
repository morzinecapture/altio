-- Historical business rows retain amounts/references for the other participant,
-- while direct account identifiers and the deleting user's content are removed.
-- Open work/disputes and unresolved financial jobs still stop final deletion.
alter table public.missions alter column owner_id drop not null;
alter table public.missions alter column property_id drop not null;
alter table public.emergency_requests alter column owner_id drop not null;
alter table public.emergency_requests alter column property_id drop not null;
alter table public.interventions alter column owner_id drop not null;
alter table public.emergency_completion_steps alter column owner_id drop not null;
alter table public.emergency_completion_steps alter column provider_id drop not null;

create table altio_private.retained_account_documents (
 kind text not null, record_id uuid not null, subject_id uuid not null,
 payload jsonb not null, archived_at timestamptz not null default now(),
 retention_review_after date not null,
 primary key(kind,record_id,subject_id)
);
alter table altio_private.retained_account_documents enable row level security;
revoke all on altio_private.retained_account_documents from public,anon,authenticated;

create or replace function altio_private.account_deletion_blockers(p_user_id uuid)
returns text[] language plpgsql security definer set search_path='' as $$
declare result text[]:='{}'; p jsonb; col record; found_reference boolean;
begin
 if p_user_id is null then raise exception 'Missing account identifier'; end if;
 select to_jsonb(u) into p from public.users u where id=p_user_id;
 if p is null then return array['profile_missing']; end if;
 if coalesce(p->>'picture','')<>'' or coalesce(p->>'google_calendar_token','')<>'' or coalesce(p->>'google_calendar_refresh_token','')<>''
 or exists(select 1 from public.provider_profiles where provider_id=p_user_id and
 (coalesce(stripe_account_id,'')<>'' or coalesce(rc_pro_doc_url,'')<>'' or coalesce(decennale_doc_url,'')<>'')) then
 result:=array_append(result,'external_data'); end if;
 if exists(select 1 from storage.objects where owner=p_user_id or owner_id=p_user_id::text or split_part(name,'/',1)=p_user_id::text)
 then result:=array_append(result,'stored_files'); end if;
 if exists(select 1 from public.missions where (owner_id=p_user_id or assigned_provider_id=p_user_id) and status not in ('completed','cancelled','rejected','expired'))
 or exists(select 1 from public.emergency_requests where (owner_id=p_user_id or accepted_provider_id=p_user_id) and status not in ('completed','cancelled','expired'))
 or exists(select 1 from public.interventions where (owner_id=p_user_id or assigned_provider_id=p_user_id) and phase not in ('completed','cancelled','expired'))
 or exists(select 1 from public.emergency_completion_steps where (owner_id=p_user_id or provider_id=p_user_id) and
   (status not in ('paid','cancelled') or (status='paid' and invoiced_at is null)))
 then result:=array_append(result,'open_work'); end if;
 if exists(select 1 from public.reclamations where user_id=p_user_id and status not in ('resolved','closed'))
 or exists(select 1 from public.reports where (reporter_id=p_user_id or reported_user_id=p_user_id) and status not in ('resolved','dismissed','closed'))
 then result:=array_append(result,'open_dispute'); end if;
 if exists(select 1 from public.invoices i left join altio_private.invoice_parties s on s.invoice_id=i.id
   where (i.seller_id=p_user_id or i.buyer_id=p_user_id) and (s.invoice_id is null or
    (i.seller_id=p_user_id and s.seller is null) or (i.buyer_id=p_user_id and s.buyer is null)))
 then result:=array_append(result,'billing_snapshot_missing'); end if;
 if exists(select 1 from public.credit_note_jobs j join public.invoices i on i.id=j.invoice_id
  where (i.seller_id=p_user_id or i.buyer_id=p_user_id) and j.issued_at is null)
 or exists(select 1 from public.stripe_refund_events r join public.invoices i on i.stripe_pi_id=r.payment_intent_id
  where (i.seller_id=p_user_id or i.buyer_id=p_user_id) and r.reconciliation_state<>'completed')
 then result:=array_append(result,'financial_processing'); end if;
 -- Unknown relationships are deliberately refused, including legacy UUID
 -- references without a FK. The known tables below are explicitly handled.
 for col in select c.relname table_name,a.attname column_name from pg_attribute a join pg_class c on c.oid=a.attrelid
 join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p')
 and a.attnum>0 and not a.attisdropped and a.atttypid='uuid'::regtype
 and c.relname not in ('users','provider_profiles','notifications','push_tokens','rate_limit_log','provider_schedule',
 'favorite_providers','blocked_users','missions','emergency_requests','interventions','emergency_completion_steps',
 'messages','properties','reservations','concierge_assignments','invoices','mission_quotes','quotes','quote_line_items',
 'mission_applications','emergency_bids','intervention_bids','mission_photos','reviews','provider_reviews',
 'reclamations','reports','audit_log','invoice_mandate_counters','quote_provider_counters')
 loop
 execute format('select exists(select 1 from public.%I where %I=$1)',col.table_name,col.column_name) into found_reference using p_user_id;
 if found_reference then result:=array_append(result,'unknown_relationship');exit;end if;
 end loop;
 return result;
end $$;

create or replace function altio_private.erase_closed_account_data(p_user_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare old public.users; property_ids uuid[]; affected_providers uuid[];
begin
 select * into old from public.users where id=p_user_id for update;
 if not found then raise exception 'Missing account profile';end if;
 if cardinality(altio_private.account_deletion_blockers(old.id))>0 then raise exception 'Account deletion requires related-data processing';end if;
 select coalesce(array_agg(id),'{}') into property_ids from public.properties where owner_id=old.id;
 select coalesce(array_agg(distinct provider_id),'{}') into affected_providers from public.reviews where owner_id=old.id;
 -- Contract evidence has restricted access and an explicit review date. Do not
 -- retain the user's whole profile, OAuth credentials or unrelated messages.
 insert into altio_private.retained_account_documents(kind,record_id,subject_id,payload,retention_review_after)
 select 'accepted_quote',q.id,old.id,jsonb_build_object('quote',to_jsonb(q),'lines',
  (select coalesce(jsonb_agg(to_jsonb(l)),'[]') from public.quote_line_items l where l.quote_id=q.id)),
 (date_trunc('year',coalesce(q.accepted_at,q.created_at,now()))+interval '11 years')::date
 from public.mission_quotes q where q.status='accepted' and (q.provider_id=old.id or q.accepted_by=old.id)
 on conflict do nothing;
 insert into altio_private.retained_account_documents(kind,record_id,subject_id,payload,retention_review_after)
 select 'resolved_complaint',r.id,old.id,to_jsonb(r),(coalesce(r.resolved_at,r.created_at,now())+interval '5 years')::date
 from public.reclamations r where r.user_id=old.id on conflict do nothing;

 update public.invoices set seller_id=null where seller_id=old.id;
 update public.invoices set buyer_id=null where buyer_id=old.id;
 update public.mission_quotes set provider_id=null where provider_id=old.id;
 update public.mission_quotes set accepted_by=null,owner_signature_ip=null,owner_signature_png=null,owner_signature_text=null where accepted_by=old.id;
 update public.quotes set provider_id=null where provider_id=old.id;
 update public.missions set owner_id=null,description=null,dispute_reason=null,google_event_id=null where owner_id=old.id;
 update public.missions set assigned_provider_id=null where assigned_provider_id=old.id;
 update public.missions set dispute_resolved_by=null where dispute_resolved_by=old.id;
 update public.missions set property_id=null where property_id=any(property_ids);
 update public.emergency_requests set owner_id=null,description='Compte supprimé',photos='{}' where owner_id=old.id;
 update public.emergency_requests set accepted_provider_id=null,before_photos='{}',after_photos='{}' where accepted_provider_id=old.id;
 update public.emergency_requests set target_provider_id=null where target_provider_id=old.id;
 update public.emergency_requests set property_id=null where property_id=any(property_ids);
 update public.interventions set owner_id=null,description=null,photos='{}',dispute_reason=null,google_event_id=null where owner_id=old.id;
 update public.interventions set assigned_provider_id=null where assigned_provider_id=old.id;
 update public.interventions set target_provider_id=null where target_provider_id=old.id;
 update public.interventions set dispute_resolved_by=null where dispute_resolved_by=old.id;
 update public.interventions set property_id=null where property_id=any(property_ids);
 update public.emergency_completion_steps set owner_id=null,dispute_reason=null where owner_id=old.id;
 update public.emergency_completion_steps set provider_id=null where provider_id=old.id;
 delete from public.messages where sender_id=old.id or receiver_id=old.id;
 delete from public.mission_photos where provider_id=old.id;
 delete from public.reviews where owner_id=old.id or provider_id=old.id;
 delete from public.provider_reviews where owner_id=old.id or provider_id=old.id;
 update public.provider_profiles p set average_rating=(select round(avg(r.rating),2) from public.reviews r where r.provider_id=p.provider_id),
 total_reviews=(select count(*) from public.reviews r where r.provider_id=p.provider_id) where p.provider_id=any(affected_providers) and p.provider_id<>old.id;
 delete from public.reclamations where user_id=old.id;
 delete from public.reports where reporter_id=old.id;
 update public.reports set reported_user_id=null where reported_user_id=old.id;
 update public.reports set resolved_by=null where resolved_by=old.id;
 update public.audit_log set admin_id=null where admin_id=old.id;
 update public.audit_log set target_id=null,metadata='{}' where target_type='user' and target_id=old.id;
 delete from public.notifications where user_id=old.id;
 delete from public.push_tokens where user_id=old.id;
 delete from public.rate_limit_log where user_id=old.id;
 delete from public.provider_schedule where provider_id=old.id;
 delete from public.favorite_providers where owner_id=old.id or provider_id=old.id;
 delete from public.blocked_users where blocker_id=old.id or blocked_id=old.id;
 delete from public.mission_applications where provider_id=old.id;
 delete from public.emergency_bids where provider_id=old.id;
 delete from public.intervention_bids where provider_id=old.id;
 delete from public.concierge_assignments where provider_id=old.id or property_id=any(property_ids);
 delete from public.reservations where owner_id=old.id or property_id=any(property_ids);
 delete from public.properties where owner_id=old.id;
 delete from public.provider_profiles where provider_id=old.id;
 return;
end $$;

revoke all on function altio_private.erase_closed_account_data(uuid) from public,anon,authenticated,service_role;
create or replace function altio_private.guard_auth_account_deletion()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.users where id=old.id for update;
 if not found then raise exception 'Account profile requires reconciliation';end if;
 if cardinality(altio_private.account_deletion_blockers(old.id))>0 then raise exception 'Account deletion requires related-data processing';end if;
 perform altio_private.erase_closed_account_data(old.id);
 return old;
end $$;
