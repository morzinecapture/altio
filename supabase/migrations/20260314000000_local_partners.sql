-- ─── Colonne admin sur users ─────────────────────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false;

-- ─── Table local_partners ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS local_partners (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  category     TEXT NOT NULL,
  zone         TEXT NOT NULL,
  description  TEXT,
  logo_url     TEXT,
  brochure_url TEXT,
  phone        TEXT,
  website      TEXT,
  address      TEXT,
  is_active    BOOLEAN DEFAULT true,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE local_partners ENABLE ROW LEVEL SECURITY;

-- Lecture : tout utilisateur connecté peut lire les partenaires actifs
DROP POLICY IF EXISTS "Anyone reads active partners" ON local_partners;
CREATE POLICY "Anyone reads active partners"
  ON local_partners FOR SELECT
  USING (is_active = true);

-- Écriture : admins uniquement
DROP POLICY IF EXISTS "Admins manage partners" ON local_partners;
CREATE POLICY "Admins manage partners"
  ON local_partners FOR ALL
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true)
  );

-- ─── Index pour performances ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_partners_zone     ON local_partners(zone);
CREATE INDEX IF NOT EXISTS idx_partners_category ON local_partners(category);
CREATE INDEX IF NOT EXISTS idx_partners_active   ON local_partners(is_active);
