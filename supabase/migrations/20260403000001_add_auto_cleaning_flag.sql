-- Flag pour activer la création automatique de missions ménage à chaque sync iCal
ALTER TABLE properties ADD COLUMN IF NOT EXISTS auto_cleaning BOOLEAN DEFAULT false;

-- Compteur de missions ménage validées (pour trigger la suggestion d'automatisation après le 1er succès)
ALTER TABLE properties ADD COLUMN IF NOT EXISTS validated_cleaning_count INTEGER DEFAULT 0;
