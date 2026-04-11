-- Add is_auto_entrepreneur flag to users table.
-- Auto-entrepreneurs under franchise de base are VAT exempt by default.

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_auto_entrepreneur BOOLEAN DEFAULT false;

-- Backfill: sync existing providers who selected auto_entrepreneur at onboarding
UPDATE users u
SET is_auto_entrepreneur = true, is_vat_exempt = true
FROM provider_profiles pp
WHERE pp.provider_id = u.id
  AND pp.company_type = 'auto_entrepreneur'
  AND u.is_auto_entrepreneur = false;

-- Trigger: auto-sync is_auto_entrepreneur + is_vat_exempt when company_type changes
CREATE OR REPLACE FUNCTION sync_auto_entrepreneur_vat()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.company_type IS DISTINCT FROM OLD.company_type THEN
    UPDATE users SET
      is_auto_entrepreneur = (NEW.company_type = 'auto_entrepreneur'),
      is_vat_exempt = (NEW.company_type = 'auto_entrepreneur')
    WHERE id = NEW.provider_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_sync_auto_entrepreneur ON provider_profiles;
CREATE TRIGGER trg_sync_auto_entrepreneur
  AFTER UPDATE OF company_type ON provider_profiles
  FOR EACH ROW
  EXECUTE FUNCTION sync_auto_entrepreneur_vat();

-- Also fire on INSERT (onboarding creates the row)
DROP TRIGGER IF EXISTS trg_sync_auto_entrepreneur_insert ON provider_profiles;
CREATE TRIGGER trg_sync_auto_entrepreneur_insert
  AFTER INSERT ON provider_profiles
  FOR EACH ROW
  WHEN (NEW.company_type = 'auto_entrepreneur')
  EXECUTE FUNCTION sync_auto_entrepreneur_vat();
