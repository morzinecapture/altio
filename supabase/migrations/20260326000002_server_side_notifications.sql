-- ============================================================================
-- Server-side notifications on mission status change
-- Replaces client-side sendPushNotification calls with a DB trigger.
-- Uses pg_net to call the send-push Edge Function asynchronously.
-- ============================================================================

-- Helper: build and send a push notification via the send-push Edge Function
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

  -- If settings not available, try env-based fallback
  IF v_url IS NULL THEN
    v_url := current_setting('supabase.url', true);
  END IF;
  IF v_anon_key IS NULL THEN
    v_anon_key := current_setting('supabase.service_role_key', true);
  END IF;

  -- Always insert in-app notification (even without push config)
  INSERT INTO notifications (user_id, type, title, body, reference_id)
  VALUES (p_user_id, p_ref_type, p_title, p_body, p_reference_id::text);

  -- If push config not available, skip device push silently (dev environment)
  IF v_url IS NULL OR v_anon_key IS NULL THEN
    RETURN;
  END IF;

  v_payload := jsonb_build_object(
    'userId', p_user_id,
    'title', p_title,
    'body', p_body,
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

-- ============================================================================
-- Main trigger: notify on mission status transitions
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
  SELECT p.name INTO v_prop_name FROM properties p WHERE p.id = NEW.property_id;

  v_label := v_mission_type;
  IF v_prop_name IS NOT NULL THEN
    v_label := v_label || ' — ' || v_prop_name;
  END IF;

  -- ── Notification matrix by transition ──
  CASE NEW.status
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
      -- Notify owner: intervention started
      PERFORM _send_push(
        v_owner_id,
        '🔧 Intervention commencée',
        COALESCE(v_provider_name, 'Le prestataire') || ' a commencé l''intervention — ' || v_label || '.',
        NEW.id
      );

    WHEN 'awaiting_payment' THEN
      -- Notify owner: mission completed, please validate
      PERFORM _send_push(
        v_owner_id,
        '✅ Mission terminée',
        'La mission de ' || v_label || ' est terminée. Validez le paiement.',
        NEW.id
      );

    WHEN 'validated' THEN
      -- Notify provider: validated, payment incoming
      IF v_provider_id IS NOT NULL THEN
        PERFORM _send_push(
          v_provider_id,
          '✅ Intervention validée',
          'L''intervention de ' || v_label || ' a été validée. Paiement en cours.',
          NEW.id
        );
      END IF;

    WHEN 'paid' THEN
      -- Notify provider: payment received (amount handled by webhook, generic here)
      IF v_provider_id IS NOT NULL THEN
        PERFORM _send_push(
          v_provider_id,
          '💰 Paiement reçu',
          'Vous avez reçu votre paiement pour la mission de ' || v_label || '.',
          NEW.id
        );
      END IF;
      -- Notify owner: payment confirmed
      PERFORM _send_push(
        v_owner_id,
        '✅ Paiement confirmé',
        'Paiement confirmé pour votre mission de ' || v_label || '.',
        NEW.id
      );

    WHEN 'cancelled' THEN
      -- Notify the other party
      IF v_provider_id IS NOT NULL THEN
        PERFORM _send_push(
          v_provider_id,
          '❌ Mission annulée',
          'La mission de ' || v_label || ' a été annulée.',
          NEW.id
        );
      END IF;

    WHEN 'dispute' THEN
      -- Notify provider: dispute opened
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
      -- Notify owner: no provider found
      PERFORM _send_push(
        v_owner_id,
        '⏰ Mission expirée',
        'Aucun prestataire disponible pour ' || v_label || '. Vous pouvez republier.',
        NEW.id
      );

    WHEN 'rejected' THEN
      -- Notify owner: provider declined
      PERFORM _send_push(
        v_owner_id,
        '❌ Mission refusée',
        COALESCE(v_provider_name, 'Le prestataire') || ' a décliné votre mission de ' || v_label || '. Vous pouvez sélectionner un autre prestataire.',
        NEW.id
      );

    ELSE
      -- No notification for other transitions
      NULL;
  END CASE;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop if exists to allow re-run
DROP TRIGGER IF EXISTS trg_notify_mission_status ON missions;

CREATE TRIGGER trg_notify_mission_status
  AFTER UPDATE OF status ON missions
  FOR EACH ROW
  EXECUTE FUNCTION notify_mission_status_change();
