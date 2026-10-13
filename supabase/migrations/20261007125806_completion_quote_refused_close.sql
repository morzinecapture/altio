-- Preserve the existing transition graph, adding only closure after a paid visit.
DO $migration$
DECLARE definition text;
BEGIN
  definition := pg_get_functiondef('public.check_emergency_status_transition()'::regprocedure);
  IF position('WHEN ''quote_refused'' THEN' IN definition)=0 THEN
    RAISE EXCEPTION 'Unexpected emergency transition function';
  END IF;
  definition := replace(definition, 'WHEN ''quote_refused'' THEN', $replacement$WHEN 'quote_refused' THEN
      IF NEW.status='completed' AND current_user IN ('postgres','service_role')
        AND EXISTS (SELECT 1 FROM public.emergency_completion_steps s
          WHERE s.emergency_id=NEW.id AND s.phase='visit' AND s.finish_emergency
            AND s.paid_at IS NOT NULL AND s.disputed_at IS NULL)
        AND NOT EXISTS (SELECT 1 FROM public.emergency_completion_steps s
          WHERE s.emergency_id=NEW.id AND (s.paid_at IS NULL OR s.disputed_at IS NOT NULL)) THEN
        RETURN NEW;
      END IF;
$replacement$);
  EXECUTE definition;
END;
$migration$;
