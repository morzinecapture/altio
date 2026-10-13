-- First compatible containment: existing signed-in clients keep their joins.
-- Authenticated directory/private data separation is a separate migration.
revoke all on public.users, public.provider_profiles, public.public_profiles,
  public.admin_dashboard_stats from anon;

-- Preserve the existing columns while filtering this definer view for real admins.
do $$
declare definition text;
begin
  definition := rtrim(pg_get_viewdef('public.admin_dashboard_stats'::regclass, true), ';' || chr(10));
  execute 'create or replace view public.admin_dashboard_stats as select * from ('
    || definition || ') stats where public.is_admin()';
end;
$$;

alter table public.payments enable row level security;
alter table public.quotes enable row level security;
revoke all on public.payments, public.quotes from anon, authenticated;
-- These legacy tables are not used by the client; Edge Functions retain service_role access.

create or replace function public.guard_user_privileged_fields()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if current_user in ('postgres', 'service_role') or coalesce(public.is_admin(), false) then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if coalesce(new.is_admin, false) or coalesce(new.suspended, false)
       or new.suspended_at is not null or new.suspended_reason is not null
       or new.google_calendar_token is not null or new.google_calendar_refresh_token is not null then
      raise exception 'Privileged account fields are server-managed' using errcode = '42501';
    end if;
  elsif new.id is distinct from old.id
     or new.is_admin is distinct from old.is_admin
     or new.suspended is distinct from old.suspended
     or new.suspended_at is distinct from old.suspended_at
     or new.suspended_reason is distinct from old.suspended_reason
     or (new.google_calendar_token is distinct from old.google_calendar_token and new.google_calendar_token is not null)
     or (new.google_calendar_refresh_token is distinct from old.google_calendar_refresh_token and new.google_calendar_refresh_token is not null) then
    raise exception 'Privileged account fields are server-managed' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_user_privileged_fields() from public, anon, authenticated;
create trigger guard_user_privileged_fields before insert or update on public.users
for each row execute function public.guard_user_privileged_fields();

create or replace function public.guard_provider_privileged_fields()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if current_user in ('postgres', 'service_role') or coalesce(public.is_admin(), false) then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.stripe_account_id is not null or coalesce(new.stripe_onboarding_complete, false)
       or coalesce(new.stripe_charges_enabled, false) or coalesce(new.stripe_payouts_enabled, false)
       or coalesce(new.rc_pro_verified, false) or coalesce(new.decennale_verified, false)
       or coalesce(new.total_earnings, 0) <> 0 or coalesce(new.total_reviews, 0) <> 0
       or coalesce(new.rating, 0) <> 0 or coalesce(new.average_rating, 0) <> 0 then
      raise exception 'Provider financial and verification fields are server-managed' using errcode = '42501';
    end if;
  elsif new.provider_id is distinct from old.provider_id
     or new.stripe_account_id is distinct from old.stripe_account_id
     or new.stripe_onboarding_complete is distinct from old.stripe_onboarding_complete
     or new.stripe_charges_enabled is distinct from old.stripe_charges_enabled
     or new.stripe_payouts_enabled is distinct from old.stripe_payouts_enabled
     or new.rc_pro_verified is distinct from old.rc_pro_verified
     or new.decennale_verified is distinct from old.decennale_verified
     or new.total_earnings is distinct from old.total_earnings
     or new.total_reviews is distinct from old.total_reviews
     or new.rating is distinct from old.rating
     or new.average_rating is distinct from old.average_rating then
    raise exception 'Provider financial and verification fields are server-managed' using errcode = '42501';
  end if;
  -- Replacing an insurance document invalidates its previous review.
  if tg_op = 'UPDATE' then
    if new.rc_pro_doc_url is distinct from old.rc_pro_doc_url then new.rc_pro_verified := false; end if;
    if new.decennale_doc_url is distinct from old.decennale_doc_url then new.decennale_verified := false; end if;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_provider_privileged_fields() from public, anon, authenticated;
create trigger guard_provider_privileged_fields before insert or update on public.provider_profiles
for each row execute function public.guard_provider_privileged_fields();

notify pgrst, 'reload schema';
