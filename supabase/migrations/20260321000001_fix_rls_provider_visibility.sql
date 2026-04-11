-- ══════════════════════════════════════════════════════════════════
-- Fix RLS policies for provider visibility on missions, emergencies, and properties
-- ══════════════════════════════════════════════════════════════════

-- ── 1. Missions: providers need to see bids_open + their assigned missions in all states ──
DROP POLICY IF EXISTS "Providers read assigned missions" ON missions;
CREATE POLICY "Providers read assigned missions" ON missions
  FOR SELECT TO authenticated
  USING (
    auth.uid() = assigned_provider_id
    OR auth.uid() = owner_id
    OR status IN ('pending', 'published', 'bids_open')
  );

-- ── 2. Emergency requests: providers need to see open + their accepted emergencies in all states ──
DROP POLICY IF EXISTS "Providers read relevant emergencies" ON emergency_requests;
DROP POLICY IF EXISTS "Owners manage emergencies" ON emergency_requests;
DROP POLICY IF EXISTS "Owners manage own emergencies" ON emergency_requests;
DROP POLICY IF EXISTS "Users read own or relevant emergencies" ON emergency_requests;

CREATE POLICY "Users read own or relevant emergencies" ON emergency_requests
  FOR SELECT TO authenticated
  USING (
    auth.uid() = owner_id
    OR auth.uid() = accepted_provider_id
    OR status IN ('open', 'bids_open', 'pending')
  );

CREATE POLICY "Owners manage own emergencies" ON emergency_requests
  FOR ALL TO authenticated
  USING (auth.uid() = owner_id);

-- ── 3. Properties: providers assigned to an emergency should also see the property ──
DROP POLICY IF EXISTS "Providers read properties via missions" ON properties;
DROP POLICY IF EXISTS "Providers read properties via assignments" ON properties;
CREATE POLICY "Providers read properties via assignments" ON properties
  FOR SELECT TO authenticated
  USING (
    auth.uid() = owner_id
    OR EXISTS (
      SELECT 1 FROM missions m
      WHERE m.property_id = properties.id
        AND m.assigned_provider_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM emergency_requests e
      WHERE e.property_id = properties.id
        AND e.accepted_provider_id = auth.uid()
    )
  );

-- ── 4. update_provider_rating: add SECURITY DEFINER ──
CREATE OR REPLACE FUNCTION update_provider_rating()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  avg_r NUMERIC;
  cnt_r INT;
BEGIN
  SELECT AVG(rating), COUNT(*) INTO avg_r, cnt_r
  FROM reviews
  WHERE provider_id = NEW.provider_id;

  UPDATE provider_profiles
  SET average_rating = ROUND(avg_r, 2),
      total_reviews = cnt_r
  WHERE provider_id = NEW.provider_id;

  RETURN NEW;
END;
$$;
