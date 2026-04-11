/**
 * Mission-related API functions — extracted from api.ts
 */
import { supabase, checkError, captureError, unwrapJoin, getPropertyName, haversineKm, assertMissionTransition } from './_client';
import type { MissionStatus, CreateMissionPayload, ApplyToMissionPayload, MergedMission, MissionApplicationEnriched, SupabaseError, MissionRow, ApplicationRow, ProviderWithUser } from './_client';
import { sendPushNotification } from './notifications';
import { getEmergency } from './emergencies';
import { geocodeAddress } from './profile';


// Missions
export const getMissions = async (status?: string, missionType?: string, forProvider?: boolean) => {
  const { data: { session } } = await supabase.auth.getSession();
  const uid = session?.user?.id;

  let query = supabase.from('missions').select('*, property:properties(name, address, city, access_code, instructions, deposit_location, latitude, longitude)').order('created_at', { ascending: false });

  if (status) query = query.eq('status', status);
  if (missionType) query = query.eq('mission_type', missionType);

  const { data, error } = await query;
  checkError(error);

  let mergedMissions = (data || []).map((m) => ({
    ...m,
    mission_id: m.id,
    property_name: unwrapJoin(m.property)?.name,
    property_address: forProvider && (m.assigned_provider_id !== uid || ['pending', 'pending_provider_approval'].includes(m.status)) ? (unwrapJoin(m.property)?.city || '') : unwrapJoin(m.property)?.address,
    access_code: unwrapJoin(m.property)?.access_code,
    instructions: unwrapJoin(m.property)?.instructions,
    deposit_location: unwrapJoin(m.property)?.deposit_location,
    property_lat: unwrapJoin(m.property)?.latitude,
    property_lng: unwrapJoin(m.property)?.longitude,
    is_emergency: false
  }));

  let emQuery = supabase.from('emergency_requests').select('*, property:properties(name, address, city, access_code, instructions, deposit_location, latitude, longitude)').order('created_at', { ascending: false });
  if (missionType) emQuery = emQuery.eq('service_type', missionType);

  const { data: emData } = await emQuery;

  let emergencies = (emData || []).map((e) => {
    let mappedStatus = 'pending';
    if (e.status === 'bids_open') mappedStatus = 'pending';
    else if (e.status === 'provider_accepted' || e.status === 'bid_accepted') mappedStatus = 'assigned';
    else if (e.status === 'completed') mappedStatus = 'completed';
    else if (e.status === 'cancelled') mappedStatus = 'cancelled';
    else if (e.status === 'refunded') mappedStatus = 'refunded';
    else if (e.status === 'awaiting_payment' || e.status === 'quote_accepted' || e.status === 'quote_paid') mappedStatus = 'awaiting_payment';
    else mappedStatus = 'in_progress';

    const fixed_rate = (e.displacement_fee || 0) + (e.diagnostic_fee || 0);

    return {
      ...e,
      mission_id: e.id,
      mission_type: e.service_type,
      status: mappedStatus,
      raw_status: e.status,
      assigned_provider_id: e.accepted_provider_id,
      fixed_rate,
      scheduled_date: e.created_at,
      property_name: unwrapJoin(e.property)?.name,
      property_address: forProvider && e.accepted_provider_id !== uid ? (unwrapJoin(e.property)?.city || '') : unwrapJoin(e.property)?.address,
      access_code: (e.property as MissionRow['property'])?.access_code,
      instructions: (e.property as MissionRow['property'])?.instructions,
      deposit_location: (e.property as MissionRow['property'])?.deposit_location,
      property_lat: unwrapJoin(e.property)?.latitude,
      property_lng: unwrapJoin(e.property)?.longitude,
      is_emergency: true
    };
  });

  if (status) emergencies = emergencies.filter((e) => e.status === status);

  mergedMissions = ([...mergedMissions, ...emergencies] as typeof mergedMissions).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

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
      mergedMissions = mergedMissions.filter((m) => {
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

    // Fetch provider's emergency bids to attach status and filter cancelled
    const { data: myEmBids } = await supabase
      .from('emergency_bids')
      .select('emergency_request_id, status')
      .eq('provider_id', uid);
    const bidStatusMap = new Map<string, string>();
    (myEmBids || []).forEach((b: { emergency_request_id: string; status: string }) => {
      bidStatusMap.set(b.emergency_request_id, b.status);
    });

    mergedMissions = mergedMissions.map((m) => {
      if (m.is_emergency && bidStatusMap.has(m.mission_id)) {
        return { ...m, my_bid_status: bidStatusMap.get(m.mission_id) };
      }
      return m;
    }).filter((m) => !(m.is_emergency && m.my_bid_status === 'cancelled'));
  }

  return mergedMissions;
};

export const createMission = async (data: CreateMissionPayload) => {
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
      status: data.assigned_provider_id ? 'pending_provider_approval' : 'pending',
      assigned_provider_id: data.assigned_provider_id || null,
    })
    .select()
    .single();
  checkError(error);

  return mission;
};

