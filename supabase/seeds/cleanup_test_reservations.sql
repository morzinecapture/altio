-- =============================================================================
-- CLEANUP : Suppression du "Chalet Test Morzine" et de ses réservations
-- Propriétaire : maximegakiere@gmail.com
-- =============================================================================
-- Exécution en local :
--   psql "$SUPABASE_DB_URL" -f supabase/seeds/cleanup_test_reservations.sql
--
-- Exécution sur Supabase Cloud :
--   Ouvrir le SQL Editor du dashboard Supabase et coller ce fichier entier.
--
-- Ce script est idempotent : si la propriété n'existe pas, il se termine
-- silencieusement sans erreur.
-- =============================================================================

DO $$
DECLARE
  v_owner_id    UUID;
  v_property_id UUID;
  v_deleted_res INTEGER;
BEGIN
  -- 1. Récupérer l'user_id
  SELECT id INTO v_owner_id
  FROM auth.users
  WHERE email = 'maximegakiere@gmail.com';

  IF v_owner_id IS NULL THEN
    RAISE NOTICE 'Utilisateur maximegakiere@gmail.com introuvable — rien à supprimer.';
    RETURN;
  END IF;

  -- 2. Récupérer la propriété de test
  SELECT id INTO v_property_id
  FROM properties
  WHERE name = 'Chalet Test Morzine' AND owner_id = v_owner_id;

  IF v_property_id IS NULL THEN
    RAISE NOTICE 'Propriété "Chalet Test Morzine" introuvable — rien à supprimer.';
    RETURN;
  END IF;

  -- 3. Supprimer les réservations liées
  DELETE FROM reservations WHERE property_id = v_property_id;
  GET DIAGNOSTICS v_deleted_res = ROW_COUNT;
  RAISE NOTICE '% réservation(s) supprimée(s) pour la propriété %', v_deleted_res, v_property_id;

  -- 4. Supprimer la propriété
  DELETE FROM properties WHERE id = v_property_id;
  RAISE NOTICE 'Propriété "Chalet Test Morzine" supprimée (id: %).', v_property_id;
END $$;
