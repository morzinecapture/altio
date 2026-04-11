-- =============================================================================
-- SIMULATEUR iCal — Réservations Airbnb/Booking fictives + missions ménage
-- Propriétaire : maximegakiere@gmail.com
-- =============================================================================
-- Exécution sur Supabase Cloud :
--   Ouvrir le SQL Editor du dashboard Supabase et coller ce fichier entier.
--
-- Ce script est idempotent :
--   - ON CONFLICT DO NOTHING sur reservations.external_id
--   - NOT EXISTS check avant chaque insertion de mission
--   - Aucun UPDATE ni DELETE — les données existantes ne sont pas touchées
--
-- Note schéma :
--   - reservations.source CHECK IN ('airbnb', 'booking', 'manual')
--   - reservations utilise check_in / check_out (pas start_date / end_date)
--   - missions n'a pas de colonne reservation_id — la ref est dans description
--   - Index partiel unique sur missions : missions_cleaning_unique_per_day
--     (property_id, scheduled_date::date) WHERE mission_type = 'cleaning' AND status != 'cancelled'
-- =============================================================================

DO $$
DECLARE
  v_owner_id    UUID;
  v_property_id UUID;

  -- Variables pour chaque réservation insérée
  v_res1_id UUID;
  v_res2_id UUID;
  v_res3_id UUID;
  v_res4_id UUID;
  v_res5_id UUID;

  -- Dates calculées
  v_today DATE := CURRENT_DATE;

