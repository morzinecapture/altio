-- M1 : active la relance à 24 h et le paiement après 48 h promis dans l'app.
-- Prérequis : secrets Vault project_url et completion_worker_key, identiques à
-- COMPLETION_WORKER_KEY de la fonction process-completion-steps déployée.
-- La migration échoue plutôt que d'activer un job qui tomberait en erreur chaque minute.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'project_url' AND nullif(decrypted_secret, '') IS NOT NULL)
     OR NOT EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'completion_worker_key' AND nullif(decrypted_secret, '') IS NOT NULL) THEN
    RAISE EXCEPTION 'Configurez project_url et completion_worker_key dans Vault avant d''activer altio-completion-steps';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'altio-completion-steps') THEN
    PERFORM cron.schedule('altio-completion-steps', '* * * * *', 'select public.dispatch_completion_worker()');
  END IF;
  PERFORM cron.alter_job(job_id := jobid, active := true) FROM cron.job WHERE jobname = 'altio-completion-steps';
END $$;
