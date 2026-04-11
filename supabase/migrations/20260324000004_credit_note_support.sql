-- ============================================================================
-- Credit note (avoir) support for invoices
-- Adds: credit_note_seq sequence, related_invoice_id column,
--        credit_note type to invoice_type CHECK constraint
-- ============================================================================

-- Sequence for credit note numbering: ALTIO-AV-YYYY-XXXX
CREATE SEQUENCE IF NOT EXISTS credit_note_seq START 1;
GRANT USAGE, SELECT ON SEQUENCE credit_note_seq TO service_role;

-- Add related_invoice_id to link credit notes to their original invoice
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS related_invoice_id UUID REFERENCES invoices(id);
CREATE INDEX IF NOT EXISTS idx_invoices_related_invoice_id ON invoices(related_invoice_id)
  WHERE related_invoice_id IS NOT NULL;

COMMENT ON COLUMN invoices.related_invoice_id IS 'For credit notes: references the original invoice being cancelled/refunded';

-- Update invoice_type CHECK to allow credit_note type
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_invoice_type_check;
ALTER TABLE invoices ADD CONSTRAINT invoices_invoice_type_check
  CHECK (invoice_type IN ('commission', 'service', 'service_fee', 'credit_note'));

-- Update status CHECK to allow 'refunded' status
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_status_check;
ALTER TABLE invoices ADD CONSTRAINT invoices_status_check
  CHECK (status IN ('issued', 'sent', 'paid', 'cancelled', 'refunded'));

-- RPC wrapper for nextval on credit_note_seq (same pattern as invoice sequences)
CREATE OR REPLACE FUNCTION next_credit_note_number()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_num int;
BEGIN
  SELECT nextval('credit_note_seq') INTO next_num;
  RETURN next_num;
END;
$$;

GRANT EXECUTE ON FUNCTION next_credit_note_number() TO service_role;
