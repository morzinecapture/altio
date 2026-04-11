-- ============================================================
-- Storage bucket for property photos
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('property-photos', 'property-photos', true)
ON CONFLICT (id) DO NOTHING;

-- INSERT: only the owner of the property record can upload
-- Path convention: {propertyId}/{timestamp}.jpg
CREATE POLICY "Property owner can upload photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'property-photos'
  AND EXISTS (
    SELECT 1 FROM properties p
    WHERE p.owner_id = auth.uid()
      AND (storage.foldername(name))[1] = p.id::text
  )
);

-- SELECT: public (future site de réservation)
CREATE POLICY "Public read for property photos"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'property-photos');

-- DELETE: only the owner of the property record
CREATE POLICY "Property owner can delete photos"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'property-photos'
  AND EXISTS (
    SELECT 1 FROM properties p
    WHERE p.owner_id = auth.uid()
      AND (storage.foldername(name))[1] = p.id::text
  )
);
