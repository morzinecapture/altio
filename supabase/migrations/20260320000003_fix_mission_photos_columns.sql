-- Add missing uploaded_at column to mission_photos if it doesn't exist
ALTER TABLE mission_photos
  ADD COLUMN IF NOT EXISTS uploaded_at timestamptz DEFAULT now();
