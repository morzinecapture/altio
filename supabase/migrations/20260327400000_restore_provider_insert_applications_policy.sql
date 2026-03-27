-- ============================================================
-- Ensure mission_applications has correct per-operation policies
-- for providers.
--
-- The Sprint 6 audit (20260318000001) created a FOR ALL policy
-- "Providers manage own applications". This migration splits it
-- into explicit per-operation policies for clarity, while
-- keeping INSERT permissive (auth.uid() = provider_id).
--
-- Document verification is enforced at the application layer
-- in applyToMission(). A future migration will add schema
-- columns and a proper RLS gate once the data model is ready.
-- ============================================================

DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'mission_applications') THEN

    -- Drop any leftover policies from previous attempts
    DROP POLICY IF EXISTS "Providers manage own applications"       ON mission_applications;
    DROP POLICY IF EXISTS "Providers read own applications"         ON mission_applications;
    DROP POLICY IF EXISTS "Providers update own applications"       ON mission_applications;
    DROP POLICY IF EXISTS "Providers delete own applications"       ON mission_applications;
    DROP POLICY IF EXISTS "Providers insert own applications"       ON mission_applications;
    DROP POLICY IF EXISTS "Verified providers insert applications"  ON mission_applications;

    -- Per-operation policies for providers
    CREATE POLICY "Providers read own applications" ON mission_applications
      FOR SELECT USING (auth.uid() = provider_id);

    CREATE POLICY "Providers update own applications" ON mission_applications
      FOR UPDATE USING (auth.uid() = provider_id);

    CREATE POLICY "Providers delete own applications" ON mission_applications
      FOR DELETE USING (auth.uid() = provider_id);

    CREATE POLICY "Providers insert own applications" ON mission_applications
      FOR INSERT
      WITH CHECK (auth.uid() = provider_id);

  END IF;
END $$;
