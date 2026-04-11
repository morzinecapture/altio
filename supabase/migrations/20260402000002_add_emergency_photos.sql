-- Add photos column to emergency_requests for owner-uploaded fault photos
ALTER TABLE emergency_requests ADD COLUMN IF NOT EXISTS photos text[] DEFAULT '{}';

-- Storage bucket for emergency photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('emergency-photos', 'emergency-photos', true)
ON CONFLICT (id) DO NOTHING;

-- RLS: owner can upload photos
CREATE POLICY "Owners can upload emergency photos"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'emergency-photos'
  AND auth.role() = 'authenticated'
);

-- RLS: anyone authenticated can view emergency photos (public bucket)
CREATE POLICY "Authenticated users can view emergency photos"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'emergency-photos'
  AND auth.role() = 'authenticated'
);
