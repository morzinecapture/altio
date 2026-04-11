-- ============================================================================
-- Invoice numbering: 3 separate sequences
--   F2 (service_fee, Altio → proprio)  : ALTIO-PROP-YYYY-XXXX
--   F3 (commission, Altio → presta)    : ALTIO-PREST-YYYY-XXXX
--   F1 (service/mandat, per provider)  : MAN-[SIRET_SHORT]-YYYY-XXXX
-- ============================================================================

-- Sequences for F2 and F3 (Altio's own invoices)
CREATE SEQUENCE IF NOT EXISTS invoice_seq_prop START 1;
CREATE SEQUENCE IF NOT EXISTS invoice_seq_prest START 1;

-- Table for per-provider mandate invoice counters (F1)
-- Each provider has their own continuous sequence
CREATE TABLE IF NOT EXISTS invoice_mandate_counters (
  provider_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  year int NOT NULL,
  last_number int NOT NULL DEFAULT 0,
  PRIMARY KEY (provider_id, year)
);

-- RLS: only service_role can touch this table (edge functions use service key)
ALTER TABLE invoice_mandate_counters ENABLE ROW LEVEL SECURITY;

-- Atomic increment function for mandate counters
-- Returns the next invoice number for a given provider+year
CREATE OR REPLACE FUNCTION next_mandate_invoice_number(p_provider_id uuid, p_year int)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_num int;
BEGIN
  INSERT INTO invoice_mandate_counters (provider_id, year, last_number)
  VALUES (p_provider_id, p_year, 1)
  ON CONFLICT (provider_id, year)
  DO UPDATE SET last_number = invoice_mandate_counters.last_number + 1
  RETURNING last_number INTO next_num;

  RETURN next_num;
END;
$$;

GRANT EXECUTE ON FUNCTION next_mandate_invoice_number(uuid, int) TO service_role;

-- Grant nextval on the new sequences to service_role
GRANT USAGE, SELECT ON SEQUENCE invoice_seq_prop TO service_role;
GRANT USAGE, SELECT ON SEQUENCE invoice_seq_prest TO service_role;
