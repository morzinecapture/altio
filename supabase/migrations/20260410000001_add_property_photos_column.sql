-- Add photos array column to properties (URLs of uploaded images)
ALTER TABLE properties ADD COLUMN IF NOT EXISTS photos TEXT[] DEFAULT '{}';
