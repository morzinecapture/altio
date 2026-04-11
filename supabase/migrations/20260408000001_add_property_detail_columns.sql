-- Add missing columns to properties for the add-property form (IF NOT EXISTS — safe to re-run)
ALTER TABLE properties ADD COLUMN IF NOT EXISTS access_code TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS instructions TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS deposit_location TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS linen_instructions TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS fixed_rate NUMERIC;
