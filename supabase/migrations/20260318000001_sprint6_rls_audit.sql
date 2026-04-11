-- ══════════════════════════════════════════════════════════════════
-- SPRINT 6 — Audit RLS complet + Reviews system + Rate limiting
-- ══════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────────
-- 1. TABLE: users
--    Trou détecté : aucune policy permettant à un user de lire/MAJ
--    sa propre ligne (seules les policies admin existaient).
-- ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users read own profile"   ON users;
DROP POLICY IF EXISTS "Users update own profile" ON users;

CREATE POLICY "Users read own profile" ON users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users update own profile" ON users
  FOR UPDATE USING (auth.uid() = id);

-- ──────────────────────────────────────────────────────────────────
-- 2. TABLE: missions
--    Trou détecté : table sans RLS ou sans policies user/provider.
-- ──────────────────────────────────────────────────────────────────
ALTER TABLE missions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners read own missions"          ON missions;
DROP POLICY IF EXISTS "Owners insert missions"            ON missions;
DROP POLICY IF EXISTS "Owners update own missions"        ON missions;
DROP POLICY IF EXISTS "Providers read assigned missions"  ON missions;
DROP POLICY IF EXISTS "Providers update assigned missions" ON missions;

CREATE POLICY "Owners read own missions" ON missions
  FOR SELECT USING (auth.uid() = owner_id);

CREATE POLICY "Owners insert missions" ON missions
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Owners update own missions" ON missions
  FOR UPDATE USING (auth.uid() = owner_id);

-- Provider voit les missions où il est assigné OU les missions publiées/pending
CREATE POLICY "Providers read assigned missions" ON missions
  FOR SELECT USING (
    auth.uid() = assigned_provider_id
    OR status IN ('pending', 'published')
  );

CREATE POLICY "Providers update assigned missions" ON missions
  FOR UPDATE USING (auth.uid() = assigned_provider_id);

-- ──────────────────────────────────────────────────────────────────
-- 3. TABLE: properties
--    Trou détecté : pas de RLS activé / pas de policies.
-- ──────────────────────────────────────────────────────────────────
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners manage own properties"      ON properties;
DROP POLICY IF EXISTS "Providers read mission properties" ON properties;

CREATE POLICY "Owners manage own properties" ON properties
  FOR ALL USING (auth.uid() = owner_id);

-- Prestataires peuvent lire les propriétés de leurs missions assignées
CREATE POLICY "Providers read mission properties" ON properties
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM missions m
      WHERE m.property_id = properties.id
        AND m.assigned_provider_id = auth.uid()
    )
  );

-- ──────────────────────────────────────────────────────────────────
-- 4. TABLE: reservations (si elle existe)
--    Trou détecté : aucune RLS sur les réservations.
-- ──────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'reservations') THEN
    ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Owners manage own reservations"       ON reservations;
    DROP POLICY IF EXISTS "Providers read relevant reservations" ON reservations;

    CREATE POLICY "Owners manage own reservations" ON reservations
      FOR ALL USING (
        EXISTS (
          SELECT 1 FROM properties p
          WHERE p.id = reservations.property_id
            AND p.owner_id = auth.uid()
        )
      );

    CREATE POLICY "Providers read relevant reservations" ON reservations
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM missions m
          WHERE m.property_id = reservations.property_id
            AND m.assigned_provider_id = auth.uid()
        )
      );
  END IF;
END $$;

-- ──────────────────────────────────────────────────────────────────
-- 5. TABLE: emergency_requests
--    Trou détecté : seul l'admin pouvait lire ; owners/providers exclus.
-- ──────────────────────────────────────────────────────────────────
ALTER TABLE emergency_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners manage own emergencies"    ON emergency_requests;
DROP POLICY IF EXISTS "Providers read open emergencies"  ON emergency_requests;

CREATE POLICY "Owners manage own emergencies" ON emergency_requests
  FOR ALL USING (auth.uid() = owner_id);

-- Prestataires peuvent voir les urgences ouvertes ou en cours
CREATE POLICY "Providers read open emergencies" ON emergency_requests
  FOR SELECT USING (status IN ('open', 'assigned', 'pending'));

-- ──────────────────────────────────────────────────────────────────
-- 6. TABLE: provider_profiles
--    Trou détecté : admins gèrent tout mais providers ne pouvaient
--    pas gérer leur propre profil ; owners ne pouvaient pas lire.
-- ──────────────────────────────────────────────────────────────────
ALTER TABLE provider_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Providers manage own profile" ON provider_profiles;
DROP POLICY IF EXISTS "Owners read provider profiles" ON provider_profiles;
DROP POLICY IF EXISTS "Public read provider profiles" ON provider_profiles;