export const getMission = async (id: string) => {
  const { data: mission, error } = await supabase
    .from('missions')
    .select('*, property:properties(name, address, city, access_code, instructions, deposit_location, linen_instructions, latitude, longitude), applications:mission_applications(*, provider:users!mission_applications_provider_id_fkey(name, picture, profile:provider_profiles(average_rating, total_reviews))), assigned_provider:users!missions_assigned_provider_id_fkey(name, picture)')
    .eq('id', id)
    .single();

  // If not found in missions, try emergency_requests (emergencies use the same detail screen)
  if (error && (error.code === 'PGRST116' || error.message?.includes('Cannot coerce'))) {
    const emergency = await getEmergency(id);
    if (emergency) {
      return {
        ...emergency,
        mission_id: emergency.id,
        mission_type: emergency.service_type,
        fixed_rate: (emergency.displacement_fee || 0) + (emergency.diagnostic_fee || 0) + (emergency.repair_cost || 0),
        assigned_provider_id: emergency.accepted_provider_id,
        is_emergency: true,
        applications: [],
        photos: [],
      };
    }
  }

  checkError(error);

  const { data: { session } } = await supabase.auth.getSession();
  const uid = session?.user?.id;
  const isAssigned = mission?.assigned_provider_id === uid;

  if (mission) {
    mission.property_name = mission.property?.name;
    // Confidentialité : adresse complète + coordonnées uniquement pour le proprio
    // ou le prestataire assigné (y compris favori en pending_provider_approval)
    const canSeeAddress = mission.owner_id === uid || isAssigned;
    mission.property_address = canSeeAddress ? mission.property?.address : (mission.property?.city || '');
    mission.property_city = mission.property?.city;

    // Auto-géocodage si la propriété n'a pas encore de coordonnées GPS
    // On utilise l'adresse complète (disponible en DB côté serveur) pour une précision maximale
    if (!mission.property?.latitude && mission.property?.address) {
      const coords = await geocodeAddress(mission.property.address);
      if (coords) {
        supabase.from('properties')
          .update({ latitude: coords.lat, longitude: coords.lng })
          .eq('id', mission.property_id)
          .then(() => {});
        // Injecter les coords dans l'objet property pour cette requête
        (mission.property as Record<string, unknown>).latitude = coords.lat;
        (mission.property as Record<string, unknown>).longitude = coords.lng;
      }
    }

    // Coordinates: visible to owner, assigned provider, or any provider on browsable missions
    const canSeeCoords = canSeeAddress || mission.status === 'pending_provider_approval';
    mission.property_lat = canSeeCoords ? mission.property?.latitude : undefined;
    mission.property_lng = canSeeCoords ? mission.property?.longitude : undefined;
    mission.access_code = mission.property?.access_code;
    mission.instructions = mission.property?.instructions;
    mission.deposit_location = mission.property?.deposit_location;
    mission.linen_instructions = mission.property?.linen_instructions;

    mission.applications = (mission.applications as { id: string; provider_id: string; proposed_rate?: number; message?: string; status: string; created_at: string; provider?: { name?: string; picture?: string; profile?: { average_rating?: number; total_reviews?: number } | { average_rating?: number; total_reviews?: number }[] } | { name?: string; picture?: string; profile?: { average_rating?: number; total_reviews?: number } | { average_rating?: number; total_reviews?: number }[] }[] }[] | undefined)?.map((app) => {
      const prov = unwrapJoin(app.provider);
      const profile = Array.isArray(prov?.profile) ? prov.profile[0] : prov?.profile;
      return {
        ...app,
        provider_name: prov?.name,
        provider_picture: prov?.picture,
        provider_rating: profile?.average_rating,
        provider_reviews: profile?.total_reviews,
      };
    });

    const { data: photosData, error: photosError } = await supabase
      .from('mission_photos')
      .select('photo_url, uploaded_at')
      .eq('mission_id', id)
      .order('uploaded_at', { ascending: false });
    if (photosError && __DEV__) console.warn('mission_photos query error:', photosError.message, photosError.code);
    mission.photos = photosData || [];

    const ap = unwrapJoin(mission.assigned_provider as unknown);
    mission.assigned_provider_name = (ap as { name?: string } | null)?.name;
    mission.assigned_provider_picture = (ap as { picture?: string } | null)?.picture;
  }

  return mission;
};

