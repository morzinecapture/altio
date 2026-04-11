-- Track processed Stripe webhook events to prevent duplicate processing.
-- Service role only — Edge Functions insert, nothing reads from client.
CREATE TABLE IF NOT EXISTS webhook_events_processed (
  event_id   TEXT        PRIMARY KEY,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-cleanup events older than 7 days (run via pg_cron or manual)
CREATE INDEX idx_webhook_events_age ON webhook_events_processed (processed_at);

ALTER TABLE webhook_events_processed ENABLE ROW LEVEL SECURITY;

-- Only service_role (Edge Functions) can access
CREATE POLICY "Service role only" ON webhook_events_processed
  FOR ALL USING (false);
