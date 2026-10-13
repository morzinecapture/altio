-- Explicitly marked fixtures never consume customer credit-note sequence numbers.
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
  VALUES(p_invoice_id,CASE WHEN p_context->>'validationRunId'=p_invoice_id::text AND original.invoice_number='TEST-RELEASE-' || p_invoice_id::text THEN 'TEST-AV-' || p_invoice_id::text ELSE 'ALTIO-AV-' || to_char(now() AT TIME ZONE 'UTC','YYYY') || '-' || lpad(nextval('public.credit_note_seq')::text,6,'0') END,
    p_reason,to_jsonb(original),p_context) RETURNING * INTO job;
  RETURN to_jsonb(job);
END; $$;

REVOKE ALL ON FUNCTION public.prepare_credit_note(uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_credit_note(uuid,text,jsonb) TO service_role;