export const applyToMission = async (missionId: string, data: ApplyToMissionPayload) => {
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

  // Vérifier que la mission est bien en 'pending_provider_approval' (anti-pattern #8)
  const { data: missionCheck } = await supabase
    .from('missions')
    .select('status')
    .eq('id', missionId)
    .single();
  if (!missionCheck || !['pending', 'pending_provider_approval'].includes(missionCheck.status)) {
    throw new Error('Cette mission n\'est plus disponible pour candidature.');
  }

  // Guard: empêcher les candidatures en double
  const { count: existingCount } = await supabase
    .from('mission_applications')
    .select('id', { count: 'exact', head: true })
    .eq('mission_id', missionId)
    .eq('provider_id', session.user.id)
    .neq('status', 'rejected');
  if ((existingCount || 0) > 0) {
    throw new Error('Vous avez déjà postulé pour cette mission.');
  }

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

  // Notifier le propriétaire de la mission
  const { data: mission } = await supabase
    .from('missions')
    .select('owner_id, mission_type, provider:users!missions_assigned_provider_id_fkey(name)')
    .eq('id', missionId)
    .single();

  if (mission?.owner_id) {
    const { data: providerUser } = await supabase
      .from('users')
      .select('name')
      .eq('id', session.user.id)
      .single();
    sendPushNotification(
      mission.owner_id,
      '📋 Nouvelle candidature',
      `${providerUser?.name || 'Un prestataire'} a postulé à votre mission de ${mission.mission_type || 'service'}.`,
      { missionId }
    ).catch(err => captureError(err, { context: 'push-notification-new-application', userId: mission.owner_id }));
  }

  return app;
};

/**
 * Provider declines a broadcast mission (no assigned_provider_id).
 * Inserts a mission_applications row with status='declined' and notifies
 * the owner that this provider isn't available, so they can expand the zone.
 */
export const declineBroadcastMission = async (missionId: string) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');

  // Sanity: only for broadcast missions in pending_provider_approval
  const { data: missionCheck } = await supabase
    .from('missions')
    .select('status, assigned_provider_id')
    .eq('id', missionId)
    .single();
  if (!missionCheck || !['pending', 'pending_provider_approval'].includes(missionCheck.status)) {
    throw new Error('Cette mission n\'est plus ouverte.');
  }
  if (missionCheck.assigned_provider_id) {
    throw new Error('Cette mission n\'est pas en broadcast.');
  }

  // Prevent duplicate decline
  const { count: existingCount } = await supabase
    .from('mission_applications')
    .select('id', { count: 'exact', head: true })
    .eq('mission_id', missionId)
    .eq('provider_id', session.user.id);
  if ((existingCount || 0) > 0) {
    throw new Error('Vous avez déjà répondu à cette mission.');
  }

  const { data, error } = await supabase
    .from('mission_applications')
    .insert({
      mission_id: missionId,
      provider_id: session.user.id,
      status: 'declined',
    })
    .select()
    .single();
  checkError(error);

  // Owner notification is handled server-side via the
  // notify_owner_on_broadcast_decline trigger on mission_applications.
  return data;
};

/**
 * Owner widens the broadcast zone for a mission to 30 km and re-notifies
 * providers in the expanded radius (skipping those who already replied).
 */
export const expandMissionZone = async (missionId: string) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');

  const { error: updateError } = await supabase
    .from('missions')
    .update({ zone_radius_km: 30 })
    .eq('id', missionId)
    .eq('owner_id', session.user.id);
  checkError(updateError);

  const { error: rpcError } = await supabase.rpc('rebroadcast_mission_to_wider_zone', {
    p_mission_id: missionId,
  });
  if (rpcError) throw new Error(rpcError.message);
};

export const getMyApplications = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('mission_applications')
    .select('*, mission:missions!mission_applications_mission_id_fkey(*, property:properties(name, address, city))')
    .eq('provider_id', session.user.id)
    .in('status', ['pending', 'accepted'])
    .order('created_at', { ascending: false });

  checkError(error);

  return (data || []).map((app) => ({
    ...app,
    mission_id: unwrapJoin(app.mission)?.id,
    mission_type: unwrapJoin(app.mission)?.mission_type,
    property_name: unwrapJoin(unwrapJoin(app.mission)?.property)?.name,
    property_address: unwrapJoin(unwrapJoin(app.mission)?.property)?.city || unwrapJoin(unwrapJoin(app.mission)?.property)?.address,
    description: unwrapJoin(app.mission)?.description,
    scheduled_date: unwrapJoin(app.mission)?.scheduled_date,
    fixed_rate: app.proposed_rate || unwrapJoin(app.mission)?.fixed_rate,
    mission_status: unwrapJoin(app.mission)?.status,
  }));
};

