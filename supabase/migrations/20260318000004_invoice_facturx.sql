-- Ajoute la colonne facturx_url à la table invoices pour stockage du XML Factur-X
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS facturx_url TEXT;

-- Commentaire pour la conformité réglementaire
COMMENT ON COLUMN invoices.facturx_url IS 'URL du fichier XML Factur-X (EN 16931) pour conformité facturation électronique 2026';
