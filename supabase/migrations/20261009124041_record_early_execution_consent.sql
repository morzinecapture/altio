create table altio_private.early_execution_consents (
 id uuid primary key default gen_random_uuid(),user_id uuid not null,reference_id uuid not null,
 contract_kind text not null check(contract_kind in ('bid','quote')),version text not null,
 request_text text not null,acknowledgement_text text not null,recorded_at timestamptz not null default now(),
 unique(user_id,reference_id,contract_kind,version),retention_review_after date not null default (now()+interval '5 years')::date
);
alter table altio_private.early_execution_consents enable row level security;
revoke all on altio_private.early_execution_consents from public,anon,authenticated;
create function public.record_early_execution_consent(p_user_id uuid,p_reference uuid,p_kind text,p_version text,p_requested boolean,p_acknowledged boolean)
returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 if p_version is distinct from '2026-10-09-v1' or p_requested is distinct from true or p_acknowledged is distinct from true then raise exception 'Explicit consent required';end if;
 if p_kind='bid' then
  if not exists(select 1 from public.emergency_bids b join public.emergency_requests e on e.id=b.emergency_request_id where b.id=p_reference and e.owner_id=p_user_id and b.status='pending') then raise exception 'Order unavailable';end if;
 elsif p_kind='quote' then
  if not exists(select 1 from public.mission_quotes q left join public.missions m on m.id=q.mission_id left join public.emergency_requests e on e.id=q.emergency_request_id where q.id=p_reference and coalesce(m.owner_id,e.owner_id)=p_user_id and q.status='pending') then raise exception 'Order unavailable';end if;
 else raise exception 'Invalid contract kind';end if;
 insert into altio_private.early_execution_consents(user_id,reference_id,contract_kind,version,request_text,acknowledgement_text)
 values(p_user_id,p_reference,p_kind,p_version,
 'Je demande expressément que la prestation commence avant la fin du délai de rétractation de 14 jours.',
 'Je reconnais que je perdrai mon droit de rétractation lorsque la prestation sera entièrement exécutée. Son seul commencement ne supprime pas ce droit.')
 on conflict(user_id,reference_id,contract_kind,version) do nothing;
 select id into result from altio_private.early_execution_consents where user_id=p_user_id and reference_id=p_reference and contract_kind=p_kind and version=p_version;
 return result;
end $$;
revoke all on function public.record_early_execution_consent(uuid,uuid,text,text,boolean,boolean) from public,anon,authenticated;
grant execute on function public.record_early_execution_consent(uuid,uuid,text,text,boolean,boolean) to service_role;