export const handleApplication = async (missionId: string, appId: string, action: string) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');
  const status = action === 'accept' ? 'accepted' : 'rejected';
  const { data, error } = await supabase
    .from('mission_applications')
    .update({ status })
    .eq('id', appId)
    .eq('status', 'pending')
    .select()
    .single();
  checkError(error);

  if (status === 'accepted') {
    // Reject all others
    await supabase.from('mission_applications').update({ status: 'rejected' }).eq('mission_id', missionId).neq('id', appId);
    // Assign provider
    const { data: mission } = await supabase
      .from('missions')
      .select('mission_type, property:properties(name)')
      .eq('id', missionId)
      .single() as { data: Record<string, unknown> | null; error: SupabaseError | null };
    // R3: Mission must be in pending or pending_provider_approval to transition to assigned
    const { error: assignError } = await supabase
      .from('missions')
      .update({ status: 'assigned', assigned_provider_id: data.provider_id })
      .eq('id', missionId)
      .eq('owner_id', session.user.id)
      .in('status', ['pending', 'pending_provider_approval'])
      .select()
      .single();
    if (assignError) {
      throw new Error('Impossible d\'assigner la mission au prestataire');
    }
    // Notifications are now handled server-side via DB trigger (trg_notify_mission_status)
    // Fire-and-forget Google Calendar sync
    supabase.functions.invoke('sync-google-calendar', {
      body: { mission_id: missionId, action: 'create' },
    }).catch(err => captureError(err, { context: 'google-calendar-sync', missionId }));
  } else {
    // Application rejection notification — handled via application_applications trigger (not mission status)
    sendPushNotification(
      data.provider_id,
      '❌ Candidature non retenue',
      `Votre candidature n'a pas été retenue cette fois. D'autres missions sont disponibles.`,
      { missionId }
    ).catch(err => captureError(err, { context: 'push-notification-application-rejected', userId: data.provider_id }));
  }
  return { message: `Application ${status}` };
};

export const startMission = async (missionId: string) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');

  // State machine guard
  assertMissionTransition('assigned', 'in_progress');

  // R3: Vérifier que la mission est bien en 'assigned' et que c'est le bon provider
  const { data, error } = await supabase
    .from('missions')
    .update({ status: 'in_progress', started_at: new Date().toISOString() })
    .eq('id', missionId)
    .eq('status', 'assigned')
    .eq('assigned_provider_id', session.user.id)
    .select('*, owner_id, mission_type, property:properties(name)')
    .single();
  if (error || !data) throw new Error('Impossible de démarrer cette mission. Vérifiez qu\'elle vous est bien assignée.');

  // Notifications are now handled server-side via DB trigger (trg_notify_mission_status)

  return data;
};

export const completeMission = async (missionId: string, photoUrls: string[] = []) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');

  // State machine guard
  assertMissionTransition('in_progress', 'awaiting_payment');

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

  // R3: Vérifier que la mission est bien en 'in_progress' et que c'est le bon provider
  const { data, error } = await supabase
    .from('missions')
    .update({ status: 'awaiting_payment', completed_at: new Date().toISOString() })
    .eq('id', missionId)
    .eq('status', 'in_progress')
    .eq('assigned_provider_id', session.user.id)
    .select('*, owner_id, mission_type, property:properties(name)')
    .single();

  checkError(error);

  // Notifications are now handled server-side via DB trigger (trg_notify_mission_status)

  return data;
};

export const uploadMissionPhoto = async (missionId: string, uri: string): Promise<string> => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');

  // Import dynamique pour éviter le crash en Expo Go
  const { compressImage } = await import('../utils/image-compress');

  const filename = `${missionId}/${session.user.id}/${Date.now()}.jpg`;

  // Compress image before upload (1200px max width, 70% quality)
  const compressedUri = await compressImage(uri);

  // Read file as ArrayBuffer (reliable on React Native)
  const response = await fetch(compressedUri);
  if (!response.ok) throw new Error(`Impossible de lire le fichier (${response.status})`);
  const arrayBuffer = await response.arrayBuffer();

  const { error } = await supabase.storage
    .from('mission_proofs')
    .upload(filename, arrayBuffer, { contentType: 'image/jpeg' });

  if (error) throw new Error(`Erreur d'upload: ${error.message}`);

  const { data: publicUrlData } = supabase.storage.from('mission_proofs').getPublicUrl(filename);
  return publicUrlData.publicUrl;
};

