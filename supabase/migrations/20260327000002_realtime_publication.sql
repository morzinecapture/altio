-- Enable Supabase Realtime for key tables
-- Without this, useRealtimeSync listens but never receives events
DO $$
BEGIN
  -- Add tables to realtime publication (idempotent — ignore if already added)
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE missions;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE emergency_requests;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END$$;
