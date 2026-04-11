-- =============================================================================
-- SEED : Réservations de test pour "Chalet Test Morzine"
-- Propriétaire : maximegakiere@gmail.com
-- =============================================================================
-- Exécution en local :
--   psql "$SUPABASE_DB_URL" -f supabase/seeds/seed_test_reservations.sql
--
-- Exécution sur Supabase Cloud :
--   Ouvrir le SQL Editor du dashboard Supabase et coller ce fichier entier.
--
-- Ce script est idempotent (ON CONFLICT DO NOTHING sur external_id).
-- Les réservations existantes avec les mêmes external_id sont ignorées.
-- =============================================================================

DO $$
DECLARE
  v_owner_id    UUID;
  v_property_id UUID;
BEGIN
  -- 1. Récupérer l'user_id du propriétaire de test
  SELECT id INTO v_owner_id
  FROM auth.users
  WHERE email = 'maximegakiere@gmail.com';

  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Utilisateur maximegakiere@gmail.com introuvable dans auth.users';
  END IF;

  -- 2. Créer la propriété de test si elle n'existe pas déjà
  SELECT id INTO v_property_id
  FROM properties
  WHERE name = 'Chalet Test Morzine' AND owner_id = v_owner_id;

  IF v_property_id IS NULL THEN
    INSERT INTO properties (
      owner_id,
      name,
      address,
      property_type,
      ical_url
    )
    VALUES (
      v_owner_id,
      'Chalet Test Morzine',
      '123 Route des Alpes, 74110 Morzine',
      'chalet',
      NULL
    )
    RETURNING id INTO v_property_id;

    RAISE NOTICE 'Propriété créée : % (id: %)', 'Chalet Test Morzine', v_property_id;
  ELSE
    RAISE NOTICE 'Propriété existante réutilisée : % (id: %)', 'Chalet Test Morzine', v_property_id;
  END IF;

  -- 3. Insérer les 6 réservations simulées
  --    Colonnes disponibles : property_id, check_in, check_out, guest_name, source, external_id
  --    source CHECK IN ('airbnb', 'booking', 'manual')  — 'direct' → 'manual'
  --    ON CONFLICT sur l'index partiel unique reservations_external_id_idx

  INSERT INTO reservations (property_id, owner_id, check_in, check_out, guest_name, source, external_id)
  VALUES
    -- Rés. 1 : dans 5 jours, 7 nuits, Airbnb
    (
      v_property_id, v_owner_id,
      (NOW() + INTERVAL '5 days')::date,
      (NOW() + INTERVAL '12 days')::date,
      'Martin Dupont', 'airbnb', 'airbnb-test-seed-0001'
    ),
    -- Rés. 2 : dans 14 jours, 4 nuits, Booking
    (
      v_property_id, v_owner_id,
      (NOW() + INTERVAL '14 days')::date,
      (NOW() + INTERVAL '18 days')::date,
      'Sophie Laurent', 'booking', 'booking-test-seed-0002'
    ),
    -- Rés. 3 : dans 21 jours, 10 nuits, Airbnb
    (
      v_property_id, v_owner_id,
      (NOW() + INTERVAL '21 days')::date,
      (NOW() + INTERVAL '31 days')::date,
      'Thomas Bernard', 'airbnb', 'airbnb-test-seed-0003'
    ),
    -- Rés. 4 : dans 35 jours, 3 nuits, Airbnb
    (
      v_property_id, v_owner_id,
      (NOW() + INTERVAL '35 days')::date,
      (NOW() + INTERVAL '38 days')::date,
      'Emma Petit', 'airbnb', 'airbnb-test-seed-0004'
    ),
    -- Rés. 5 : dans 42 jours, 14 nuits, réservation directe (→ 'manual')
    (
      v_property_id, v_owner_id,
      (NOW() + INTERVAL '42 days')::date,
      (NOW() + INTERVAL '56 days')::date,
      'Lucas Moreau', 'manual', 'manual-test-seed-0005'
    ),
    -- Rés. 6 : dans 60 jours, 5 nuits, Booking
    (
      v_property_id, v_owner_id,
      (NOW() + INTERVAL '60 days')::date,
      (NOW() + INTERVAL '65 days')::date,
      'Julie Rousseau', 'booking', 'booking-test-seed-0006'
    )
  ON CONFLICT (external_id) WHERE external_id IS NOT NULL DO NOTHING;

  RAISE NOTICE 'Seed terminé — propriété id: %', v_property_id;
END $$;
