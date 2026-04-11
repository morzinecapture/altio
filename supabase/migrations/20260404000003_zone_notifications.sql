-- ============================================================================
-- Zone notifications: opt-in + centralised matching + rate-limit
--
-- 1. Add opt-in column `notify_new_missions_in_zone` (default true — push OS
--    consent is the real gate) and `last_zone_notification_at` for anti-spam.
-- 2. Expose a reusable `is_provider_in_zone(provider_id, lat, lng)` boolean
--    helper (Haversine over provider_profiles.latitude/longitude/radius_km).
-- 3. Add `_can_notify_provider_zone` + `_mark_provider_zone_notified` helpers
--    enforcing a 30-minute gap between zone broadcasts per provider
--    (≈ max 2 broadcasts / hour as requested).
-- 4. Refactor existing broadcast functions (`notify_mission_status_change`,
--    `rebroadcast_mission_to_wider_zone`) to use the helpers, opt-in and
--    rate-limit — single source of truth for matching.
-- 5. New AFTER INSERT trigger on `emergency_requests` that broadcasts open
--    emergencies to eligible providers in zone — currently NO broadcast
--    exists for emergencies, this closes the gap.
-- ============================================================================

-- 1. Opt-in + anti-spam columns ----------------------------------------------
ALTER TABLE provider_profiles
  ADD COLUMN IF NOT EXISTS notify_new_missions_in_zone BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_zone_notification_at TIMESTAMPTZ;

-- 2. Centralised matching function -------------------------------------------
CREATE OR REPLACE FUNCTION is_provider_in_zone(
  p_provider_id uuid,
  p_lat double precision,
  p_lng double precision
) RETURNS boolean AS $$
DECLARE
  v_prov_lat double precision;
  v_prov_lng double precision;
  v_radius integer;
  v_dist double precision;
BEGIN
  IF p_lat IS NULL OR p_lng IS NULL THEN
    RETURN false;
  END IF;
  SELECT latitude, longitude, COALESCE(radius_km, 50)
    INTO v_prov_lat, v_prov_lng, v_radius
    FROM provider_profiles
    WHERE provider_id = p_provider_id;
  IF v_prov_lat IS NULL OR v_prov_lng IS NULL THEN
    RETURN false;
  END IF;
  v_dist := 6371 * 2 * asin(sqrt(
    sin(radians(p_lat - v_prov_lat) / 2) ^ 2 +
    cos(radians(v_prov_lat)) * cos(radians(p_lat)) *
    sin(radians(p_lng - v_prov_lng) / 2) ^ 2
  ));
  RETURN v_dist <= v_radius;
END;
$$ LANGUAGE plpgsql STABLE;

GRANT EXECUTE ON FUNCTION is_provider_in_zone(uuid, double precision, double precision) TO authenticated;

-- 3. Anti-spam helpers --------------------------------------------------------
CREATE OR REPLACE FUNCTION _can_notify_provider_zone(p_provider_id uuid)
RETURNS boolean AS $$
DECLARE
  v_last timestamptz;
