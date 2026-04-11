-- Add target_provider_id and scheduled_date to emergency_requests
-- to support planned intervention requests (not just immediate emergencies).

ALTER TABLE emergency_requests
  ADD COLUMN IF NOT EXISTS target_provider_id uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS scheduled_date timestamptz;

-- Index for provider-targeted queries
CREATE INDEX IF NOT EXISTS idx_emergency_requests_target_provider
  ON emergency_requests(target_provider_id)
  WHERE target_provider_id IS NOT NULL;

-- Update RLS: targeted provider can always read their requests
DROP POLICY IF EXISTS "Providers read open emergencies" ON emergency_requests;
CREATE POLICY "Providers read open emergencies" ON emergency_requests
  FOR SELECT TO authenticated
  USING (
    (status IN ('open', 'assigned', 'pending', 'bids_open') AND owner_id IS NOT NULL)
    OR auth.uid() = target_provider_id
  );
