-- These tables are used only after authentication in Altio.
revoke all on public.properties, public.missions, public.emergency_requests,
 public.emergency_bids, public.mission_quotes, public.messages, public.invoices,
 public.notifications, public.interventions, public.reservations,
 public.mission_photos, public.quote_line_items, public.blocked_users from anon;
