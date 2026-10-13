import { supabase, checkError, unwrapJoin, haversineKm } from './_client';
import type { PushNotificationData, AppNotification, NotificationRow } from './_client';
import { getMissionTypeLabel, getServiceTypeLabel } from '../utils/serviceLabels';

export const registerPushToken = async (tokenData: { data: string } | string, platform: string, expectedUserId?: string) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return;
  if (expectedUserId && session.user.id !== expectedUserId) return;

  const actualToken = typeof tokenData === 'string' ? tokenData : tokenData.data;

  const { error } = await supabase
    .from('users')
    .update({ expo_push_token: actualToken })
    .eq('id', session.user.id)
    .select('id')
    .single();

  checkError(error);
};

export const sendPushNotification = async (userId: string, title: string, body: string, data?: PushNotificationData) => {
  const referenceId = data?.missionId || data?.emergencyId || null;
  const notifType = data?.emergencyId ? 'emergency' : 'mission';

  // One server transaction owns both the inbox entry and the device dispatch.
  const { error } = await supabase.rpc('insert_notification_for_user', {
    p_user_id: userId, p_type: notifType, p_title: title, p_body: body, p_reference_id: referenceId,
  });
  checkError(error);

};

export const getNotifications = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return [];
  const uid = session.user.id;

  // 1. Query the persistent notifications table (fast — single query)
  const { data: rows, error } = await supabase
    .from('notifications')
    .select('id, type, title, body, reference_id, read, created_at')
    .eq('user_id', uid)
    .order('created_at', { ascending: false })
    .limit(50);

  const dbNotifications: AppNotification[] = (!error && rows)
    ? rows.map((r: NotificationRow) => ({
        notification_id: r.id,
        type: r.type,
        title: r.title,
        body: r.body,
        reference_id: r.reference_id,
        read: r.read,
        created_at: r.created_at,
      }))
    : [];

  // 2. Only run heavy fallback if DB has no notifications
  //    (DB trigger + RPC handle new inserts, so fallback is only needed
  //     before migration is applied or for historical data)
  if (dbNotifications.length > 0) {
    return dbNotifications;
  }

  // 3. Fallback: derive from mission_applications / emergencies
  const fallbackNotifications = await getNotificationsFallback(uid);
  return fallbackNotifications;
};

