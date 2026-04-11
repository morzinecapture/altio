/**
 * Emergency-related API functions.
 * Extracted from src/api.ts — all emergency CRUD, bids, quotes, schedule.
 */
import { supabase, checkError, checkFunctionError, captureError, unwrapJoin, haversineKm, assertEmergencyTransition } from './_client';
import type { EmergencyStatus, CreateEmergencyPayload, AcceptEmergencyPayload, CompleteEmergencyPayload, EmergencyRequest, EmergencyBidEnriched, ScheduleItem, SupabaseError, QuoteLineItem } from './_client';
import type { EmergencyRow, BidRow, ProviderWithUser } from './_client';
import { sendPushNotification } from './notifications';
import { capturePayment } from './payments';

// Emergency
export const createEmergency = async (data: CreateEmergencyPayload) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');

  const responseDeadline = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const { data: req, error } = await supabase
    .from('emergency_requests')
    .insert({
      ...data,
      owner_id: session.user.id,
      status: 'bids_open',
      response_deadline: responseDeadline,
    })
    .select('*, property:properties(name, address, latitude, longitude)')
    .single();
  checkError(error);

  // Fire-and-forget: fetch favorites + notify providers in background
  // Only the INSERT above must complete before returning to the caller
  (async () => {
    try {
      const isTargeted = !!data.target_provider_id;

      // Targeted intervention: notify the specific provider directly
      if (isTargeted) {
        const dateLabel = data.scheduled_date
          ? `pour le ${new Date(data.scheduled_date).toLocaleDateString('fr-FR')}`
          : '';
        sendPushNotification(
          data.target_provider_id!,
          '📋 Demande d\'intervention',
          `Un propriétaire vous a envoyé une demande ${req.service_type} ${dateLabel}`.trim(),
          { emergencyId: req.id },
        ).catch(err => captureError(err, { context: 'push-notification-targeted-intervention', userId: data.target_provider_id! }));
        return;
      }

      // Broadcast to providers in zone (favorites first, then others after 2H)
      const { data: favorites } = await supabase
        .from('favorite_providers')
        .select('provider_id')
        .eq('owner_id', session.user.id);

      const favoriteIds = new Set((favorites || []).map((f: { provider_id: string }) => f.provider_id));
      const hasFavorites = favoriteIds.size > 0;

      const { data: providers } = await supabase
        .from('provider_profiles')
        .select('provider_id, specialties, radius_km, latitude, longitude, users!inner(expo_push_token)');

      if (providers && providers.length > 0 && req.property) {
        const pLat = req.property.latitude;
        const pLng = req.property.longitude;

        for (const p of providers) {
          const userRow = Array.isArray(p.users) ? p.users[0] : p.users as { expo_push_token?: string };
          if (!userRow?.expo_push_token) continue;
          if (p.specialties && p.specialties.length > 0 && !p.specialties.includes(req.service_type)) continue;

          if (p.latitude && p.longitude && pLat && pLng) {
            const dist = haversineKm(p.latitude, p.longitude, pLat, pLng);
            if (dist > (p.radius_km || 50)) continue;
          }

          if (hasFavorites && favoriteIds.has(p.provider_id)) {
            sendPushNotification(p.provider_id, `⭐ 🚨 Nouvelle Urgence`, `Une urgence ${req.service_type} a été déclarée à proximité. Vous êtes prioritaire — répondez vite !`, { emergencyId: req.id }).catch(err => captureError(err, { context: 'push-notification-emergency-favorite', userId: p.provider_id }));
          } else {
            sendPushNotification(p.provider_id, `🚨 Nouvelle Urgence`, `Une urgence ${req.service_type} a été déclarée à proximité.${hasFavorites ? ' Accessible dans 2H.' : ' Répondez vite !'}`, { emergencyId: req.id }).catch(err => captureError(err, { context: 'push-notification-emergency', userId: p.provider_id }));
          }
        }
      }
    } catch (err) {
      if (__DEV__) console.warn('Failed to notify providers', err);
    }
  })();

  return req;
};

