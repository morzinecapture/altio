-- Keep user-facing notification copy in French, even when the stored service
-- identifier is an English technical code.
CREATE OR REPLACE FUNCTION public.localize_service_codes(p_text text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_text text := p_text;
BEGIN
  IF v_text IS NULL THEN RETURN NULL; END IF;
  v_text := regexp_replace(v_text, '\mplumbing\M', 'plomberie', 'gi');
  v_text := regexp_replace(v_text, '\mcleaning\M', 'ménage', 'gi');
  v_text := regexp_replace(v_text, '\melectrical\M', 'électricité', 'gi');
  v_text := regexp_replace(v_text, '\melectricity\M', 'électricité', 'gi');
  v_text := regexp_replace(v_text, '\mlocksmith\M', 'serrurerie', 'gi');
  v_text := regexp_replace(v_text, '\mlinen\M', 'linge', 'gi');
  v_text := regexp_replace(v_text, '\mrepair\M', 'réparation', 'gi');
  v_text := regexp_replace(v_text, '\mheating\M', 'chauffage', 'gi');
  v_text := regexp_replace(v_text, '\mmaintenance\M', 'entretien', 'gi');
  v_text := regexp_replace(v_text, '\mgeneral\M', 'général', 'gi');
  v_text := regexp_replace(v_text, '\memergency\M', 'urgence', 'gi');
  RETURN v_text;
END;
$$;

CREATE OR REPLACE FUNCTION public.localize_notification_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.title := public.localize_service_codes(NEW.title);
  NEW.body := public.localize_service_codes(NEW.body);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_localize_notification_before_insert ON public.notifications;
CREATE TRIGGER trg_localize_notification_before_insert
  BEFORE INSERT OR UPDATE OF title, body ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.localize_notification_before_insert();

-- Clean up historical copy so the notification centre is consistent too.
UPDATE public.notifications
SET title = public.localize_service_codes(title),
    body = public.localize_service_codes(body)
WHERE title IS DISTINCT FROM public.localize_service_codes(title)
   OR body IS DISTINCT FROM public.localize_service_codes(body);

-- Existing notifications are intentionally preserved. Duplicate provider
-- selection announcements are prevented in the application paths without
-- deleting historical user data during this migration.

-- Commercial safeguards for an emergency visit. NOT VALID preserves legacy
-- rows while PostgreSQL still enforces the caps on all new or changed offers.
ALTER TABLE public.emergency_bids
  DROP CONSTRAINT IF EXISTS emergency_bids_travel_cost_cap,
  DROP CONSTRAINT IF EXISTS emergency_bids_diagnostic_cost_cap,
  DROP CONSTRAINT IF EXISTS emergency_bids_visit_total_cap;

ALTER TABLE public.emergency_bids
  ADD CONSTRAINT emergency_bids_travel_cost_cap
    CHECK (travel_cost >= 0 AND travel_cost <= 80) NOT VALID,
  ADD CONSTRAINT emergency_bids_diagnostic_cost_cap
    CHECK (diagnostic_cost >= 0 AND diagnostic_cost <= 100) NOT VALID,
  ADD CONSTRAINT emergency_bids_visit_total_cap
    CHECK (travel_cost + diagnostic_cost <= 150) NOT VALID;

ALTER TABLE public.emergency_requests
  DROP CONSTRAINT IF EXISTS emergency_requests_displacement_fee_cap,
  DROP CONSTRAINT IF EXISTS emergency_requests_diagnostic_fee_cap,
  DROP CONSTRAINT IF EXISTS emergency_requests_visit_total_cap;

ALTER TABLE public.emergency_requests
  ADD CONSTRAINT emergency_requests_displacement_fee_cap
    CHECK (displacement_fee IS NULL OR displacement_fee BETWEEN 0 AND 80) NOT VALID,
  ADD CONSTRAINT emergency_requests_diagnostic_fee_cap
    CHECK (diagnostic_fee IS NULL OR diagnostic_fee BETWEEN 0 AND 100) NOT VALID,
  ADD CONSTRAINT emergency_requests_visit_total_cap
    CHECK (COALESCE(displacement_fee, 0) + COALESCE(diagnostic_fee, 0) <= 150) NOT VALID;

-- The newer intervention flow may not exist in every environment yet.
DO $$
BEGIN
  IF to_regclass('public.intervention_bids') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'intervention_bids'
         AND column_name = 'displacement_fee'
     )
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'intervention_bids'
         AND column_name = 'diagnostic_fee'
     ) THEN
    ALTER TABLE public.intervention_bids
      DROP CONSTRAINT IF EXISTS intervention_bids_displacement_fee_cap,
      DROP CONSTRAINT IF EXISTS intervention_bids_diagnostic_fee_cap,
      DROP CONSTRAINT IF EXISTS intervention_bids_visit_total_cap;

    ALTER TABLE public.intervention_bids
      ADD CONSTRAINT intervention_bids_displacement_fee_cap
        CHECK (displacement_fee IS NULL OR displacement_fee BETWEEN 0 AND 80) NOT VALID,
      ADD CONSTRAINT intervention_bids_diagnostic_fee_cap
        CHECK (diagnostic_fee IS NULL OR diagnostic_fee BETWEEN 0 AND 100) NOT VALID,
      ADD CONSTRAINT intervention_bids_visit_total_cap
        CHECK (COALESCE(displacement_fee, 0) + COALESCE(diagnostic_fee, 0) <= 150) NOT VALID;
  END IF;
END;
$$;

-- Emergency complaints need their own reference. Previously the app tried to
-- store an emergency UUID in reclamations.mission_id, which references missions.
ALTER TABLE public.reclamations
  ADD COLUMN IF NOT EXISTS emergency_id uuid
  REFERENCES public.emergency_requests(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_reclamations_emergency_id
  ON public.reclamations(emergency_id)
  WHERE emergency_id IS NOT NULL;
