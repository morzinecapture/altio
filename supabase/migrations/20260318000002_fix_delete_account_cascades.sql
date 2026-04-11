-- ══════════════════════════════════════════════════════════════════
-- Fix cascade rules for safe account deletion
-- Uses DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT directly
-- (avoids naming conflicts with the dynamic helper approach)
-- ══════════════════════════════════════════════════════════════════

-- ── missions.owner_id → SET NULL ─────────────────────────────────
ALTER TABLE missions DROP CONSTRAINT IF EXISTS missions_owner_id_fkey;
ALTER TABLE missions
  ADD CONSTRAINT missions_owner_id_fkey
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL;

-- ── missions.assigned_provider_id → SET NULL ─────────────────────
ALTER TABLE missions DROP CONSTRAINT IF EXISTS missions_assigned_provider_id_fkey;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='missions' AND column_name='assigned_provider_id') THEN
    ALTER TABLE missions
      ADD CONSTRAINT missions_assigned_provider_id_fkey
      FOREIGN KEY (assigned_provider_id) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ── properties.owner_id → CASCADE ────────────────────────────────
ALTER TABLE properties DROP CONSTRAINT IF EXISTS properties_owner_id_fkey;
ALTER TABLE properties
  ADD CONSTRAINT properties_owner_id_fkey
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE;

-- ── provider_profiles.provider_id → CASCADE ──────────────────────
ALTER TABLE provider_profiles DROP CONSTRAINT IF EXISTS provider_profiles_provider_id_fkey;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='provider_profiles' AND column_name='provider_id') THEN
    ALTER TABLE provider_profiles
      ADD CONSTRAINT provider_profiles_provider_id_fkey
      FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ── emergency_requests.owner_id → CASCADE ────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='emergency_requests' AND column_name='owner_id') THEN
    ALTER TABLE emergency_requests DROP CONSTRAINT IF EXISTS emergency_requests_owner_id_fkey;
    ALTER TABLE emergency_requests
      ADD CONSTRAINT emergency_requests_owner_id_fkey
      FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ── mission_applications.provider_id → CASCADE ───────────────────
-- Drop existing constraint first (it exists but may lack ON DELETE CASCADE)
ALTER TABLE mission_applications DROP CONSTRAINT IF EXISTS mission_applications_provider_id_fkey;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='mission_applications' AND column_name='provider_id') THEN
    ALTER TABLE mission_applications
      ADD CONSTRAINT mission_applications_provider_id_fkey
      FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;
