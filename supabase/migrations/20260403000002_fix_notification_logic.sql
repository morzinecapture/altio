-- ============================================================================
-- Fix notification trigger logic for direct provider assignments:
--
-- BUG 1: "Candidature acceptée" sent when provider was directly assigned
--        (no application exists) → now checks mission_applications first
-- BUG 2: pending_provider_approval broadcasts to ALL providers even when
--        assigned_provider_id is set (direct assignment to favorite)
--        → now only notifies the targeted provider
-- BUG 3: No specific notification for direct assignments
--        → new message "Mission confirmée" for direct assigns
-- ============================================================================

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
  -- Only fire on actual status changes
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  v_owner_id := NEW.owner_id;
  v_provider_id := NEW.assigned_provider_id;
  v_mission_type := COALESCE(NEW.mission_type, 'service');

  -- Fetch names
  SELECT name INTO v_provider_name FROM users WHERE id = v_provider_id;
  SELECT name INTO v_owner_name FROM users WHERE id = v_owner_id;
  SELECT p.name, p.latitude, p.longitude
    INTO v_prop_name, v_prop_lat, v_prop_lng
    FROM properties p WHERE p.id = NEW.property_id;

  v_label := v_mission_type;
  IF v_prop_name IS NOT NULL THEN
    v_label := v_label || ' — ' || v_prop_name;
  END IF;

  -- ── Notification matrix by transition ──
  CASE NEW.status
    WHEN 'pending_provider_approval' THEN
      -- FIX BUG 2: If a provider is already assigned (direct/favorite),
      -- only notify THAT provider, not everyone in the zone
      IF NEW.assigned_provider_id IS NOT NULL THEN
        PERFORM _send_push(
          NEW.assigned_provider_id,
          '📋 Nouvelle mission pour vous',
          'Un propriétaire vous confie une mission de ' || v_label || '. Consultez et acceptez.',
          NEW.id
        );
      ELSE
        -- Open mission: broadcast to eligible providers in zone + matching specialties
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
              )) <= COALESCE(pp.radius_km, 50)
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
      -- FIX BUG 1 & 3: Distinguish between accepted application vs direct assignment
      IF v_provider_id IS NOT NULL THEN
        IF EXISTS (
          SELECT 1 FROM mission_applications
          WHERE mission_id = NEW.id
            AND provider_id = v_provider_id
            AND status = 'accepted'
        ) THEN
          -- Provider applied and was selected → "Candidature acceptée"
          PERFORM _send_push(
            v_provider_id,
            '✅ Candidature acceptée !',
            'Votre candidature pour ' || v_label || ' a été retenue.',
            NEW.id
          );
        ELSE
          -- Direct assignment (favorite) → "Mission confirmée"
          PERFORM _send_push(
            v_provider_id,
            '✅ Mission confirmée',
            'Votre mission de ' || v_label || ' est confirmée. Préparez-vous !',
            NEW.id
          );
        END IF;
      END IF;
      -- Notify owner: provider confirmed
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
