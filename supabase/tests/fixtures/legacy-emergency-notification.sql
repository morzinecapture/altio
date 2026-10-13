CREATE OR REPLACE FUNCTION public.notify_emergency_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
$function$

