-- ============================================================================
-- Auto-create cleaning missions from iCal reservations
--   1. Adds reservation_id column on missions (FK → reservations)
--   2. Adds AFTER INSERT trigger on reservations that creates a cleaning
--      mission + sends a push notification to the property owner.
-- ============================================================================

-- 1. Link column ───────────────────────────────────────────────────────────────
ALTER TABLE missions
  ADD COLUMN IF NOT EXISTS reservation_id UUID
  REFERENCES reservations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS missions_reservation_id_idx
  ON missions(reservation_id);

-- At most one mission per reservation
CREATE UNIQUE INDEX IF NOT EXISTS missions_reservation_id_unique
  ON missions(reservation_id) WHERE reservation_id IS NOT NULL;

-- 2. Trigger function ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION auto_create_cleaning_mission_from_reservation()
RETURNS TRIGGER AS $$
DECLARE
  v_owner_id    uuid;
  v_prop_name   text;
  v_fixed_rate  numeric;
  v_mission_id  uuid;
  v_body        text;
  v_guest       text;
BEGIN
  -- Skip blocked slots (Airbnb "Not available" / Booking "BLOCKED")
  v_guest := COALESCE(NEW.guest_name, '');
  IF v_guest = 'Indisponible' OR v_guest = '' THEN
    -- Still continue: a checkout is a checkout even if guest name missing.
    -- But if explicitly "Indisponible", skip.
    IF v_guest = 'Indisponible' THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Defensive: skip if a mission is already linked to this reservation
  IF EXISTS (SELECT 1 FROM missions WHERE reservation_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  -- Fetch owner + property name + fixed_rate
  SELECT owner_id, name, fixed_rate
    INTO v_owner_id, v_prop_name, v_fixed_rate
    FROM properties
   WHERE id = NEW.property_id;

  IF v_owner_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Create the cleaning mission (broadcast, not assigned)
  INSERT INTO missions (
    property_id,
    owner_id,
    reservation_id,
    mission_type,
    status,
    mode,
    scheduled_date,
    description,
    fixed_rate
  ) VALUES (
    NEW.property_id,
    v_owner_id,
    NEW.id,
    'cleaning',
    'pending',
    'fixed',
    NEW.check_out,
    'Ménage check-out — ' || COALESCE(NULLIF(v_guest, ''), 'invité'),
    v_fixed_rate
  ) RETURNING id INTO v_mission_id;

  -- Push notification to the owner
  v_body := 'Nouvelle mission ménage créée pour '
         || COALESCE(v_prop_name, 'votre logement')
         || ' le '
         || to_char(NEW.check_out::date, 'DD/MM/YYYY');

  PERFORM _send_push(
    v_owner_id,
    '🧹 Ménage planifié',
    v_body,
    v_mission_id,
    'mission'
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Trigger ───────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_auto_cleaning_mission ON reservations;

CREATE TRIGGER trg_auto_cleaning_mission
  AFTER INSERT ON reservations
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_cleaning_mission_from_reservation();
