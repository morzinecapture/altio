-- Track displacement payment intent ID on emergency_requests
-- Enables invoice generation for on_site completions (no quote path)
ALTER TABLE emergency_requests ADD COLUMN IF NOT EXISTS displacement_payment_id TEXT;

CREATE INDEX IF NOT EXISTS idx_emergency_displacement_pi
  ON emergency_requests(displacement_payment_id)
  WHERE displacement_payment_id IS NOT NULL;
