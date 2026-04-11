-- Add electronic signature fields to mission_quotes for legal compliance
-- owner_signature_text: consent text agreed by the owner ("Bon pour accord...")
-- owner_signature_ip: IP address at time of signature (optional, logged by Edge Function)
-- These fields, combined with existing owner_signature_at, constitute the electronic signature record.

DO $$
BEGIN
  -- Add owner_signature_text if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'mission_quotes' AND column_name = 'owner_signature_text'
  ) THEN
    ALTER TABLE mission_quotes ADD COLUMN owner_signature_text text;
  END IF;

  -- Add owner_signature_ip if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'mission_quotes' AND column_name = 'owner_signature_ip'
  ) THEN
    ALTER TABLE mission_quotes ADD COLUMN owner_signature_ip text;
  END IF;

  -- Add quote_number if not exists (for PDF filename and legal reference)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'mission_quotes' AND column_name = 'quote_number'
  ) THEN
    ALTER TABLE mission_quotes ADD COLUMN quote_number text;
  END IF;
END$$;