export const getEmergencies = async (forProvider?: boolean) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Non authentifié');

  const { data, error } = await supabase
    .from('emergency_requests')
    .select('*, property:properties(name, address, city, latitude, longitude), provider:users!emergency_requests_accepted_provider_id_fkey(name, picture), bids:emergency_bids(id, status, provider_id)')
    .order('created_at', { ascending: false });

  checkError(error);
  const uid = session.user.id;
  let emergencies = (data || []).map((r: EmergencyRow) => ({
    ...r,
    property_name: unwrapJoin(r.property)?.name,
    property_address: forProvider && r.accepted_provider_id !== uid
      ? (unwrapJoin(r.property)?.city || '')
      : unwrapJoin(r.property)?.address,
    property_lat: unwrapJoin(r.property)?.latitude,
    property_lng: unwrapJoin(r.property)?.longitude,
    provider_name: r.provider?.name,
    provider_picture: r.provider?.picture,
    bids: (r.bids || []).filter((b: { status: string }) => b.status !== 'cancelled' && b.status !== 'rejected'),
  }));

  if (forProvider) {
    // Prestataire : urgences dans sa zone/catégories OU celles qui lui sont assignées
    const { data: pp } = await supabase
      .from('provider_profiles')
      .select('specialties, radius_km, latitude, longitude')
      .eq('provider_id', session.user.id)
      .single();

    if (pp) {
      const { specialties = [], radius_km = 50, latitude: pLat, longitude: pLng } = pp;
      emergencies = emergencies.filter((e) => {
        // Toujours montrer les urgences assignées à ce prestataire
        if (e.accepted_provider_id === session.user.id) return true;
        // Toujours montrer les demandes ciblées vers ce prestataire
        if (e.target_provider_id === session.user.id) return true;
        // Exclure les urgences déjà acceptées par un autre prestataire
        if (e.accepted_provider_id && e.accepted_provider_id !== session.user.id) return false;
        // Filtrer par zone et catégorie pour les urgences ouvertes
        if (specialties.length > 0 && !specialties.includes(e.service_type)) return false;
        if (pLat && pLng && e.property_lat && e.property_lng) {
          const dist = haversineKm(pLat, pLng, e.property_lat, e.property_lng);
          if (dist > radius_km) return false;
        }
        return true;
      });
    }
  } else {
    // Propriétaire : uniquement SES urgences
    emergencies = emergencies.filter((e) => e.owner_id === session.user.id);
  }

  return emergencies;
};

export const getEmergency = async (id: string) => {
  const { data, error } = await supabase
    .from('emergency_requests')
    .select('*, property:properties(name, address, city, latitude, longitude), provider:users!emergency_requests_accepted_provider_id_fkey(name, picture)')
    .eq('id', id)
    .single();
  checkError(error);

  if (data) {
    const { data: { session } } = await supabase.auth.getSession();
    const uid = session?.user?.id;
    const isAssigned = data.accepted_provider_id === uid;
    const isOwnerUser = data.owner_id === uid;

    data.property_name = data.property?.name;
    data.property_address = (isOwnerUser || isAssigned) ? data.property?.address : (data.property?.city || '');
    data.property_lat = (isOwnerUser || isAssigned) ? data.property?.latitude : undefined;
    data.property_lng = (isOwnerUser || isAssigned) ? data.property?.longitude : undefined;
    data.provider_name = data.provider?.name;
    data.provider_picture = data.provider?.picture;

    // Fetch bids separately
    // Columns verified against remote schema 2026-03-27:
    //   users: name, picture, company_name, siren, is_vat_exempt, is_auto_entrepreneur (NOT siret, NOT tva_status)
    //   provider_profiles: average_rating, total_reviews (NOT siret, NOT company_name, NOT tva_status)
    const { data: bids, error: bidsError } = await supabase
      .from('emergency_bids')
      .select('*, provider:users!emergency_bids_provider_id_fkey(name, picture, company_name, siren, is_vat_exempt, is_auto_entrepreneur, profile:provider_profiles(average_rating, total_reviews))')
      .eq('emergency_request_id', id)
      .order('created_at', { ascending: true });

    if (bidsError) {
      if (__DEV__) console.warn('Failed to fetch bids:', bidsError);
      data.bids = [];
    } else {
      data.bids = (bids || []).map((b) => {
        const prov = unwrapJoin(b.provider);
        const profile = Array.isArray(prov?.profile) ? prov.profile[0] : prov?.profile;
        return {
          ...b,
          provider_name: prov?.name,
          provider_picture: prov?.picture,
          provider_rating: profile?.average_rating,
          provider_reviews: profile?.total_reviews,
          provider_siret: prov?.siren,
          provider_company: prov?.company_name,
          provider_tva_status: null, // tva_status doesn't exist in schema
          provider_is_vat_exempt: prov?.is_vat_exempt ?? false,
          provider_is_auto_entrepreneur: prov?.is_auto_entrepreneur ?? false,
        };
      });
    }

    // Fetch quote separately (with line items)
    const { data: quotes } = await supabase
      .from('mission_quotes')
      .select('*, line_items:quote_line_items(*)')
      .eq('emergency_request_id', id)
      .order('created_at', { ascending: false })
      .limit(1);
    data.quote = quotes?.[0] || null;
    // Sort line items by sort_order
    if (data.quote?.line_items) {
      data.quote.line_items.sort((a: QuoteLineItem, b: QuoteLineItem) => (a.sort_order || 0) - (b.sort_order || 0));
    }
  }
  return data;
};

