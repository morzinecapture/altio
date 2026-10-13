-- A server-side price is only trustworthy when clients cannot rewrite it.
create or replace function public.guard_payment_prices()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if current_user in ('postgres', 'service_role') or coalesce(public.is_admin(), false) then return new; end if;
  if tg_table_name = 'missions' then
    if new.owner_id is distinct from old.owner_id then
      raise exception 'Mission ownership is immutable' using errcode = '42501';
    end if;
    if new.fixed_rate is distinct from old.fixed_rate then
      if auth.uid() <> old.owner_id or not (
        old.status in ('pending', 'pending_provider_approval')
        or (old.status = 'in_progress' and new.fixed_rate >= old.fixed_rate)
      ) then raise exception 'Mission price is locked' using errcode = '42501'; end if;
    end if;
    if old.status in ('validated', 'paid') and new.status not in ('validated', 'paid', 'dispute', 'cancelled') then
      raise exception 'Validated mission cannot return to editable pricing' using errcode = '42501';
    end if;
  elsif tg_table_name = 'mission_quotes' then
    if new.provider_id is distinct from old.provider_id or new.mission_id is distinct from old.mission_id
       or new.emergency_request_id is distinct from old.emergency_request_id or new.intervention_id is distinct from old.intervention_id then
      raise exception 'Quote parties are immutable' using errcode = '42501';
    end if;
    if new.repair_cost is distinct from old.repair_cost or new.total_ht is distinct from old.total_ht
       or new.tva_rate is distinct from old.tva_rate or new.is_vat_exempt is distinct from old.is_vat_exempt then
      if auth.uid() <> old.provider_id or old.status <> 'pending' then
        raise exception 'Only the provider can revise a pending quote price' using errcode = '42501';
      end if;
    end if;
  elsif tg_table_name = 'emergency_bids' then
    if new.provider_id is distinct from old.provider_id or new.mission_id is distinct from old.mission_id
       or new.emergency_request_id is distinct from old.emergency_request_id then
      raise exception 'Bid parties are immutable' using errcode = '42501';
    end if;
    if new.travel_cost is distinct from old.travel_cost or new.diagnostic_cost is distinct from old.diagnostic_cost then
      if auth.uid() <> old.provider_id or old.status <> 'pending' then
        raise exception 'Only the provider can revise a pending bid price' using errcode = '42501';
      end if;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_payment_prices() from public, anon, authenticated;
create trigger guard_payment_prices before update on public.missions for each row execute function public.guard_payment_prices();
create trigger guard_payment_prices before update on public.mission_quotes for each row execute function public.guard_payment_prices();
create trigger guard_payment_prices before update on public.emergency_bids for each row execute function public.guard_payment_prices();
