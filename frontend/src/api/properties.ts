/**
 * Properties & Reservations API
 * Extracted from src/api.ts — property CRUD, iCal sync, reservations.
 */
import { supabase, checkError } from './_client';
import type { CreatePropertyPayload, UpdatePropertyPayload, Reservation, ReservationRow } from './_client';
import type { Property } from '../types/api';
import { geocodeAddress } from './profile';

const propertyPhotoPath = (url: string): string | null => {
  const marker = '/property-photos/';
  const markerIndex = url.indexOf(marker);
  if (markerIndex >= 0) return url.slice(markerIndex + marker.length).split('?')[0];
  return url.startsWith('http') ? null : url;
};

/**
 * Property photos remain private in Storage. Turn their stored paths/public URLs
 * into short-lived URLs that only an authorised owner can request.
 */
const signPropertyPhotos = async <T extends { photos?: string[] }>(property: T): Promise<T> => {
  if (!property.photos?.length) return property;

  const photos = await Promise.all(property.photos.map(async (url) => {
    const path = propertyPhotoPath(url);
    if (!path) return url;
    const { data, error } = await supabase.storage.from('property-photos').createSignedUrl(path, 60 * 60 * 24);
    if (error || !data?.signedUrl) {
      console.warn('[Properties] unable to sign property photo:', error?.message);
      return '';
    }
    return data.signedUrl;
  }));

  return { ...property, photos };
};

// Properties
export const getProperties = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('properties')
    .select('*')
    .eq('owner_id', session.user.id)
    .order('created_at', { ascending: false });
  checkError(error);
  return Promise.all((data || []).map(property => signPropertyPhotos(property as Property)));
};

export const createProperty = async (data: CreatePropertyPayload) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) {
    throw new Error('Not authenticated');
  }

  const insertPayload = { ...data, owner_id: session.user.id };

  const { data: prop, error } = await supabase
    .from('properties')
    .insert(insertPayload)
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
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('properties')
    .select('*')
    .eq('id', id)
    .eq('owner_id', session.user.id)
    .single();
  checkError(error);
  return signPropertyPhotos(data as Property);
};

export const updateProperty = async (id: string, data: UpdatePropertyPayload) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');

  const { data: updated, error } = await supabase
    .from('properties')
    .update(data)
    .eq('id', id)
    .eq('owner_id', session.user.id)
    .select()
    .single();
  checkError(error);
  return signPropertyPhotos(updated as Property);
};

export const deleteProperty = async (id: string) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');

  const { error } = await supabase.from('properties').delete().eq('id', id).eq('owner_id', session.user.id);
  checkError(error);
  return { ok: true };
};

// ─── Property photos ─────────────────────────────────────────────────────────

export const uploadPropertyPhoto = async (propertyId: string, uri: string): Promise<string> => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');

  // Lazy import — avoids crashing unrelated screens that import properties.ts
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const ImageManipulator = require('expo-image-manipulator');

  // Compress before upload: max 1920px wide, quality 0.7
  const manipResult = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 1920 } }],
    { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG },
  );

  const filename = `${propertyId}/${Date.now()}.jpg`;
  // React Native uploads are unreliable with Blob bodies. Expo's File API gives
  // Supabase the ArrayBuffer it expects, so the stored object is a valid JPEG.
  const { File } = await import('expo-file-system');
  const file = new File(manipResult.uri);
  const fileBody = await file.arrayBuffer();

  const { error } = await supabase.storage
    .from('property-photos')
    .upload(filename, fileBody, { contentType: 'image/jpeg' });
  checkError(error);

  const { data: { publicUrl } } = supabase.storage
    .from('property-photos')
    .getPublicUrl(filename);

  return publicUrl;
};

export const deletePropertyPhoto = async (url: string): Promise<void> => {
  const marker = '/property-photos/';
  const idx = url.indexOf(marker);
  if (idx === -1) return;
  const path = decodeURIComponent(url.substring(idx + marker.length).split('?')[0]);

  const { error } = await supabase.storage
    .from('property-photos')
    .remove([path]);
  checkError(error);
};

export const enableAutoCleaning = async (propertyId: string, enabled: boolean) => {
  const { error } = await supabase
    .from('properties')
    .update({ auto_cleaning: enabled })
    .eq('id', propertyId);
  checkError(error);
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
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');

  let query = supabase
    .from('reservations')
    .select('*, properties!inner(owner_id)')
    .is('ical_cancelled_at', null)
    .eq('properties.owner_id', session.user.id)
    .order('check_in', { ascending: false });
  if (propertyId) query = query.eq('property_id', propertyId);

  const { data, error } = await query;
  checkError(error);
  return data || [];
};

// Upcoming reservations across ALL owner properties (dashboard widget)
export interface UpcomingReservation {
  id: string;
  property_id: string;
  property_name: string | null;
  guest_name: string | null;
  check_in: string;
  check_out: string;
  source: string | null;
  has_mission: boolean;
  mission_id: string | null;
}

export const getUpcomingReservations = async (): Promise<UpcomingReservation[]> => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');

  const todayISO = new Date().toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('reservations')
    .select('id, property_id, guest_name, check_in, check_out, source, properties!inner(name, owner_id), missions(id, status, mission_type)')
    .is('ical_cancelled_at', null)
    .eq('properties.owner_id', session.user.id)
    .gte('check_in', todayISO)
    .order('check_in', { ascending: true })
    .limit(5);
  checkError(error);

  return (data || []).map((r: Record<string, unknown>) => {
    const prop = r.properties as { name?: string } | null;
    const missionsArr = r.missions as Array<{ id: string; status: string; mission_type: string }> | null;
    const cleaningMission = Array.isArray(missionsArr)
      ? missionsArr.find((m) => m.mission_type === 'cleaning' && m.status !== 'cancelled')
      : null;
    return {
      id: r.id as string,
      property_id: r.property_id as string,
      property_name: prop?.name || null,
      guest_name: (r.guest_name as string | null) || null,
      check_in: r.check_in as string,
      check_out: r.check_out as string,
      source: (r.source as string | null) || null,
      has_mission: !!cleaningMission,
      mission_id: cleaningMission?.id || null,
    };
  });
};

