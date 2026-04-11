-- Ajouter les champs TVA sur mission_quotes
ALTER TABLE mission_quotes ADD COLUMN IF NOT EXISTS tva_rate NUMERIC(5,4) DEFAULT 0.20;
ALTER TABLE mission_quotes ADD COLUMN IF NOT EXISTS is_vat_exempt BOOLEAN DEFAULT false;

-- Mettre à jour les devis existants des auto-entrepreneurs
UPDATE mission_quotes mq
SET is_vat_exempt = true, tva_rate = 0
FROM users u
WHERE u.id = mq.provider_id AND u.is_vat_exempt = true;

-- Mettre à jour les devis rénovation existants
UPDATE mission_quotes
SET tva_rate = 0.10
WHERE is_renovation = true AND is_vat_exempt = false;
