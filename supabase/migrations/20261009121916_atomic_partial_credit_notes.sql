-- Cumulative targets make webhook duplicates and out-of-order retries harmless.
-- Amounts use integer cents; one pending document per invoice prevents overlap.
create table public.partial_credit_note_jobs (
 id uuid primary key default gen_random_uuid(),invoice_id uuid not null references public.invoices(id),
 target_cents bigint not null check(target_cents>0),credit_ht numeric not null,credit_ttc numeric not null,
 invoice_number text unique not null,reason text not null,original_invoice jsonb not null,document_context jsonb not null,
 created_at timestamptz not null default now(),issued_at timestamptz,unique(invoice_id,target_cents)
);
alter table public.partial_credit_note_jobs enable row level security;
revoke all on public.partial_credit_note_jobs from public,anon,authenticated;
grant select,insert,update on public.partial_credit_note_jobs to service_role;
create or replace function public.prepare_partial_credit_note(p_invoice_id uuid,p_target_cents bigint,p_reason text,p_context jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare original public.invoices;job public.partial_credit_note_jobs;used_ht numeric;used_ttc numeric;
begin
 select * into original from public.invoices where id=p_invoice_id for update;
 if not found or original.invoice_type='credit_note' or original.amount_ttc<=0 or original.amount_ht<0 or original.amount_ht>original.amount_ttc then raise exception 'Invalid original invoice';end if;
 select * into job from public.partial_credit_note_jobs where invoice_id=p_invoice_id and target_cents=p_target_cents;
 if found then
  if job.issued_at is not null then return jsonb_build_object('existing',(select to_jsonb(i) from public.invoices i where id=job.id));end if;
  return to_jsonb(job);
 end if;
 if original.status in ('cancelled','refunded') or p_target_cents is null or p_target_cents<=0 or p_target_cents>round(original.amount_ttc*100) then raise exception 'Credit target exceeds invoice';end if;
 if exists(select 1 from public.credit_note_jobs where invoice_id=p_invoice_id) or exists(select 1 from public.partial_credit_note_jobs where invoice_id=p_invoice_id and issued_at is null) then raise exception 'Prior credit requires completion';end if;
 select coalesce(-sum(amount_ht),0),coalesce(-sum(amount_ttc),0) into used_ht,used_ttc from public.invoices where related_invoice_id=p_invoice_id and invoice_type='credit_note';
 if p_target_cents<=round(used_ttc*100) then raise exception 'Credit target already covered';end if;
 if nullif(trim(p_reason),'') is null or length(p_reason)>1000 or jsonb_typeof(p_context) is distinct from 'object' then raise exception 'Invalid document context';end if;
 insert into public.partial_credit_note_jobs(invoice_id,target_cents,credit_ht,credit_ttc,invoice_number,reason,original_invoice,document_context)
 values(p_invoice_id,p_target_cents,round(original.amount_ht*p_target_cents/(original.amount_ttc*100),2)-used_ht,p_target_cents/100.0-used_ttc,
 'ALTIO-AV-'||to_char(now() at time zone 'UTC','YYYY')||'-'||lpad(nextval('public.credit_note_seq')::text,6,'0'),p_reason,to_jsonb(original),p_context) returning * into job;
 if job.credit_ht<0 or job.credit_ht>job.credit_ttc then raise exception 'Credit rounding requires reconciliation';end if;
 return to_jsonb(job);
end $$;
create or replace function public.finalize_partial_credit_note(p_invoice_id uuid,p_job_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare original public.invoices;job public.partial_credit_note_jobs;credit public.invoices;prefix text;used_ttc numeric;
begin
 select * into original from public.invoices where id=p_invoice_id for update;
 select * into job from public.partial_credit_note_jobs where invoice_id=p_invoice_id and id=p_job_id for update;
 if not found then raise exception 'Credit reservation unavailable';end if;
 select * into credit from public.invoices where id=p_job_id and related_invoice_id=p_invoice_id and invoice_type='credit_note';
 if found then return to_jsonb(credit);end if;
 select coalesce(-sum(amount_ttc),0) into used_ttc from public.invoices where related_invoice_id=p_invoice_id and invoice_type='credit_note';
 if original.amount_ttc is distinct from (job.original_invoice->>'amount_ttc')::numeric or original.amount_ht is distinct from (job.original_invoice->>'amount_ht')::numeric
 or original.vat_rate is distinct from (job.original_invoice->>'vat_rate')::numeric or original.stripe_pi_id is distinct from job.original_invoice->>'stripe_pi_id'
 or original.status in ('cancelled','refunded') or round((used_ttc+job.credit_ttc)*100)<>job.target_cents then raise exception 'Invoice changed since credit preparation';end if;
 prefix:=to_char(job.created_at at time zone 'UTC','YYYY')||'/'||job.invoice_number;
 insert into public.invoices(id,invoice_number,mission_id,emergency_id,intervention_id,completion_step_id,invoice_type,amount_ht,amount_ttc,vat_rate,seller_id,buyer_id,pdf_url,facturx_url,stripe_pi_id,status,related_invoice_id,created_at)
 values(job.id,job.invoice_number,original.mission_id,original.emergency_id,original.intervention_id,original.completion_step_id,'credit_note',-job.credit_ht,-job.credit_ttc,original.vat_rate,original.seller_id,original.buyer_id,prefix||'.html',prefix||'.xml',original.stripe_pi_id,'issued',p_invoice_id,job.created_at) returning * into credit;
 if job.target_cents=round(original.amount_ttc*100) then update public.invoices set status='cancelled' where id=p_invoice_id;end if;
 update public.partial_credit_note_jobs set issued_at=now() where id=p_job_id;
 return to_jsonb(credit);
end $$;
revoke all on function public.prepare_partial_credit_note(uuid,bigint,text,jsonb),public.finalize_partial_credit_note(uuid,uuid) from public,anon,authenticated;
grant execute on function public.prepare_partial_credit_note(uuid,bigint,text,jsonb),public.finalize_partial_credit_note(uuid,uuid) to service_role;
-- A legacy full-credit call may not race a pending partial reservation.
do $$
declare f record;body text;
begin
 for f in select oid,prosrc from pg_proc where oid in ('public.prepare_credit_note(uuid,text,jsonb)'::regprocedure,'public.finalize_credit_note(uuid,uuid)'::regprocedure) loop
 body:=replace(f.prosrc,'  SELECT * INTO original FROM public.invoices WHERE id=p_invoice_id FOR UPDATE;',
 '  SELECT * INTO original FROM public.invoices WHERE id=p_invoice_id FOR UPDATE;
  IF EXISTS(SELECT 1 FROM public.partial_credit_note_jobs WHERE invoice_id=p_invoice_id) THEN RAISE EXCEPTION ''Use cumulative credit after partial reservation''; END IF;');
 if body=f.prosrc then raise exception 'Credit guard insertion failed';end if;
 execute replace(pg_get_functiondef(f.oid),f.prosrc,body);
 end loop;
end $$;
-- Preserve the account erasure interlock when this migration follows its rollout.
do $$
declare body text; definition text;
begin
 if to_regprocedure('altio_private.account_deletion_blockers(uuid)') is not null then
 select prosrc,pg_get_functiondef(oid) into body,definition from pg_proc where oid='altio_private.account_deletion_blockers(uuid)'::regprocedure;
 execute replace(definition,body,replace(body,' return result;',
 ' if exists(select 1 from public.partial_credit_note_jobs j join public.invoices i on i.id=j.invoice_id where (i.seller_id=p_user_id or i.buyer_id=p_user_id) and j.issued_at is null) then result:=array_append(result,''financial_processing'');end if;
 return result;'));
 end if;
end $$;