// Monthly reservations across ALL owner properties (planning screen)
export interface MonthReservation {
  id: string;
  property_id: string;
  property_name: string | null;
  guest_name: string | null;
  check_in: string;
  check_out: string;
  source: string | null;
  mission_id: string | null;
  mission_status: string | null;
  mission_provider_name: string | null;
}

export const getMonthReservations = async (year: number, month: number, propertyId?: string): Promise<MonthReservation[]> => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');

  // month is 0-indexed (JS convention), range covers whole month
  const startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const endDate = month === 11
    ? `${year + 1}-01-01`
    : `${year}-${String(month + 2).padStart(2, '0')}-01`;

  let query = supabase
    .from('reservations')
    .select('id, property_id, guest_name, check_in, check_out, source, properties!inner(name, owner_id), missions(id, status, mission_type, assigned_provider_id, provider:public_profiles!missions_assigned_provider_id_fkey(name))')
    .is('ical_cancelled_at', null)
    .eq('properties.owner_id', session.user.id)
    .lt('check_in', endDate)
    .gte('check_out', startDate)
    .order('check_in', { ascending: true });

  if (propertyId) query = query.eq('property_id', propertyId);

  const { data, error } = await query;
  checkError(error);

  return (data || []).map((r: Record<string, unknown>) => {
    const prop = r.properties as { name?: string } | null;
    const missionsArr = r.missions as Array<{ id: string; status: string; mission_type: string; provider?: { name?: string } | { name?: string }[] }> | null;
    const cleaningMission = Array.isArray(missionsArr)
      ? missionsArr.find((m) => m.mission_type === 'cleaning' && m.status !== 'cancelled')
      : null;
    const providerName = cleaningMission?.provider
      ? (Array.isArray(cleaningMission.provider) ? cleaningMission.provider[0]?.name : cleaningMission.provider?.name) || null
      : null;
    return {
      id: r.id as string,
      property_id: r.property_id as string,
      property_name: prop?.name || null,
      guest_name: (r.guest_name as string | null) || null,
      check_in: r.check_in as string,
      check_out: r.check_out as string,
      source: (r.source as string | null) || null,
      mission_id: cleaningMission?.id || null,
      mission_status: cleaningMission?.status || null,
      mission_provider_name: providerName,
    };
  });
};

// Reservations with their linked cleaning mission (LEFT JOIN via reservation_id FK)
export interface ReservationWithMission {
  id: string;
  property_id: string;
  guest_name?: string | null;
  check_in: string;
  check_out: string;
  source?: string | null;
  mission?: {
    id: string;
    status: string;
    mission_type: string;
    scheduled_date: string | null;
  } | null;
}

export const getPropertyReservations = async (propertyId: string): Promise<ReservationWithMission[]> => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('reservations')
    .select('id, property_id, guest_name, check_in, check_out, source, missions(id, status, mission_type, scheduled_date)')
    .is('ical_cancelled_at', null)
    .eq('property_id', propertyId)
    .order('check_in', { ascending: true });
  checkError(error);

  return (data || []).map((r: Record<string, unknown>) => {
    const missionsArr = r.missions as Array<{ id: string; status: string; mission_type: string; scheduled_date: string | null }> | null;
    const mission = Array.isArray(missionsArr) && missionsArr.length > 0 ? missionsArr[0] : null;
    return {
      id: r.id as string,
      property_id: r.property_id as string,
      guest_name: r.guest_name as string | null,
      check_in: r.check_in as string,
      check_out: r.check_out as string,
      source: r.source as string | null,
      mission,
    };
  });
};

// Reservations with mission status (has_mission flag + mission details)
export interface ReservationMissionStatus {
  id: string;
  property_id: string;
  guest_name: string | null;
  check_in: string;
  check_out: string;
  source: string | null;
  has_mission: boolean;
  mission_id: string | null;
  mission_provider_name: string | null;
}

export const getReservationsWithMissionStatus = async (propertyId: string): Promise<ReservationMissionStatus[]> => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('reservations')
    .select('id, property_id, guest_name, check_in, check_out, source, missions(id, status, mission_type, assigned_provider_id, provider:public_profiles!missions_assigned_provider_id_fkey(name))')
    .is('ical_cancelled_at', null)
    .eq('property_id', propertyId)
    .gte('check_out', new Date().toISOString().slice(0, 10))
    .order('check_in', { ascending: true });
  checkError(error);

  return (data || []).map((r: Record<string, unknown>) => {
    const missionsArr = r.missions as Array<{ id: string; status: string; mission_type: string; provider?: { name?: string } | { name?: string }[] }> | null;
    const cleaningMission = Array.isArray(missionsArr)
      ? missionsArr.find((m) => m.mission_type === 'cleaning')
      : null;
    const providerName = cleaningMission?.provider
      ? (Array.isArray(cleaningMission.provider) ? cleaningMission.provider[0]?.name : cleaningMission.provider?.name) || null
      : null;
    return {
      id: r.id as string,
      property_id: r.property_id as string,
      guest_name: (r.guest_name as string | null) || null,
      check_in: r.check_in as string,
      check_out: r.check_out as string,
      source: (r.source as string | null) || null,
      has_mission: !!cleaningMission,
      mission_id: cleaningMission?.id || null,
      mission_provider_name: providerName,
    };
  });
};
