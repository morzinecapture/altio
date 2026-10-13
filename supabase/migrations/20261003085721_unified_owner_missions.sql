-- Additive, backwards-compatible metadata. The existing repair/quote workflow is preserved.
-- services/linge_fourni already exist on the linked project; retain them on fresh installs too.
ALTER TABLE public.missions ADD COLUMN IF NOT EXISTS services jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.missions ADD COLUMN IF NOT EXISTS linge_fourni boolean DEFAULT false;
ALTER TABLE public.missions ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'normal'
  CHECK (priority IN ('normal', 'urgent'));
ALTER TABLE public.missions ADD COLUMN IF NOT EXISTS linen_service text;
-- NULL supports older clients: scheduled repairs are normal, unscheduled requests are urgent.
ALTER TABLE public.emergency_requests ADD COLUMN IF NOT EXISTS priority text
  CHECK (priority IN ('normal', 'urgent'));
COMMENT ON COLUMN public.missions.services IS 'Requested services for one provider. Cleaning and linen can be combined; legacy empty arrays fall back to mission_type.';
COMMENT ON COLUMN public.missions.linen_service IS 'Explicit linen instructions agreed as part of the mission.';
COMMENT ON COLUMN public.emergency_requests.priority IS 'Requested urgency, independent of the repair workflow. Legacy NULL is inferred from scheduled_date.';