export const acceptEmergency = async (id: string, data: AcceptEmergencyPayload) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');

  const { data: req, error } = await supabase
    .from('emergency_requests')
    .update({
      ...data,
      accepted_provider_id: session.user.id,
      status: 'provider_accepted'
    })
    .eq('id', id)
    .eq('status', 'bids_open')
    .select()
    .single();
  if (error || !req) throw new Error('Impossible d\'accepter cette urgence. Vérifiez le statut.');
  return req;
};

export const completeEmergency = async (id: string, data: CompleteEmergencyPayload) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');

  // State machine guard: on_site → completed (direct completion without quote)
  assertEmergencyTransition('on_site', 'completed');

  const { data: req, error } = await supabase.from('emergency_requests').update({
    ...data,
    status: 'completed',
    completed_at: new Date().toISOString(),
  })
    .eq('id', id)
    .eq('accepted_provider_id', session.user.id)
    .eq('status', 'on_site')
    .select('*, owner_id')
    .single();
  if (error || !req) throw new Error('Impossible de terminer cette urgence. Vérifiez le statut.');

  // Generate invoices for the displacement/diagnostic fees (fire-and-forget)
  const invoiceBody = { emergencyId: id, stripePaymentIntentId: req.displacement_payment_id || undefined };
  Promise.all([
    supabase.functions.invoke('generate-invoice', { body: { ...invoiceBody, invoiceType: 'service' } }),
    supabase.functions.invoke('generate-invoice', { body: { ...invoiceBody, invoiceType: 'service_fee' } }),
    supabase.functions.invoke('generate-invoice', { body: { ...invoiceBody, invoiceType: 'commission' } }),
  ]).catch(() => { /* silent — invoices are critical but must not block UX */ });

  // Notifications are now handled server-side via DB trigger (trg_notify_emergency_status)

  return req;
};

// ─── Emergency bids (new flow) ────────────────────────────────────────────────

