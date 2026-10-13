-- Narrowed after the broad migration was rejected: only these two functions
-- have been inspected in full. No other function or trigger privilege changes.
create or replace function public.is_mission_owner(p_mission_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
select exists (select 1 from public.missions where id=p_mission_id and owner_id=auth.uid());
$$;
-- This trigger uses OLD/NEW, arrays, and pg_catalog built-ins only.
alter function public.check_mission_status_transition() set search_path = '';