export const addMissionPhoto = async (missionId: string, uri: string): Promise<{ photo_url: string; uploaded_at: string }> => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');

  const uploadedUrl = await uploadMissionPhoto(missionId, uri);

  const { data, error } = await supabase.from('mission_photos').insert({
    mission_id: missionId,
    provider_id: session.user.id,
    photo_url: uploadedUrl,
  }).select('photo_url, uploaded_at').single();
  checkError(error);
  return data!;
};

export const acceptDirectMission = async (missionId: string) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('missions')
    .update({ status: 'assigned' })
    .eq('id', missionId)
    .eq('assigned_provider_id', session.user.id)
    .eq('status', 'pending_provider_approval')
    .select('*, owner:users!missions_owner_id_fkey(name), provider:users!missions_assigned_provider_id_fkey(name)')
    .single();
  if (error || !data) throw new Error('Impossible d\'accepter cette mission. Vérifiez qu\'elle vous est bien attribuée.');

  // Notifications are now handled server-side via DB trigger (trg_notify_mission_status)

  // Fire-and-forget: sync to Google Calendar (silently ignored if not connected)
  supabase.functions.invoke('sync-google-calendar', {
    body: { mission_id: missionId, action: 'create' },
  }).catch(err => captureError(err, { context: 'google-calendar-sync', missionId }));
  return data;
};

export const rejectDirectMission = async (missionId: string) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('missions')
    .update({ status: 'rejected', assigned_provider_id: null })
    .eq('id', missionId)
    .eq('assigned_provider_id', session.user.id)
    .eq('status', 'pending_provider_approval')
    .select('*, provider:users!missions_assigned_provider_id_fkey(name)')
    .single();
  if (error || !data) throw new Error('Impossible de refuser cette mission.');

  // Notifications are now handled server-side via DB trigger (trg_notify_mission_status)

  return data;
};

export const getProviderDaySchedule = async (providerId: string, date: string) => {
  const startOfDay = `${date}T00:00:00`;
  const endOfDay = `${date}T23:59:59`;

  const { data, error } = await supabase
    .from('missions')
    .select('id, status, scheduled_date, mission_type, property:properties(id, name, address, latitude, longitude)')
    .eq('assigned_provider_id', providerId)
    .gte('scheduled_date', startOfDay)
    .lte('scheduled_date', endOfDay)
    .in('status', ['assigned', 'in_progress', 'awaiting_payment'])
    .order('scheduled_date', { ascending: true });
  checkError(error);

  return (data || []).map((m) => {
    const prop = unwrapJoin(m.property);
    return {
      id: m.id,
      status: m.status,
      scheduled_date: m.scheduled_date,
      mission_type: m.mission_type,
      property: prop ? {
        id: (prop as { id: string }).id,
        name: (prop as { name: string }).name,
        address: (prop as { address: string }).address,
        latitude: (prop as { latitude: number | null }).latitude,
        longitude: (prop as { longitude: number | null }).longitude,
      } : null,
    };
  });
};

