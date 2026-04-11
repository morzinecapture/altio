-- ══════════════════════════════════════════════════════════════════
-- Migration: 20260321000009_fix_emergency_rls_and_mission_expiry.sql
--
-- Fixes:
-- 1. Provider cannot read emergency_requests in advanced statuses
--    (quote_accepted, in_progress, etc.) — breaks completion flow
-- 2. Add cron job for automatic mission expiration (pending → expired)
-- 3. Add notification for expired missions via edge function
-- 4. Add missing columns for new mission states (validated, paid, dispute, expired)
-- ══════════════════════════════════════════════════════════════════

-- ── 1. FIX: Provider SELECT on emergency_requests ─────────────────
-- Current policy only allows: status IN ('open', 'assigned', 'pending')
-- Missing: quote_submitted, quote_accepted, in_progress, bid_accepted,
--          provider_accepted, displacement_paid, on_site, completed
-- Provider needs to read emergencies where they are the accepted_provider_id

DROP POLICY IF EXISTS "Providers read open emergencies" ON emergency_requests;

-- Recreate: providers can read open emergencies (for bidding)
CREATE POLICY "Providers read open emergencies" ON emergency_requests
  FOR SELECT TO authenticated
  USING (
    status IN ('open', 'assigned', 'pending', 'bids_open')
  );

-- NEW: Accepted provider can read their assigned emergency in ANY status
DROP POLICY IF EXISTS "Accepted provider reads own emergency" ON emergency_requests;
CREATE POLICY "Accepted provider reads own emergency" ON emergency_requests
  FOR SELECT TO authenticated
  USING (auth.uid() = accepted_provider_id);

-- ── 2. ADD: Missing columns for new mission states ────────────────
-- These columns support the full state machine from CLAUDE.md

DO $$ BEGIN
  -- validated_at: when owner validates the intervention
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'missions' AND column_name = 'validated_at') THEN
    ALTER TABLE missions ADD COLUMN validated_at TIMESTAMPTZ;
  END IF;

  -- paid_at: when payment is confirmed
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'missions' AND column_name = 'paid_at') THEN
    ALTER TABLE missions ADD COLUMN paid_at TIMESTAMPTZ;
  END IF;

  -- cancelled_at: when mission is cancelled
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'missions' AND column_name = 'cancelled_at') THEN
    ALTER TABLE missions ADD COLUMN cancelled_at TIMESTAMPTZ;
  END IF;

  -- expired_at: when mission expires
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'missions' AND column_name = 'expired_at') THEN
    ALTER TABLE missions ADD COLUMN expired_at TIMESTAMPTZ;
  END IF;

  -- dispute_at: when dispute is opened
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'missions' AND column_name = 'dispute_at') THEN
    ALTER TABLE missions ADD COLUMN dispute_at TIMESTAMPTZ;
  END IF;

  -- dispute_reason: reason for dispute
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'missions' AND column_name = 'dispute_reason') THEN
    ALTER TABLE missions ADD COLUMN dispute_reason TEXT;
  END IF;
END $$;

-- ── 3. CRON: Auto-expire missions after 7 days with no provider ───
-- Missions in 'pending' status for more than 7 days → 'expired'
-- Also sends push notification to the owner via send-push edge function

-- Create the expiration function
CREATE OR REPLACE FUNCTION expire_pending_missions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  rec RECORD;
  supabase_url TEXT;
  service_key TEXT;
BEGIN
  -- Get config
  supabase_url := current_setting('app.supabase_url', true);
  service_key  := current_setting('app.service_role_key', true);

  -- Find and expire old pending missions (7 days)
  FOR rec IN
    SELECT id, owner_id, mission_type
    FROM missions
    WHERE status = 'pending'
      AND created_at < NOW() - INTERVAL '7 days'
  LOOP
    -- Update status
    UPDATE missions
    SET status = 'expired', expired_at = NOW()
    WHERE id = rec.id AND status = 'pending';

    -- Send push notification to owner (fire-and-forget)
    IF supabase_url IS NOT NULL AND service_key IS NOT NULL THEN
      PERFORM extensions.http_post(
        url     := supabase_url || '/functions/v1/send-push',
        headers := jsonb_build_object(
          'Content-Type',  'application/json',
          'Authorization', 'Bearer ' || service_key
        ),
        body    := jsonb_build_object(
          'userId', rec.owner_id::text,
          'title',  '⏰ Mission expirée',
          'body',   'Aucun prestataire disponible pour votre mission de ' || COALESCE(rec.mission_type, 'service') || '. Vous pouvez la republier.',
          'data',   jsonb_build_object('missionId', rec.id::text)
        )
      );
    END IF;
  END LOOP;
END;
$$;

-- Schedule the cron job: every hour, check for expired missions
SELECT cron.unschedule('expire-pending-missions')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'expire-pending-missions'
);

SELECT cron.schedule(
  'expire-pending-missions',
  '15 * * * *',  -- Every hour at :15 (offset from iCal sync at :00)
  $$ SELECT expire_pending_missions(); $$
);

-- ══════════════════════════════════════════════════════════════════
-- Deployment notes:
-- - pg_cron and pg_net must be enabled (already done in 20260318000003)
-- - app.supabase_url and app.service_role_key must be set in DB config
-- ══════════════════════════════════════════════════════════════════
