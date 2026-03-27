-- Add emergency_bids to Realtime publication
-- The emergency detail screen subscribes to emergency_bids changes
-- but without this, Supabase never sends the events.
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE emergency_bids;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END$$;
