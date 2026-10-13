CREATE TABLE public.credit_note_jobs (
  invoice_id uuid PRIMARY KEY REFERENCES public.invoices(id),
  id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  invoice_number text NOT NULL UNIQUE,
  reason text NOT NULL,
  original_invoice jsonb NOT NULL,
  document_context jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  issued_at timestamptz
);
ALTER TABLE public.credit_note_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.credit_note_jobs FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.credit_note_jobs TO service_role;
GRANT USAGE ON SEQUENCE public.credit_note_seq TO service_role;

CREATE OR REPLACE FUNCTION public.prepare_credit_note(p_invoice_id uuid,p_reason text,p_context jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE original public.invoices%ROWTYPE; existing public.invoices%ROWTYPE; job public.credit_note_jobs%ROWTYPE;
BEGIN
  SELECT * INTO original FROM public.invoices WHERE id=p_invoice_id FOR UPDATE;
  IF NOT FOUND OR original.invoice_type='credit_note' THEN RAISE EXCEPTION 'Invalid original invoice'; END IF;
  SELECT * INTO existing FROM public.invoices WHERE related_invoice_id=p_invoice_id AND invoice_type='credit_note' LIMIT 1;
  IF FOUND THEN
    IF existing.amount_ttc <> -original.amount_ttc OR existing.amount_ht <> -original.amount_ht THEN
      RAISE EXCEPTION 'Existing credit requires reconciliation';
    END IF;
    RETURN jsonb_build_object('existing',to_jsonb(existing));
  END IF;
  SELECT * INTO job FROM public.credit_note_jobs WHERE invoice_id=p_invoice_id;
  IF FOUND THEN RETURN to_jsonb(job); END IF;
  IF original.status IN ('cancelled','refunded') OR original.amount_ttc<=0 OR original.amount_ht<0
    OR original.amount_ht>original.amount_ttc OR original.vat_rate IS NULL THEN RAISE EXCEPTION 'Invalid invoice amounts or state'; END IF;
  IF nullif(trim(p_reason),'') IS NULL OR length(p_reason)>1000 OR jsonb_typeof(p_context) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Invalid document context';
  END IF;
  INSERT INTO public.credit_note_jobs(invoice_id,invoice_number,reason,original_invoice,document_context)
  VALUES(p_invoice_id,'ALTIO-AV-' || to_char(now() AT TIME ZONE 'UTC','YYYY') || '-' || lpad(nextval('public.credit_note_seq')::text,6,'0'),
    p_reason,to_jsonb(original),p_context) RETURNING * INTO job;
  RETURN to_jsonb(job);
END; $$;

CREATE OR REPLACE FUNCTION public.finalize_credit_note(p_invoice_id uuid,p_job_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE original public.invoices%ROWTYPE; job public.credit_note_jobs%ROWTYPE; credit public.invoices%ROWTYPE; prefix text;
BEGIN
  SELECT * INTO original FROM public.invoices WHERE id=p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Original invoice unavailable'; END IF;
  SELECT * INTO job FROM public.credit_note_jobs WHERE invoice_id=p_invoice_id AND id=p_job_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Credit note reservation unavailable'; END IF;
  SELECT * INTO credit FROM public.invoices WHERE id=p_job_id AND related_invoice_id=p_invoice_id AND invoice_type='credit_note';
  IF FOUND THEN RETURN to_jsonb(credit); END IF;
  IF original.amount_ttc IS DISTINCT FROM (job.original_invoice->>'amount_ttc')::numeric
    OR original.amount_ht IS DISTINCT FROM (job.original_invoice->>'amount_ht')::numeric
    OR original.vat_rate IS DISTINCT FROM (job.original_invoice->>'vat_rate')::numeric
    OR original.status IN ('cancelled','refunded')
    OR original.stripe_pi_id IS DISTINCT FROM job.original_invoice->>'stripe_pi_id'
    OR EXISTS (SELECT 1 FROM public.invoices WHERE related_invoice_id=p_invoice_id AND invoice_type='credit_note') THEN
    RAISE EXCEPTION 'Invoice changed since credit note preparation';
  END IF;
  prefix:=to_char(job.created_at AT TIME ZONE 'UTC','YYYY') || '/' || job.invoice_number;
  INSERT INTO public.invoices(id,invoice_number,mission_id,emergency_id,intervention_id,completion_step_id,invoice_type,
    amount_ht,amount_ttc,vat_rate,seller_id,buyer_id,pdf_url,facturx_url,stripe_pi_id,status,related_invoice_id,created_at)
  VALUES(job.id,job.invoice_number,original.mission_id,original.emergency_id,original.intervention_id,original.completion_step_id,'credit_note',
    -original.amount_ht,-original.amount_ttc,original.vat_rate,original.seller_id,original.buyer_id,
    prefix || '.html',prefix || '.xml',original.stripe_pi_id,'issued',p_invoice_id,job.created_at) RETURNING * INTO credit;
  UPDATE public.invoices SET status='cancelled' WHERE id=p_invoice_id;
  UPDATE public.credit_note_jobs SET issued_at=now() WHERE invoice_id=p_invoice_id;
  RETURN to_jsonb(credit);
END; $$;
REVOKE ALL ON FUNCTION public.prepare_credit_note(uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.finalize_credit_note(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_credit_note(uuid,text,jsonb),public.finalize_credit_note(uuid,uuid) TO service_role;
