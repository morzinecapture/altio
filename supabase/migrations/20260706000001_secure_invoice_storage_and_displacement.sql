-- Secure invoice/quote documents and support intervention displacement invoices.

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS intervention_id UUID;
CREATE INDEX IF NOT EXISTS idx_invoices_intervention_id ON invoices(intervention_id)
  WHERE intervention_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_intervention_type
  ON invoices (intervention_id, invoice_type)
  WHERE intervention_id IS NOT NULL;

ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_invoice_type_check;
ALTER TABLE invoices ADD CONSTRAINT invoices_invoice_type_check
  CHECK (invoice_type IN ('commission', 'service', 'displacement', 'service_fee', 'credit_note'));

INSERT INTO storage.buckets (id, name, public)
VALUES ('invoices', 'invoices', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS "Invoices are publicly readable" ON storage.objects;
DROP POLICY IF EXISTS "Invoice participants can read invoice objects" ON storage.objects;
CREATE POLICY "Invoice participants can read invoice objects"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'invoices'
  AND (
    EXISTS (
      SELECT 1
      FROM public.invoices i
      WHERE (i.pdf_url = storage.objects.name OR i.facturx_url = storage.objects.name)
        AND (
          i.seller_id = auth.uid()
          OR i.buyer_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.id = auth.uid() AND COALESCE(u.is_admin, false) = true
          )
        )
    )
    OR EXISTS (
      SELECT 1
      FROM public.mission_quotes mq
      WHERE mq.quote_document_url = storage.objects.name
        AND (
          mq.provider_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.emergency_requests er
            WHERE er.id = mq.emergency_request_id
              AND (er.owner_id = auth.uid() OR er.accepted_provider_id = auth.uid())
          )
          OR EXISTS (
            SELECT 1 FROM public.missions m
            WHERE m.id = mq.mission_id
              AND (m.owner_id = auth.uid() OR m.assigned_provider_id = auth.uid())
          )
          OR EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.id = auth.uid() AND COALESCE(u.is_admin, false) = true
          )
        )
    )
  )
);

DROP POLICY IF EXISTS "Service role can write invoices" ON storage.objects;
CREATE POLICY "Service role can write invoices"
ON storage.objects FOR INSERT
TO service_role
WITH CHECK (bucket_id = 'invoices');

DROP POLICY IF EXISTS "Service role can update invoices" ON storage.objects;
CREATE POLICY "Service role can update invoices"
ON storage.objects FOR UPDATE
TO service_role
USING (bucket_id = 'invoices')
WITH CHECK (bucket_id = 'invoices');
