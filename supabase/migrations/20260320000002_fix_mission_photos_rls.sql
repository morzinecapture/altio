-- ============================================================
-- Fix: mission_photos SELECT policy
-- The previous policy used a subquery on missions table,
-- which has its own RLS — causing nested RLS conflicts
-- that silently return 0 rows.
-- ============================================================

-- Drop the old problematic policy
DROP POLICY IF EXISTS "Mission participants can view photos" ON mission_photos;

-- Owner can view photos on their missions
CREATE POLICY "Owners can view mission photos" ON mission_photos
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM missions m
      WHERE m.id = mission_photos.mission_id
        AND m.owner_id = auth.uid()
    )
  );

-- Provider can view their own uploaded photos
CREATE POLICY "Providers can view own mission photos" ON mission_photos
  FOR SELECT TO authenticated
  USING (provider_id = auth.uid());

-- Grant usage so the policies with subqueries can bypass missions RLS
-- by using a security definer function
CREATE OR REPLACE FUNCTION public.is_mission_owner(p_mission_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM missions
    WHERE id = p_mission_id
      AND owner_id = auth.uid()
  );
$$;

-- Replace the owner policy with one using the SECURITY DEFINER function
DROP POLICY IF EXISTS "Owners can view mission photos" ON mission_photos;

CREATE POLICY "Owners can view mission photos" ON mission_photos
  FOR SELECT TO authenticated
  USING (public.is_mission_owner(mission_photos.mission_id));
