-- Allow reviews for emergencies (not just missions)
-- Make mission_id nullable and add emergency_request_id
ALTER TABLE reviews ALTER COLUMN mission_id DROP NOT NULL;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS emergency_request_id UUID REFERENCES emergency_requests(id) ON DELETE CASCADE;

-- Add check: either mission_id or emergency_request_id must be set
ALTER TABLE reviews DROP CONSTRAINT IF EXISTS reviews_has_reference;
ALTER TABLE reviews ADD CONSTRAINT reviews_has_reference CHECK (mission_id IS NOT NULL OR emergency_request_id IS NOT NULL);

-- Update unique constraint to handle both cases
ALTER TABLE reviews DROP CONSTRAINT IF EXISTS reviews_mission_id_owner_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS reviews_mission_unique ON reviews (mission_id, owner_id) WHERE mission_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS reviews_emergency_unique ON reviews (emergency_request_id, owner_id) WHERE emergency_request_id IS NOT NULL;
