-- Add city column to properties for privacy-safe location display
-- Providers see only the city, not the full address, until mission is accepted.
ALTER TABLE properties ADD COLUMN IF NOT EXISTS city TEXT;

-- Backfill: extract city from existing addresses (best-effort French format)
-- Typical French address: "12 rue des Lilas, 74110 Morzine" → city = "Morzine"
-- Or: "12 rue des Lilas, Morzine" → city = last comma-separated segment trimmed
UPDATE properties
SET city = TRIM(SPLIT_PART(address, ',', GREATEST(
  ARRAY_LENGTH(STRING_TO_ARRAY(address, ','), 1), 1
)))
WHERE address IS NOT NULL AND city IS NULL;
