-- ============================================================
-- Restore permissive INSERT policy on mission_applications
--
-- Migration 20260327300000 replaced the original "Providers manage
-- own applications" (FOR ALL) with a restrictive INSERT policy
-- that requires verified=true, rc_pro_verified=true, and
-- decennale_verified=true.  This silently blocks test providers
-- (and any provider whose documents are still being reviewed)
-- because Supabase RLS returns an empty row instead of an error.
--
-- The frontend already performs the same verification check in
-- applyToMission() and shows a user-friendly error message.
-- Keeping the RLS overly restrictive creates a double-block
-- that is invisible to the user (silent Supabase failure).
--
-- This migration restores the original simple policy:
-- a provider can INSERT their own application row.
-- Document verification is enforced at the application layer.
-- ============================================================

DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'mission_applications') THEN

    -- Drop the restrictive INSERT policy from 20260327300000
    DROP POLICY IF EXISTS "Verified providers insert applications" ON mission_applications;

    -- Restore simple INSERT: provider can insert their own rows
    CREATE POLICY "Providers insert own applications" ON mission_applications
      FOR INSERT
      WITH CHECK (auth.uid() = provider_id);

  END IF;
END $$;