export const submitEmergencyBid = async (emergencyId: string, data: {
  travel_cost: number;
  diagnostic_cost: number;
  estimated_arrival: string;
}) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');

  // Vérifier que le prestataire a complété ses documents obligatoires (SIRET + RC Pro)
  const [{ data: userDoc }, { data: provDoc }] = await Promise.all([
    supabase.from('users').select('siren').eq('id', session.user.id).single(),
    supabase.from('provider_profiles').select('rc_pro_doc_url').eq('provider_id', session.user.id).single(),
  ]);
  if (!userDoc?.siren || !provDoc?.rc_pro_doc_url) {
    throw new Error('Veuillez compléter votre profil (SIRET et assurance RC Pro) avant de postuler. Rendez-vous dans Profil > Mes documents & SIRET.');
  }

  // R4: Max 3 candidatures actives par urgence (hors rejected/cancelled)
  const { count } = await supabase
    .from('emergency_bids')
    .select('*', { count: 'exact', head: true })
    .eq('emergency_request_id', emergencyId)
    .in('status', ['pending', 'accepted']);
  if ((count ?? 0) >= 3) {
    throw new Error('Cette urgence a déjà atteint le nombre maximum de candidatures (3).');
  }

  const { data: bid, error } = await supabase
    .from('emergency_bids')
    .insert({
      emergency_request_id: emergencyId,
      provider_id: session.user.id,
      travel_cost: data.travel_cost,
      diagnostic_cost: data.diagnostic_cost,
      estimated_arrival: data.estimated_arrival,
      status: 'pending',
    })
    .select()
    .single();
  checkError(error);

  // Notify owner
  const { data: em } = await supabase.from('emergency_requests').select('owner_id, service_type').eq('id', emergencyId).single();
  if (em?.owner_id) {
    sendPushNotification(em.owner_id, '🔔 Nouvelle candidature', `Un prestataire a postulé à votre urgence ${em.service_type}`, { emergencyId }).catch(err => captureError(err, { context: 'push-notification-emergency-bid', userId: em.owner_id }));
  }

  return bid;
};

export const acceptEmergencyBid = async (emergencyId: string, bidId: string, providerId: string, displacementPaymentIntentId?: string) => {
  // Vérifier que l'utilisateur connecté est le propriétaire de l'urgence
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Non authentifié');

  const { data: er } = await supabase
    .from('emergency_requests')
    .select('owner_id')
    .eq('id', emergencyId)
    .single();
  if (!er || er.owner_id !== session.user.id) throw new Error('Seul le propriétaire peut accepter un bid');

  // Accept chosen bid (guard against race condition: only accept if still pending)
  const { data: updatedBid, error: bidError } = await supabase
    .from('emergency_bids')
    .update({ status: 'accepted' })
    .eq('id', bidId)
    .eq('status', 'pending')
    .select();
  checkError(bidError);
  if (!updatedBid || updatedBid.length === 0) throw new Error('Ce bid a déjà été traité');

  // Reject others
  await supabase
    .from('emergency_bids')
    .update({ status: 'rejected' })
    .eq('emergency_request_id', emergencyId)
    .neq('id', bidId);

  // Get bid data
  const { data: bid } = await supabase
    .from('emergency_bids')
    .select('travel_cost, diagnostic_cost, estimated_arrival')
    .eq('id', bidId)
    .single();

  // Le paiement du déplacement est déjà collecté dans handleAcceptBid (Stripe automatic capture)
  // Donc on passe directement à 'displacement_paid'
  const updatePayload: Record<string, unknown> = {
    status: 'displacement_paid',
    accepted_provider_id: providerId,
    displacement_fee: bid?.travel_cost,
    diagnostic_fee: bid?.diagnostic_cost,
  };
  if (displacementPaymentIntentId) {
    updatePayload.displacement_payment_id = displacementPaymentIntentId;
  }
  const { data: updatedEm, error: emError } = await supabase
    .from('emergency_requests')
    .update(updatePayload)
    .eq('id', emergencyId)
    .eq('status', 'bids_open')
    .select();
  checkError(emError);
  if (!updatedEm || updatedEm.length === 0) throw new Error('Ce bid a déjà été traité');

  // Notifications are now handled server-side via DB trigger (trg_notify_emergency_status)

  return { ok: true };
};

