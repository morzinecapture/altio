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

export const getProviders = async (specialty?: string) => {
  let query = supabase
    .from('provider_profiles')
    .select('*, user:users(*)');

  if (specialty) {
    query = query.contains('specialties', [specialty]);
  }

  const { data, error } = await query;
  checkError(error);
  return data || [];
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
  const { data: { session } } = await supabase.auth.getSession();
  const uid = session?.user?.id;

  let query = supabase.from('missions').select('*, property:properties(name, address, access_code, instructions, deposit_location, latitude, longitude)').order('created_at', { ascending: false });

  if (status) query = query.eq('status', status);
  if (missionType) query = query.eq('mission_type', missionType);

  const { data, error } = await query;
  checkError(error);

  let mergedMissions = (data || []).map((m: any) => ({
    ...m,
    mission_id: m.id,
    property_name: m.property?.name,
    property_address: m.property?.address,
    access_code: m.property?.access_code,
    instructions: m.property?.instructions,
    deposit_location: m.property?.deposit_location,
    property_lat: m.property?.latitude,
    property_lng: m.property?.longitude,
    is_emergency: false
  }));

  let emQuery = supabase.from('emergency_requests').select('*, property:properties(name, address, access_code, instructions, deposit_location, latitude, longitude)').order('created_at', { ascending: false });
  if (missionType) emQuery = emQuery.eq('service_type', missionType);

  const { data: emData } = await emQuery;

  let emergencies = (emData || []).map((e: any) => {
    let mappedStatus = 'pending';
    if (e.status === 'open') mappedStatus = 'pending';
    else if (e.status === 'provider_accepted' || e.status === 'bid_accepted') mappedStatus = 'assigned';
    else if (e.status === 'completed') mappedStatus = 'completed';
    else mappedStatus = 'in_progress';

    const fixed_rate = (e.displacement_fee || 0) + (e.diagnostic_fee || 0);

    return {
      ...e,
      mission_id: e.id,
      mission_type: e.service_type,
      status: mappedStatus,
      raw_status: e.status,
      fixed_rate,
      scheduled_date: e.created_at,
      property_name: e.property?.name,
      property_address: e.property?.address,
      access_code: e.property?.access_code,
      instructions: e.property?.instructions,
      deposit_location: e.property?.deposit_location,
      property_lat: e.property?.latitude,
      property_lng: e.property?.longitude,
      is_emergency: true
    };
  });

  if (status) emergencies = emergencies.filter((e: any) => e.status === status);

  mergedMissions = [...mergedMissions, ...emergencies].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  if (forProvider && uid) {
    const { data: pp } = await supabase
      .from('provider_profiles')
      .select('specialties, radius_km, latitude, longitude')
      .eq('provider_id', uid)
      .single();

    // Get owner IDs that have this provider as a favorite
    const { data: favEntries } = await supabase
      .from('favorite_providers')
      .select('owner_id')
      .eq('provider_id', uid);
    const favoriteOfOwners = new Set((favEntries || []).map(f => f.owner_id));

    if (pp) {
      const { specialties = [], radius_km = 50, latitude: pLat, longitude: pLng } = pp;
      mergedMissions = mergedMissions.filter((m: any) => {
        if (m.is_emergency && m.accepted_provider_id && m.accepted_provider_id !== uid) return false;
        if (!m.is_emergency && m.assigned_provider_id && m.assigned_provider_id !== uid) return false;

        if (m.status === 'pending') {
          // Favorites 2H priority: hide from non-favorites during priority window
          if (m.favorites_only_until && !m.is_emergency) {
            const deadline = new Date(m.favorites_only_until);
            if (new Date() < deadline && !favoriteOfOwners.has(m.owner_id)) {
              return false; // Not a favorite, still in priority window
            }
          }

          if (specialties.length > 0 && !specialties.includes(m.mission_type)) return false;
          if (pLat && pLng && m.property_lat && m.property_lng) {
            const dist = haversineKm(pLat, pLng, m.property_lat, m.property_lng);
            if (dist > radius_km) return false;
          }
        }
        return true;
      });
    }
  }

  return mergedMissions;
};

