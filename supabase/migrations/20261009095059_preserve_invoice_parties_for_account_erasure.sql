-- Billing-only snapshots. Not exposed through the client Data API.
create schema if not exists altio_private;
create table altio_private.invoice_parties (
 invoice_id uuid primary key references public.invoices(id) on delete restrict,
 seller jsonb, buyer jsonb,
 captured_at timestamptz not null default now(),
 source text not null check(source in ('issuance','legacy_backfill','credit_original')),
 retention_review_after date not null
);
alter table altio_private.invoice_parties enable row level security;
revoke all on altio_private.invoice_parties from public,anon,authenticated;

create or replace function altio_private.billing_party(p_user_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('name',u.name,'company_name',u.company_name,'siren',u.siren,
  'vat_number',u.vat_number,'billing_address',u.billing_address)
 from public.users u where u.id=p_user_id;
$$;
revoke all on function altio_private.billing_party(uuid) from public,anon,authenticated;

create or replace function altio_private.snapshot_invoice_parties()
returns trigger language plpgsql security definer set search_path='' as $$
declare s jsonb; b jsonb; origin text:='issuance';
begin
 if new.related_invoice_id is not null then
  select seller,buyer into s,b from altio_private.invoice_parties where invoice_id=new.related_invoice_id;
  if not found then raise exception 'Original billing snapshot missing'; end if;
  origin:='credit_original';
 else
  s:=altio_private.billing_party(new.seller_id); b:=altio_private.billing_party(new.buyer_id);
 end if;
 insert into altio_private.invoice_parties(invoice_id,seller,buyer,source,retention_review_after)
 values(new.id,s,b,origin,(date_trunc('year',coalesce(new.created_at,now()))+interval '11 years')::date)
 on conflict(invoice_id) do nothing;
 return new;
end $$;
revoke all on function altio_private.snapshot_invoice_parties() from public,anon,authenticated;
create trigger snapshot_invoice_parties after insert on public.invoices
for each row execute function altio_private.snapshot_invoice_parties();

-- Legacy snapshots are explicitly identified: current profile data is not
-- claimed to be the historical data printed on an earlier document.
insert into altio_private.invoice_parties(invoice_id,seller,buyer,source,retention_review_after)
 select i.id,altio_private.billing_party(i.seller_id),altio_private.billing_party(i.buyer_id),
 'legacy_backfill',(date_trunc('year',coalesce(i.created_at,now()))+interval '11 years')::date
 from public.invoices i on conflict(invoice_id) do nothing;

create or replace function altio_private.invoice_document_parties(p_invoice_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('seller',seller,'buyer',buyer,'source',source)
 from altio_private.invoice_parties where invoice_id=p_invoice_id;
$$;
revoke all on function altio_private.invoice_document_parties(uuid) from public,anon,authenticated;
grant usage on schema altio_private to service_role;
grant execute on function altio_private.invoice_document_parties(uuid) to service_role;
create or replace function public.get_invoice_document_parties(p_invoice_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
 select altio_private.invoice_document_parties(p_invoice_id);
$$;
revoke all on function public.get_invoice_document_parties(uuid) from public,anon,authenticated;
grant execute on function public.get_invoice_document_parties(uuid) to service_role;

-- Persist the exact unescaped identities used by the renderer, in the same
-- transaction as the invoice row. A profile edit during rendering cannot alter it.
create or replace function altio_private.insert_invoice_with_parties(p_invoice jsonb,p_seller jsonb,p_buyer jsonb)
returns public.invoices language plpgsql security definer set search_path='' as $$
declare result public.invoices;
begin
 if p_buyer is null or nullif(coalesce(nullif(p_buyer->>'company_name',''),p_buyer->>'name'),'') is null
   or (p_buyer->>'id') is distinct from (p_invoice->>'buyer_id') then
   raise exception 'Invoice buyer snapshot invalid';
 end if;
 if p_invoice->>'seller_id' is not null and (p_seller is null or
   (p_seller->>'id') is distinct from (p_invoice->>'seller_id')) then
   raise exception 'Invoice seller snapshot invalid';
 end if;
 insert into public.invoices(invoice_number,mission_id,emergency_id,intervention_id,completion_step_id,
  invoice_type,amount_ht,amount_ttc,vat_rate,seller_id,buyer_id,pdf_url,stripe_pi_id,status,facturx_url)
 values(p_invoice->>'invoice_number',(p_invoice->>'mission_id')::uuid,(p_invoice->>'emergency_id')::uuid,
  (p_invoice->>'intervention_id')::uuid,(p_invoice->>'completion_step_id')::uuid,p_invoice->>'invoice_type',
  (p_invoice->>'amount_ht')::numeric,(p_invoice->>'amount_ttc')::numeric,(p_invoice->>'vat_rate')::numeric,
  (p_invoice->>'seller_id')::uuid,(p_invoice->>'buyer_id')::uuid,p_invoice->>'pdf_url',p_invoice->>'stripe_pi_id',
  p_invoice->>'status',p_invoice->>'facturx_url') returning * into result;
 update altio_private.invoice_parties set
  seller=(select jsonb_object_agg(key,value) from jsonb_each(p_seller) where key in ('name','company_name','siren','siret','vat_number','billing_address','address','email')),
  buyer=(select jsonb_object_agg(key,value) from jsonb_each(p_buyer) where key in ('name','company_name','siren','siret','vat_number','billing_address','address','email'))
 where invoice_id=result.id;
 return result;
end $$;
revoke all on function altio_private.insert_invoice_with_parties(jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function altio_private.insert_invoice_with_parties(jsonb,jsonb,jsonb) to service_role;
create or replace function public.insert_invoice_with_parties(p_invoice jsonb,p_seller jsonb,p_buyer jsonb)
returns public.invoices language sql security invoker set search_path='' as $$
 select altio_private.insert_invoice_with_parties(p_invoice,p_seller,p_buyer);
$$;
revoke all on function public.insert_invoice_with_parties(jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.insert_invoice_with_parties(jsonb,jsonb,jsonb) to service_role;
