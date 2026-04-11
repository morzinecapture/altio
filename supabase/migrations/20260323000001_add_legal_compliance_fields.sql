-- Migration: Legal compliance fields
-- Phase 1: Mandat de facturation, CGU acceptance, droit de rétractation
-- Phase 2: Système de réclamations P2B

-- ═══════════════════════════════════════════════════════════════════════
-- Phase 1 — Champs juridiques sur profiles et missions
-- ═══════════════════════════════════════════════════════════════════════

-- Horodatage acceptation CGU (tous les utilisateurs)
ALTER TABLE users ADD COLUMN IF NOT EXISTS cgu_accepted_at TIMESTAMPTZ;

-- Horodatage acceptation mandat de facturation (prestataires uniquement)
-- Art. 289-I-2 du CGI — obligatoire pour émettre des factures au nom du prestataire
ALTER TABLE users ADD COLUMN IF NOT EXISTS mandate_accepted_at TIMESTAMPTZ;

-- Auto-certification DSA (art. 30 DSA — traçabilité prestataires)
ALTER TABLE users ADD COLUMN IF NOT EXISTS dsa_certified_at TIMESTAMPTZ;

-- Renonciation droit de rétractation par le propriétaire (art. L221-28 Code conso)
ALTER TABLE missions ADD COLUMN IF NOT EXISTS retractation_waived_at TIMESTAMPTZ;

-- ═══════════════════════════════════════════════════════════════════════
-- Phase 2 — Système de réclamations (obligation P2B)
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS reclamations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('quality', 'payment', 'commission', 'account', 'other')),
  mission_id UUID REFERENCES missions(id),
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'in_progress', 'resolved', 'closed')),
  resolution TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  acknowledged_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ
);

-- Index pour lookup rapide par utilisateur
CREATE INDEX IF NOT EXISTS idx_reclamations_user ON reclamations(user_id);
CREATE INDEX IF NOT EXISTS idx_reclamations_status ON reclamations(status);

-- RLS : un utilisateur ne voit que ses propres réclamations
ALTER TABLE reclamations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own reclamations"
  ON reclamations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create reclamations"
  ON reclamations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Admins voient toutes les réclamations
CREATE POLICY "Admins can view all reclamations"
  ON reclamations FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true)
  );

CREATE POLICY "Admins can update reclamations"
  ON reclamations FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true)
  );
