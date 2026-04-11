-- ══════════════════════════════════════════════════════════════════
-- Restrict users table RLS: replace overly permissive SELECT policy
--
-- Problem: "Authenticated read public profiles" allowed any
-- authenticated user to read ALL columns (siren, vat_number,
-- billing_address, stripe_account_id, google_calendar_token, etc.)
--
-- Fix:
-- 1. Own-profile policy: full column access for your own row
-- 2. General read policy: still USING(true) because RLS cannot
--    restrict columns — jointures need to read other users' basic
--    info (name, picture on bids/missions).  The real column-level
--    protection is enforced API-side (explicit select lists).
-- 3. public_profiles VIEW: defense-in-depth — exposes only safe
--    columns so the frontend can query it instead of the base table
--    when displaying other users' info.
-- ══════════════════════════════════════════════════════════════════

-- ── 1. Drop old policies ─────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated read public profiles" ON users;
DROP POLICY IF EXISTS "Users read own profile" ON users;
DROP POLICY IF EXISTS "Authenticated read all profiles" ON users;

-- ── 2. Own-profile: each user reads their full row ──────────────
CREATE POLICY "Users read own profile" ON users
  FOR SELECT TO authenticated
  USING (id = auth.uid());

-- ── 3. General read: needed for jointures (provider name on bids, etc.)
-- RLS cannot filter columns, only rows. The API layer MUST use explicit
-- select lists and never select('*') for other users' data.
CREATE POLICY "Authenticated read all profiles" ON users
  FOR SELECT TO authenticated
  USING (true);

-- ── 4. public_profiles view: safe column subset ─────────────────
-- Frontend code should prefer this view over the users table when
-- displaying another user's info (e.g. provider cards, bid authors).
CREATE OR REPLACE VIEW public_profiles AS
  SELECT
    id,
    name,
    email,
    picture,
    role,
    onboarding_completed,
    created_at
  FROM users;
