ALTER TABLE missions ADD COLUMN IF NOT EXISTS require_photos BOOLEAN DEFAULT false;
COMMENT ON COLUMN missions.require_photos IS 'Si true, le prestataire doit fournir au moins une photo avant de compléter la mission. Optionnel, activé par le propriétaire.';
