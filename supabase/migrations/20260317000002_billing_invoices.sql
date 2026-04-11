-- Sprint 4 : Facturation électronique (réforme France 2026/2027)

-- ── Données fiscales sur les utilisateurs ─────────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS siren            TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS vat_number       TEXT;      -- FR + 11 chars
ALTER TABLE users ADD COLUMN IF NOT EXISTS company_name     TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS billing_address  TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_vat_exempt    BOOLEAN DEFAULT false;

-- ── Séquence pour numéros de factures séquentiels ─────────────────────────────
CREATE SEQUENCE IF NOT EXISTS invoice_seq START 1;

-- ── Table invoices ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invoices (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number  TEXT UNIQUE NOT NULL,
  mission_id      UUID REFERENCES missions(id) ON DELETE SET NULL,
  invoice_type    TEXT NOT NULL CHECK (invoice_type IN ('commission', 'service')),
  amount_ht       DECIMAL(10,2) NOT NULL,
  amount_ttc      DECIMAL(10,2) NOT NULL,
  vat_rate        DECIMAL(5,2)  DEFAULT 20.00,
  seller_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  buyer_id        UUID REFERENCES users(id) ON DELETE SET NULL,
  pdf_url         TEXT,
  stripe_pi_id    TEXT,
  status          TEXT DEFAULT 'issued' CHECK (status IN ('issued', 'sent', 'paid', 'cancelled')),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── Row Level Security ─────────────────────────────────────────────────────────
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

-- Owner (buyer) voit ses factures de prestation
CREATE POLICY "owner_sees_own_invoices" ON invoices
  FOR SELECT USING (
    buyer_id  = auth.uid() OR
    seller_id = auth.uid()
  );

-- Admin voit tout
CREATE POLICY "admin_sees_all_invoices" ON invoices
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true)
  );

-- Service role peut tout faire (Edge Functions)
CREATE POLICY "service_role_full_access" ON invoices
  FOR ALL USING (auth.role() = 'service_role');

-- ── Index ─────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS invoices_seller_id_idx    ON invoices(seller_id);
CREATE INDEX IF NOT EXISTS invoices_buyer_id_idx     ON invoices(buyer_id);
CREATE INDEX IF NOT EXISTS invoices_mission_id_idx   ON invoices(mission_id);
CREATE INDEX IF NOT EXISTS invoices_created_at_idx   ON invoices(created_at DESC);
