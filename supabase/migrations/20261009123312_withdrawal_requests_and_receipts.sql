create table public.withdrawal_requests (
 id uuid primary key, user_id uuid references public.users(id) on delete set null,
 contract_kind text not null check(contract_kind in ('mission','emergency','intervention','platform')),
 contract_id uuid, declaration text not null, receipt jsonb not null,
 reclamation_id uuid references public.reclamations(id) on delete set null,
 created_at timestamptz not null default now(),receipt_sent_at timestamptz,receipt_attempted_at timestamptz,
 receipt_error boolean not null default false
);
alter table public.withdrawal_requests enable row level security;
revoke all on public.withdrawal_requests from public,anon,authenticated;
grant select on public.withdrawal_requests to authenticated;
grant select,insert,update on public.withdrawal_requests to service_role;
create policy withdrawal_owner_read on public.withdrawal_requests for select to authenticated using(user_id=auth.uid());
create policy require_active_session on public.withdrawal_requests as restrictive for all to authenticated using((select altio_private.has_active_session())) with check((select altio_private.has_active_session()));
create or replace function public.submit_withdrawal(p_user_id uuid,p_request_id uuid,p_kind text,p_contract_id uuid,p_declaration text,p_verified_email text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u public.users;r public.withdrawal_requests; owner_id uuid; provider_id uuid; complaint uuid; receipt jsonb;
begin
 select * into u from public.users where id=p_user_id for update;
 if not found or u.role<>'owner' then raise exception 'Owner account required';end if;
 if exists(select 1 from altio_private.account_erasure_jobs where subject_id=p_user_id and state='processing') then raise exception 'Account erasure in progress';end if;
 select * into r from public.withdrawal_requests where id=p_request_id;
 if found then
  if r.user_id is distinct from p_user_id or r.contract_kind is distinct from p_kind or r.contract_id is distinct from p_contract_id or r.declaration is distinct from p_declaration then raise exception 'Withdrawal reference conflict';end if;
  return to_jsonb(r);
 end if;
 if p_verified_email is null or length(p_verified_email)>320 or p_verified_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then raise exception 'Verified email required';end if;
 if p_request_id is null or p_kind not in ('mission','emergency','intervention','platform') or p_kind is null or length(trim(p_declaration)) not between 1 and 4000 then raise exception 'Invalid declaration';end if;
 if p_kind='mission' then select m.owner_id,m.assigned_provider_id into owner_id,provider_id from public.missions m where id=p_contract_id for update;
 elsif p_kind='emergency' then select e.owner_id,e.accepted_provider_id into owner_id,provider_id from public.emergency_requests e where id=p_contract_id for update;
 elsif p_kind='intervention' then select i.owner_id,i.assigned_provider_id into owner_id,provider_id from public.interventions i where id=p_contract_id for update;
 else owner_id:=p_user_id;end if;
 if owner_id is distinct from p_user_id then raise exception 'Contract unavailable';end if;
 -- Record the declaration without deciding eligibility or claiming a refund.
 insert into public.reclamations(user_id,type,mission_id,emergency_id,description,status)
 values(p_user_id,'other',case when p_kind='mission' then p_contract_id end,case when p_kind='emergency' then p_contract_id end,
 'Rétractation — '||p_kind||' '||coalesce(p_contract_id::text,'service Altio')||E'\n'||p_declaration,'open') returning id into complaint;
 if provider_id is not null then
  perform public._send_push(provider_id,'Déclaration de rétractation reçue',p_declaration,p_contract_id,p_kind);
 end if;
 -- Freeze automated completion through the existing complaint trigger.
 receipt:=jsonb_build_object('reference',p_request_id,'submittedAt',now(),'name',u.name,'email',p_verified_email,
 'contractKind',p_kind,'contractId',p_contract_id,'declaration',p_declaration,
 'notice','Votre déclaration de rétractation a été enregistrée. Cet accusé confirme sa réception ; le traitement du contrat et des sommes éventuellement dues ou remboursables est en cours.');
 insert into public.withdrawal_requests(id,user_id,contract_kind,contract_id,declaration,receipt,reclamation_id)
 values(p_request_id,p_user_id,p_kind,p_contract_id,p_declaration,receipt,complaint) returning * into r;
 return to_jsonb(r);
end $$;
revoke all on function public.submit_withdrawal(uuid,uuid,text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.submit_withdrawal(uuid,uuid,text,uuid,text,text) to service_role;
-- Closed requests are archived with the complaint evidence; open complaints
-- already prevent account erasure. Do not leave receipts in client-visible rows.
do $$
declare body text;definition text;
begin
 select prosrc,pg_get_functiondef(oid) into body,definition from pg_proc where oid='altio_private.erase_closed_account_data(uuid)'::regprocedure;
 execute replace(definition,body,replace(body,' -- Contract evidence',
 ' insert into altio_private.retained_account_documents(kind,record_id,subject_id,payload,retention_review_after)
 select ''withdrawal'',id,p_user_id,receipt,(now()+interval ''5 years'')::date from public.withdrawal_requests where user_id=p_user_id on conflict do nothing;
 delete from public.withdrawal_requests where user_id=p_user_id;
 -- Contract evidence'));
 select prosrc,pg_get_functiondef(oid) into body,definition from pg_proc where oid='altio_private.account_deletion_blockers(uuid)'::regprocedure;
 execute replace(definition,body,replace(body,'''reclamations'',''reports''' ,'''withdrawal_requests'',''reclamations'',''reports''' ));
end $$;
