-- Only fields needed for searching and selecting a provider are shared.
create or replace view public.public_provider_profiles with (security_barrier = true) as
select provider_id, specialties, zone, available, rating, average_rating,
       total_reviews, bio, hourly_rate, created_at, company_type, radius_km,
       weekly_availability, latitude, longitude, location_label,
       rc_pro_verified, decennale_verified, legal_status, qualifications
from public.provider_profiles
where auth.uid() is not null;
revoke all on public.public_provider_profiles from public, anon, authenticated;
grant select on public.public_provider_profiles to authenticated, service_role;
drop policy if exists "Public read provider profiles" on public.provider_profiles;
drop policy if exists "Public can view provider profiles" on public.provider_profiles;
comment on view public.public_provider_profiles is 'Authenticated provider directory: no insurance documents, Stripe identifiers, earnings, or private preferences.';
notify pgrst, 'reload schema';
