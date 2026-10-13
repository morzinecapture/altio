-- The definer view is an explicitly allowlisted directory, not a copy of users.
-- Private contact and billing fields remain restricted to the account owner/admin.
create or replace view public.public_profiles with (security_barrier=true) as
select u.id,u.name,
  case when u.id=auth.uid() or public.is_admin() then u.email else null end as email,
  u.picture,u.role,u.onboarding_completed,u.created_at,
  u.company_name,u.siren,u.is_vat_exempt,u.is_auto_entrepreneur,
  case when u.id=auth.uid() or public.is_admin() then u.phone else null end as phone,
  case when u.id=auth.uid() or public.is_admin() or exists (
    select 1 from public.invoices i where
      (i.seller_id=u.id and i.buyer_id=auth.uid()) or (i.buyer_id=u.id and i.seller_id=auth.uid())
  ) then u.billing_address else null end as billing_address,
  u.vat_number
from public.users u
where auth.uid() is not null;
revoke all on public.public_profiles from public,anon,authenticated;
grant select on public.public_profiles to authenticated,service_role;

drop policy if exists "Public can view basic user info" on public.users;
drop policy if exists "Authenticated read all profiles" on public.users;
notify pgrst,'reload schema';