BEGIN
  SELECT last_zone_notification_at INTO v_last
    FROM provider_profiles
    WHERE provider_id = p_provider_id;
  RETURN v_last IS NULL OR v_last < now() - interval '30 minutes';
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION _mark_provider_zone_notified(p_provider_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE provider_profiles
    SET last_zone_notification_at = now()
    WHERE provider_id = p_provider_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Refactor existing broadcast functions -----------------------------------

-- 4a. notify_mission_status_change — broadcast branch uses helpers + opt-in
CREATE OR REPLACE FUNCTION notify_mission_status_change()
RETURNS TRIGGER AS $$
DECLARE
  v_owner_id uuid;
  v_provider_id uuid;
  v_provider_name text;
  v_owner_name text;
  v_mission_type text;
  v_prop_name text;
  v_label text;
  v_prov RECORD;
  v_prop_lat double precision;
  v_prop_lng double precision;
BEGIN
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  v_owner_id := NEW.owner_id;
  v_provider_id := NEW.assigned_provider_id;
  v_mission_type := COALESCE(NEW.mission_type, 'service');

  SELECT name INTO v_provider_name FROM users WHERE id = v_provider_id;
  SELECT name INTO v_owner_name FROM users WHERE id = v_owner_id;
  SELECT p.name, p.latitude, p.longitude
    INTO v_prop_name, v_prop_lat, v_prop_lng
    FROM properties p WHERE p.id = NEW.property_id;

  v_label := v_mission_type;
  IF v_prop_name IS NOT NULL THEN
    v_label := v_label || ' — ' || v_prop_name;
  END IF;

  CASE NEW.status
    WHEN 'pending_provider_approval' THEN
      IF NEW.assigned_provider_id IS NOT NULL THEN
        PERFORM _send_push(
          NEW.assigned_provider_id,
          '📋 Nouvelle mission pour vous',
          'Un propriétaire vous confie une mission de ' || v_label || '. Consultez et acceptez.',
          NEW.id
        );
      ELSE
        -- Open broadcast: eligible providers in zone, matching specialty,
        -- opt-in, and not rate-limited.
        FOR v_prov IN
          SELECT pp.provider_id
          FROM provider_profiles pp
          WHERE pp.notify_new_missions_in_zone = true
            AND (pp.specialties IS NULL OR array_length(pp.specialties, 1) IS NULL
                 OR v_mission_type = ANY(pp.specialties))
            AND is_provider_in_zone(pp.provider_id, v_prop_lat, v_prop_lng)
            AND _can_notify_provider_zone(pp.provider_id)
        LOOP
          PERFORM _send_push(
            v_prov.provider_id,
            '📋 Nouvelle mission disponible',
            'Une mission de ' || v_label || ' est disponible près de chez vous.',
            NEW.id
          );
          PERFORM _mark_provider_zone_notified(v_prov.provider_id);
        END LOOP;
      END IF;

    WHEN 'assigned' THEN
      IF v_provider_id IS NOT NULL THEN
        IF EXISTS (
          SELECT 1 FROM mission_applications
          WHERE mission_id = NEW.id
            AND provider_id = v_provider_id
            AND status = 'accepted'
        ) THEN
          PERFORM _send_push(
            v_provider_id,
            '✅ Candidature acceptée !',
            'Votre candidature pour ' || v_label || ' a été retenue.',
            NEW.id
          );
        ELSE
          PERFORM _send_push(
            v_provider_id,
            '✅ Mission confirmée',
            'Votre mission de ' || v_label || ' est confirmée. Préparez-vous !',
            NEW.id
          );
        END IF;
      END IF;
      PERFORM _send_push(
        v_owner_id,
        '👷 Prestataire confirmé',
        COALESCE(v_provider_name, 'Un prestataire') || ' va intervenir pour votre mission de ' || v_label || '.',
        NEW.id
      );

    WHEN 'in_progress' THEN
      PERFORM _send_push(
        v_owner_id,
        '🔧 Intervention commencée',
        COALESCE(v_provider_name, 'Le prestataire') || ' a commencé l''intervention — ' || v_label || '.',
        NEW.id
      );

    WHEN 'awaiting_payment' THEN
      PERFORM _send_push(
        v_owner_id,
        '✅ Mission terminée',
        'La mission de ' || v_label || ' est terminée. Validez le paiement.',
        NEW.id
      );

    WHEN 'validated' THEN
      IF v_provider_id IS NOT NULL THEN
        PERFORM _send_push(
          v_provider_id,
          '✅ Intervention validée',
          'L''intervention de ' || v_label || ' a été validée. Paiement en cours.',
          NEW.id
        );
      END IF;

    WHEN 'paid' THEN
      IF v_provider_id IS NOT NULL THEN
        PERFORM _send_push(
          v_provider_id,
          '💰 Paiement reçu',
          'Vous avez reçu votre paiement pour la mission de ' || v_label || '.',
          NEW.id
        );
      END IF;
      PERFORM _send_push(
        v_owner_id,
        '✅ Paiement confirmé',
        'Paiement confirmé pour votre mission de ' || v_label || '.',
        NEW.id
      );

    WHEN 'cancelled' THEN
      IF v_provider_id IS NOT NULL THEN
        PERFORM _send_push(
          v_provider_id,
          '❌ Mission annulée',
          'La mission de ' || v_label || ' a été annulée.',
          NEW.id
        );
      END IF;

    WHEN 'dispute' THEN
      IF v_provider_id IS NOT NULL THEN
        PERFORM _send_push(
          v_provider_id,
          '⚠️ Litige ouvert',
          'Un litige a été ouvert pour la mission de ' || v_label || '.' ||
            CASE WHEN NEW.dispute_reason IS NOT NULL THEN ' Motif : ' || NEW.dispute_reason ELSE '' END,
          NEW.id
        );
      END IF;

    WHEN 'expired' THEN
      PERFORM _send_push(
        v_owner_id,
        '⏰ Mission expirée',
        'Aucun prestataire disponible pour ' || v_label || '. Vous pouvez republier.',
        NEW.id
      );

    WHEN 'rejected' THEN
      PERFORM _send_push(
        v_owner_id,
        '❌ Mission refusée',
        COALESCE(v_provider_name, 'Le prestataire') || ' a décliné votre mission de ' || v_label || '. Vous pouvez sélectionner un autre prestataire.',
        NEW.id
      );

    ELSE
      NULL;
  END CASE;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4b. rebroadcast_mission_to_wider_zone — uses helpers + opt-in + rate-limit
CREATE OR REPLACE FUNCTION rebroadcast_mission_to_wider_zone(p_mission_id uuid)
RETURNS void AS $$
DECLARE
  v_mission_type text;
  v_prop_lat double precision;
  v_prop_lng double precision;
  v_label text;
  v_prop_name text;
  v_prov RECORD;
BEGIN
  SELECT m.mission_type, p.latitude, p.longitude, p.name
    INTO v_mission_type, v_prop_lat, v_prop_lng, v_prop_name
    FROM missions m
    JOIN properties p ON p.id = m.property_id
    WHERE m.id = p_mission_id;

  IF v_prop_lat IS NULL OR v_prop_lng IS NULL THEN
    RETURN;
  END IF;

  v_label := COALESCE(v_mission_type, 'service');
  IF v_prop_name IS NOT NULL THEN
    v_label := v_label || ' — ' || v_prop_name;
  END IF;

  FOR v_prov IN
    SELECT pp.provider_id
    FROM provider_profiles pp
    WHERE pp.notify_new_missions_in_zone = true
      AND (pp.specialties IS NULL OR array_length(pp.specialties, 1) IS NULL
           OR v_mission_type = ANY(pp.specialties))
      AND is_provider_in_zone(pp.provider_id, v_prop_lat, v_prop_lng)
      AND _can_notify_provider_zone(pp.provider_id)
      -- Skip providers who already declined or applied
      AND NOT EXISTS (
        SELECT 1 FROM mission_applications ma
        WHERE ma.mission_id = p_mission_id
          AND ma.provider_id = pp.provider_id
      )
  LOOP
    PERFORM _send_push(
      v_prov.provider_id,
      '📋 Nouvelle mission disponible',
      'Une mission de ' || v_label || ' est disponible près de chez vous.',
      p_mission_id
    );
    PERFORM _mark_provider_zone_notified(v_prov.provider_id);
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. New broadcast trigger on emergency_requests INSERT ----------------------
CREATE OR REPLACE FUNCTION notify_emergency_broadcast_on_insert()
RETURNS TRIGGER AS $$
DECLARE
  v_prop_lat double precision;
  v_prop_lng double precision;
  v_prop_name text;
  v_service_type text;
  v_label text;
  v_prov RECORD;
BEGIN
  -- Only open emergencies
  IF NEW.status <> 'bids_open' THEN
    RETURN NEW;
  END IF;

  -- Targeted interventions (direct to a specific provider) bypass broadcast
  IF NEW.target_provider_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT p.latitude, p.longitude, p.name
    INTO v_prop_lat, v_prop_lng, v_prop_name
    FROM properties p WHERE p.id = NEW.property_id;

  IF v_prop_lat IS NULL OR v_prop_lng IS NULL THEN
    RETURN NEW;
  END IF;

  v_service_type := COALESCE(NEW.service_type, 'urgence');
  v_label := v_service_type;
  IF v_prop_name IS NOT NULL THEN
    v_label := v_label || ' — ' || v_prop_name;
  END IF;

  FOR v_prov IN
    SELECT pp.provider_id
    FROM provider_profiles pp
    WHERE pp.notify_new_missions_in_zone = true
      AND (pp.specialties IS NULL OR array_length(pp.specialties, 1) IS NULL
           OR NEW.service_type = ANY(pp.specialties))
      AND is_provider_in_zone(pp.provider_id, v_prop_lat, v_prop_lng)
      AND _can_notify_provider_zone(pp.provider_id)
  LOOP
    PERFORM _send_push(
      v_prov.provider_id,
      '🚨 Nouvelle urgence près de chez vous',
      'Urgence ' || v_label || '. Consultez et positionnez votre offre.',
      NEW.id,
      'emergency'
    );
    PERFORM _mark_provider_zone_notified(v_prov.provider_id);
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_notify_emergency_broadcast_on_insert ON emergency_requests;
CREATE TRIGGER trg_notify_emergency_broadcast_on_insert
  AFTER INSERT ON emergency_requests
  FOR EACH ROW
  EXECUTE FUNCTION notify_emergency_broadcast_on_insert();
