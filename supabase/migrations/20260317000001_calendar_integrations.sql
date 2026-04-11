-- Sprint 3 : Calendar integrations (iCal + Google Calendar)

-- ── iCal per-source URLs on properties ──────────────────────────────────────
ALTER TABLE properties ADD COLUMN IF NOT EXISTS ical_airbnb_url  TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS ical_booking_url TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS last_ical_sync   TIMESTAMPTZ;

-- ── External reservation tracking ───────────────────────────────────────────
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS external_id TEXT;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS source      TEXT CHECK (source IN ('airbnb', 'booking', 'manual'));
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS guest_name  TEXT;

-- Prevent duplicates on re-sync
CREATE UNIQUE INDEX IF NOT EXISTS reservations_external_id_idx
  ON reservations(external_id) WHERE external_id IS NOT NULL;

-- ── Google Calendar on users ─────────────────────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_calendar_token         TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_calendar_refresh_token TEXT;

-- ── Google Calendar event ID on missions ─────────────────────────────────────
ALTER TABLE missions ADD COLUMN IF NOT EXISTS google_event_id TEXT;
