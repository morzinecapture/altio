alter table public.missions add column if not exists updated_at timestamptz;
update public.missions set updated_at = coalesce(paid_at, cancelled_at, validated_at, completed_at, started_at, created_at) where updated_at is null;
alter table public.missions alter column updated_at set default now();
alter table public.missions alter column updated_at set not null;
create or replace function public.touch_mission_updated_at() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger touch_mission_updated_at before update on public.missions
for each row execute function public.touch_mission_updated_at();
notify pgrst, 'reload schema';
