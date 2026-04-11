-- ============================================================================
-- Fix 1: Duplicate notifications — _send_push() already inserts in DB,
--         but the edge function also inserts because skipDbInsert was missing.
--         Add skipDbInsert=true to the payload so edge function only sends push.
--
-- Fix 2: Add notification trigger for emergency_requests (same pattern as missions).
--         Previously, emergency notifications were client-side only — if the app
--         crashed mid-transition, notifications were lost.
-- ============================================================================

-- ── Fix 1: _send_push() with skipDbInsert ──────────────────────────────────

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

  -- skipDbInsert=true because we already inserted above
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


-- ── Fix 2: Emergency notification trigger ──────────────────────────────────

CREATE OR REPLACE FUNCTION notify_emergency_status_change()
RETURNS TRIGGER AS $$
DECLARE
  v_owner_id uuid;
  v_provider_id uuid;
  v_provider_name text;
  v_service_type text;
  v_prop_name text;
  v_label text;
BEGIN
  -- Only fire on actual status changes
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  v_owner_id := NEW.owner_id;
  v_provider_id := NEW.accepted_provider_id;
  v_service_type := COALESCE(NEW.service_type, 'service');

  -- Fetch names
  SELECT name INTO v_provider_name FROM users WHERE id = v_provider_id;
  SELECT p.name INTO v_prop_name FROM properties p WHERE p.id = NEW.property_id;

  v_label := v_service_type;
  IF v_prop_name IS NOT NULL THEN
    v_label := v_label || ' — ' || v_prop_name;
  END IF;

  -- ── Notification matrix by emergency status ──
  CASE NEW.status
    WHEN 'displacement_paid' THEN
      -- Provider selected + displacement paid → notify provider to go on-site
      IF v_provider_id IS NOT NULL THEN
        PERFORM _send_push(
          v_provider_id,
          '✅ Candidature acceptée !',
          'Le propriétaire a choisi votre offre et payé le déplacement. Rendez-vous sur place !',
          NEW.id,
          'emergency'
        );
      END IF;

    WHEN 'on_site' THEN
      -- Provider arrived → notify owner
      PERFORM _send_push(
        v_owner_id,
        '📍 Prestataire sur place',
        COALESCE(v_provider_name, 'Le technicien') || ' est arrivé sur place — diagnostic en cours.',
        NEW.id,
        'emergency'
      );

    WHEN 'quote_submitted' THEN
      -- Quote submitted — intermediate state, no notification (auto-advances to quote_sent)
      NULL;

    WHEN 'quote_sent' THEN
      -- Quote ready for owner review
      PERFORM _send_push(
        v_owner_id,
        '📋 Devis reçu',
        'Le prestataire a soumis un devis pour votre urgence de ' || v_label || '. Consultez et décidez.',
        NEW.id,
        'emergency'
      );

    WHEN 'quote_accepted' THEN
      -- Owner accepted quote → notify provider to start work
      IF v_provider_id IS NOT NULL THEN
        PERFORM _send_push(
          v_provider_id,
          '✅ Devis accepté !',
          'Le propriétaire a accepté votre devis. Vous pouvez démarrer les travaux.',
          NEW.id,
          'emergency'
        );
      END IF;

    WHEN 'quote_refused' THEN
      -- Owner refused quote → notify provider
      IF v_provider_id IS NOT NULL THEN
        PERFORM _send_push(
          v_provider_id,
          '❌ Devis refusé',
          'Le propriétaire a refusé votre devis. Vous pouvez soumettre une nouvelle proposition.',
          NEW.id,
          'emergency'
        );
      END IF;

    WHEN 'in_progress' THEN
      -- Work started → notify owner
      PERFORM _send_push(
        v_owner_id,
        '🔧 Travaux en cours',
        COALESCE(v_provider_name, 'Le prestataire') || ' a commencé les travaux — ' || v_label || '.',
        NEW.id,
        'emergency'
      );

    WHEN 'completed' THEN
      -- Emergency completed → notify both parties
      PERFORM _send_push(
        v_owner_id,
        '🏠 Intervention terminée',
        'L''urgence de ' || v_label || ' est résolue. Le paiement a été traité.',
        NEW.id,
        'emergency'
      );
      IF v_provider_id IS NOT NULL THEN
        PERFORM _send_push(
          v_provider_id,
          '💰 Mission terminée',
          'L''intervention de ' || v_label || ' est terminée. Paiement en cours.',
          NEW.id,
          'emergency'
        );
      END IF;

    ELSE
      NULL;
  END CASE;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on emergency_requests
DROP TRIGGER IF EXISTS trg_notify_emergency_status ON emergency_requests;

CREATE TRIGGER trg_notify_emergency_status
  AFTER UPDATE OF status ON emergency_requests
  FOR EACH ROW
  EXECUTE FUNCTION notify_emergency_status_change();
