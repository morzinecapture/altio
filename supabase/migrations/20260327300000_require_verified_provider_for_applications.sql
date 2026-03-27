-- ============================================================
-- Restrict mission_applications INSERT to verified providers
-- A provider must have verified=true, siret, rc_pro_verified,
-- and decennale_verified before they can apply to a mission.
-- ============================================================

DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'mission_applications') THEN

    -- Drop the existing all-encompassing policy for providers
    DROP POLICY IF EXISTS "Providers manage own applications" ON mission_applications;

    -- Re-create SELECT/UPDATE/DELETE for providers (unchanged behavior)
    CREATE POLICY "Providers read own applications" ON mission_applications
      FOR SELECT USING (auth.uid() = provider_id);

    CREATE POLICY "Providers update own applications" ON mission_applications
      FOR UPDATE USING (auth.uid() = provider_id);

    CREATE POLICY "Providers delete own applications" ON mission_applications
      FOR DELETE USING (auth.uid() = provider_id);

    -- INSERT requires verified provider profile
    CREATE POLICY "Verified providers insert applications" ON mission_applications
      FOR INSERT
      WITH CHECK (
        auth.uid() = provider_id
        AND EXISTS (
          SELECT 1 FROM provider_profiles pp
          WHERE pp.provider_id = auth.uid()
            AND pp.verified = true
            AND pp.siret IS NOT NULL
            AND pp.rc_pro_verified = true
            AND pp.decennale_verified = true
        )
      );

  END IF;
END $$;
