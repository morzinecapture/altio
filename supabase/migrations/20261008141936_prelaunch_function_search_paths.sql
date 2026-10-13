-- Reviewed against the deployed definitions on 2026-10-08. Public is not
-- writable by anon/authenticated. Keep existing business logic and grants;
-- resolve builtins first, business objects next, temporary objects last.
ALTER FUNCTION public.cleanup_rate_limit_log() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.mission_date(timestamptz) SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public._touch_concierge_assignment_updated_at() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.check_emergency_status_transition() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public._touch_intervention_updated_at() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.notify_intervention_status_change() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.notify_owner_on_intervention_bid() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.check_intervention_phase_transition() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.is_provider_in_zone(uuid, double precision, double precision) SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.next_quote_number(uuid) SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.create_rotation_missions_from_ical() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.check_intervention_scheduled_48h() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.check_intervention_bid_cap() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.notify_intervention_broadcast_on_insert() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public._can_notify_provider_zone(uuid) SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public._mark_provider_zone_notified(uuid) SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.check_intervention_pricing_mode() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.check_intervention_inline_amount_cap() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.localize_service_codes(text) SET search_path = pg_catalog, public, pg_temp;