export const createMission = async (data: any) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');

  const { data: prop } = await supabase.from('properties').select('fixed_rate').eq('id', data.property_id).single();

  // Check if owner has favorites
  const { data: favorites } = await supabase
    .from('favorite_providers')
    .select('provider_id')
    .eq('owner_id', session.user.id);

  const hasFavorites = favorites && favorites.length > 0;
  const favoritesOnlyUntil = hasFavorites
    ? new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString() // 2H priority
    : null;

  const { data: mission, error } = await supabase
    .from('missions')
    .insert({
      ...data,
      owner_id: session.user.id,
      fixed_rate: data.fixed_rate || prop?.fixed_rate,
      favorites_only_until: favoritesOnlyUntil,
      status: data.status || 'pending',
      assigned_provider_id: data.assigned_provider_id || null,
    })
    .select()
    .single();
  checkError(error);

  // Notify favorites first
  if (hasFavorites) {
    for (const fav of favorites!) {
      sendPushNotification(
        fav.provider_id,
        '⭐ Mission prioritaire',
        `Une mission vous est proposée en priorité pendant 2H. Répondez vite !`,
        { missionId: mission.id }
      );
    }
  }

  return mission;
};

export const getMission = async (id: string) => {
  const { data: mission, error } = await supabase
    .from('missions')
    .select('*, property:properties(name, address, access_code, instructions, deposit_location, linen_instructions), applications:mission_applications(*, provider:users!mission_applications_provider_id_fkey(name, picture, profile:provider_profiles(rating, total_reviews)))')
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

    mission.applications = mission.applications?.map((app: any) => {
      const profile = Array.isArray(app.provider?.profile) ? app.provider.profile[0] : app.provider?.profile;
      return {
        ...app,
        provider_name: app.provider?.name,
        provider_picture: app.provider?.picture,
        provider_rating: profile?.rating,
        provider_reviews: profile?.total_reviews,
      };
    });

    const { data: photosData } = await supabase
      .from('mission_photos')
      .select('photo_url, uploaded_at')
      .eq('mission_id', id)
      .order('uploaded_at', { ascending: false });
    mission.photos = photosData || [];
  }

  return mission;
};

export const applyToMission = async (missionId: string, data: any) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');

  // Check candidature limit (max 3 per mission)
  const { count } = await supabase
    .from('mission_applications')
    .select('id', { count: 'exact', head: true })
    .eq('mission_id', missionId)
    .neq('status', 'rejected');

  if ((count || 0) >= 3) {
    throw new Error('Cette mission a déjà atteint le nombre maximum de candidatures (3).');
  }

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

export const completeMission = async (missionId: string, photoUrls: string[] = []) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');

  // Insert photos if any
  if (photoUrls.length > 0) {
    const photoInserts = photoUrls.map(url => ({
      mission_id: missionId,
      provider_id: session.user.id,
      photo_url: url
    }));
    const { error: photoError } = await supabase.from('mission_photos').insert(photoInserts);
    checkError(photoError);
  }

  // Set status to awaiting_payment
  const { data, error } = await supabase
    .from('missions')
    .update({ status: 'awaiting_payment', completed_at: new Date().toISOString() })
    .eq('id', missionId)
    .select()
    .single();

  checkError(error);
  return data;
};