export const addMissionExtraHours = async (missionId: string, newRate: number) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('missions')
    .update({ fixed_rate: newRate })
    .eq('id', missionId)
    .eq('owner_id', session.user.id)
    .eq('status', 'in_progress');
  checkError(error);
};

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
      .neq('status', 'cancelled')
      .neq('status', 'refunded')
      .order('scheduled_date', { ascending: true, nullsFirst: false })
      .limit(5),
    supabase.from('emergency_requests').select('id', { count: 'exact', head: true }).eq('owner_id', uid).eq('status', 'bids_open'),
    supabase.from('emergency_requests').select('id', { count: 'exact', head: true }).eq('owner_id', uid).neq('status', 'bids_open').neq('status', 'completed').neq('status', 'cancelled').neq('status', 'refunded'),
    supabase.from('emergency_requests')
      .select('id, status, service_type, created_at, displacement_fee, diagnostic_fee, description, property:properties(name, address)')
      .eq('owner_id', uid)
      .neq('status', 'completed')
      .neq('status', 'cancelled')
      .neq('status', 'refunded')
      .order('created_at', { ascending: true })
      .limit(5),
  ]);

  const rawUpcomingMissions = (upcomingRes.data || []).map((m) => ({
    ...m,
    mission_id: m.id,
    property_name: unwrapJoin(m.property)?.name,
    property_address: unwrapJoin(m.property)?.address,
    is_emergency: false
  }));

  const rawUpcomingEmergencies = (upcomingEmRes.data || []).map((e) => {
    let mappedStatus = 'pending';
    if (e.status === 'bids_open') mappedStatus = 'pending';
    else if (e.status === 'provider_accepted' || e.status === 'bid_accepted') mappedStatus = 'assigned';
    else if (e.status === 'cancelled') mappedStatus = 'cancelled';
    else if (e.status === 'refunded') mappedStatus = 'refunded';
    else if (e.status === 'completed') mappedStatus = 'completed';
    else mappedStatus = 'in_progress';

    return {
      mission_id: e.id,
      mission_type: e.service_type,
      status: mappedStatus,
      raw_status: e.status,
      fixed_rate: (e.displacement_fee || 0) + (e.diagnostic_fee || 0),
      scheduled_date: e.created_at,
      description: e.description,
      property_name: unwrapJoin(e.property)?.name,
      property_address: unwrapJoin(e.property)?.address,
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

// ── Cancel mission (owner only, statuses: pending or assigned) ──
export const cancelMission = async (missionId: string) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');

  const { data: mission, error: fetchErr } = await supabase
    .from('missions')
    .select('status, owner_id, assigned_provider_id, mission_type, property:properties(name)')
    .eq('id', missionId)
    .eq('owner_id', session.user.id)
    .single();

  if (fetchErr || !mission) throw new Error('Mission introuvable');
  assertMissionTransition(mission.status as MissionStatus, 'cancelled');

  // Use the current status from DB (already validated by assertMissionTransition above)
  const { data: updated, error } = await supabase
    .from('missions')
    .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
    .eq('id', missionId)
    .eq('owner_id', session.user.id)
    .eq('status', mission.status)
    .select();
  checkError(error);
  if (!updated || updated.length === 0) throw new Error('Cette mission ne peut plus être annulée');

  // Notifications are now handled server-side via DB trigger (trg_notify_mission_status)
};

// ── Validate mission without paying yet (owner only, status: awaiting_payment → validated) ──
export const validateMission = async (missionId: string) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');

  const { data: mission, error: fetchErr } = await supabase
    .from('missions')
    .select('status, owner_id, assigned_provider_id, mission_type, property:properties(name)')
    .eq('id', missionId)
    .eq('owner_id', session.user.id)
    .single();

  if (fetchErr || !mission) throw new Error('Mission introuvable');
  assertMissionTransition(mission.status as MissionStatus, 'validated');

  const { error } = await supabase
    .from('missions')
    .update({ status: 'validated', validated_at: new Date().toISOString() })
    .eq('id', missionId)
    .eq('status', 'awaiting_payment')
    .eq('owner_id', session.user.id);
  checkError(error);

  // Notifications are now handled server-side via DB trigger (trg_notify_mission_status)
};

// ── Open dispute (owner only, status: awaiting_payment → dispute) ──
export const openDispute = async (missionId: string, reason: string) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');

  const { data: mission, error: fetchErr } = await supabase
    .from('missions')
    .select('status, owner_id, assigned_provider_id, mission_type, property:properties(name)')
    .eq('id', missionId)
    .eq('owner_id', session.user.id)
    .single();

  if (fetchErr || !mission) throw new Error('Mission introuvable');
  assertMissionTransition(mission.status as MissionStatus, 'dispute');

  const { error } = await supabase
    .from('missions')
    .update({ status: 'dispute', dispute_reason: reason, dispute_at: new Date().toISOString() })
    .eq('id', missionId)
    .eq('status', 'awaiting_payment')
    .eq('owner_id', session.user.id);
  checkError(error);

  // Notifications are now handled server-side via DB trigger (trg_notify_mission_status)
};

// ── Republish expired mission (owner only, status: expired → pending) ──
export const republishMission = async (missionId: string) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');

  const { data: mission, error: fetchErr } = await supabase
    .from('missions')
    .select('status, owner_id')
    .eq('id', missionId)
    .eq('owner_id', session.user.id)
    .single();

  if (fetchErr || !mission) throw new Error('Mission introuvable');
  assertMissionTransition(mission.status as MissionStatus, 'pending');

  const { error } = await supabase
    .from('missions')
    .update({ status: 'pending', expired_at: null })
    .eq('id', missionId)
    .eq('status', 'expired')
    .eq('owner_id', session.user.id);
  checkError(error);
};

// ── Quotes ──────────────────────────────────────────────────────────────────────

