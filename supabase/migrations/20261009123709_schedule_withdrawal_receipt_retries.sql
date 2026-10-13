-- Deploy the worker and verify its authenticated configuration endpoint before
-- enabling this schedule. Local preparation must not start remote emails.
create or replace function public.dispatch_withdrawal_receipts(p_check boolean default false)
returns bigint language plpgsql security definer set search_path='' as $$
declare u text; k text;
begin
 select decrypted_secret into u from vault.decrypted_secrets where name='project_url';
 select decrypted_secret into k from vault.decrypted_secrets where name='completion_worker_key';
 if nullif(u,'') is null or nullif(k,'') is null then raise exception 'Internal worker configuration missing';end if;
 return net.http_post(url:=u||'/functions/v1/process-withdrawal-receipts'||case when p_check then '?check=configuration' else '' end,
 headers:=jsonb_build_object('Content-Type','application/json','x-service-key',k),body:='{}'::jsonb,timeout_milliseconds:=60000);
end $$;
revoke all on function public.dispatch_withdrawal_receipts(boolean) from public,anon,authenticated;
grant execute on function public.dispatch_withdrawal_receipts(boolean) to service_role;
select cron.schedule('altio-withdrawal-receipts','* * * * *','select public.dispatch_withdrawal_receipts()');
select cron.alter_job((select jobid from cron.job where jobname='altio-withdrawal-receipts'),active:=false);