export const uploadMissionPhoto = async (missionId: string, uri: string): Promise<string> => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');

  const filename = `${missionId}/${session.user.id}/${Date.now()}.jpg`;

  const response = await fetch(uri);
  const blob = await response.blob();

  const { error } = await supabase.storage
    .from('mission_proofs')
    .upload(filename, blob, { contentType: 'image/jpeg' });

  if (error) throw new Error(`Erreur d'upload: ${error.message}`);

  const { data: publicUrlData } = supabase.storage.from('mission_proofs').getPublicUrl(filename);
  return publicUrlData.publicUrl;
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
    .select('*, property:properties(name, address, latitude, longitude)')
    .single();
  checkError(error);

  // Check if owner has favorites
  const { data: favorites } = await supabase
    .from('favorite_providers')
    .select('provider_id')
    .eq('owner_id', session.user.id);

  const favoriteIds = new Set((favorites || []).map(f => f.provider_id));
  const hasFavorites = favoriteIds.size > 0;

  // Notify providers (favorites first, then others after 2H via client-side filtering)
  try {
    const { data: providers } = await supabase
      .from('provider_profiles')
      .select('provider_id, specialties, radius_km, latitude, longitude, users!inner(expo_push_token)');

    if (providers && providers.length > 0 && req.property) {
      const pLat = req.property.latitude;
      const pLng = req.property.longitude;

      for (const p of providers) {
        const userRow = p.users as any;
        if (!userRow?.expo_push_token) continue;
        if (p.specialties && p.specialties.length > 0 && !p.specialties.includes(req.service_type)) continue;

        if (p.latitude && p.longitude && pLat && pLng) {
          const dist = haversineKm(p.latitude, p.longitude, pLat, pLng);
          if (dist > (p.radius_km || 50)) continue;
        }

        if (hasFavorites && !favoriteIds.has(p.provider_id)) {
          // Non-favorite: skip for now, they'll see it after 2H via getMissions filter
          continue;
        }

        const prefix = hasFavorites ? '⭐ ' : '';
        sendPushNotification(p.provider_id, `${prefix}🚨 Nouvelle Urgence`, `Une urgence ${req.service_type} a été déclarée à proximité. Répondez vite !`, { emergencyId: req.id });
      }
    }
  } catch (err) {
    console.warn('Failed to notify providers', err);
  }

  return req;
};