export const getQuoteDetails = async (quoteId: string) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');

  const { data: quote, error: qError } = await supabase
    .from('mission_quotes')
    .select('*, provider:users!mission_quotes_provider_id_fkey(name, picture, email, siren, company_name, profile:provider_profiles(average_rating, total_reviews, specialties, bio, zone))')
    .eq('id', quoteId)
    .single();
  checkError(qError);
  if (!quote) throw new Error('Devis introuvable');

  const providerProfile = Array.isArray(quote.provider?.profile)
    ? quote.provider.profile[0]
    : quote.provider?.profile;

  const { data: lineItems } = await supabase
    .from('quote_line_items')
    .select('*')
    .eq('quote_id', quoteId)
    .order('sort_order', { ascending: true });

  let mission = null;
  let emergency = null;

  if (quote.mission_id) {
    const { data: m } = await supabase
      .from('missions')
      .select('id, mission_type, description, scheduled_at, property:properties(name, address)')
      .eq('id', quote.mission_id)
      .single();
    mission = m;
  }

  if (quote.emergency_request_id) {
    const { data: e } = await supabase
      .from('emergency_requests')
      .select('id, service_type, description, property:properties(name, address)')
      .eq('id', quote.emergency_request_id)
      .single();
    emergency = e;
  }

  return {
    ...quote,
    provider_name: quote.provider?.name,
    provider_picture: quote.provider?.picture,
    provider_email: quote.provider?.email,
    provider_rating: providerProfile?.rating,
    provider_reviews: providerProfile?.total_reviews,
    provider_specialties: providerProfile?.specialties || [],
    provider_bio: providerProfile?.bio,
    provider_zone: providerProfile?.zone,
    provider_siret: quote.provider?.siren,
    provider_company: quote.provider?.company_name,
    line_items: lineItems || [],
    mission,
    emergency,
  };
};

export const acceptQuote = async (quoteId: string, missionId?: string, emergencyId?: string) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');

  const now = new Date().toISOString();

  const { error: qError } = await supabase
    .from('mission_quotes')
    .update({
      status: 'accepted',
      accepted_at: now,
      accepted_by: session.user.id,
      owner_signature_at: now,
      owner_signature_text: 'Bon pour accord — Devis reçu avant l\'exécution des travaux',
    })
    .eq('id', quoteId);
  checkError(qError);

  if (emergencyId) {
    const { error: emError } = await supabase
      .from('emergency_requests')
      .update({ status: 'quote_accepted' })
      .eq('id', emergencyId)
      .in('status', ['quote_sent', 'quote_submitted']);
    checkError(emError);
  }

  if (missionId) {
    const { error: mError } = await supabase
      .from('missions')
      .update({ status: 'quote_accepted' })
      .eq('id', missionId)
      .in('status', ['quote_sent', 'quote_submitted']);
    checkError(mError);
  }

  const { data: quote } = await supabase
    .from('mission_quotes')
    .select('provider_id, repair_cost')
    .eq('id', quoteId)
    .single();
  if (quote?.provider_id) {
    sendPushNotification(
      quote.provider_id,
      'Devis accepté',
      `Votre devis de ${quote.repair_cost}€ a été accepté par le propriétaire.`,
      { quoteId, emergencyId, missionId }
    ).catch(err => captureError(err, { context: 'push-notification-quote-accepted', userId: quote.provider_id }));
  }

  return { ok: true };
};

export const refuseQuote = async (quoteId: string, reason?: string) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');

  const { error: qError } = await supabase
    .from('mission_quotes')
    .update({ status: 'refused', refusal_reason: reason || null })
    .eq('id', quoteId);
  checkError(qError);

  const { data: quote } = await supabase
    .from('mission_quotes')
    .select('provider_id, emergency_request_id, mission_id, repair_cost')
    .eq('id', quoteId)
    .single();

  if (quote?.emergency_request_id) {
    await supabase
      .from('emergency_requests')
      .update({ status: 'quote_refused' })
      .eq('id', quote.emergency_request_id)
      .eq('status', 'quote_sent');
  }

  if (quote?.mission_id) {
    await supabase
      .from('missions')
      .update({ status: 'quote_refused' })
      .eq('id', quote.mission_id)
      .eq('status', 'quote_sent');
  }

  if (quote?.provider_id) {
    sendPushNotification(
      quote.provider_id,
      'Devis refusé',
      `Votre devis de ${quote?.repair_cost || 0}€ a été refusé par le propriétaire.${reason ? ` Motif : ${reason}` : ''}`,
      { quoteId, emergencyId: quote.emergency_request_id, missionId: quote.mission_id }
    ).catch(err => captureError(err, { context: 'push-notification-quote-refused', userId: quote.provider_id }));
  }

  return { ok: true };
};

