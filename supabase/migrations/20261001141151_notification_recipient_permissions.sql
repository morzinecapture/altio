create or replace function public.can_send_notification(p_recipient uuid, p_reference uuid)
returns boolean language sql stable security definer set search_path = '' as $$
select auth.uid() is not null and (
  p_recipient = auth.uid() or public.is_admin() or (
    not exists (select 1 from public.blocked_users b where
      (b.blocker_id=auth.uid() and b.blocked_id=p_recipient) or
      (b.blocker_id=p_recipient and b.blocked_id=auth.uid()))
    and (
      exists (select 1 from public.missions m where m.id=p_reference and (
        (m.owner_id=auth.uid() and (m.assigned_provider_id=p_recipient or exists (select 1 from public.mission_applications a where a.mission_id=m.id and a.provider_id=p_recipient)))
        or (m.owner_id=p_recipient and (m.assigned_provider_id=auth.uid() or exists (select 1 from public.mission_applications a where a.mission_id=m.id and a.provider_id=auth.uid())))
      ))
      or exists (select 1 from public.emergency_requests e where e.id=p_reference and (
        (e.owner_id=auth.uid() and (e.accepted_provider_id=p_recipient or e.target_provider_id=p_recipient or exists (select 1 from public.emergency_bids b where b.emergency_request_id=e.id and b.provider_id=p_recipient)
          or (e.status in ('open','bids_open') and exists (select 1 from public.provider_profiles pp where pp.provider_id=p_recipient and pp.available=true))))
        or (e.owner_id=p_recipient and (e.accepted_provider_id=auth.uid() or e.target_provider_id=auth.uid() or exists (select 1 from public.emergency_bids b where b.emergency_request_id=e.id and b.provider_id=auth.uid())))
      ))
      or exists (select 1 from public.interventions i where i.id=p_reference and (
        (i.owner_id=auth.uid() and i.assigned_provider_id=p_recipient) or
        (i.owner_id=p_recipient and i.assigned_provider_id=auth.uid())
      ))
    )
  )
);
$$;
revoke all on function public.can_send_notification(uuid,uuid) from public, anon;
grant execute on function public.can_send_notification(uuid,uuid) to authenticated, service_role;
create or replace function public.insert_notification_for_user(p_user_id uuid, p_type text, p_title text, p_body text, p_reference_id text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not coalesce(public.can_send_notification(p_user_id,p_reference_id::uuid),false) then
    raise exception 'Notification non autorisée' using errcode = '42501';
  end if;
  if length(p_title)>200 or length(p_body)>2000 then raise exception 'Notification trop longue'; end if;
  insert into public.notifications(user_id,type,title,body,reference_id) values (p_user_id,p_type,p_title,p_body,p_reference_id::uuid);
end;
$$;
revoke all on function public.insert_notification_for_user(uuid,text,text,text,text) from public,anon;
grant execute on function public.insert_notification_for_user(uuid,text,text,text,text) to authenticated,service_role;