export const getEmergencies = async (forProvider?: boolean) => {
  const { data, error } = await supabase
    .from('emergency_requests')
    .select('*, property:properties(name, address, latitude, longitude), provider:users!emergency_requests_accepted_provider_id_fkey(name, picture)')
    .order('created_at', { ascending: false });

  checkError(error);
  console.log('[DEBUG-getEmergencies] RAW DATA:', data?.length);

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

      console.log('[DEBUG-getEmergencies] Provider Profile:', pp);

      if (pp) {
        const { specialties = [], radius_km = 50, latitude: pLat, longitude: pLng } = pp;
        emergencies = emergencies.filter((e: any) => {
          if (specialties.length > 0 && !specialties.includes(e.service_type)) {
            console.log(`[DEBUG-getEmergencies] Filtered (Specialty mismatch: ${e.service_type})`);
            return false;
          }
          if (pLat && pLng && e.property_lat && e.property_lng) {
            const dist = haversineKm(pLat, pLng, e.property_lat, e.property_lng);
            console.log(`[DEBUG-getEmergencies] Distance: ${dist}km (Max ${radius_km}km)`);
            if (dist > radius_km) {
              console.log(`[DEBUG-getEmergencies] Filtered (Too far: ${dist}km)`);
              return false;
            }
          } else {
            console.log(`[DEBUG-getEmergencies] Missing coords. Prop: ${e.property_lat}, Provider: ${pLat}`);
          }
          return true;
        });
      }
    }
  }

  console.log('[DEBUG-getEmergencies] FINAL RETURN:', emergencies.length);
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
    await supabase.functions.invoke('send-push', {
      body: { userId, title, body, data }
    });
  } catch (err) {
    // Non-blocking: push failures should never crash the app flow
    console.warn('[Push] Notification skipped:', err);
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
      .select('*, provider:users(name, picture, profile:provider_profiles(rating, total_reviews))')
      .eq('emergency_request_id', id)
      .order('created_at', { ascending: true });

    data.bids = (bids || []).map((b: any) => {
      // Because provider_profiles is stored as an array of 1 element when joined, or an object
      const profile = Array.isArray(b.provider?.profile) ? b.provider.profile[0] : b.provider?.profile;
      return {
        ...b,
        provider_name: b.provider?.name,
        provider_picture: b.provider?.picture,
        provider_rating: profile?.rating,
        provider_reviews: profile?.total_reviews,
      };
    });

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

  // Provider schedule is now derived from missions/emergencies directly
  // No separate table needed

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

export const createPaymentIntent = async (amount: number, metadata?: any, captureMethod: 'automatic' | 'manual' = 'automatic', destination?: string, applicationFeeAmount?: number) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');

  const { data, error } = await supabase.functions.invoke('create-payment-intent', {
    body: {
      amount: amount * 100,
      captureMethod,
      metadata,
      destination,
      application_fee_amount: applicationFeeAmount ? applicationFeeAmount * 100 : undefined
    }
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

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  // Fetch standard missions assigned to this provider
  const { data: missions, error: missionsError } = await supabase
    .from('missions')
    .select('id, mission_type, description, status, scheduled_date, property:properties(name, address)')
    .eq('assigned_provider_id', session.user.id)
    .gte('scheduled_date', startOfDay.toISOString());
  checkError(missionsError);

  // Fetch emergencies assigned to this provider
  const { data: emergencies, error: emError } = await supabase
    .from('emergency_requests')
    .select('id, service_type, description, status, created_at, property:properties(name, address)')
    .eq('accepted_provider_id', session.user.id)
    .gte('created_at', startOfDay.toISOString());
  checkError(emError);

  // Map and combine
  const formattedMissions = (missions || []).map((m: any) => ({
    id: m.id,
    mission_id: m.id,
    title: m.property?.name || 'Mission',
    address: m.property?.address || '',
    is_emergency: false,
    scheduled_at: m.scheduled_date || new Date().toISOString(),
    duration_minutes: 120, // default estimate
  }));

  const formattedEmergencies = (emergencies || []).map((e: any) => ({
    id: e.id,
    mission_id: e.id,
    title: e.property?.name || 'Urgence',
    address: e.property?.address || '',
    is_emergency: true,
    scheduled_at: e.created_at || new Date().toISOString(),
    duration_minutes: 60, // default estimate
  }));

  const combined = [...formattedMissions, ...formattedEmergencies];
  combined.sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());

  return combined;
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

export const getProviderProfile = async (providerId: string) => {
  const [userRes, profileRes] = await Promise.all([
    supabase.from('users').select('name, picture').eq('id', providerId).single(),
    supabase.from('provider_profiles').select('rating, total_reviews, specialties, bio, zone').eq('provider_id', providerId).single()
  ]);

  return {
    ...(userRes.data || {}),
    ...(profileRes.data || {})
  };
};

export const getProviderStats = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');
  const uid = session.user.id;

  const [profileRes, completedRes, inProgressRes, applicationsRes, recentRes, earningsRes,
    emCompletedRes, emInProgressRes, emEarningsRes, emQuotesRes] = await Promise.all([
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
      supabase.from('emergency_requests').select('id', { count: 'exact', head: true }).eq('accepted_provider_id', uid).eq('status', 'completed'),
      supabase.from('emergency_requests').select('id', { count: 'exact', head: true }).eq('accepted_provider_id', uid).neq('status', 'open').neq('status', 'completed'),
      supabase.from('emergency_requests').select('displacement_fee, diagnostic_fee, completed_at, id, service_type, description, property:properties(name)').eq('accepted_provider_id', uid).eq('status', 'completed').order('completed_at', { ascending: false }).limit(5),
      supabase.from('mission_quotes').select('repair_cost, emergency_request_id, emergency:emergency_requests!inner(status)').eq('provider_id', uid).eq('status', 'accepted').eq('emergency.status', 'completed')
    ]);

  const missionsEarnings = (earningsRes.data || []).reduce((sum: number, m: any) => sum + (m.fixed_rate || 0), 0);
  const emFees = (emEarningsRes.data || []).reduce((sum: number, e: any) => sum + (e.displacement_fee || 0) + (e.diagnostic_fee || 0), 0);
  const emQuotesEarnings = (emQuotesRes.data || []).reduce((sum: number, q: any) => sum + (q.repair_cost || 0), 0);

  const totalEarnings = profileRes.data?.total_earnings || (missionsEarnings + emFees + emQuotesEarnings);

  const rawRecentMissions = (recentRes.data || []).map((m: any) => ({
    ...m,
    mission_id: m.id,
    property_name: m.property?.name,
    is_emergency: false
  }));

  const rawRecentEmergencies = (emEarningsRes.data || []).map((e: any) => {
    const quote = (emQuotesRes.data || []).find((q: any) => q.emergency_request_id === e.id);
    const fixed_rate = (e.displacement_fee || 0) + (e.diagnostic_fee || 0) + (quote?.repair_cost || 0);
    return {
      mission_id: e.id,
      mission_type: e.service_type,
      description: e.description,
      fixed_rate,
      completed_at: e.completed_at,
      property_name: e.property?.name,
      is_emergency: true
    };
  });

  const recent = [...rawRecentMissions, ...rawRecentEmergencies]
    .sort((a, b) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime())
    .slice(0, 5);

  return {
    total_earnings: totalEarnings,
    rating: profileRes.data?.rating || 0,
    total_reviews: profileRes.data?.total_reviews || 0,
    completed_missions: (completedRes.count || 0) + (emCompletedRes.count || 0),
    in_progress_missions: (inProgressRes.count || 0) + (emInProgressRes.count || 0),
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

  const [propsRes, pendingRes, activeRes, upcomingRes, emPendingRes, emActiveRes, upcomingEmRes] = await Promise.all([
    supabase.from('properties').select('id', { count: 'exact', head: true }).eq('owner_id', uid),
    supabase.from('missions').select('id', { count: 'exact', head: true }).eq('owner_id', uid).eq('status', 'pending'),
    supabase.from('missions').select('id', { count: 'exact', head: true }).eq('owner_id', uid).in('status', ['assigned', 'in_progress']),
    supabase.from('missions')
      .select('id, status, mission_type, scheduled_date, fixed_rate, description, property:properties(name, address)')
      .eq('owner_id', uid)
      .neq('status', 'completed')
      .order('scheduled_date', { ascending: true, nullsFirst: false })
      .limit(5),
    supabase.from('emergency_requests').select('id', { count: 'exact', head: true }).eq('owner_id', uid).eq('status', 'open'),
    supabase.from('emergency_requests').select('id', { count: 'exact', head: true }).eq('owner_id', uid).neq('status', 'open').neq('status', 'completed'),
    supabase.from('emergency_requests')
      .select('id, status, service_type, created_at, displacement_fee, diagnostic_fee, description, property:properties(name, address)')
      .eq('owner_id', uid)
      .neq('status', 'completed')
      .order('created_at', { ascending: true })
      .limit(5),
  ]);

  const rawUpcomingMissions = (upcomingRes.data || []).map((m: any) => ({
    ...m,
    mission_id: m.id,
    property_name: m.property?.name,
    property_address: m.property?.address,
    is_emergency: false
  }));

  const rawUpcomingEmergencies = (upcomingEmRes.data || []).map((e: any) => {
    let mappedStatus = 'pending';
    if (e.status === 'open') mappedStatus = 'pending';
    else mappedStatus = 'assigned';

    return {
      mission_id: e.id,
      mission_type: e.service_type,
      status: mappedStatus,
      raw_status: e.status,
      fixed_rate: (e.displacement_fee || 0) + (e.diagnostic_fee || 0),
      scheduled_date: e.created_at,
      description: e.description,
      property_name: e.property?.name,
      property_address: e.property?.address,
      is_emergency: true
    };
  });

  const upcoming = [...rawUpcomingMissions, ...rawUpcomingEmergencies]
    .sort((a, b) => new Date(a.scheduled_date || Date.now()).getTime() - new Date(b.scheduled_date || Date.now()).getTime())
    .slice(0, 5);

  return {
    properties_count: propsRes.count || 0,
    pending_missions: (pendingRes.count || 0) + (emPendingRes.count || 0),
    active_missions: (activeRes.count || 0) + (emActiveRes.count || 0),
    upcoming_missions: upcoming,
  };
};

// Chat Messages
export const getMessages = async (missionId?: string, emergencyId?: string) => {
  if (!missionId && !emergencyId) return [];

  let query = supabase
    .from('messages')
    .select('*, sender:users!messages_sender_id_fkey(name, picture), receiver:users!messages_receiver_id_fkey(name, picture)')
    .order('created_at', { ascending: true });

  if (missionId) query = query.eq('mission_id', missionId);
  if (emergencyId) query = query.eq('emergency_id', emergencyId);

  const { data, error } = await query;
  if (error) {
    console.error('Error fetching messages:', error);
    return [];
  }
  return data || [];
};

export const sendMessage = async (content: string, receiverId: string, missionId?: string, emergencyId?: string) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');

  const { data, error } = await supabase.from('messages').insert({
    sender_id: session.user.id,
    receiver_id: receiverId,
    content,
    mission_id: missionId || null,
    emergency_id: emergencyId || null,
  }).select().single();

  checkError(error);
  return data;
};

// ─── Favorite Providers ───────────────────────────────────────────────────────

export const getFavoriteProviders = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('favorite_providers')
    .select('*, provider:users!favorite_providers_provider_id_fkey(id, name, picture, profile:provider_profiles(specialties, rating, total_reviews))')
    .eq('owner_id', session.user.id);
  checkError(error);
  return data || [];
};

