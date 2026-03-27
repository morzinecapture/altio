/**
 * Mission-related API functions — extracted from api.ts
 */
import { supabase, checkError, captureError, unwrapJoin, getPropertyName, haversineKm, assertMissionTransition } from './_client';
import type { MissionStatus, CreateMissionPayload, ApplyToMissionPayload, MergedMission, MissionApplicationEnriched, SupabaseError, MissionRow, ApplicationRow, ProviderWithUser } from './_client';
import { sendPushNotification } from './notifications';
import { getEmergency } from './emergencies';

// Missions
export const getMissions = async (status?: string, missionType?: string, forProvider?: boolean) => {
  const { data: { session } } = await supabase.auth.getSession();
  const uid = session?.user?.id;

  let query = supabase.from('missions').select('*, property:properties(name, address, access_code, instructions, deposit_location, latitude, longitude)').order('created_at', { ascending: false });

  if (status) query = query.eq('status', status);
  if (missionType) query = query.eq('mission_type', missionType);

  const { data, error } = await query;
  checkError(error);

  let mergedMissions = (data || []).map((m) => ({
    ...m,
    mission_id: m.id,
    property_name: unwrapJoin(m.property)?.name,
    property_address: unwrapJoin(m.property)?.address,
    access_code: unwrapJoin(m.property)?.access_code,
    instructions: unwrapJoin(m.property)?.instructions,
    deposit_location: unwrapJoin(m.property)?.deposit_location,
    property_lat: unwrapJoin(m.property)?.latitude,
    property_lng: unwrapJoin(m.property)?.longitude,
    is_emergency: false
  }));

  let emQuery = supabase.from('emergency_requests').select('*, property:properties(name, address, access_code, instructions, deposit_location, latitude, longitude)').order('created_at', { ascending: false });
  if (missionType) emQuery = emQuery.eq('service_type', missionType);

  const { data: emData } = await emQuery;

  let emergencies = (emData || []).map((e) => {
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
      assigned_provider_id: e.accepted_provider_id,
      fixed_rate,
      scheduled_date: e.created_at,
      property_name: unwrapJoin(e.property)?.name,
      property_address: unwrapJoin(e.property)?.address,
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

  // Notify favorites first
  const favoriteIds = new Set((favorites || []).map((f) => f.provider_id));
  if (hasFavorites) {
    for (const fav of favorites!) {
      sendPushNotification(
        fav.provider_id,
        '⭐ Mission prioritaire',
        `Une mission de ${data.mission_type || 'service'} vous est proposée en priorité pendant 2H. Répondez vite !`,
        { missionId: mission.id }
      ).catch(err => captureError(err, { context: 'push-notification-favorite', userId: fav.provider_id }));
    }
  }

  // Notify all eligible providers (non-favorites get a standard notification)
  if (!data.assigned_provider_id) {
    try {
      const { data: property } = await supabase
        .from('properties')
        .select('latitude, longitude')
        .eq('id', data.property_id)
        .single();

      const { data: providers } = await supabase
        .from('provider_profiles')
        .select('provider_id, specialties, radius_km, latitude, longitude');

      if (providers && property) {
        for (const p of providers) {
          if (favoriteIds.has(p.provider_id)) continue; // Already notified above
          if (p.specialties && p.specialties.length > 0 && !p.specialties.includes(data.mission_type)) continue;
          if (p.latitude && p.longitude && property.latitude && property.longitude) {
            const dist = haversineKm(p.latitude, p.longitude, property.latitude, property.longitude);
            if (dist > (p.radius_km || 50)) continue;
          }
          sendPushNotification(
            p.provider_id,
            '📋 Nouvelle mission disponible',
            `Une mission de ${data.mission_type || 'service'} est disponible${hasFavorites ? ' (accessible dans 2H)' : ''} près de chez vous.`,
            { missionId: mission.id }
          ).catch(err => captureError(err, { context: 'push-notification-new-mission', userId: p.provider_id }));
        }
      }
    } catch (err) {
      if (__DEV__) console.warn('Failed to notify non-favorite providers', err);
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

  if (mission) {
    mission.property_name = mission.property?.name;
    mission.property_address = mission.property?.address;
    mission.access_code = mission.property?.access_code;
    mission.instructions = mission.property?.instructions;
    mission.deposit_location = mission.property?.deposit_location;
    mission.linen_instructions = mission.property?.linen_instructions;

    mission.applications = (mission.applications as { id: string; provider_id: string; proposed_rate?: number; message?: string; status: string; created_at: string; provider?: { name?: string; picture?: string; profile?: { rating?: number; total_reviews?: number } | { rating?: number; total_reviews?: number }[] } | { name?: string; picture?: string; profile?: { rating?: number; total_reviews?: number } | { rating?: number; total_reviews?: number }[] }[] }[] | undefined)?.map((app) => {
      const prov = unwrapJoin(app.provider);
      const profile = Array.isArray(prov?.profile) ? prov.profile[0] : prov?.profile;
      return {
        ...app,
        provider_name: prov?.name,
        provider_picture: prov?.picture,
        provider_rating: profile?.rating,
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
  }

  return mission;
};

export const applyToMission = async (missionId: string, data: ApplyToMissionPayload) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');

  // TODO: remettre la vérification documents (verified, rc_pro, décennale)
  // une fois les colonnes ajoutées sur provider_profiles en prod.
  // Pour l'instant, la candidature est ouverte à tout prestataire authentifié.

  // Vérifier que la mission est bien en 'pending_provider_approval' (anti-pattern #8)
  const { data: missionCheck } = await supabase
    .from('missions')
    .select('status')
    .eq('id', missionId)
    .single();
  if (!missionCheck || missionCheck.status !== 'pending_provider_approval') {
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

  console.log('SUPABASE RESULT:', { app, error });
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

export const getMyApplications = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('mission_applications')
    .select('*, mission:missions!mission_applications_mission_id_fkey(*, property:properties(name, address))')
    .eq('provider_id', session.user.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  checkError(error);

  return (data || []).map((app) => ({
    ...app,
    mission_id: unwrapJoin(app.mission)?.id,
    mission_type: unwrapJoin(app.mission)?.mission_type,
    property_name: unwrapJoin(unwrapJoin(app.mission)?.property)?.name,
    property_address: unwrapJoin(unwrapJoin(app.mission)?.property)?.address,
    description: unwrapJoin(app.mission)?.description,
    scheduled_date: unwrapJoin(app.mission)?.scheduled_date,
    fixed_rate: app.proposed_rate || unwrapJoin(app.mission)?.fixed_rate,
    mission_status: unwrapJoin(app.mission)?.status,
  }));
};

export const handleApplication = async (missionId: string, appId: string, action: string) => {
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
    // R3: Vérifier que la mission est bien en 'pending' avant de passer à 'assigned'
    await supabase.from('missions').update({ status: 'assigned', assigned_provider_id: data.provider_id }).eq('id', missionId).eq('status', 'pending');
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

  const filename = `${missionId}/${session.user.id}/${Date.now()}.jpg`;

  // Read file as ArrayBuffer (reliable on React Native)
  const response = await fetch(uri);
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
    .update({ status: 'rejected' })
    .eq('id', missionId)
    .eq('assigned_provider_id', session.user.id)
    .eq('status', 'pending_provider_approval')
    .select('*, provider:users!missions_assigned_provider_id_fkey(name)')
    .single();
  if (error || !data) throw new Error('Impossible de refuser cette mission.');

  // Notifications are now handled server-side via DB trigger (trg_notify_mission_status)

  return data;
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

  const rawUpcomingMissions = (upcomingRes.data || []).map((m) => ({
    ...m,
    mission_id: m.id,
    property_name: unwrapJoin(m.property)?.name,
    property_address: unwrapJoin(m.property)?.address,
    is_emergency: false
  }));

  const rawUpcomingEmergencies = (upcomingEmRes.data || []).map((e) => {
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

  const { error } = await supabase
    .from('missions')
    .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
    .eq('id', missionId)
    .eq('owner_id', session.user.id);
  checkError(error);

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
    .select('*, provider:users!mission_quotes_provider_id_fkey(name, picture, email, profile:provider_profiles(rating, total_reviews, specialties, bio, zone, siret, company_name, tva_status))')
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
    provider_siret: providerProfile?.siret,
    provider_company: providerProfile?.company_name,
    provider_tva_status: providerProfile?.tva_status,
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
}) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');

  const totalHT = data.lines.reduce((sum, l) => sum + l.quantity * l.unit_price_ht, 0);

  const quotePayload: Record<string, unknown> = {
    provider_id: session.user.id,
    description: data.description || '',
    repair_cost: totalHT,
    repair_delay_days: data.validity_days,
    status: 'pending',
    estimated_start_date: data.estimated_start_date || null,
    estimated_duration: data.estimated_duration || null,
    is_renovation: data.is_renovation,
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
    const { data: docData } = await supabase.functions.invoke('generate-quote', {
      body: {
        quoteId: quote.id,
        missionId: data.missionId || null,
        emergencyId: data.emergencyId || null,
      },
    });

    if (docData?.document_url && quote) {
      await supabase
        .from('mission_quotes')
        .update({ quote_document_url: docData.document_url })
        .eq('id', quote.id);
    }
  } catch {
    // Non-blocking: document generation can be retried later
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
