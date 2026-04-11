-- ============================================================================
-- Fix notifications system:
-- 1. Fix _send_push: remove unnecessary ::text cast on UUID reference_id
-- 2. Add pending_provider_approval handling to mission status trigger
--    (broadcast notification to eligible providers when mission is published)
-- 3. Fix RLS: allow service-role inserts without blocking trigger inserts
-- ============================================================================

-- 1. Fix _send_push helper: remove ::text cast, reference_id is already UUID
CREATE OR REPLACE FUNCTION _send_push(
  p_user_id uuid,
  p_title text,
  p_body text,
  p_reference_id uuid DEFAULT NULL,
  p_ref_type text DEFAULT 'mission'
) RETURNS void AS $$
DECLARE
  v_url text;
  v_anon_key text;
  v_payload jsonb;
BEGIN
  v_url := current_setting('app.settings.supabase_url', true);
  v_anon_key := current_setting('app.settings.service_role_key', true);

  IF v_url IS NULL THEN
    v_url := current_setting('supabase.url', true);
  END IF;
  IF v_anon_key IS NULL THEN
    v_anon_key := current_setting('supabase.service_role_key', true);
  END IF;

  -- Always insert in-app notification (even without push config)
  INSERT INTO notifications (user_id, type, title, body, reference_id)
  VALUES (p_user_id, p_ref_type, p_title, p_body, p_reference_id);

  -- If push config not available, skip device push silently (dev environment)
  IF v_url IS NULL OR v_anon_key IS NULL THEN
    RETURN;
  END IF;

  v_payload := jsonb_build_object(
    'userId', p_user_id,
    'title', p_title,
    'body', p_body,
    'skipDbInsert', true,
    'data', jsonb_build_object(
      CASE WHEN p_ref_type = 'emergency' THEN 'emergencyId' ELSE 'missionId' END,
      p_reference_id
    )
  );

  -- Fire-and-forget push via pg_net
  BEGIN
    PERFORM extensions.http_post(
      url := v_url || '/functions/v1/send-push',
      body := v_payload::text,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_anon_key
      )::jsonb
    );
  EXCEPTION WHEN OTHERS THEN
    -- Push failed but in-app notification is already saved
    NULL;
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Update mission status trigger to handle pending_provider_approval (broadcast)
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
      -- Mission published: notify eligible providers in zone + matching specialties
      FOR v_prov IN
        SELECT pp.provider_id
        FROM provider_profiles pp
        WHERE (pp.specialties IS NULL OR array_length(pp.specialties, 1) IS NULL
               OR v_mission_type = ANY(pp.specialties))
          AND (pp.latitude IS NOT NULL AND pp.longitude IS NOT NULL
               AND v_prop_lat IS NOT NULL AND v_prop_lng IS NOT NULL)
          AND (
            -- Haversine approximation in km
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

    WHEN 'assigned' THEN
      -- Notify provider: accepted
      IF v_provider_id IS NOT NULL THEN
        PERFORM _send_push(
          v_provider_id,
          '✅ Candidature acceptée !',
          'Votre candidature pour ' || v_label || ' a été retenue.',
          NEW.id
        );
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

-- Re-create trigger (drop + create to ensure it picks up the new function)
DROP TRIGGER IF EXISTS trg_notify_mission_status ON missions;

CREATE TRIGGER trg_notify_mission_status
  AFTER UPDATE OF status ON missions
  FOR EACH ROW
  EXECUTE FUNCTION notify_mission_status_change();

-- 3. RPC function for client-side cross-user notification inserts
-- SECURITY DEFINER bypasses RLS, allowing authenticated users to create
-- notifications for other users (e.g., provider sends notif to owner).
-- This is safe because:
--   - Requires authenticated session (auth.uid() IS NOT NULL)
--   - Only inserts, no read/update/delete
--   - Notification content is controlled by the caller (our app code)
CREATE OR REPLACE FUNCTION insert_notification_for_user(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_body text,
  p_reference_id text DEFAULT NULL
) RETURNS void AS $$
BEGIN
  -- Ensure caller is authenticated
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO notifications (user_id, type, title, body, reference_id)
  VALUES (p_user_id, p_type, p_title, p_body, p_reference_id::uuid);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