export const addFavoriteProvider = async (providerId: string) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('favorite_providers')
    .insert({ owner_id: session.user.id, provider_id: providerId })
    .select()
    .single();
  checkError(error);
  return data;
};

export const removeFavoriteProvider = async (providerId: string) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('favorite_providers')
    .delete()
    .eq('owner_id', session.user.id)
    .eq('provider_id', providerId);
  checkError(error);
};

// ─── Stripe Connect ──────────────────────────────────────────────────────────

export const createStripeConnectAccount = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');

  const { data, error } = await supabase.functions.invoke('create-connect-account', {
    headers: { Authorization: `Bearer ${session.access_token}` },
    method: 'POST',
  });

  if (error) {
    if (data?.error) throw new Error(data.error);
    throw error;
  }
  if (data?.error) throw new Error(data.error);

  return data;
};

// ─── Partenaires locaux ────────────────────────────────────────────────────────

export const getPartners = async (zone?: string, category?: string) => {
  let query = supabase
    .from('local_partners')
    .select('*')
    .eq('is_active', true)
    .order('name');

  if (zone) query = query.eq('zone', zone);
  if (category) query = query.eq('category', category);

  const { data, error } = await query;
  checkError(error);
  return data || [];
};

export const createPartner = async (partner: {
  name: string;
  category: string;
  zone: string;
  description?: string;
  logo_url?: string;
  brochure_url?: string;
  phone?: string;
  website?: string;
  address?: string;
}) => {
  const { data, error } = await supabase
    .from('local_partners')
    .insert(partner)
    .select()
    .single();
  checkError(error);
  return data;
};

