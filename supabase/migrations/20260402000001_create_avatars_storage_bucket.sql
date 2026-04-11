-- ============================================================
-- Storage bucket & RLS policies for user avatars
-- ============================================================

-- 1. Create avatars bucket (public so profile pictures are accessible)
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 2. Policies (idempotent: drop if exists then recreate)
DROP POLICY IF EXISTS "Users can upload own avatar" ON storage.objects;
CREATE POLICY "Users can upload own avatar"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Public read access for avatars" ON storage.objects;
CREATE POLICY "Public read access for avatars"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Users can update own avatar" ON storage.objects;
CREATE POLICY "Users can update own avatar"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Users can delete own avatar" ON storage.objects;
CREATE POLICY "Users can delete own avatar"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- ============================================================
-- Storage bucket for insurance documents (private)
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('insurance-documents', 'insurance-documents', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Users can upload own insurance docs" ON storage.objects;
CREATE POLICY "Users can upload own insurance docs"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'insurance-documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Users can view own insurance docs" ON storage.objects;
CREATE POLICY "Users can view own insurance docs"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'insurance-documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Users can update own insurance docs" ON storage.objects;
CREATE POLICY "Users can update own insurance docs"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'insurance-documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'insurance-documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