export const rejectEmergencyBid = async (emergencyId: string, bidId: string) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');

  // Verify the caller owns this emergency
  const { data: er } = await supabase
    .from('emergency_requests')
    .select('owner_id')
    .eq('id', emergencyId)
    .single();
  if (er?.owner_id !== session.user.id) throw new Error('Not authorized');

  const { error } = await supabase
    .from('emergency_bids')
    .update({ status: 'rejected' })
    .eq('id', bidId)
    .eq('emergency_request_id', emergencyId);
  checkError(error);

  // Notify provider
  const { data: bid } = await supabase.from('emergency_bids').select('provider_id').eq('id', bidId).single();
  if (bid?.provider_id) {
    sendPushNotification(bid.provider_id, '❌ Offre refusée', 'Le propriétaire n\'a pas retenu votre offre pour cette urgence.', { emergencyId }).catch(err => captureError(err, { context: 'push-notification-emergency-bid-rejected', userId: bid.provider_id }));
  }

  return { ok: true };
};

export const markEmergencyArrived = async (emergencyId: string) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');

  // State machine guard: only displacement_paid → on_site is the canonical path
  assertEmergencyTransition('displacement_paid', 'on_site');

  // R3: Vérifier que l'urgence est dans un état valide et que c'est le bon provider
  const { data, error } = await supabase
    .from('emergency_requests')
    .update({ status: 'on_site' })
    .eq('id', emergencyId)
    .eq('status', 'displacement_paid')
    .eq('accepted_provider_id', session.user.id)
    .select('*, owner_id')
    .single();
  if (error || !data) throw new Error('Impossible de marquer l\'arrivée. Vérifiez le statut de l\'urgence.');

  // Notifications are now handled server-side via DB trigger (trg_notify_emergency_status)

  return data;
};

// ─── Emergency quotes (phase 2) ──────────────────────────────────────────────

export const submitEmergencyQuote = async (emergencyId: string, data: {
  description: string;
  repair_cost: number;
  repair_delay_days: number;
}) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');

  // State machine guard
  assertEmergencyTransition('on_site', 'quote_sent');

  const { data: quote, error } = await supabase
    .from('mission_quotes')
    .insert({
      emergency_request_id: emergencyId,
      provider_id: session.user.id,
      description: data.description,
      repair_cost: data.repair_cost,
      repair_delay_days: data.repair_delay_days,
      status: 'pending',
    })
    .select()
    .single();
  checkError(error);

  // on_site → quote_sent (direct — skip transient quote_submitted state)
  const { error: statusErr } = await supabase
    .from('emergency_requests')
    .update({ status: 'quote_sent' })
    .eq('id', emergencyId)
    .eq('status', 'on_site');
  if (statusErr) throw new Error('Impossible de soumettre le devis : ' + statusErr.message);

  // Notifications are now handled server-side via DB trigger (trg_notify_emergency_status)

  return quote;
};

export const acceptEmergencyQuote = async (emergencyId: string, quoteId: string, paymentIntentId: string) => {
  // State machine guard: quote_sent → quote_accepted
  assertEmergencyTransition('quote_sent', 'quote_accepted');

  const captureDeadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');

  // Vérifier que l'utilisateur est bien le propriétaire de l'urgence
  const { data: em } = await supabase
    .from('emergency_requests')
    .select('owner_id')
    .eq('id', emergencyId)
    .single();
  if (!em || em.owner_id !== session.user.id) throw new Error('Seul le propriétaire peut accepter le devis');

  const { error: qError } = await supabase
    .from('mission_quotes')
    .update({
      status: 'accepted',
      accepted_at: new Date().toISOString(),
      accepted_by: session.user.id,
      stripe_capture_deadline: captureDeadline,
    })
    .eq('id', quoteId);
  checkError(qError);

  // R3: Vérifier que l'urgence est bien en 'quote_sent' avant d'accepter le devis
  const { error: emError } = await supabase
    .from('emergency_requests')
    .update({ status: 'quote_accepted', quote_payment_id: paymentIntentId })
    .eq('id', emergencyId)
    .in('status', ['quote_sent', 'quote_submitted']);
  checkError(emError);

  // Notifications are now handled server-side via DB trigger (trg_notify_emergency_status)

  return { ok: true };
};

