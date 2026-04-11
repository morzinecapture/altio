-- ══════════════════════════════════════════════════════════════════
-- Fix remaining NO ACTION FK constraints that block account deletion
-- ══════════════════════════════════════════════════════════════════

-- ── emergency_bids.provider_id → CASCADE ────────────────────────
ALTER TABLE emergency_bids DROP CONSTRAINT IF EXISTS emergency_bids_provider_id_fkey;
ALTER TABLE emergency_bids
  ADD CONSTRAINT emergency_bids_provider_id_fkey
  FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE;

-- ── emergency_requests.accepted_provider_id → SET NULL ──────────
ALTER TABLE emergency_requests DROP CONSTRAINT IF EXISTS emergency_requests_accepted_provider_id_fkey;
ALTER TABLE emergency_requests ALTER COLUMN accepted_provider_id DROP NOT NULL;
ALTER TABLE emergency_requests
  ADD CONSTRAINT emergency_requests_accepted_provider_id_fkey
  FOREIGN KEY (accepted_provider_id) REFERENCES users(id) ON DELETE SET NULL;

-- ── mission_quotes.provider_id → CASCADE ────────────────────────
ALTER TABLE mission_quotes DROP CONSTRAINT IF EXISTS mission_quotes_provider_id_fkey;
ALTER TABLE mission_quotes
  ADD CONSTRAINT mission_quotes_provider_id_fkey
  FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE;

-- ── provider_schedule.provider_id → CASCADE ─────────────────────
ALTER TABLE provider_schedule DROP CONSTRAINT IF EXISTS provider_schedule_provider_id_fkey;
ALTER TABLE provider_schedule
  ADD CONSTRAINT provider_schedule_provider_id_fkey
  FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE;

-- ── quotes.provider_id → CASCADE ────────────────────────────────
ALTER TABLE quotes DROP CONSTRAINT IF EXISTS quotes_provider_id_fkey;
ALTER TABLE quotes
  ADD CONSTRAINT quotes_provider_id_fkey
  FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE;

-- ── reservations.owner_id → CASCADE ─────────────────────────────
ALTER TABLE reservations DROP CONSTRAINT IF EXISTS reservations_owner_id_fkey;
ALTER TABLE reservations
  ADD CONSTRAINT reservations_owner_id_fkey
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE;