export const updatePartner = async (id: string, updates: Record<string, any>) => {
  const { data, error } = await supabase
    .from('local_partners')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  checkError(error);
  return data;
};

export const deletePartner = async (id: string) => {
  const { error } = await supabase
    .from('local_partners')
    .delete()
    .eq('id', id);
  checkError(error);
};

export const uploadPartnerFile = async (
  bucket: 'partner-logos' | 'partner-brochures',
  partnerId: string,
  uri: string,
  mimeType: string
): Promise<string> => {
  const ext = mimeType === 'application/pdf' ? 'pdf' : 'jpg';
  const path = `${partnerId}/${Date.now()}.${ext}`;

  const response = await fetch(uri);
  const blob = await response.blob();

  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, blob, { contentType: mimeType, upsert: true });
  checkError(error);

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
};

export const acceptDirectMission = async (missionId: string) => {
  const { data, error } = await supabase
    .from('missions')
    .update({ status: 'assigned' })
    .eq('id', missionId)
    .select()
    .single();
  checkError(error);
  return data;
};

export const rejectDirectMission = async (missionId: string) => {
  const { data, error } = await supabase
    .from('missions')
    .update({ status: 'rejected' })
    .eq('id', missionId)
    .select()
    .single();
  checkError(error);
  return data;
};