export const refuseEmergencyQuote = async (emergencyId: string, quoteId: string) => {
  // Vérifier que l'utilisateur connecté est le propriétaire de l'urgence
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Non authentifié');

  const { data: er } = await supabase
    .from('emergency_requests')
    .select('owner_id')
    .eq('id', emergencyId)
    .single();
  if (!er || er.owner_id !== session.user.id) throw new Error('Seul le propriétaire peut refuser un devis');

  // State machine guard: quote_sent → quote_refused
  assertEmergencyTransition('quote_sent', 'quote_refused');

  const { error: qError } = await supabase
    .from('mission_quotes')
    .update({ status: 'refused' })
    .eq('id', quoteId);
  checkError(qError);

  // R3: Vérifier que l'urgence est bien en 'quote_sent' avant de refuser
  const { error: emError } = await supabase
    .from('emergency_requests')
    .update({ status: 'quote_refused' })
    .eq('id', emergencyId)
    .in('status', ['quote_submitted', 'quote_sent']);
  checkError(emError);

  // Notifications are now handled server-side via DB trigger (trg_notify_emergency_status)

  return { ok: true };
};

export const completeEmergencyWithCapture = async (emergencyId: string) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');

  // R3: Vérifier le statut AVANT de capturer le paiement
  const { data: em, error: fetchErr } = await supabase
    .from('emergency_requests')
    .select('owner_id, quote_payment_id, status, accepted_provider_id')
    .eq('id', emergencyId)
    .single();

  if (fetchErr || !em) {
    throw new Error('Impossible de charger l\'urgence. Veuillez réessayer.');
  }

  if (!['quote_accepted', 'in_progress'].includes(em.status)) {
    throw new Error('L\'urgence doit être en statut "devis accepté" ou "en cours" pour être terminée.');
  }

  // Vérifier que l'utilisateur est bien le prestataire assigné
  if (em.accepted_provider_id !== session.user.id) {
    throw new Error('Seul le prestataire assigné peut terminer cette urgence.');
  }

  if (!em.quote_payment_id) {
    throw new Error('Aucune empreinte bancaire trouvée pour cette urgence. Le paiement n\'a peut-être pas été placé.');
  }

  // Capture the payment hold
  try {
    await capturePayment(em.quote_payment_id, undefined, undefined, emergencyId);
  } catch (e: unknown) {
    const msg = (e as Error)?.message || '';
    if (msg.includes('already been captured') || msg.includes('already_captured')) {
      // Payment was already captured — continue to mark as completed
    } else if (msg.includes('expired') || msg.includes('canceled') || msg.includes('cancelled')) {
      throw new Error('L\'empreinte bancaire a expiré (délai de 7 jours dépassé). Demandez un nouveau paiement au propriétaire.');
    } else {
      throw new Error(`Échec de la capture du paiement (PI: ${em.quote_payment_id?.substring(0, 10)}...) : ${msg}`);
    }
  }

  const { error } = await supabase
    .from('emergency_requests')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', emergencyId)
    .in('status', ['quote_accepted', 'in_progress']);
  checkError(error);

  // Invoice generation is handled by capture-payment edge function (fire-and-forget)
  // Do NOT call generate-invoice here — it causes duplicate invoices

  // Notifications are now handled server-side via DB trigger (trg_notify_emergency_status)

  return { ok: true };
};

export const cancelEmergency = async (emergencyId: string) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');

  // Vérifier que l'urgence appartient au proprio et est annulable
  const { data: em, error: fetchErr } = await supabase
    .from('emergency_requests')
    .select('id, status, owner_id')
    .eq('id', emergencyId)
    .eq('owner_id', session.user.id)
    .single();
  if (fetchErr || !em) throw new Error('Urgence introuvable');
  if (em.status !== 'bids_open') {
    throw new Error('Impossible d\'annuler : un prestataire a déjà été accepté ou l\'intervention est en cours.');
  }

  // Rejeter tous les bids en attente
  await supabase
    .from('emergency_bids')
    .update({ status: 'rejected' })
    .eq('emergency_request_id', emergencyId)
    .eq('status', 'pending');

  // Annuler l'urgence
  const { data, error } = await supabase
    .from('emergency_requests')
    .update({ status: 'cancelled' })
    .eq('id', emergencyId)
    .eq('owner_id', session.user.id)
    .eq('status', 'bids_open')
    .select()
    .single();
  checkError(error);
  return data;
};