CREATE POLICY "Providers manage own profile" ON provider_profiles
  FOR ALL USING (auth.uid() = provider_id);

-- Tout utilisateur authentifié peut lire les profils (pour le catalogue)
CREATE POLICY "Public read provider profiles" ON provider_profiles
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- ──────────────────────────────────────────────────────────────────
-- 7. TABLE: messages (si elle existe)
--    Trou détecté : pas de RLS — données accessibles à tous.
-- ──────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'messages') THEN
    ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Participants read messages" ON messages;
    DROP POLICY IF EXISTS "Senders insert messages"    ON messages;

    CREATE POLICY "Participants read messages" ON messages
      FOR SELECT USING (
        auth.uid() = sender_id OR auth.uid() = receiver_id
      );

    CREATE POLICY "Senders insert messages" ON messages
      FOR INSERT WITH CHECK (auth.uid() = sender_id);
  END IF;
END $$;

-- ──────────────────────────────────────────────────────────────────
-- 8. TABLE: mission_applications (si elle existe)
--    Trou détecté : providers et owners ne pouvaient pas lire.
-- ──────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'mission_applications') THEN
    ALTER TABLE mission_applications ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Providers manage own applications"        ON mission_applications;
    DROP POLICY IF EXISTS "Owners read applications on own missions" ON mission_applications;
    DROP POLICY IF EXISTS "Owners update applications"               ON mission_applications;

    CREATE POLICY "Providers manage own applications" ON mission_applications
      FOR ALL USING (auth.uid() = provider_id);

    CREATE POLICY "Owners read applications on own missions" ON mission_applications
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM missions m
          WHERE m.id = mission_applications.mission_id
            AND m.owner_id = auth.uid()
        )
      );

    CREATE POLICY "Owners update applications" ON mission_applications
      FOR UPDATE USING (
        EXISTS (
          SELECT 1 FROM missions m
          WHERE m.id = mission_applications.mission_id
            AND m.owner_id = auth.uid()
        )
      );
  END IF;
END $$;

-- ══════════════════════════════════════════════════════════════════
-- REVIEWS SYSTEM
-- ══════════════════════════════════════════════════════════════════

DROP TABLE IF EXISTS reviews CASCADE;
CREATE TABLE reviews (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id    UUID NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  owner_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating        INT  NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment       TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (mission_id, owner_id)   -- un seul avis par mission par owner
);

ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners create own reviews" ON reviews
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Owners read own reviews" ON reviews
  FOR SELECT USING (auth.uid() = owner_id);

CREATE POLICY "Providers read own reviews" ON reviews
  FOR SELECT USING (auth.uid() = provider_id);

CREATE POLICY "Public read all reviews" ON reviews
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins manage reviews" ON reviews
  FOR ALL USING (is_admin());

-- Colonne average_rating sur provider_profiles (si absente)
ALTER TABLE provider_profiles
  ADD COLUMN IF NOT EXISTS average_rating NUMERIC(3,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_reviews  INT          DEFAULT 0;

-- Fonction + trigger pour mettre à jour la note moyenne
CREATE OR REPLACE FUNCTION update_provider_rating()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE provider_profiles
  SET
    average_rating = (
      SELECT ROUND(AVG(rating)::NUMERIC, 2)
      FROM reviews
      WHERE provider_id = NEW.provider_id
    ),
    total_reviews = (
      SELECT COUNT(*) FROM reviews WHERE provider_id = NEW.provider_id
    )
  WHERE provider_id = NEW.provider_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_provider_rating ON reviews;
CREATE TRIGGER trg_update_provider_rating
  AFTER INSERT OR UPDATE OR DELETE ON reviews
  FOR EACH ROW EXECUTE FUNCTION update_provider_rating();

-- ══════════════════════════════════════════════════════════════════
-- RATE LIMITING
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS rate_limit_log (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL,
  action     TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_user_action_time
  ON rate_limit_log (user_id, action, created_at DESC);

ALTER TABLE rate_limit_log ENABLE ROW LEVEL SECURITY;

-- Seul le service_role peut écrire (depuis les Edge Functions)
CREATE POLICY "Service role manages rate limits" ON rate_limit_log
  FOR ALL USING (false);   -- bloqué pour tous les rôles non-service

-- Nettoyage automatique : supprimer les entrées > 24h (job quotidien)
CREATE OR REPLACE FUNCTION cleanup_rate_limit_log()
RETURNS void LANGUAGE sql AS $$
  DELETE FROM rate_limit_log WHERE created_at < now() - INTERVAL '24 hours';
$$;
