-- ─── Admin Setup — version finale ────────────────────────────────────────────

-- ─── is_admin sur users ───────────────────────────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false;

-- ─── Table audit_log ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,
  target_type TEXT,
  target_id   UUID,
  metadata    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage audit_log" ON audit_log;
CREATE POLICY "Admins manage audit_log" ON audit_log FOR ALL
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true));

-- ─── Colonnes suspension ──────────────────────────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended        BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_at     TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_reason TEXT;

-- ─── Policies RLS admin ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins read all users" ON users;
DROP POLICY IF EXISTS "Admins update users"   ON users;
CREATE POLICY "Admins read all users" ON users FOR SELECT
  USING (EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.is_admin = true));
CREATE POLICY "Admins update users" ON users FOR UPDATE
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true));

DROP POLICY IF EXISTS "Admins read all missions"  ON missions;
DROP POLICY IF EXISTS "Admins update missions"    ON missions;
CREATE POLICY "Admins read all missions" ON missions FOR SELECT
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true));
CREATE POLICY "Admins update missions" ON missions FOR UPDATE
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true));

DROP POLICY IF EXISTS "Admins manage provider_profiles" ON provider_profiles;
CREATE POLICY "Admins manage provider_profiles" ON provider_profiles FOR ALL
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true));

DROP POLICY IF EXISTS "Admins read all emergency_requests" ON emergency_requests;
CREATE POLICY "Admins read all emergency_requests" ON emergency_requests FOR SELECT
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true));

-- ─── Vue admin_dashboard_stats (sans colonnes optionnelles) ───────────────────
CREATE OR REPLACE VIEW admin_dashboard_stats AS
SELECT
  (SELECT COUNT(*) FROM missions
    WHERE status NOT IN ('completed', 'cancelled', 'rejected'))  AS active_missions_count,
  (SELECT COUNT(*) FROM missions
    WHERE created_at >= DATE_TRUNC('month', NOW()))               AS missions_this_month,
  (SELECT COUNT(*) FROM missions
    WHERE status = 'completed')                                   AS completed_missions_total,
  (SELECT COUNT(*) FROM users WHERE role = 'owner')               AS owners_count,
  (SELECT COUNT(*) FROM users WHERE role = 'provider')            AS providers_count,
  (SELECT COUNT(*) FROM users
    WHERE created_at >= NOW() - INTERVAL '30 days')               AS new_users_30d,
  (SELECT COUNT(*) FROM provider_profiles)                        AS providers_pending_verification,
  (SELECT COUNT(*) FROM emergency_requests
    WHERE status NOT IN ('completed', 'cancelled'))               AS active_emergencies,
  COALESCE((
    SELECT SUM(fixed_rate * 0.10) FROM missions
    WHERE status IN ('completed', 'awaiting_payment')
    AND created_at >= DATE_TRUNC('month', NOW())
  ), 0)                                                           AS commissions_this_month,
  COALESCE((
    SELECT SUM(fixed_rate) FROM missions
    WHERE status IN ('completed', 'awaiting_payment')
  ), 0)                                                           AS total_volume;

-- ─── Index ────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_audit_log_admin_id   ON audit_log(admin_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_target     ON audit_log(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at DESC);
