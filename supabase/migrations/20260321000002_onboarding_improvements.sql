-- ============================================================
-- Onboarding improvements: insurance columns, quote validity,
-- and insurance-documents storage bucket
-- ============================================================

-- ── 1. Add insurance verification columns to provider_profiles ──

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'provider_profiles'
      AND column_name = 'rc_pro_verified'
  ) THEN
    ALTER TABLE provider_profiles ADD COLUMN rc_pro_verified BOOLEAN DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'provider_profiles'
      AND column_name = 'decennale_verified'
  ) THEN
    ALTER TABLE provider_profiles ADD COLUMN decennale_verified BOOLEAN DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'provider_profiles'
      AND column_name = 'rc_pro_doc_url'
  ) THEN
    ALTER TABLE provider_profiles ADD COLUMN rc_pro_doc_url TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'provider_profiles'
      AND column_name = 'decennale_doc_url'
  ) THEN
    ALTER TABLE provider_profiles ADD COLUMN decennale_doc_url TEXT;
  END IF;
END $$;

-- ── 2. Add valid_until column to mission_quotes ──

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'mission_quotes'
      AND column_name = 'valid_until'
  ) THEN
    ALTER TABLE mission_quotes ADD COLUMN valid_until TIMESTAMPTZ DEFAULT NULL;
  END IF;
END $$;

-- ── 3. Storage bucket for insurance documents (private) ──

INSERT INTO storage.buckets (id, name, public)
VALUES ('insurance-documents', 'insurance-documents', false)
ON CONFLICT (id) DO NOTHING;

-- ── 4. Storage RLS policies for insurance-documents bucket ──

-- Authenticated users can upload to their own folder ({userId}/*)
DROP POLICY IF EXISTS "Users upload own insurance docs" ON storage.objects;
CREATE POLICY "Users upload own insurance docs"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'insurance-documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Users can read their own insurance documents
DROP POLICY IF EXISTS "Users read own insurance docs" ON storage.objects;
CREATE POLICY "Users read own insurance docs"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'insurance-documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Admins can read all insurance documents
DROP POLICY IF EXISTS "Admins read all insurance docs" ON storage.objects;
CREATE POLICY "Admins read all insurance docs"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'insurance-documents'
  AND is_admin()
);

-- Users can update their own insurance documents
DROP POLICY IF EXISTS "Users update own insurance docs" ON storage.objects;
CREATE POLICY "Users update own insurance docs"
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

-- Users can delete their own insurance documents
DROP POLICY IF EXISTS "Users delete own insurance docs" ON storage.objects;
CREATE POLICY "Users delete own insurance docs"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'insurance-documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