export const cancelEmergencyBid = async (emergencyId: string) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');

  const { data: bid, error: findErr } = await supabase
    .from('emergency_bids')
    .select('id')
    .eq('emergency_request_id', emergencyId)
    .eq('provider_id', session.user.id)
    .eq('status', 'pending')
    .single();
  checkError(findErr);
  if (!bid) throw new Error('Aucune candidature trouvée');

  const { error } = await supabase
    .from('emergency_bids')
    .update({ status: 'cancelled' })
    .eq('id', bid.id)
    .eq('provider_id', session.user.id);
  checkError(error);
  return { ok: true };
};

// ─── Provider schedule ────────────────────────────────────────────────────────

export const getProviderSchedule = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  // Fetch standard missions assigned to this provider
  const { data: missions, error: missionsError } = await supabase
    .from('missions')
    .select('id, mission_type, description, status, scheduled_date, property_id, property:properties(name, address)')
    .eq('assigned_provider_id', session.user.id)
    .gte('scheduled_date', startOfDay.toISOString());
  checkError(missionsError);

  // Fetch emergencies assigned to this provider
  const { data: emergencies, error: emError } = await supabase
    .from('emergency_requests')
    .select('id, service_type, description, status, created_at, scheduled_date, property:properties(name, address)')
    .eq('accepted_provider_id', session.user.id)
    .gte('created_at', startOfDay.toISOString());
  checkError(emError);

  // Filter out emergencies where provider's bid is no longer active
  const { data: myActiveBids } = await supabase
    .from('emergency_bids')
    .select('emergency_request_id')
    .eq('provider_id', session.user.id)
    .in('status', ['pending', 'accepted']);
  const activeBidEmergencyIds = new Set((myActiveBids || []).map((b: { emergency_request_id: string }) => b.emergency_request_id));
  const filteredEmergencies = (emergencies || []).filter((e) => activeBidEmergencyIds.has(e.id));

  // Map and combine
  const formattedMissions = (missions || []).map((m) => ({
    id: m.id,
    mission_id: m.id,
    title: unwrapJoin(m.property)?.name || 'Mission',
    address: unwrapJoin(m.property)?.address || '',
    is_emergency: false,
    scheduled_at: m.scheduled_date || new Date().toISOString(),
    duration_minutes: 120, // default estimate
    status: m.status,
  }));

  const formattedEmergencies = filteredEmergencies.map((e) => ({
    id: e.id,
    mission_id: e.id,
    title: unwrapJoin(e.property)?.name || 'Urgence',
    address: unwrapJoin(e.property)?.address || '',
    is_emergency: true,
    scheduled_at: e.scheduled_date || e.created_at || new Date().toISOString(),
    duration_minutes: 60, // default estimate
    status: e.status,
  }));

  // Fetch iCal reservations for properties where this provider has upcoming missions
  const propertyIds = [...new Set((missions || []).map((m) => m.property_id).filter(Boolean))];
  let formattedReservations: ScheduleItem[] = [];

  if (propertyIds.length > 0) {
    const { data: reservations } = await supabase
      .from('reservations')
      .select('id, property_id, guest_name, check_in, check_out, source, property:properties(name, address)')
      .in('property_id', propertyIds)
      .gte('check_out', startOfDay.toISOString())
      .order('check_out', { ascending: true });

    formattedReservations = (reservations || []).map((r) => ({
      id: `res-${r.id}`,
      mission_id: null,
      title: `Check-out ${r.guest_name || r.source || ''}`.trim(),
      address: unwrapJoin(r.property)?.address || '',
      is_emergency: false,
      is_reservation: true,
      source: r.source,
      check_in: r.check_in,
      check_out: r.check_out,
      scheduled_at: r.check_out,
      duration_minutes: null,
    }));
  }

  const combined = [...formattedMissions, ...formattedEmergencies, ...formattedReservations];
  combined.sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());

  return combined;
};
