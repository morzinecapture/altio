-- Create favorite_providers table
CREATE TABLE IF NOT EXISTS favorite_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(owner_id, provider_id)
);

-- Enable RLS
ALTER TABLE favorite_providers ENABLE ROW LEVEL SECURITY;

-- Owner can manage their own favorites
CREATE POLICY "Owners manage own favorites" ON favorite_providers
  FOR ALL TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

-- Providers can see who favorited them (for priority notifications)
CREATE POLICY "Providers read own favorites" ON favorite_providers
  FOR SELECT TO authenticated
  USING (auth.uid() = provider_id);
