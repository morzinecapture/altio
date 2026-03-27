-- ======================================================================
-- Fix: complete cascade delete on account deletion
--
-- Root cause: when an owner deletes their account, emergency_requests
-- survive because emergency_bids/mission_quotes from OTHER providers
-- reference them (FK NO ACTION blocks deletion). The Edge Function
-- swallows the error (try/catch), leaving orphaned records that the
-- RLS policy "Providers read open emergencies" still exposes.
--
-- Fixes:
-- 1. emergency_bids.emergency_request_id  → ON DELETE CASCADE
-- 2. mission_quotes.emergency_request_id  → ON DELETE CASCADE
-- 3. invoices.emergency_id               → ON DELETE SET NULL
-- 4. RLS: providers no longer see orphaned emergency_requests
-- 5. Cleanup existing orphaned data
-- ======================================================================

-- ── 1. emergency_bids.emergency_request_id → CASCADE ────────────────
-- When an emergency_request is deleted, its bids must go too.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'emergency_bids' AND column_name = 'emergency_request_id'
  ) THEN
    -- Drop any existing FK (name may vary)
    ALTER TABLE emergency_bids
      DROP CONSTRAINT IF EXISTS emergency_bids_emergency_request_id_fkey;
    ALTER TABLE emergency_bids
      DROP CONSTRAINT IF EXISTS emergency_bids_emergency_id_fkey;

    ALTER TABLE emergency_bids
      ADD CONSTRAINT emergency_bids_emergency_request_id_fkey
      FOREIGN KEY (emergency_request_id)
      REFERENCES emergency_requests(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ── 2. mission_quotes.emergency_request_id → CASCADE ────────────────
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'mission_quotes' AND column_name = 'emergency_request_id'
  ) THEN
    ALTER TABLE mission_quotes
      DROP CONSTRAINT IF EXISTS mission_quotes_emergency_request_id_fkey;
    ALTER TABLE mission_quotes
      DROP CONSTRAINT IF EXISTS mission_quotes_emergency_id_fkey;

    ALTER TABLE mission_quotes
      ADD CONSTRAINT mission_quotes_emergency_request_id_fkey
      FOREIGN KEY (emergency_request_id)
      REFERENCES emergency_requests(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ── 3. invoices.emergency_id → SET NULL ─────────────────────────────
-- Re-assert so invoice rows survive but lose the reference.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'emergency_id'
  ) THEN
    ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_emergency_id_fkey;
    ALTER TABLE invoices
      ADD CONSTRAINT invoices_emergency_id_fkey
      FOREIGN KEY (emergency_id)
      REFERENCES emergency_requests(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ── 4. Re-assert emergency_requests.owner_id → CASCADE ──────────────
-- Safety: ensure previous migration was applied correctly.
ALTER TABLE emergency_requests DROP CONSTRAINT IF EXISTS emergency_requests_owner_id_fkey;
ALTER TABLE emergency_requests
  ADD CONSTRAINT emergency_requests_owner_id_fkey
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE;

-- ── 5. RLS: filter out orphaned emergency_requests ──────────────────
-- Replace the policy that exposes all open emergencies with one that
-- also checks owner_id IS NOT NULL (defense in depth).
DROP POLICY IF EXISTS "Providers read open emergencies" ON emergency_requests;
CREATE POLICY "Providers read open emergencies" ON emergency_requests
  FOR SELECT TO authenticated
  USING (
    status IN ('open', 'assigned', 'pending', 'bids_open')
    AND owner_id IS NOT NULL
  );

-- ── 6. Cleanup orphaned emergency data ──────────────────────────────
-- Delete emergency_requests whose owner no longer exists in users table.
DELETE FROM emergency_requests
WHERE owner_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM users WHERE id = emergency_requests.owner_id);

-- Also delete emergency_requests with NULL owner_id (leftover from
-- partial account deletions).
DELETE FROM emergency_requests WHERE owner_id IS NULL;
