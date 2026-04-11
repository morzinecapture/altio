-- ============================================================
-- Storage buckets & RLS policies for photo uploads
-- ============================================================

-- 1. Create buckets (idempotent: skip if already exists)
INSERT INTO storage.buckets (id, name, public)
VALUES ('mission_proofs', 'mission_proofs', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('partner-logos', 'partner-logos', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('partner-brochures', 'partner-brochures', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Storage policies for mission_proofs bucket

-- Authenticated users can upload to mission_proofs (path: missionId/userId/filename)
CREATE POLICY "Authenticated users can upload mission proofs"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'mission_proofs');

-- Anyone can view mission proofs (public bucket)
CREATE POLICY "Public read access for mission proofs"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'mission_proofs');

-- Users can update their own uploads
CREATE POLICY "Users can update own mission proofs"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'mission_proofs' AND (storage.foldername(name))[2] = auth.uid()::text)
WITH CHECK (bucket_id = 'mission_proofs');

-- Users can delete their own uploads
CREATE POLICY "Users can delete own mission proofs"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'mission_proofs' AND (storage.foldername(name))[2] = auth.uid()::text);

-- 3. Storage policies for partner-logos bucket

CREATE POLICY "Authenticated users can upload partner logos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'partner-logos');

CREATE POLICY "Public read access for partner logos"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'partner-logos');

CREATE POLICY "Authenticated users can update partner logos"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'partner-logos')
WITH CHECK (bucket_id = 'partner-logos');

-- 4. Storage policies for partner-brochures bucket

CREATE POLICY "Authenticated users can upload partner brochures"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'partner-brochures');

CREATE POLICY "Public read access for partner brochures"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'partner-brochures');

CREATE POLICY "Authenticated users can update partner brochures"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'partner-brochures')
WITH CHECK (bucket_id = 'partner-brochures');

-- 5. Create mission_photos table if not exists
CREATE TABLE IF NOT EXISTS mission_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  provider_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  photo_url text NOT NULL,
  uploaded_at timestamptz DEFAULT now()
);

-- RLS on mission_photos table
ALTER TABLE mission_photos ENABLE ROW LEVEL SECURITY;

-- Providers can insert their own photos
CREATE POLICY "Providers can insert mission photos"
ON mission_photos FOR INSERT
TO authenticated
WITH CHECK (provider_id = auth.uid());

-- Mission participants can view photos
CREATE POLICY "Mission participants can view photos"
ON mission_photos FOR SELECT
TO authenticated
USING (
  provider_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM missions m
    WHERE m.id = mission_photos.mission_id
    AND m.owner_id = auth.uid()
  )
);
