-- ─── Fix: récursion infinie dans les policies admin ──────────────────────────
-- La policy "Admins read all users" fait un SELECT sur users depuis users
-- → boucle infinie. Solution : fonction SECURITY DEFINER qui bypasse les RLS.

-- Supprimer les policies récursives
DROP POLICY IF EXISTS "Admins read all users"              ON users;
DROP POLICY IF EXISTS "Admins update users"                ON users;
DROP POLICY IF EXISTS "Admins read all missions"           ON missions;
DROP POLICY IF EXISTS "Admins update missions"             ON missions;
DROP POLICY IF EXISTS "Admins manage provider_profiles"    ON provider_profiles;
DROP POLICY IF EXISTS "Admins read all emergency_requests" ON emergency_requests;
DROP POLICY IF EXISTS "Admins manage audit_log"            ON audit_log;

-- Fonction SECURITY DEFINER : lit is_admin sans déclencher les policies RLS
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(is_admin, false) FROM users WHERE id = auth.uid() LIMIT 1;
$$;

-- Recréer toutes les policies en utilisant is_admin() au lieu du sous-select
CREATE POLICY "Admins read all users" ON users FOR SELECT
  USING (is_admin());

CREATE POLICY "Admins update users" ON users FOR UPDATE
  USING (is_admin());

CREATE POLICY "Admins read all missions" ON missions FOR SELECT
  USING (is_admin());

CREATE POLICY "Admins update missions" ON missions FOR UPDATE
  USING (is_admin());

CREATE POLICY "Admins manage provider_profiles" ON provider_profiles FOR ALL
  USING (is_admin());

CREATE POLICY "Admins read all emergency_requests" ON emergency_requests FOR SELECT
  USING (is_admin());

CREATE POLICY "Admins manage audit_log" ON audit_log FOR ALL
  USING (is_admin());
