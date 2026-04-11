-- ══════════════════════════════════════════════════════════════════
-- Fix emergency_bids RLS + provider UPDATE on emergency_requests
-- + users table public profile read (needed for jointures)
--
-- Bugs fixed:
-- 1. emergency_bids had no RLS policies → bids couldn't be read/written
-- 2. Provider couldn't UPDATE emergency_requests (markArrived, quote, etc.)
-- 3. Users could only read their OWN profile → all jointures on other
--    users (provider names, etc.) returned null
-- 4. mission_quotes had no RLS policies
-- ══════════════════════════════════════════════════════════════════

-- ── 0. users: allow authenticated users to read basic profile info ──
-- Without this, any Supabase query joining on users (e.g. bid→provider name)
-- returns null for other users' rows, breaking the entire emergency flow.
DROP POLICY IF EXISTS "Authenticated read public profiles" ON users;
CREATE POLICY "Authenticated read public profiles" ON users
  FOR SELECT TO authenticated
  USING (true);

-- ── 1. emergency_bids: enable RLS + create policies ──────────────

ALTER TABLE emergency_bids ENABLE ROW LEVEL SECURITY;

-- Clean up any existing policies
DROP POLICY IF EXISTS "Providers insert own bids" ON emergency_bids;
DROP POLICY IF EXISTS "Providers read own bids" ON emergency_bids;
DROP POLICY IF EXISTS "Owners read bids on own emergencies" ON emergency_bids;
DROP POLICY IF EXISTS "Owners update bids on own emergencies" ON emergency_bids;
DROP POLICY IF EXISTS "Admins manage all bids" ON emergency_bids;

-- Providers can insert their own bids
CREATE POLICY "Providers insert own bids" ON emergency_bids
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = provider_id);

-- Providers can read their own bids
CREATE POLICY "Providers read own bids" ON emergency_bids
  FOR SELECT TO authenticated
  USING (auth.uid() = provider_id);

-- Owners can read bids on their own emergencies
CREATE POLICY "Owners read bids on own emergencies" ON emergency_bids
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM emergency_requests er
      WHERE er.id = emergency_bids.emergency_request_id
        AND er.owner_id = auth.uid()
    )
  );

-- Owners can update bids on their own emergencies (accept/reject)
CREATE POLICY "Owners update bids on own emergencies" ON emergency_bids
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM emergency_requests er
      WHERE er.id = emergency_bids.emergency_request_id
        AND er.owner_id = auth.uid()
    )
  );

-- Admins can manage all bids
CREATE POLICY "Admins manage all bids" ON emergency_bids
  FOR ALL TO authenticated
  USING (is_admin());

-- ── 2. emergency_requests: provider UPDATE policy ────────────────
-- The accepted provider needs to UPDATE status (markArrived, submitQuote, complete)

DROP POLICY IF EXISTS "Accepted provider updates emergency" ON emergency_requests;

CREATE POLICY "Accepted provider updates emergency" ON emergency_requests
  FOR UPDATE TO authenticated
  USING (auth.uid() = accepted_provider_id);

-- ── 3. mission_quotes: RLS if not already set ────────────────────
-- Providers create quotes, owners read/update them

DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'mission_quotes') THEN
    ALTER TABLE mission_quotes ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Providers insert own quotes" ON mission_quotes;
    DROP POLICY IF EXISTS "Participants read quotes" ON mission_quotes;
    DROP POLICY IF EXISTS "Owners update quotes" ON mission_quotes;
    DROP POLICY IF EXISTS "Admins manage quotes" ON mission_quotes;

    -- Providers can insert their own quotes
    CREATE POLICY "Providers insert own quotes" ON mission_quotes
      FOR INSERT TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM emergency_requests er
          WHERE er.id = mission_quotes.emergency_request_id
            AND er.accepted_provider_id = auth.uid()
        )
      );

    -- Both owner and provider can read quotes on their emergencies
    CREATE POLICY "Participants read quotes" ON mission_quotes
      FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM emergency_requests er
          WHERE er.id = mission_quotes.emergency_request_id
            AND (er.owner_id = auth.uid() OR er.accepted_provider_id = auth.uid())
        )
      );

    -- Owners can update quotes (accept/refuse)
    CREATE POLICY "Owners update quotes" ON mission_quotes
      FOR UPDATE TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM emergency_requests er
          WHERE er.id = mission_quotes.emergency_request_id
            AND er.owner_id = auth.uid()
        )
      );

    -- Admins full access
    CREATE POLICY "Admins manage quotes" ON mission_quotes
      FOR ALL TO authenticated
      USING (is_admin());
  END IF;
END $$;
