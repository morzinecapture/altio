create or replace function public.guard_mission_payment_confirmation()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if current_user in ('postgres','service_role') then return new;end if;
 if tg_op='INSERT' then
   if new.status='paid' or new.paid_at is not null or new.payment_intent_id is not null or new.stripe_payment_intent_id is not null then
     raise exception 'Payment confirmation is server-managed' using errcode='42501';
   end if;
 elsif (new.status='paid' and old.status is distinct from 'paid')
   or new.paid_at is distinct from old.paid_at
   or new.payment_intent_id is distinct from old.payment_intent_id
   or new.stripe_payment_intent_id is distinct from old.stripe_payment_intent_id then
   raise exception 'Payment confirmation is server-managed' using errcode='42501';
 end if;
 return new;
end;$$;
revoke all on function public.guard_mission_payment_confirmation() from public,anon,authenticated;
create trigger guard_mission_payment_confirmation before insert or update on public.missions
for each row execute function public.guard_mission_payment_confirmation();
