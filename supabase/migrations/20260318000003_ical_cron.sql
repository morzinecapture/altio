-- ─────────────────────────────────────────────────────────────────────────────
-- Migration : 20260318000003_ical_cron.sql
-- Activation de pg_cron + pg_net et création du job de sync iCal toutes les heures
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Activer les extensions nécessaires
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net  WITH SCHEMA extensions;

-- 2. Supprimer le job existant s'il existe déjà (idempotence)
SELECT cron.unschedule('sync-ical-hourly')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'sync-ical-hourly'
);

-- 3. Créer le job cron : toutes les heures, appelle sync-ical pour chaque
--    propriété ayant au moins une URL iCal configurée.
--
--    pg_net.http_post() est non-bloquant (retourne immédiatement un request_id).
--    Les appels sont lancés en parallèle, un par propriété.
SELECT cron.schedule(
  'sync-ical-hourly',
  '0 * * * *',
  $$
  SELECT extensions.http_post(
    url     := current_setting('app.supabase_url') || '/functions/v1/sync-ical',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key')
    ),
    body    := jsonb_build_object('property_id', id::text)
  )
  FROM public.properties
  WHERE ical_airbnb_url IS NOT NULL
     OR ical_booking_url IS NOT NULL
     OR ical_url         IS NOT NULL;
  $$
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Notes de déploiement
-- ─────────────────────────────────────────────────────────────────────────────
-- Les paramètres app.supabase_url et app.service_role_key doivent être définis
-- dans la base de données (une seule fois, à faire dans le dashboard Supabase
-- ou via une migration séparée si pas encore présents) :
--
--   ALTER DATABASE postgres
--     SET "app.supabase_url"        = 'https://<project-ref>.supabase.co';
--   ALTER DATABASE postgres
--     SET "app.service_role_key"    = '<service-role-jwt>';
--
-- pg_cron s'exécute dans le schéma `cron` (géré par Supabase automatiquement
-- lorsque l'extension est activée depuis le dashboard ou via migrations).
-- pg_net s'exécute dans le schéma `extensions` ; la fonction http_post est
-- exposée sous extensions.http_post (alias de net.http_post selon la version).
-- ─────────────────────────────────────────────────────────────────────────────
