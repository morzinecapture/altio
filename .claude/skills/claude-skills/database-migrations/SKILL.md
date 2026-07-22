---
name: database-migrations
description: Migrations de base de données Supabase pour Altio. Utilise cette skill dès qu'on crée ou modifie une table, ajoute une colonne, crée un index, modifie un type, ou touche au schéma de la base de données. Déclenche aussi quand on parle de migration, schema, DDL, ou structure de données.
---

# Database Migrations — Altio / Supabase

## Commandes Supabase CLI
```bash
# Créer une nouvelle migration
supabase migration new nom_de_la_migration

# Appliquer les migrations en local
supabase db reset

# Pusher les migrations vers le projet distant
supabase db push

# Voir le diff entre local et distant
supabase db diff
```

## Convention de nommage des migrations
```
YYYYMMDDHHMMSS_description_en_snake_case.sql
```
Exemples :
- `20260318120000_create_profiles_table.sql`
- `20260318130000_add_ical_sources_table.sql`
- `20260319100000_add_zone_id_to_missions.sql`

## Schéma complet Altio (tables principales)

```sql
-- Profils (extension de auth.users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'provider')),
  full_name TEXT NOT NULL,
  phone TEXT,
  avatar_url TEXT,
  company_name TEXT,
  siret TEXT,
  stripe_account_id TEXT,       -- Pour les prestataires (Connect)
  stripe_customer_id TEXT,      -- Pour les propriétaires
  expo_push_token TEXT,
  is_active BOOLEAN DEFAULT true,
  onboarding_completed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Zones géographiques
CREATE TABLE zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  department TEXT,
  is_active BOOLEAN DEFAULT true
);

-- Logements
CREATE TABLE properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  type TEXT CHECK (type IN ('appartement', 'chalet', 'maison', 'studio')),
  rooms INTEGER,
  zone_id UUID REFERENCES zones(id),
  photos TEXT[],                 -- URLs Supabase Storage
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Sources iCal
CREATE TABLE ical_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID REFERENCES properties(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  platform TEXT CHECK (platform IN ('airbnb', 'booking', 'other')),
  last_synced_at TIMESTAMPTZ,
  sync_status TEXT DEFAULT 'pending',
  error_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Réservations (importées via iCal)
CREATE TABLE reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID REFERENCES properties(id) ON DELETE CASCADE,
  ical_source_id UUID REFERENCES ical_sources(id),
  external_uid TEXT NOT NULL,
  guest_name TEXT,
  checkin DATE NOT NULL,
  checkout DATE NOT NULL,
  platform TEXT,
  auto_mission_created BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(ical_source_id, external_uid)
);

-- Missions
CREATE TABLE missions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID REFERENCES properties(id),
  owner_id UUID NOT NULL REFERENCES profiles(id),
  provider_id UUID REFERENCES profiles(id),
  reservation_id UUID REFERENCES reservations(id),
  status TEXT NOT NULL DEFAULT 'draft',
  service_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  date_needed DATE NOT NULL,
  time_slot TEXT,
  estimated_duration_hours NUMERIC,
  proposed_price NUMERIC,
  agreed_price NUMERIC,
  commission_rate NUMERIC DEFAULT 0.15,
  zone_id UUID REFERENCES zones(id),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  photos_before TEXT[],
  photos_after TEXT[],
  stripe_payment_intent_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Candidatures
CREATE TABLE mission_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id UUID REFERENCES missions(id) ON DELETE CASCADE,
  provider_id UUID REFERENCES profiles(id),
  proposed_price NUMERIC NOT NULL,
  message TEXT,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(mission_id, provider_id)
);

-- Zones des prestataires
CREATE TABLE provider_zones (
  provider_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  zone_id UUID REFERENCES zones(id) ON DELETE CASCADE,
  PRIMARY KEY (provider_id, zone_id)
);

-- Services des prestataires
CREATE TABLE provider_services (
  provider_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  service_type TEXT NOT NULL,
  hourly_rate NUMERIC,
  PRIMARY KEY (provider_id, service_type)
);

-- Favoris
CREATE TABLE favorites (
  owner_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  provider_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (owner_id, provider_id)
);

-- Avis
CREATE TABLE reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id UUID REFERENCES missions(id),
  author_id UUID REFERENCES profiles(id),
  target_id UUID REFERENCES profiles(id),
  rating INTEGER CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(mission_id, author_id)
);

-- Messages
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id UUID REFERENCES missions(id),
  owner_id UUID REFERENCES profiles(id),
  provider_id UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES profiles(id),
  content TEXT NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

## Index recommandés
```sql
CREATE INDEX idx_missions_owner ON missions(owner_id);
CREATE INDEX idx_missions_provider ON missions(provider_id);
CREATE INDEX idx_missions_zone_status ON missions(zone_id, status);
CREATE INDEX idx_missions_date ON missions(date_needed);
CREATE INDEX idx_reservations_checkout ON reservations(checkout);
CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at);
```

## Seed data (zones initiales)
```sql
INSERT INTO zones (name, slug, department) VALUES
  ('Morzine', 'morzine', '74'),
  ('Les Gets', 'les-gets', '74'),
  ('Chamonix', 'chamonix', '74'),
  ('Megève', 'megeve', '74'),
  ('Samoëns', 'samoens', '74');
```

## Règles
- Toujours tester les migrations en local avant de push (`supabase db reset`)
- Jamais de DROP TABLE en production — utiliser des migrations additives
- Toujours ajouter `ON DELETE CASCADE` quand une FK pointe vers profiles ou properties
- Chaque nouvelle table → activer RLS immédiatement (voir skill supabase-rls)
- Les types TEXT avec CHECK sont préférés aux ENUM (plus faciles à migrer)
