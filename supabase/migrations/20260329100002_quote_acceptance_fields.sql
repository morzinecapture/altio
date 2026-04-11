-- Add legal compliance fields for formal quote acceptance tracking
ALTER TABLE mission_quotes ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ;
ALTER TABLE mission_quotes ADD COLUMN IF NOT EXISTS accepted_by UUID REFERENCES users(id);
ALTER TABLE mission_quotes ADD COLUMN IF NOT EXISTS quote_number TEXT;
