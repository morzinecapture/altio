ALTER TABLE public.stripe_refund_events ADD COLUMN last_attempt_at timestamptz, ADD COLUMN last_error text;
CREATE OR REPLACE FUNCTION public.dispatch_refund_reconciliation(p_check boolean DEFAULT false)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u text; k text;
BEGIN
  SELECT decrypted_secret INTO u FROM vault.decrypted_secrets WHERE name='project_url';
  SELECT decrypted_secret INTO k FROM vault.decrypted_secrets WHERE name='completion_worker_key';
  IF nullif(u,'') IS NULL OR nullif(k,'') IS NULL THEN RAISE EXCEPTION 'Internal worker configuration missing'; END IF;
  RETURN net.http_post(url:=u || '/functions/v1/process-refund-events' || CASE WHEN p_check THEN '?check=configuration' ELSE '' END,
    headers:=jsonb_build_object('Content-Type','application/json','x-service-key',k),body:='{}'::jsonb,timeout_milliseconds:=60000);
END; $$;
REVOKE ALL ON FUNCTION public.dispatch_refund_reconciliation(boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_refund_reconciliation(boolean) TO service_role;
SELECT cron.schedule('altio-refund-reconciliation','*/10 * * * *','select public.dispatch_refund_reconciliation()');
