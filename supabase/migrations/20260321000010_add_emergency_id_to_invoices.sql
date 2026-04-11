-- Add emergency_id column to invoices table so invoices can reference emergency_requests
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS emergency_id UUID REFERENCES emergency_requests(id);
CREATE INDEX IF NOT EXISTS idx_invoices_emergency_id ON invoices(emergency_id);
