create or replace function public.guard_message_integrity() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- Internal jobs have no user identity. End users must retain immutable content.
  if auth.uid() is null then
    if auth.role() = 'service_role' or session_user = 'postgres' then return new; end if;
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' then
    if (to_jsonb(new) - 'read') is distinct from (to_jsonb(old) - 'read') then
      raise exception 'Only the read status can be changed' using errcode = '42501';
    end if;
    return new;
  end if;
  if new.sender_id <> auth.uid() or new.sender_id = new.receiver_id then
    raise exception 'Invalid message participants' using errcode = '42501';
  end if;
  if exists (select 1 from public.blocked_users b where
     (b.blocker_id = new.sender_id and b.blocked_id = new.receiver_id) or
     (b.blocker_id = new.receiver_id and b.blocked_id = new.sender_id)) then
    raise exception 'Cette conversation est bloquée' using errcode = '42501';
  end if;
  if num_nonnulls(new.mission_id, new.emergency_id, new.intervention_id) <> 1 then
    raise exception 'A single conversation reference is required' using errcode = '42501';
  end if;
  if new.mission_id is not null and not exists (
    select 1 from public.missions m where m.id=new.mission_id
    and m.status not in ('pending','expired','cancelled')
    and ((m.owner_id=new.sender_id and m.assigned_provider_id=new.receiver_id)
      or (m.owner_id=new.receiver_id and m.assigned_provider_id=new.sender_id))
  ) then raise exception 'Conversation unavailable' using errcode = '42501'; end if;
  if new.emergency_id is not null and not exists (
    select 1 from public.emergency_requests e where e.id=new.emergency_id
    and ((e.owner_id=new.sender_id and e.accepted_provider_id=new.receiver_id)
      or (e.owner_id=new.receiver_id and e.accepted_provider_id=new.sender_id))
  ) then raise exception 'Conversation unavailable' using errcode = '42501'; end if;
  if new.intervention_id is not null and not exists (
    select 1 from public.interventions i where i.id=new.intervention_id
    and ((i.owner_id=new.sender_id and i.assigned_provider_id=new.receiver_id)
      or (i.owner_id=new.receiver_id and i.assigned_provider_id=new.sender_id))
  ) then raise exception 'Conversation unavailable' using errcode = '42501'; end if;
  if length(trim(new.content)) = 0 or length(new.content)>10000 then
    raise exception 'Message vide ou trop long' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_message_integrity() from public, anon, authenticated;
create trigger guard_message_integrity before insert or update on public.messages
for each row execute function public.guard_message_integrity();
