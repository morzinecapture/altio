-- The legal issuer outlives an application account. Never restart its series
-- when the same business signs up again after erasure.
create table altio_private.invoice_issuer_counters (
 siren text not null check(siren ~ '^[0-9]{9}$'), year integer not null,
 last_number bigint not null check(last_number>=0), primary key(siren,year)
);
alter table altio_private.invoice_issuer_counters enable row level security;
revoke all on altio_private.invoice_issuer_counters from public,anon,authenticated;
insert into altio_private.invoice_issuer_counters(siren,year,last_number)
select left(regexp_replace(u.siren,'\s','','g'),9),c.year,max(c.last_number)
from public.invoice_mandate_counters c join public.users u on u.id=c.provider_id
where left(regexp_replace(u.siren,'\s','','g'),9) ~ '^[0-9]{9}$'
group by 1,2;
-- Include issued documents even if their original account has gone.
insert into altio_private.invoice_issuer_counters(siren,year,last_number)
select split_part(invoice_number,'-',2),split_part(invoice_number,'-',3)::int,max(split_part(invoice_number,'-',4)::bigint)
from public.invoices where invoice_number ~ '^MAN-[0-9]{9}-[0-9]{4}-[0-9]+$' group by 1,2
on conflict(siren,year) do update set last_number=greatest(invoice_issuer_counters.last_number,excluded.last_number);
create or replace function public.next_mandate_invoice_number(p_provider_id uuid,p_year integer)
returns integer language plpgsql security definer set search_path='' as $$
declare issuer text; next_number bigint;
begin
 if p_year<2000 or p_year>9999 then raise exception 'Invalid invoice year';end if;
 select left(regexp_replace(siren,'\s','','g'),9) into issuer from public.users where id=p_provider_id;
 if issuer is null or issuer !~ '^[0-9]{9}$' then raise exception 'Verified issuer identifier required';end if;
 insert into altio_private.invoice_issuer_counters(siren,year,last_number) values(issuer,p_year,1)
 on conflict(siren,year) do update set last_number=invoice_issuer_counters.last_number+1 returning last_number into next_number;
 return next_number::integer;
end $$;
revoke all on function public.next_mandate_invoice_number(uuid,integer) from public,anon,authenticated;
grant execute on function public.next_mandate_invoice_number(uuid,integer) to service_role;