export const submitQuoteWithLines = async (data: {
  missionId?: string;
  emergencyId?: string;
  lines: Array<{
    type: string;
    description: string;
    quantity: number;
    unit: string;
    unit_price_ht: number;
  }>;
  validity_days: number;
  estimated_start_date?: string;
  estimated_duration?: string;
  description?: string;
  is_renovation: boolean;
  is_vat_exempt: boolean;
}) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');

  const totalHT = data.lines.reduce((sum, l) => sum + l.quantity * l.unit_price_ht, 0);

  // Parse French date (DD/MM/YYYY) to ISO for TIMESTAMPTZ column
  let isoStartDate: string | null = null;
  if (data.estimated_start_date) {
    const parts = data.estimated_start_date.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
    if (parts) {
      const [, dd, mm, yyyy] = parts;
      isoStartDate = `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
    } else {
      // Already ISO or other format — pass as-is
      isoStartDate = data.estimated_start_date;
    }
  }

  const quotePayload: Record<string, unknown> = {
    provider_id: session.user.id,
    description: data.description || '',
    repair_cost: totalHT,
    repair_delay_days: data.validity_days,
    status: 'pending',
    estimated_start_date: isoStartDate,
    estimated_duration: data.estimated_duration || null,
    is_renovation: data.is_renovation,
    tva_rate: data.is_vat_exempt ? 0 : (data.is_renovation ? 0.10 : 0.20),
    is_vat_exempt: data.is_vat_exempt,
    validity_days: data.validity_days,
  };

  if (data.emergencyId) {
    quotePayload.emergency_request_id = data.emergencyId;
  }
  if (data.missionId) {
    quotePayload.mission_id = data.missionId;
  }

  const { data: quote, error: qError } = await supabase
    .from('mission_quotes')
    .insert(quotePayload)
    .select()
    .single();
  checkError(qError);

  if (quote && data.lines.length > 0) {
    const lineItems = data.lines.map((line, index) => ({
      quote_id: quote.id,
      sort_order: index,
      type: line.type,
      description: line.description,
      quantity: line.quantity,
      unit: line.unit,
      unit_price_ht: line.unit_price_ht,
    }));

    const { error: lError } = await supabase
      .from('quote_line_items')
      .insert(lineItems);
    checkError(lError);
  }

  try {
    const { data: docData, error: genError } = await supabase.functions.invoke('generate-quote', {
      body: {
        quoteId: quote.id,
        missionId: data.missionId || null,
        emergencyId: data.emergencyId || null,
      },
    });
    if (genError) {
      console.warn('[submitQuoteWithLines] generate-quote error:', JSON.stringify(genError));
    }

    const generatedUrl = docData?.document_url || docData?.url;
    if (generatedUrl && quote) {
      await supabase
        .from('mission_quotes')
        .update({ quote_document_url: generatedUrl })
        .eq('id', quote.id);
    }
  } catch (e) {
    console.warn('[submitQuoteWithLines] generate-quote failed:', e);
  }

  if (data.emergencyId) {
    // quote_submitted → then auto-advance to quote_sent (document generated + owner notified)
    await supabase
      .from('emergency_requests')
      .update({ status: 'quote_submitted' })
      .eq('id', data.emergencyId)
      .in('status', ['on_site', 'provider_accepted', 'displacement_paid']);
    await supabase
      .from('emergency_requests')
      .update({ status: 'quote_sent' })
      .eq('id', data.emergencyId)
      .eq('status', 'quote_submitted');
  }

  if (data.missionId) {
    // quote_submitted → then auto-advance to quote_sent (document generated + owner notified)
    await supabase
      .from('missions')
      .update({ status: 'quote_submitted' })
      .eq('id', data.missionId)
      .in('status', ['in_progress', 'accepted', 'assigned']);
    await supabase
      .from('missions')
      .update({ status: 'quote_sent' })
      .eq('id', data.missionId)
      .eq('status', 'quote_submitted');
  }

  const ownerId = data.emergencyId
    ? (await supabase.from('emergency_requests').select('owner_id').eq('id', data.emergencyId).single()).data?.owner_id
    : (await supabase.from('missions').select('owner_id').eq('id', data.missionId!).single()).data?.owner_id;

  if (ownerId) {
    sendPushNotification(
      ownerId,
      'Nouveau devis reçu',
      `Un prestataire vous a envoyé un devis de ${totalHT.toFixed(2)}€ HT.`,
      { missionId: data.missionId, emergencyId: data.emergencyId, quoteId: quote.id }
    ).catch(err => captureError(err, { context: 'push-notification-new-quote', userId: ownerId }));
  }

  return quote;
};
