// API Client for MontRTO using Supabase
import { supabase } from './lib/supabase';

// Helper to throw errors explicitly from Supabase responses
const checkError = (error: any) => {
  if (error) {
    console.error('Supabase Error:', error);
    throw new Error(error.message || 'Supabase query failed');
  }
};

// ─── Geo helpers ──────────────────────────────────────────────────────────────

const haversineKm = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

export const geocodeAddress = async (address: string): Promise<{ lat: number; lng: number } | null> => {
  try {
    const encoded = encodeURIComponent(address + ', France');
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&limit=1`,
      { headers: { 'User-Agent': 'MontRTO/1.0 (contact@montrto.fr)' } }
    );
    const data = await res.json();
    if (data?.length > 0) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    }
    return null;
  } catch {
    return null;
  }
};

// Users
export const setRole = async (role: string) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('users')
    .upsert({
      id: session.user.id,
      email: session.user.email || '',
      name: session.user.user_metadata?.full_name || '',
      picture: session.user.user_metadata?.avatar_url || '',
      role
    })
    .select()
    .single();

  checkError(error);

  if (role === 'provider') {
    // Create a provider profile if none exists
    const { error: profileError } = await supabase
      .from('provider_profiles')
      .insert({ provider_id: session.user.id })
      .select()
      .single();

    if (profileError && profileError.code !== '23505') { // 23505 is unique violation (already exists)
      checkError(profileError);
    }
  }

  return data;
};

export const getProfile = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('users')
    .select('*, provider_profile:provider_profiles(*)')
    .eq('id', session.user.id)
    .single();

  checkError(error);
  return data;
};

export const updateProviderProfile = async (data: any) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');

  const { data: updated, error } = await supabase
    .from('provider_profiles')
    .update(data)
    .eq('provider_id', session.user.id)
    .select()
    .single();

  checkError(error);
  return updated;
};

export const completeOwnerOnboarding = async (data: { owner_type: string }) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');
  const { data: updated, error } = await supabase
    .from('users')
    .update({ owner_type: data.owner_type, onboarding_completed: true })
    .eq('id', session.user.id)
    .select()
    .single();
  checkError(error);
  return updated;
};

export const completeProviderOnboarding = async (data: {
  specialties: string[];
  company_type: string;
  radius_km: number;
  weekly_availability: string[];
}) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');
  const { error: userError } = await supabase
    .from('users')
    .update({ onboarding_completed: true })
    .eq('id', session.user.id);
  checkError(userError);
  const { data: updated, error } = await supabase
    .from('provider_profiles')
    .update({ specialties: data.specialties, company_type: data.company_type, radius_km: data.radius_km, weekly_availability: data.weekly_availability })
    .eq('provider_id', session.user.id)
    .select()
    .single();
  checkError(error);
  return updated;
};

// Properties
export const getProperties = async () => {
  const { data, error } = await supabase
    .from('properties')
    .select('*')
    .order('created_at', { ascending: false });
  checkError(error);
  return data || [];
};

export const createProperty = async (data: any) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');

  const { data: prop, error } = await supabase
    .from('properties')
    .insert({ ...data, owner_id: session.user.id })
    .select()
    .single();

  checkError(error);

  // Geocode address asynchronously
  if (prop?.address) {
    geocodeAddress(prop.address).then(coords => {
      if (coords) {
        supabase.from('properties').update({ latitude: coords.lat, longitude: coords.lng }).eq('id', prop.id);
      }
    });
  }

  return prop;
};

export const getProperty = async (id: string) => {
  const { data, error } = await supabase
    .from('properties')
    .select('*')
    .eq('id', id)
    .single();
  checkError(error);
  return data;
};

export const updateProperty = async (id: string, data: any) => {
  const { data: updated, error } = await supabase
    .from('properties')
    .update(data)
    .eq('id', id)
    .select()
    .single();
  checkError(error);
  return updated;
};

export const deleteProperty = async (id: string) => {
  const { error } = await supabase.from('properties').delete().eq('id', id);
  checkError(error);
  return { ok: true };
};

// Syncing iCal logic will ideally need a Supabase Edge Function since 
// we shouldn't rely on the client to parse raw network calendars and loop insertions.
export const syncIcal = async (id: string) => {
  const { data, error } = await supabase.functions.invoke('sync-ical', {
    body: { property_id: id }
  });
  checkError(error);
  return data;
};

// Reservations
export const getReservations = async (propertyId?: string) => {
  let query = supabase.from('reservations').select('*').order('check_in', { ascending: false });
  if (propertyId) query = query.eq('property_id', propertyId);

  const { data, error } = await query;
  checkError(error);
  return data || [];
};

// Missions
export const getMissions = async (status?: string, missionType?: string, forProvider?: boolean) => {
  let query = supabase.from('missions').select('*, property:properties(name, address, access_code, instructions, deposit_location, latitude, longitude)').order('created_at', { ascending: false });

  if (status) query = query.eq('status', status);
  if (missionType) query = query.eq('mission_type', missionType);

  const { data, error } = await query;
  checkError(error);

  let missions = (data || []).map((m: any) => ({
    ...m,
    property_name: m.property?.name,
    property_address: m.property?.address,
    access_code: m.property?.access_code,
    instructions: m.property?.instructions,
    deposit_location: m.property?.deposit_location,
    property_lat: m.property?.latitude,
    property_lng: m.property?.longitude,
  }));

  if (forProvider) {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      const { data: pp } = await supabase
        .from('provider_profiles')
        .select('specialties, radius_km, latitude, longitude')
        .eq('provider_id', session.user.id)
        .single();

      if (pp) {
        const { specialties = [], radius_km = 50, latitude: pLat, longitude: pLng } = pp;
        missions = missions.filter((m: any) => {
          if (specialties.length > 0 && !specialties.includes(m.mission_type)) return false;
          if (pLat && pLng && m.property_lat && m.property_lng) {
            const dist = haversineKm(pLat, pLng, m.property_lat, m.property_lng);
            if (dist > radius_km) return false;
          }
          return true;
        });
      }
    }
  }

  return missions;
};

export const createMission = async (data: any) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');

  const { data: prop } = await supabase.from('properties').select('fixed_rate').eq('id', data.property_id).single();

  const { data: mission, error } = await supabase
    .from('missions')
    .insert({
      ...data,
      owner_id: session.user.id,
      fixed_rate: data.fixed_rate || prop?.fixed_rate
    })
    .select()
    .single();
  checkError(error);
  return mission;
};

export const getMission = async (id: string) => {
  const { data: mission, error } = await supabase
    .from('missions')
    .select('*, property:properties(name, address, access_code, instructions, deposit_location, linen_instructions), applications:mission_applications(*, provider:users(name, picture), profile:provider_profiles(rating, total_reviews))')
    .eq('id', id)
    .single();

  checkError(error);

  if (mission) {
    mission.property_name = mission.property?.name;
    mission.property_address = mission.property?.address;
    mission.access_code = mission.property?.access_code;
    mission.instructions = mission.property?.instructions;
    mission.deposit_location = mission.property?.deposit_location;
    mission.linen_instructions = mission.property?.linen_instructions;

    mission.applications = mission.applications?.map((app: any) => ({
      ...app,
      provider_name: app.provider?.name,
      provider_picture: app.provider?.picture,
      provider_rating: app.profile?.rating,
      provider_reviews: app.profile?.total_reviews,
    }));
  }

  return mission;
};

export const applyToMission = async (missionId: string, data: any) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');

  const { data: app, error } = await supabase
    .from('mission_applications')
    .insert({
      mission_id: missionId,
      provider_id: session.user.id,
      proposed_rate: data.proposed_rate,
      message: data.message
    })
    .select()
    .single();

  checkError(error);

  // Automatically accept if mode is fixed... Note: In a real system, use edge functions here for atomic integrity
  return app;
};

export const handleApplication = async (missionId: string, appId: string, action: string) => {
  const status = action === 'accept' ? 'accepted' : 'rejected';
  const { data, error } = await supabase
    .from('mission_applications')
    .update({ status })
    .eq('id', appId)
    .select()
    .single();
  checkError(error);

  if (status === 'accepted') {
    // Reject all others
    await supabase.from('mission_applications').update({ status: 'rejected' }).eq('mission_id', missionId).neq('id', appId);
    // Assisgn provider
    await supabase.from('missions').update({ status: 'assigned', assigned_provider_id: data.provider_id }).eq('id', missionId);
  }
  return { message: `Application ${status}` };
};

export const startMission = async (missionId: string) => {
  const { data, error } = await supabase.from('missions').update({ status: 'in_progress', started_at: new Date().toISOString() }).eq('id', missionId).select().single();
  checkError(error);
  return data;
};

export const completeMission = async (missionId: string) => {
  const { data, error } = await supabase.from('missions').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', missionId).select().single();
  checkError(error);
  return data;
};

// Emergency
export const createEmergency = async (data: any) => {
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
    .select()
    .single();
  checkError(error);
  return req;
};

export const getEmergencies = async (forProvider?: boolean) => {
  const { data, error } = await supabase
    .from('emergency_requests')
    .select('*, property:properties(name, address, latitude, longitude), provider:users!emergency_requests_accepted_provider_id_fkey(name, picture)')
    .order('created_at', { ascending: false });

  checkError(error);
  let emergencies = (data || []).map((r: any) => ({
    ...r,
    property_name: r.property?.name,
    property_address: r.property?.address,
    property_lat: r.property?.latitude,
    property_lng: r.property?.longitude,
    provider_name: r.provider?.name,
    provider_picture: r.provider?.picture,
  }));

  if (forProvider) {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      const { data: pp } = await supabase
        .from('provider_profiles')
        .select('specialties, radius_km, latitude, longitude')
        .eq('provider_id', session.user.id)
        .single();

      if (pp) {
        const { specialties = [], radius_km = 50, latitude: pLat, longitude: pLng } = pp;
        emergencies = emergencies.filter((e: any) => {
          if (specialties.length > 0 && !specialties.includes(e.service_type)) return false;
          if (pLat && pLng && e.property_lat && e.property_lng) {
            const dist = haversineKm(pLat, pLng, e.property_lat, e.property_lng);
            if (dist > radius_km) return false;
          }
          return true;
        });
      }
    }
  }

  return emergencies;
};

// Push Notifications
export const registerPushToken = async (tokenData: { data: string } | string, platform: string) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return; // Push tokens can only be saved if logged in

  const actualToken = typeof tokenData === 'string' ? tokenData : tokenData.data;

  const { error } = await supabase
    .from('users')
    .update({ expo_push_token: actualToken })
    .eq('id', session.user.id);

  if (error) console.error('Failed to register push token in DB', error);
};

export const sendPushNotification = async (userId: string, title: string, body: string, data?: any) => {
  try {
    const { error } = await supabase.functions.invoke('send-push', {
      body: { userId, title, body, data }
    });
    if (error) console.warn('Push Edge Function error:', error);
  } catch (err) {
    console.warn('Failed to invoke send-push:', err);
  }
};

export const getEmergency = async (id: string) => {
  const { data, error } = await supabase
    .from('emergency_requests')
    .select('*, property:properties(name, address), provider:users!emergency_requests_accepted_provider_id_fkey(name, picture)')
    .eq('id', id)
    .single();
  checkError(error);

  if (data) {
    data.property_name = data.property?.name;
    data.property_address = data.property?.address;
    data.provider_name = data.provider?.name;
    data.provider_picture = data.provider?.picture;

    // Fetch bids separately
    const { data: bids } = await supabase
      .from('emergency_bids')
      .select('*, provider:users(name, picture), profile:provider_profiles(rating, total_reviews)')
      .eq('emergency_request_id', id)
      .order('created_at', { ascending: true });
    data.bids = (bids || []).map((b: any) => ({
      ...b,
      provider_name: b.provider?.name,
      provider_rating: b.profile?.rating,
      provider_reviews: b.profile?.total_reviews,
    }));

    // Fetch quote separately
    const { data: quotes } = await supabase
      .from('mission_quotes')
      .select('*')
      .eq('emergency_request_id', id)
      .order('created_at', { ascending: false })
      .limit(1);
    data.quote = quotes?.[0] || null;
  }
  return data;
};

export const acceptEmergency = async (id: string, data: any) => {
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
    .select()
    .single();
  checkError(error);
  return req;
};

// Edge functions required for real payments, placeholder
export const payDisplacement = async (id: string, originUrl: string) => {
  return { ok: true };
};

export const payQuote = async (id: string, originUrl: string) => {
  return { ok: true };
};

export const completeEmergency = async (id: string, data: any) => {
  const { data: req, error } = await supabase.from('emergency_requests').update({
    ...data,
    status: 'completed'
  }).eq('id', id).select().single();
  checkError(error);
  return req;
};

export const checkPaymentStatus = async (sessionId: string) => ({ status: 'paid' });

// ─── Emergency bids (new flow) ────────────────────────────────────────────────

export const submitEmergencyBid = async (emergencyId: string, data: {
  travel_cost: number;
  diagnostic_cost: number;
  estimated_arrival: string;
}) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');

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
    sendPushNotification(em.owner_id, '🔔 Nouvelle candidature', `Un prestataire a postulé à votre urgence ${em.service_type}`, { emergencyId });
  }

  return bid;
};

export const acceptEmergencyBid = async (emergencyId: string, bidId: string, providerId: string) => {
  // Accept chosen bid
  const { error: bidError } = await supabase
    .from('emergency_bids')
    .update({ status: 'accepted' })
    .eq('id', bidId);
  checkError(bidError);

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

  // Update emergency
  const { error: emError } = await supabase
    .from('emergency_requests')
    .update({
      status: 'bid_accepted',
      accepted_provider_id: providerId,
      displacement_fee: bid?.travel_cost,
      diagnostic_fee: bid?.diagnostic_cost,
    })
    .eq('id', emergencyId);
  checkError(emError);

  // Add to provider schedule
  await supabase
    .from('provider_schedule')
    .insert({
      provider_id: providerId,
      scheduled_at: bid?.estimated_arrival || new Date().toISOString(),
      duration_minutes: 120,
    });

  // Notify provider
  sendPushNotification(providerId, '✅ Candidature acceptée !', 'Le propriétaire a choisi votre offre. Rendez-vous sur place.', { emergencyId });

  return { ok: true };
};

export const markEmergencyArrived = async (emergencyId: string) => {
  const { data, error } = await supabase
    .from('emergency_requests')
    .update({ status: 'on_site' })
    .eq('id', emergencyId)
    .select()
    .single();
  checkError(error);
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

  await supabase
    .from('emergency_requests')
    .update({ status: 'quote_submitted' })
    .eq('id', emergencyId);

  // Notify owner
  const { data: em } = await supabase.from('emergency_requests').select('owner_id').eq('id', emergencyId).single();
  if (em?.owner_id) {
    sendPushNotification(em.owner_id, '📋 Devis reçu', `Le prestataire a soumis un devis de ${data.repair_cost}€ — ${data.repair_delay_days}j de délai.`, { emergencyId });
  }

  return quote;
};

export const acceptEmergencyQuote = async (emergencyId: string, quoteId: string, paymentIntentId: string) => {
  const captureDeadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const { error: qError } = await supabase
    .from('mission_quotes')
    .update({ status: 'accepted', stripe_capture_deadline: captureDeadline })
    .eq('id', quoteId);
  checkError(qError);

  const { error: emError } = await supabase
    .from('emergency_requests')
    .update({ status: 'quote_accepted', quote_payment_id: paymentIntentId })
    .eq('id', emergencyId);
  checkError(emError);

  // Notify provider
  const { data: em } = await supabase.from('emergency_requests').select('accepted_provider_id').eq('id', emergencyId).single();
  if (em?.accepted_provider_id) {
    sendPushNotification(em.accepted_provider_id, '✅ Devis accepté !', 'Le propriétaire a accepté votre devis. Vous pouvez démarrer les travaux.', { emergencyId });
  }

  return { ok: true };
};

export const createPaymentIntent = async (amount: number, metadata?: any, captureMethod: 'automatic' | 'manual' = 'automatic') => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');

  const { data, error } = await supabase.functions.invoke('create-payment-intent', {
    body: { amount: amount * 100, captureMethod, metadata } // Stripe expects cents
  });

  checkError(error);
  if (data?.error) throw new Error(data.error);

  return data; // returns { clientSecret, paymentIntentId }
};

export const capturePayment = async (paymentIntentId: string, amountToCapture?: number) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');

  const { data, error } = await supabase.functions.invoke('capture-payment', {
    body: { paymentIntentId, amountToCapture: amountToCapture ? amountToCapture * 100 : undefined }
  });

  checkError(error);
  if (data?.error) throw new Error(data.error);

  return data;
};

export const refuseEmergencyQuote = async (emergencyId: string, quoteId: string) => {
  const { error: qError } = await supabase
    .from('mission_quotes')
    .update({ status: 'refused' })
    .eq('id', quoteId);
  checkError(qError);

  // Fetch provider before updating
  const { data: em } = await supabase.from('emergency_requests').select('accepted_provider_id').eq('id', emergencyId).single();

  const { error: emError } = await supabase
    .from('emergency_requests')
    .update({ status: 'quote_refused' })
    .eq('id', emergencyId);
  checkError(emError);

  // Notify provider
  if (em?.accepted_provider_id) {
    sendPushNotification(em.accepted_provider_id, '❌ Devis refusé', 'Le propriétaire a refusé votre devis. Vous pouvez soumettre une nouvelle proposition.', { emergencyId });
  }

  return { ok: true };
};

export const completeEmergencyWithCapture = async (emergencyId: string) => {
  const { data: em } = await supabase.from('emergency_requests').select('owner_id, quote_payment_id').eq('id', emergencyId).single();

  if (em?.quote_payment_id) {
    try {
      await capturePayment(em.quote_payment_id);
    } catch (e) {
      console.warn("Stripe Capture failed:", e);
      throw new Error("Impossible de capturer le paiement Stripe. L'intervention ne peut être terminée.");
    }
  }

  const { error } = await supabase
    .from('emergency_requests')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', emergencyId);
  checkError(error);

  // Notify owner
  if (em?.owner_id) {
    sendPushNotification(em.owner_id, '🏠 Intervention terminée', 'Le prestataire a marqué l\'urgence comme terminée. Le paiement a été capturé.', { emergencyId });
  }

  return { ok: true };
};

// ─── Provider schedule ────────────────────────────────────────────────────────

export const getProviderSchedule = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('provider_schedule')
    .select('*, mission:missions(mission_type, description, property:properties(name, address))')
    .eq('provider_id', session.user.id)
    .gte('scheduled_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .order('scheduled_at', { ascending: true });
  checkError(error);

  return (data || []).map((s: any) => ({
    ...s,
    title: s.mission?.property?.name || 'Urgence',
    address: s.mission?.property?.address || '',
    is_emergency: !s.mission_id,
  }));
};

// Quotes
export const createQuote = async (data: any) => {
  const { error } = await supabase.from('emergency_requests').update({ quote_id: 'pending', status: 'quote_sent' }).eq('id', data.emergency_request_id);
  checkError(error);
  return { ok: true };
};

export const handleQuote = async (quoteId: string, action: string) => {
  return { ok: true };
};

// Service Types
export const getServiceTypes = async () => [
  { id: 'plumbing', name: 'Plomberie', icon: 'water-outline' },
  { id: 'electrical', name: 'Électricité', icon: 'flash-outline' },
  { id: 'locksmith', name: 'Serrurerie', icon: 'key-outline' },
  { id: 'jacuzzi', name: 'Jacuzzi/Piscine', icon: 'snow-outline' },
  { id: 'repair', name: 'Réparation', icon: 'construct-outline' }
];

// Provider
export const toggleAvailability = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');

  const { data: profile } = await supabase.from('provider_profiles').select('available').eq('provider_id', session.user.id).single();

  if (profile) {
    const { data, error } = await supabase.from('provider_profiles').update({ available: !profile.available }).eq('provider_id', session.user.id).select().single();
    checkError(error);
    return data;
  }
};

export const getProviderStats = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');
  const uid = session.user.id;

  const [profileRes, completedRes, inProgressRes, applicationsRes, recentRes, earningsRes] = await Promise.all([
    supabase.from('provider_profiles').select('total_earnings, total_reviews, rating').eq('provider_id', uid).single(),
    supabase.from('missions').select('id', { count: 'exact', head: true }).eq('assigned_provider_id', uid).eq('status', 'completed'),
    supabase.from('missions').select('id', { count: 'exact', head: true }).eq('assigned_provider_id', uid).eq('status', 'in_progress'),
    supabase.from('mission_applications').select('id', { count: 'exact', head: true }).eq('provider_id', uid).eq('status', 'pending'),
    supabase.from('missions')
      .select('id, mission_type, description, fixed_rate, completed_at, property:properties(name)')
      .eq('assigned_provider_id', uid)
      .eq('status', 'completed')
      .order('completed_at', { ascending: false })
      .limit(5),
    supabase.from('missions')
      .select('fixed_rate')
      .eq('assigned_provider_id', uid)
      .eq('status', 'completed'),
  ]);

  const totalEarnings =
    profileRes.data?.total_earnings ||
    (earningsRes.data || []).reduce((sum: number, m: any) => sum + (m.fixed_rate || 0), 0);

  const recent = (recentRes.data || []).map((m: any) => ({
    ...m,
    mission_id: m.id,
    property_name: m.property?.name,
  }));

  return {
    total_earnings: totalEarnings,
    rating: profileRes.data?.rating || 0,
    total_reviews: profileRes.data?.total_reviews || 0,
    completed_missions: completedRes.count || 0,
    in_progress_missions: inProgressRes.count || 0,
    pending_applications: applicationsRes.count || 0,
    recent_missions: recent,
  };
};

// Notifications
export const getNotifications = async () => [];

export const markNotificationRead = async (id: string) => ({ ok: true });

// Dashboard
export const getOwnerDashboard = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');
  const uid = session.user.id;

  const [propsRes, pendingRes, activeRes, upcomingRes] = await Promise.all([
    supabase.from('properties').select('id', { count: 'exact', head: true }).eq('owner_id', uid),
    supabase.from('missions').select('id', { count: 'exact', head: true }).eq('owner_id', uid).eq('status', 'pending'),
    supabase.from('missions').select('id', { count: 'exact', head: true }).eq('owner_id', uid).in('status', ['assigned', 'in_progress']),
    supabase.from('missions')
      .select('id, status, mission_type, scheduled_date, fixed_rate, description, property:properties(name, address)')
      .eq('owner_id', uid)
      .neq('status', 'completed')
      .order('scheduled_date', { ascending: true, nullsFirst: false })
      .limit(5),
  ]);

  const upcoming = (upcomingRes.data || []).map((m: any) => ({
    ...m,
    mission_id: m.id,
    property_name: m.property?.name,
    property_address: m.property?.address,
  }));

  return {
    total_properties: propsRes.count || 0,
    pending_missions: pendingRes.count || 0,
    active_missions: activeRes.count || 0,
    upcoming_missions: upcoming,
  };
};
