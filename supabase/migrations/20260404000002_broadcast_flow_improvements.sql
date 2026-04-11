-- ============================================================================
-- Broadcast flow improvements:
--   • zone_radius_km (default 10) on missions — owner-controlled broadcast radius
--   • max_applications (default 3) on missions — cap candidate count
--   • handle "declined" application status for broadcast missions:
--       when a provider declines a broadcast, notify the owner so they can
--       expand the zone. Deep link to the mission screen.
--   • RPC `rebroadcast_mission_to_wider_zone` to re-push a mission to all
--     eligible providers within the updated zone_radius_km.
--   • Update notify_mission_status_change to use NEW.zone_radius_km instead
--     of only the provider's own radius_km preference.
-- ============================================================================

-- 1. New columns on missions
ALTER TABLE missions
  ADD COLUMN IF NOT EXISTS zone_radius_km INTEGER NOT NULL DEFAULT 10;

ALTER TABLE missions
  ADD COLUMN IF NOT EXISTS max_applications INTEGER NOT NULL DEFAULT 3;

-- 2. Trigger on mission_applications: when a provider inserts a "declined"
--    row on a broadcast mission (assigned_provider_id IS NULL), notify
--    the owner so they can decide to widen the zone.
CREATE OR REPLACE FUNCTION notify_owner_on_broadcast_decline()
RETURNS TRIGGER AS $$
DECLARE
  v_owner_id uuid;
  v_assigned uuid;
  v_provider_name text;
  v_mission_type text;
BEGIN
  IF NEW.status <> 'declined' THEN
    RETURN NEW;
  END IF;

  SELECT owner_id, assigned_provider_id, mission_type
    INTO v_owner_id, v_assigned, v_mission_type
    FROM missions WHERE id = NEW.mission_id;

  -- Only notify for broadcast missions (no direct assignment)
  IF v_assigned IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT name INTO v_provider_name FROM users WHERE id = NEW.provider_id;

  PERFORM _send_push(
    v_owner_id,
    'Prestataire non disponible',
    COALESCE(v_provider_name, 'Un prestataire') || ' n''est pas disponible. ' ||
      'Voulez-vous élargir la zone ? (vous ne recevrez que 3 candidatures maximum)',
    NEW.mission_id
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_notify_owner_on_broadcast_decline ON mission_applications;
CREATE TRIGGER trg_notify_owner_on_broadcast_decline
  AFTER INSERT ON mission_applications
  FOR EACH ROW
  EXECUTE FUNCTION notify_owner_on_broadcast_decline();

-- 3. RPC: rebroadcast a mission to providers in its (possibly widened) zone.
--    Called by the frontend after expandMissionZone() bumps zone_radius_km.
CREATE OR REPLACE FUNCTION rebroadcast_mission_to_wider_zone(p_mission_id uuid)
RETURNS void AS $$
DECLARE
  v_mission_type text;
  v_prop_lat double precision;
  v_prop_lng double precision;
  v_radius integer;
  v_label text;
  v_prop_name text;
  v_prov RECORD;
BEGIN
  SELECT m.mission_type, m.zone_radius_km, p.latitude, p.longitude, p.name
    INTO v_mission_type, v_radius, v_prop_lat, v_prop_lng, v_prop_name
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
    WHERE (pp.specialties IS NULL OR array_length(pp.specialties, 1) IS NULL
           OR v_mission_type = ANY(pp.specialties))
      AND pp.latitude IS NOT NULL AND pp.longitude IS NOT NULL
      AND (
        6371 * 2 * asin(sqrt(
          sin(radians(v_prop_lat - pp.latitude) / 2) ^ 2 +
          cos(radians(pp.latitude)) * cos(radians(v_prop_lat)) *
          sin(radians(v_prop_lng - pp.longitude) / 2) ^ 2
        )) <= COALESCE(v_radius, 10)
      )
      -- Skip providers who already declined or applied
      AND NOT EXISTS (
        SELECT 1 FROM mission_applications ma
        WHERE ma.mission_id = p_mission_id
          AND ma.provider_id = pp.provider_id
      )
  LOOP
    PERFORM _send_push(
      v_prov.provider_id,
      'Nouvelle mission disponible',
      'Une mission de ' || v_label || ' est disponible près de chez vous.',
      p_mission_id
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION rebroadcast_mission_to_wider_zone(uuid) TO authenticated;

-- 4. Update notify_mission_status_change broadcast logic to also respect
--    the mission's zone_radius_km (owner-defined broadcast radius).
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
  v_dist double precision;
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
        FOR v_prov IN
          SELECT pp.provider_id
          FROM provider_profiles pp
          WHERE (pp.specialties IS NULL OR array_length(pp.specialties, 1) IS NULL
                 OR v_mission_type = ANY(pp.specialties))
            AND (pp.latitude IS NOT NULL AND pp.longitude IS NOT NULL
                 AND v_prop_lat IS NOT NULL AND v_prop_lng IS NOT NULL)
            AND (
              6371 * 2 * asin(sqrt(
                sin(radians(v_prop_lat - pp.latitude) / 2) ^ 2 +
                cos(radians(pp.latitude)) * cos(radians(v_prop_lat)) *
                sin(radians(v_prop_lng - pp.longitude) / 2) ^ 2
              )) <= LEAST(COALESCE(pp.radius_km, 50), COALESCE(NEW.zone_radius_km, 10))
            )
        LOOP
          PERFORM _send_push(
            v_prov.provider_id,
            '📋 Nouvelle mission disponible',
            'Une mission de ' || v_label || ' est disponible près de chez vous.',
            NEW.id
          );
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
