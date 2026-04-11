-- Add dispute resolution columns to missions

ALTER TABLE missions ADD COLUMN IF NOT EXISTS dispute_resolution TEXT;
ALTER TABLE missions ADD COLUMN IF NOT EXISTS dispute_resolved_at TIMESTAMPTZ;
ALTER TABLE missions ADD COLUMN IF NOT EXISTS dispute_resolved_by UUID REFERENCES auth.users(id);

-- Update admin_dashboard_stats view to include open disputes count
CREATE OR REPLACE VIEW admin_dashboard_stats AS
SELECT
  (SELECT COUNT(*) FROM missions
    WHERE status NOT IN ('completed', 'cancelled', 'rejected'))  AS active_missions_count,
  (SELECT COUNT(*) FROM missions
    WHERE created_at >= DATE_TRUNC('month', NOW()))               AS missions_this_month,
  (SELECT COUNT(*) FROM missions
    WHERE status = 'completed')                                   AS completed_missions_total,
  (SELECT COUNT(*) FROM users WHERE role = 'owner')               AS owners_count,
  (SELECT COUNT(*) FROM users WHERE role = 'provider')            AS providers_count,
  (SELECT COUNT(*) FROM users
    WHERE created_at >= NOW() - INTERVAL '30 days')               AS new_users_30d,
  (SELECT COUNT(*) FROM provider_profiles)                        AS providers_pending_verification,
  (SELECT COUNT(*) FROM emergency_requests
    WHERE status NOT IN ('completed', 'cancelled'))               AS active_emergencies,
  COALESCE((
    SELECT SUM(fixed_rate * 0.10) FROM missions
    WHERE status IN ('completed', 'awaiting_payment')
    AND created_at >= DATE_TRUNC('month', NOW())
  ), 0)                                                           AS commissions_this_month,
  COALESCE((
    SELECT SUM(fixed_rate) FROM missions
    WHERE status IN ('completed', 'awaiting_payment')
  ), 0)                                                           AS total_volume,
  (SELECT COUNT(*) FROM missions WHERE status = 'dispute')        AS open_disputes_count,
  0::bigint                                                       AS failed_payments_48h;
