-- Backfill existing auto-entrepreneurs from provider_profiles.company_type
UPDATE users u
SET is_auto_entrepreneur = true, is_vat_exempt = true
FROM provider_profiles pp
WHERE pp.provider_id = u.id
  AND pp.company_type = 'auto_entrepreneur'
  AND u.is_auto_entrepreneur = false;

-- Trigger: auto-sync users.is_auto_entrepreneur + is_vat_exempt
-- whenever provider_profiles.company_type changes
CREATE OR REPLACE FUNCTION sync_auto_entrepreneur_vat()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE users SET
    is_auto_entrepreneur = (NEW.company_type = 'auto_entrepreneur'),
    is_vat_exempt = (NEW.company_type = 'auto_entrepreneur')
  WHERE id = NEW.provider_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_sync_auto_entrepreneur ON provider_profiles;
CREATE TRIGGER trg_sync_auto_entrepreneur
  AFTER INSERT OR UPDATE OF company_type ON provider_profiles
  FOR EACH ROW
  EXECUTE FUNCTION sync_auto_entrepreneur_vat();