// Fallback: derive notifications from existing tables (used before migration is applied)
// All independent queries run in parallel via Promise.all for speed.
const getNotificationsFallback = async (uid: string) => {
  const { data: userRow } = await supabase
    .from('users')
    .select('role')
    .eq('id', uid)
    .single();

  const notifications: AppNotification[] = [];

  if (userRow?.role === 'owner') {
    // Run all owner queries in parallel
    const [missionsRes, activeMissionsRes, emergenciesRes] = await Promise.all([
      supabase
        .from('missions')
        .select('id, mission_type')
        .eq('owner_id', uid),
      supabase
        .from('missions')
        .select('id, mission_type, status, updated_at, assigned_provider_id, provider:public_profiles!missions_assigned_provider_id_fkey(name)')
        .eq('owner_id', uid)
        .in('status', ['assigned', 'in_progress', 'awaiting_payment', 'completed'])
        .order('updated_at', { ascending: false })
        .limit(20),
      supabase
        .from('emergency_requests')
        .select('id, service_type, status, updated_at, accepted_provider_id, provider:public_profiles!emergency_requests_accepted_provider_id_fkey(name)')
        .eq('owner_id', uid)
        .in('status', ['provider_accepted', 'bid_accepted', 'in_progress', 'completed'])
        .order('updated_at', { ascending: false })
        .limit(10),
    ]);

    const missions = missionsRes.data;

    // Fetch applications if owner has missions
    if (missions && missions.length > 0) {
      const missionIds = missions.map((m) => m.id);
      const missionMap: Record<string, string> = {};
      missions.forEach((m) => { missionMap[m.id] = getMissionTypeLabel(m.mission_type).toLocaleLowerCase('fr-FR'); });

      const { data: apps } = await supabase
        .from('mission_applications')
        .select('id, created_at, status, mission_id, provider:public_profiles!mission_applications_provider_id_fkey(name)')
        .in('mission_id', missionIds)
        .order('created_at', { ascending: false })
        .limit(30);

      (apps || []).forEach((app) => {
        notifications.push({
          notification_id: `app_${app.id}`,
          type: 'mission',
          title: '📋 Nouvelle candidature',
          body: `${unwrapJoin(app.provider)?.name || 'Un prestataire'} a postulé à votre mission de ${missionMap[app.mission_id] || 'service'}.`,
          reference_id: app.mission_id,
          read: app.status !== 'pending',
          created_at: app.created_at,
        });
      });
    }

    const activeMissions = activeMissionsRes.data;
    (activeMissions || []).forEach((m) => {
      const provName = (m.provider as { name?: string } | null)?.name || 'Le prestataire';
      if (m.status === 'assigned') {
        notifications.push({
          notification_id: `assigned_${m.id}`, type: 'mission',
          title: '👷 Prestataire confirmé',
          body: `${provName} va intervenir pour votre mission de ${getMissionTypeLabel(m.mission_type || 'service').toLocaleLowerCase('fr-FR')}.`,
          reference_id: m.id, read: false, created_at: m.updated_at,
        });
      } else if (m.status === 'in_progress') {
        notifications.push({
          notification_id: `progress_${m.id}`, type: 'mission',
          title: '🔧 Intervention en cours',
          body: `${provName} a commencé l'intervention pour votre mission de ${getMissionTypeLabel(m.mission_type || 'service').toLocaleLowerCase('fr-FR')}.`,
          reference_id: m.id, read: false, created_at: m.updated_at,
        });
      } else if (m.status === 'awaiting_payment') {
        notifications.push({
          notification_id: `pay_${m.id}`, type: 'mission',
          title: '💳 Paiement en attente',
          body: `Votre mission de ${getMissionTypeLabel(m.mission_type || 'service').toLocaleLowerCase('fr-FR')} est terminée. Validez et payez le prestataire.`,
          reference_id: m.id, read: false, created_at: m.updated_at,
        });
      } else if (m.status === 'completed') {
        notifications.push({
          notification_id: `done_${m.id}`, type: 'mission',
          title: '✅ Intervention terminée',
          body: `${provName} a terminé la mission de ${getMissionTypeLabel(m.mission_type || 'service').toLocaleLowerCase('fr-FR')}. Vérifiez et validez.`,
          reference_id: m.id, read: false, created_at: m.updated_at,
        });
      }
    });

    const emergencies = emergenciesRes.data;
    (emergencies || []).forEach((e) => {
      const provName = (e.provider as { name?: string } | null)?.name || 'Un prestataire';
      notifications.push({
        notification_id: `emerg_${e.id}`, type: 'emergency',
        title: e.status === 'completed' ? '✅ Urgence résolue' : '🚨 Urgence mise à jour',
        body: `${provName} ${e.status === 'completed' ? 'a résolu' : 'prend en charge'} votre urgence de ${getServiceTypeLabel(e.service_type || 'service').toLocaleLowerCase('fr-FR')}.`,
        reference_id: e.id, read: false, created_at: e.updated_at,
      });
    });

  } else if (userRow?.role === 'provider') {
    // Run all provider queries in parallel
    const [acceptedRes, myMissionsRes, profileRes] = await Promise.all([
      supabase
        .from('mission_applications')
        .select('id, created_at, mission_id, mission:missions!mission_applications_mission_id_fkey(mission_type, property:properties(name))')
        .eq('provider_id', uid)
        .eq('status', 'accepted')
        .order('created_at', { ascending: false })
        .limit(20),
      supabase
        .from('missions')
        .select('id, mission_type, status, updated_at, property:properties(name)')
        .eq('assigned_provider_id', uid)
        .in('status', ['assigned', 'in_progress', 'awaiting_payment', 'completed', 'paid'])
        .order('updated_at', { ascending: false })
        .limit(20),
      supabase
        .from('provider_profiles')
        .select('latitude, longitude, radius_km, specialties')
        .eq('provider_id', uid)
        .single(),
    ]);

    const acceptedMissionIds = new Set((acceptedRes.data || []).map((app) => app.mission_id));

    (acceptedRes.data || []).forEach((app) => {
      const appMission = unwrapJoin(app.mission);
      const missionType = getMissionTypeLabel(appMission?.mission_type || 'service').toLocaleLowerCase('fr-FR');
      const propName = unwrapJoin(appMission?.property)?.name || '';
      notifications.push({
        notification_id: `accepted_${app.id}`, type: 'mission_assigned',
        title: '✅ Candidature acceptée !',
        body: `Vous avez été sélectionné pour la mission de ${missionType}${propName ? ` — ${propName}` : ''}.`,
        reference_id: app.mission_id, read: false, created_at: app.created_at,
      });
    });

    (myMissionsRes.data || []).forEach((m) => {
      const propName = ((Array.isArray(m.property) ? m.property[0] : m.property)?.name) || 'votre client';
      if (m.status === 'assigned') {
        // Skip if this mission was already handled via the candidature path above
        if (acceptedMissionIds.has(m.id)) return;
        notifications.push({
          notification_id: `mission_${m.id}`, type: 'mission',
          title: '✅ Mission confirmée',
          body: `Mission de ${getMissionTypeLabel(m.mission_type).toLocaleLowerCase('fr-FR')} chez ${propName}.`,
          reference_id: m.id, read: false, created_at: m.updated_at,
        });
      } else if (m.status === 'in_progress') {
        notifications.push({
          notification_id: `progress_${m.id}`, type: 'mission',
          title: '🔧 Mission en cours',
          body: `Mission de ${getMissionTypeLabel(m.mission_type).toLocaleLowerCase('fr-FR')} chez ${propName}.`,
          reference_id: m.id, read: false, created_at: m.updated_at,
        });
      } else if (m.status === 'awaiting_payment' || m.status === 'completed') {
        notifications.push({
          notification_id: `awaiting_${m.id}`, type: 'mission',
          title: '⏳ En attente de validation',
          body: `Le propriétaire va valider votre mission de ${getMissionTypeLabel(m.mission_type).toLocaleLowerCase('fr-FR')}.`,
          reference_id: m.id, read: false, created_at: m.updated_at,
        });
      } else if (m.status === 'paid') {
        notifications.push({
          notification_id: `paid_${m.id}`, type: 'mission',
          title: '💰 Paiement reçu',
          body: `Vous avez été payé pour la mission de ${getMissionTypeLabel(m.mission_type).toLocaleLowerCase('fr-FR')}.`,
          reference_id: m.id, read: true, created_at: m.updated_at,
        });
      }
    });

    // Zone-based missions (only if profile has coordinates)
    const profile = profileRes.data;
    if (profile?.latitude && profile?.longitude) {
      const { data: newMissions } = await supabase
        .from('missions')
        .select('id, mission_type, created_at, assigned_provider_id, property:properties(name, latitude, longitude)')
        .eq('status', 'pending_provider_approval')
        .order('created_at', { ascending: false })
        .limit(20);

      const radiusKm = profile.radius_km || 30;
      (newMissions || []).forEach((m) => {
        const prop = unwrapJoin(m.property);
        if (!prop?.latitude || !prop?.longitude) return;

        // FIX: Ne pas montrer les missions ciblées aux autres prestataires
        if (m.assigned_provider_id && m.assigned_provider_id !== uid) return;

        const dist = haversineKm(profile.latitude, profile.longitude, prop.latitude, prop.longitude);
        if (dist > radiusKm) return;
        if (profile.specialties?.length > 0 && !profile.specialties.includes(m.mission_type)) return;
        const isTargeted = m.assigned_provider_id === uid;
        notifications.push({
          notification_id: `new_${m.id}`, type: 'mission',
          title: isTargeted ? '📋 Nouvelle mission pour vous' : '📋 Nouvelle mission disponible',
          body: `Mission de ${getMissionTypeLabel(m.mission_type).toLocaleLowerCase('fr-FR')} à proximité${prop.name ? ` — ${prop.name}` : ''}.`,
          reference_id: m.id, read: false, created_at: m.created_at,
        });
      });
    }
  }

  return notifications.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
};

export const markNotificationRead = async (id: string) => {
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('id', id);
  if (error && __DEV__) console.warn('[Notif] markRead failed:', error.message);
  return { ok: true };
};

export const markAllNotificationsRead = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return;
  await supabase
    .from('notifications')
    .update({ read: true })
    .eq('user_id', session.user.id)
    .eq('read', false);
};