// ─── Admin API ────────────────────────────────────────────────────────────────

export const getAdminStats = async () => {
  const { data, error } = await supabase
    .from('admin_dashboard_stats')
    .select('*')
    .single();
  checkError(error);
  return data;
};

export const getAdminUsers = async (
  search: string = '',
  role: string = 'all',
  status: string = 'all',
) => {
  let query = supabase
    .from('users')
    .select('id, name, email, role, is_admin, suspended, created_at, onboarding_completed')
    .order('created_at', { ascending: false })
    .limit(100);

  if (search.trim()) {
    query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%`);
  }
  if (role !== 'all') {
    query = query.eq('role', role);
  }
  if (status === 'suspended') {
    query = query.eq('suspended', true);
  } else if (status === 'all') {
    // no extra filter — show all (active + suspended)
  }

  const { data, error } = await query;
  checkError(error);
  return data ?? [];
};

export const getAdminUserDetail = async (userId: string) => {
  const [userRes, providerRes, missionsRes, auditRes] = await Promise.all([
    supabase.from('users').select('*').eq('id', userId).single(),
    supabase.from('provider_profiles').select('*').eq('provider_id', userId).maybeSingle(),
    supabase.from('missions')
      .select('id, status, mission_type, scheduled_date, fixed_rate, created_at')
      .or(`owner_id.eq.${userId},assigned_provider_id.eq.${userId}`)
      .order('created_at', { ascending: false })
      .limit(10),
    supabase.from('audit_log')
      .select('*')
      .eq('target_id', userId)
      .order('created_at', { ascending: false })
      .limit(20),
  ]);
  return {
    user: userRes.data,
    provider: providerRes.data,
    missions: missionsRes.data ?? [],
    audit: auditRes.data ?? [],
  };
};

export const suspendUser = async (userId: string, reason: string = '') => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('users')
    .update({ suspended: true, suspended_at: new Date().toISOString(), suspended_reason: reason })
    .eq('id', userId);
  checkError(error);

  await supabase.from('audit_log').insert({
    admin_id: session.user.id,
    action: 'suspend_user',
    target_type: 'user',
    target_id: userId,
    metadata: { reason },
  });
};

export const reactivateUser = async (userId: string) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('users')
    .update({ suspended: false, suspended_at: null, suspended_reason: null })
    .eq('id', userId);
  checkError(error);

  await supabase.from('audit_log').insert({
    admin_id: session.user.id,
    action: 'reactivate_user',
    target_type: 'user',
    target_id: userId,
    metadata: {},
  });
};

export const approveProviderDocument = async (providerId: string, docType: string) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');

  const { data: profile, error: fetchErr } = await supabase
    .from('provider_profiles')
    .select('documents')
    .eq('provider_id', providerId)
    .single();
  checkError(fetchErr);

  const docs = (profile?.documents ?? []).map((d: any) =>
    d.type === docType ? { ...d, status: 'approved' } : d
  );
  const allApproved = docs.every((d: any) => d.status === 'approved');

  const { error } = await supabase
    .from('provider_profiles')
    .update({ documents: docs, verified: allApproved })
    .eq('provider_id', providerId);
  checkError(error);

  await supabase.from('audit_log').insert({
    admin_id: session.user.id,
    action: 'approve_doc',
    target_type: 'provider_profile',
    target_id: providerId,
    metadata: { doc_type: docType },
  });
};

export const rejectProviderDocument = async (providerId: string, docType: string, reason: string = '') => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');

  const { data: profile, error: fetchErr } = await supabase
    .from('provider_profiles')
    .select('documents')
    .eq('provider_id', providerId)
    .single();
  checkError(fetchErr);

  const docs = (profile?.documents ?? []).map((d: any) =>
    d.type === docType ? { ...d, status: 'rejected', reject_reason: reason } : d
  );

  const { error } = await supabase
    .from('provider_profiles')
    .update({ documents: docs, verified: false })
    .eq('provider_id', providerId);
  checkError(error);

  await supabase.from('audit_log').insert({
    admin_id: session.user.id,
    action: 'reject_doc',
    target_type: 'provider_profile',
    target_id: providerId,
    metadata: { doc_type: docType, reason },
  });
};

export const getAdminEmergencies = async () => {
  const { data, error } = await supabase
    .from('emergency_requests')
    .select('*, property:properties(name, address, latitude, longitude), owner:users!owner_id(name)')
    .order('created_at', { ascending: false })
    .limit(50);
  checkError(error);
  return data ?? [];
};

export const getAdminFinances = async () => {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const { data: missions, error } = await supabase
    .from('missions')
    .select('id, status, mission_type, fixed_rate, created_at, properties(name)')
    .order('created_at', { ascending: false })
    .limit(50);
  checkError(error);

  const all = missions ?? [];
  const thisMonth = all.filter(m => new Date(m.created_at) >= startOfMonth);
  const paid = all.filter(m => ['completed', 'awaiting_payment'].includes(m.status));
  const paidThisMonth = paid.filter(m => new Date(m.created_at) >= startOfMonth);

  return {
    commissions_this_month: paidThisMonth.reduce((s: number, m: any) => s + (m.fixed_rate ?? 0) * 0.10, 0),
    volume_this_month: paidThisMonth.reduce((s: number, m: any) => s + (m.fixed_rate ?? 0), 0),
    paid_missions_count: paid.length,
    total_volume: paid.reduce((s: number, m: any) => s + (m.fixed_rate ?? 0), 0),
    recent_missions: all.slice(0, 20).map((m: any) => ({
      ...m,
      property_name: m.properties?.name,
    })),
  };
};

export const getMonthlyVolume = async () => {
  const { data, error } = await supabase
    .from('missions')
    .select('fixed_rate, created_at, status')
    .in('status', ['completed', 'awaiting_payment']);
  checkError(error);

  const now = new Date();
  const months: { month: number; year: number; volume: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ month: d.getMonth() + 1, year: d.getFullYear(), volume: 0 });
  }

  (data ?? []).forEach((m: any) => {
    const d = new Date(m.created_at);
    const entry = months.find(mo => mo.month === d.getMonth() + 1 && mo.year === d.getFullYear());
    if (entry) entry.volume += m.fixed_rate ?? 0;
  });

  return months;
};

export const getAuditLog = async (targetId?: string) => {
  let query = supabase
    .from('audit_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);

  if (targetId) {
    query = query.eq('target_id', targetId);
  }

  const { data, error } = await query;
  checkError(error);
  return data ?? [];
};

export const logAuditAction = async (
  action: string,
  targetType: string,
  targetId?: string,
  metadata?: Record<string, any>,
) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return;

  await supabase.from('audit_log').insert({
    admin_id: session.user.id,
    action,
    target_type: targetType,
    target_id: targetId ?? null,
    metadata: metadata ?? {},
  });
};

export const exportCsvData = async (): Promise<string> => {
  const { data, error } = await supabase
    .from('missions')
    .select('id, status, mission_type, fixed_rate, created_at, properties(name, address)')
    .order('created_at', { ascending: false })
    .limit(500);
  checkError(error);

  const rows = data ?? [];
  const headers = 'Date,Mission ID,Type,Propriété,Adresse,Montant,Commission (10%),Statut';
  const lines = rows.map((m: any) => {
    const date = new Date(m.created_at).toLocaleDateString('fr-FR');
    const prop = m.properties?.name ?? '';
    const addr = m.properties?.address ?? '';
    const amount = m.fixed_rate ?? 0;
    const commission = (amount * 0.10).toFixed(2);
    return `${date},${m.id},${m.mission_type},"${prop}","${addr}",${amount},${commission},${m.status}`;
  });

  return [headers, ...lines].join('\n');
};
