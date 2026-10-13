alter table public.webhook_events_processed
  add column processing_state text not null default 'completed' check (processing_state in ('processing','completed')),
  add column processing_started_at timestamptz,
  add column processing_token uuid;

create or replace function public.claim_stripe_webhook(p_event_id text, p_token uuid)
returns text language plpgsql security invoker set search_path = '' as $$
declare claimed text; existing_state text;
begin
  insert into public.webhook_events_processed(event_id,processing_state,processing_started_at,processing_token)
  values(p_event_id,'processing',now(),p_token)
  on conflict(event_id) do update
    set processing_started_at=now(),processing_token=p_token
    where webhook_events_processed.processing_state='processing'
      and webhook_events_processed.processing_started_at < now()-interval '5 minutes'
  returning event_id into claimed;
  if claimed is not null then return 'claimed';end if;
  select processing_state into existing_state from public.webhook_events_processed where event_id=p_event_id;
  return case when existing_state='completed' then 'completed' else 'busy' end;
end;
$$;
revoke all on function public.claim_stripe_webhook(text,uuid) from public,anon,authenticated;
grant execute on function public.claim_stripe_webhook(text,uuid) to service_role;
revoke all on public.webhook_events_processed from anon,authenticated;
