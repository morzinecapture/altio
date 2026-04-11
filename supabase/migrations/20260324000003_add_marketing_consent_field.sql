-- Migration: Add marketing consent field for GDPR-compliant opt-in tracking
-- Used during owner (and potentially provider) onboarding

ALTER TABLE users ADD COLUMN IF NOT EXISTS marketing_consent_at TIMESTAMPTZ;