BEGIN
  -- -------------------------------------------------------------------------
  -- 1. Récupérer l'user_id du propriétaire
  -- -------------------------------------------------------------------------
  SELECT id INTO v_owner_id
  FROM auth.users
  WHERE email = 'maximegakiere@gmail.com';

  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Utilisateur maximegakiere@gmail.com introuvable dans auth.users';
  END IF;
  RAISE NOTICE 'Propriétaire trouvé : %', v_owner_id;

  -- -------------------------------------------------------------------------
  -- 2. Récupérer la première propriété de cet utilisateur
  --    Si aucune n'existe, en créer une de test
  -- -------------------------------------------------------------------------
  SELECT id INTO v_property_id
  FROM properties
  WHERE owner_id = v_owner_id
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_property_id IS NULL THEN
    -- Vérifier si "Chalet Test Morzine" existe déjà (au cas où owner_id differ)
    SELECT id INTO v_property_id
    FROM properties
    WHERE name = 'Chalet Test Morzine' AND owner_id = v_owner_id;
  END IF;

  IF v_property_id IS NULL THEN
    INSERT INTO properties (
      owner_id,
      name,
      address,
      property_type
    )
    VALUES (
      v_owner_id,
      'Chalet Test Morzine',
      '742 Route du Bouchet, 74110 Morzine',
      'chalet'
    )
    RETURNING id INTO v_property_id;
    RAISE NOTICE 'Propriété créée : Chalet Test Morzine (id: %)', v_property_id;
  ELSE
    RAISE NOTICE 'Propriété utilisée : % (id: %)',
      (SELECT name FROM properties WHERE id = v_property_id),
      v_property_id;
  END IF;

  -- -------------------------------------------------------------------------
  -- 3. Insérer les 5 réservations simulées (idempotent via external_id)
  --    'direct' n'est pas dans le CHECK → on utilise 'manual' à la place
  -- -------------------------------------------------------------------------

  -- Rés. 1 : check-in J+3, check-out J+7 — Pierre Durand, Airbnb
  INSERT INTO reservations (property_id, owner_id, check_in, check_out, guest_name, source, external_id)
  VALUES (
    v_property_id, v_owner_id,
    v_today + INTERVAL '3 days',
    v_today + INTERVAL '7 days',
    'Pierre Durand', 'airbnb', 'sim-ical-2026-0001'
  )
  ON CONFLICT (external_id) WHERE external_id IS NOT NULL DO NOTHING
  RETURNING id INTO v_res1_id;

  -- Si DO NOTHING a joué (res déjà présente), récupérer l'id existant
  IF v_res1_id IS NULL THEN
    SELECT id INTO v_res1_id FROM reservations WHERE external_id = 'sim-ical-2026-0001';
    RAISE NOTICE 'Rés. 1 déjà existante (id: %)', v_res1_id;
  ELSE
    RAISE NOTICE 'Rés. 1 insérée — Pierre Durand / airbnb (id: %)', v_res1_id;
  END IF;

  -- Rés. 2 : check-in J+10, check-out J+14 — Sophie Martin, Airbnb
  INSERT INTO reservations (property_id, owner_id, check_in, check_out, guest_name, source, external_id)
  VALUES (
    v_property_id, v_owner_id,
    v_today + INTERVAL '10 days',
    v_today + INTERVAL '14 days',
    'Sophie Martin', 'airbnb', 'sim-ical-2026-0002'
  )
  ON CONFLICT (external_id) WHERE external_id IS NOT NULL DO NOTHING
  RETURNING id INTO v_res2_id;

  IF v_res2_id IS NULL THEN
    SELECT id INTO v_res2_id FROM reservations WHERE external_id = 'sim-ical-2026-0002';
    RAISE NOTICE 'Rés. 2 déjà existante (id: %)', v_res2_id;
  ELSE
    RAISE NOTICE 'Rés. 2 insérée — Sophie Martin / airbnb (id: %)', v_res2_id;
  END IF;

  -- Rés. 3 : check-in J+18, check-out J+21 — Thomas Leroy, Booking
  INSERT INTO reservations (property_id, owner_id, check_in, check_out, guest_name, source, external_id)
  VALUES (
    v_property_id, v_owner_id,
    v_today + INTERVAL '18 days',
    v_today + INTERVAL '21 days',
    'Thomas Leroy', 'booking', 'sim-ical-2026-0003'
  )
  ON CONFLICT (external_id) WHERE external_id IS NOT NULL DO NOTHING
  RETURNING id INTO v_res3_id;

  IF v_res3_id IS NULL THEN
    SELECT id INTO v_res3_id FROM reservations WHERE external_id = 'sim-ical-2026-0003';
    RAISE NOTICE 'Rés. 3 déjà existante (id: %)', v_res3_id;
  ELSE
    RAISE NOTICE 'Rés. 3 insérée — Thomas Leroy / booking (id: %)', v_res3_id;
  END IF;

  -- Rés. 4 : check-in J+28, check-out J+35 — Emma Petit, Airbnb
  INSERT INTO reservations (property_id, owner_id, check_in, check_out, guest_name, source, external_id)
  VALUES (
    v_property_id, v_owner_id,
    v_today + INTERVAL '28 days',
    v_today + INTERVAL '35 days',
    'Emma Petit', 'airbnb', 'sim-ical-2026-0004'
  )
  ON CONFLICT (external_id) WHERE external_id IS NOT NULL DO NOTHING
  RETURNING id INTO v_res4_id;

  IF v_res4_id IS NULL THEN
    SELECT id INTO v_res4_id FROM reservations WHERE external_id = 'sim-ical-2026-0004';
    RAISE NOTICE 'Rés. 4 déjà existante (id: %)', v_res4_id;
  ELSE
    RAISE NOTICE 'Rés. 4 insérée — Emma Petit / airbnb (id: %)', v_res4_id;
  END IF;

  -- Rés. 5 : check-in J+42, check-out J+47 — Lucas Moreau, Direct (→ 'manual')
  INSERT INTO reservations (property_id, owner_id, check_in, check_out, guest_name, source, external_id)
  VALUES (
    v_property_id, v_owner_id,
    v_today + INTERVAL '42 days',
    v_today + INTERVAL '47 days',
    'Lucas Moreau', 'manual', 'sim-ical-2026-0005'
  )
  ON CONFLICT (external_id) WHERE external_id IS NOT NULL DO NOTHING
  RETURNING id INTO v_res5_id;

  IF v_res5_id IS NULL THEN
    SELECT id INTO v_res5_id FROM reservations WHERE external_id = 'sim-ical-2026-0005';
    RAISE NOTICE 'Rés. 5 déjà existante (id: %)', v_res5_id;
  ELSE
    RAISE NOTICE 'Rés. 5 insérée — Lucas Moreau / manual (id: %)', v_res5_id;
  END IF;

  -- -------------------------------------------------------------------------
  -- 4. Créer les missions ménage pour chaque réservation
  --    scheduled_date = check_out (jour du départ)
  --    Idempotence : NOT EXISTS sur (owner_id, property_id, scheduled_date::date, mission_type)
  --                  en excluant les missions annulées
  --    Pas de colonne reservation_id sur missions → référence dans description
  -- -------------------------------------------------------------------------

  -- Mission 1 — Pierre Durand / airbnb — J+7
  IF NOT EXISTS (
    SELECT 1 FROM missions
    WHERE owner_id = v_owner_id
      AND property_id = v_property_id
      AND mission_type = 'cleaning'
      AND scheduled_date::date = (v_today + INTERVAL '7 days')::date
      AND status != 'cancelled'
  ) THEN
    INSERT INTO missions (
      owner_id, property_id, mission_type, status,
      scheduled_date, description, fixed_rate
    )
    VALUES (
      v_owner_id, v_property_id, 'cleaning', 'pending',
      (v_today + INTERVAL '7 days')::date,
      'Ménage check-out — Pierre Durand (airbnb) — rés. sim-ical-2026-0001',
      80
    );
    RAISE NOTICE 'Mission ménage créée : Pierre Durand / J+7';
  ELSE
    RAISE NOTICE 'Mission ménage J+7 déjà existante — ignorée';
  END IF;

  -- Mission 2 — Sophie Martin / airbnb — J+14
  IF NOT EXISTS (
    SELECT 1 FROM missions
    WHERE owner_id = v_owner_id
      AND property_id = v_property_id
      AND mission_type = 'cleaning'
      AND scheduled_date::date = (v_today + INTERVAL '14 days')::date
      AND status != 'cancelled'
  ) THEN
    INSERT INTO missions (
      owner_id, property_id, mission_type, status,
      scheduled_date, description, fixed_rate
    )
    VALUES (
      v_owner_id, v_property_id, 'cleaning', 'pending',
      (v_today + INTERVAL '14 days')::date,
      'Ménage check-out — Sophie Martin (airbnb) — rés. sim-ical-2026-0002',
      80
    );
    RAISE NOTICE 'Mission ménage créée : Sophie Martin / J+14';
  ELSE
    RAISE NOTICE 'Mission ménage J+14 déjà existante — ignorée';
  END IF;

  -- Mission 3 — Thomas Leroy / booking — J+21
  IF NOT EXISTS (
    SELECT 1 FROM missions
    WHERE owner_id = v_owner_id
      AND property_id = v_property_id
      AND mission_type = 'cleaning'
      AND scheduled_date::date = (v_today + INTERVAL '21 days')::date
      AND status != 'cancelled'
  ) THEN
    INSERT INTO missions (
      owner_id, property_id, mission_type, status,
      scheduled_date, description, fixed_rate
    )
    VALUES (
      v_owner_id, v_property_id, 'cleaning', 'pending',
      (v_today + INTERVAL '21 days')::date,
      'Ménage check-out — Thomas Leroy (booking) — rés. sim-ical-2026-0003',
      80
    );
    RAISE NOTICE 'Mission ménage créée : Thomas Leroy / J+21';
  ELSE
    RAISE NOTICE 'Mission ménage J+21 déjà existante — ignorée';
  END IF;

  -- Mission 4 — Emma Petit / airbnb — J+35
  IF NOT EXISTS (
    SELECT 1 FROM missions
    WHERE owner_id = v_owner_id
      AND property_id = v_property_id
      AND mission_type = 'cleaning'
      AND scheduled_date::date = (v_today + INTERVAL '35 days')::date
      AND status != 'cancelled'
  ) THEN
    INSERT INTO missions (
      owner_id, property_id, mission_type, status,
      scheduled_date, description, fixed_rate
    )
    VALUES (
      v_owner_id, v_property_id, 'cleaning', 'pending',
      (v_today + INTERVAL '35 days')::date,
      'Ménage check-out — Emma Petit (airbnb) — rés. sim-ical-2026-0004',
      80
    );
    RAISE NOTICE 'Mission ménage créée : Emma Petit / J+35';
  ELSE
    RAISE NOTICE 'Mission ménage J+35 déjà existante — ignorée';
  END IF;

  -- Mission 5 — Lucas Moreau / direct — J+47
  IF NOT EXISTS (
    SELECT 1 FROM missions
    WHERE owner_id = v_owner_id
      AND property_id = v_property_id
      AND mission_type = 'cleaning'
      AND scheduled_date::date = (v_today + INTERVAL '47 days')::date
      AND status != 'cancelled'
  ) THEN
    INSERT INTO missions (
      owner_id, property_id, mission_type, status,
      scheduled_date, description, fixed_rate
    )
    VALUES (
      v_owner_id, v_property_id, 'cleaning', 'pending',
      (v_today + INTERVAL '47 days')::date,
      'Ménage check-out — Lucas Moreau (direct) — rés. sim-ical-2026-0005',
      80
    );
    RAISE NOTICE 'Mission ménage créée : Lucas Moreau / J+47';
  ELSE
    RAISE NOTICE 'Mission ménage J+47 déjà existante — ignorée';
  END IF;

  RAISE NOTICE '=== Simulation iCal terminée — propriété : % ===', v_property_id;

END $$;

-- =============================================================================
-- VÉRIFICATION — À exécuter après le DO $$ pour confirmer l'insertion
-- =============================================================================
SELECT
  m.id,
  m.mission_type,
  m.status,
  m.scheduled_date,
  m.description,
  p.name AS property_name
FROM missions m
JOIN properties p ON p.id = m.property_id
WHERE m.owner_id = (SELECT id FROM auth.users WHERE email = 'maximegakiere@gmail.com')
  AND m.mission_type = 'cleaning'
ORDER BY m.scheduled_date;
