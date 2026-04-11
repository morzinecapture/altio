-- Prevent duplicate invoices for the same source + type
-- This handles race conditions where generate-invoice is called multiple times

-- Remove any existing duplicates (keep the oldest one per mission_id + type)
DELETE FROM invoices
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY mission_id, invoice_type
             ORDER BY created_at ASC
           ) AS rn
    FROM invoices
    WHERE mission_id IS NOT NULL
  ) sub
  WHERE rn > 1
);

-- Remove any existing duplicates (keep the oldest one per emergency_id + type)
DELETE FROM invoices
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY emergency_id, invoice_type
             ORDER BY created_at ASC
           ) AS rn
    FROM invoices
    WHERE emergency_id IS NOT NULL
  ) sub
  WHERE rn > 1
);

-- Add partial unique indexes (NULLs are distinct in unique constraints)
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_mission_type
  ON invoices (mission_id, invoice_type)
  WHERE mission_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_emergency_type
  ON invoices (emergency_id, invoice_type)
  WHERE emergency_id IS NOT NULL;
