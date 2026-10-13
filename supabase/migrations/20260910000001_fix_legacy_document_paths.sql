-- Répare l'accès aux factures et devis émis avant le 22 juillet 2026.
--
-- Contexte : la migration 20260706000001 a rendu le bucket storage `invoices`
-- privé, et le même déploiement a changé le format stocké côté Edge Functions :
--   avant : pdf_url = 'https://<projet>.supabase.co/storage/v1/object/public/invoices/<fichier>'
--   après : pdf_url = '<fichier>'
--
-- Conséquence : les lignes antérieures pointent vers une URL publique morte
-- (HTTP 400 "Bucket not found"), et la policy RLS de storage.objects — qui
-- compare `invoices.pdf_url = storage.objects.name` — ne peut pas les faire
-- correspondre, donc aucune URL signée ne peut être émise pour elles.
-- Les documents existent toujours dans le bucket, seul le pointeur est invalide.
--
-- Obligation d'archivage : les factures doivent rester disponibles et lisibles
-- 10 ans. Cette migration ne modifie AUCUN contenu de document : elle normalise
-- uniquement le pointeur, et sauvegarde les valeurs d'origine avant écriture.

-- ── 1. Sauvegarde des valeurs d'origine (réversibilité) ──────────────────────
CREATE TABLE IF NOT EXISTS legacy_document_path_backup (
  table_name  TEXT        NOT NULL,
  row_id      UUID        NOT NULL,
  column_name TEXT        NOT NULL,
  old_value   TEXT        NOT NULL,
  backed_up_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (table_name, row_id, column_name)
);

ALTER TABLE legacy_document_path_backup ENABLE ROW LEVEL SECURITY;
-- Table technique : accessible uniquement au service_role (aucune policy pour authenticated).

INSERT INTO legacy_document_path_backup (table_name, row_id, column_name, old_value)
SELECT 'invoices', id, 'pdf_url', pdf_url
FROM invoices
WHERE pdf_url LIKE '%/storage/v1/object/%/invoices/%'
ON CONFLICT DO NOTHING;

INSERT INTO legacy_document_path_backup (table_name, row_id, column_name, old_value)
SELECT 'invoices', id, 'facturx_url', facturx_url
FROM invoices
WHERE facturx_url LIKE '%/storage/v1/object/%/invoices/%'
ON CONFLICT DO NOTHING;

INSERT INTO legacy_document_path_backup (table_name, row_id, column_name, old_value)
SELECT 'mission_quotes', id, 'quote_document_url', quote_document_url
FROM mission_quotes
WHERE quote_document_url LIKE '%/storage/v1/object/%/invoices/%'
ON CONFLICT DO NOTHING;

-- ── 2. Normalisation : URL complète → chemin d'objet ─────────────────────────
-- Le segment après '/invoices/' est exactement le nom d'objet dans le bucket.
-- Les paramètres de requête éventuels (?token=... sur une URL signée) sont retirés.

UPDATE invoices
SET pdf_url = split_part(
      regexp_replace(pdf_url, '^.*/storage/v1/object/(public|sign)/invoices/', ''),
      '?', 1
    )
WHERE pdf_url LIKE '%/storage/v1/object/%/invoices/%';

UPDATE invoices
SET facturx_url = split_part(
      regexp_replace(facturx_url, '^.*/storage/v1/object/(public|sign)/invoices/', ''),
      '?', 1
    )
WHERE facturx_url LIKE '%/storage/v1/object/%/invoices/%';

UPDATE mission_quotes
SET quote_document_url = split_part(
      regexp_replace(quote_document_url, '^.*/storage/v1/object/(public|sign)/invoices/', ''),
      '?', 1
    )
WHERE quote_document_url LIKE '%/storage/v1/object/%/invoices/%';

-- ── Rollback manuel si nécessaire ────────────────────────────────────────────
-- UPDATE invoices i SET pdf_url = b.old_value
-- FROM legacy_document_path_backup b
-- WHERE b.table_name = 'invoices' AND b.column_name = 'pdf_url' AND b.row_id = i.id;
