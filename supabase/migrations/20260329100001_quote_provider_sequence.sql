-- Table de compteurs de devis par prestataire
CREATE TABLE IF NOT EXISTS quote_provider_counters (
  provider_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  current_number INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE quote_provider_counters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Providers manage own counter" ON quote_provider_counters
  FOR ALL TO authenticated
  USING (provider_id = auth.uid());

-- RPC pour incrémenter atomiquement le compteur d'un prestataire
CREATE OR REPLACE FUNCTION next_quote_number(p_provider_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  next_num INTEGER;
BEGIN
  INSERT INTO quote_provider_counters (provider_id, current_number)
  VALUES (p_provider_id, 1)
  ON CONFLICT (provider_id)
  DO UPDATE SET current_number = quote_provider_counters.current_number + 1
  RETURNING current_number INTO next_num;
  RETURN next_num;
END;
$$;

GRANT EXECUTE ON FUNCTION next_quote_number(UUID) TO authenticated;

-- Ajouter la colonne quote_number sur mission_quotes si pas déjà là
ALTER TABLE mission_quotes ADD COLUMN IF NOT EXISTS quote_number TEXT;
