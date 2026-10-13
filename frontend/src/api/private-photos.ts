import { supabase, captureError } from './_client';

/** Store durable object URLs/paths; obtain short-lived URLs when displaying them. */
export async function signMissionPhoto<T extends { photo_url: string }>(photo: T): Promise<T> {
  const marker = '/mission_proofs/';
  const index = photo.photo_url.indexOf(marker);
  const path = index >= 0 ? decodeURIComponent(photo.photo_url.slice(index + marker.length).split('?')[0])
    : /^https?:/.test(photo.photo_url) ? null : photo.photo_url;
  if (!path) return photo;
  const { data, error } = await supabase.storage.from('mission_proofs').createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) {
    captureError(error || new Error('Photo de mission inaccessible'), { scope: 'signMissionPhoto' });
    return { ...photo, photo_url: '' };
  }
  return { ...photo, photo_url: data.signedUrl };
}

/** Emergency attachments use their own private bucket, never the public avatar bucket. */
export async function signEmergencyPhotos<T extends { photos?: string[] | null }>(request: T): Promise<T> {
  const photos = await Promise.all((request.photos || []).map(async (url) => {
    const marker = '/emergency-photos/';
    const index = url.indexOf(marker);
    if (index < 0) return ''; // Unknown/legacy public links must not bypass storage permissions.
    try {
      const path = decodeURIComponent(url.slice(index + marker.length).split('?')[0]);
      const { data, error } = await supabase.storage.from('emergency-photos').createSignedUrl(path, 3600);
      if (error) throw error;
      return data?.signedUrl || '';
    } catch (error) {
      captureError(error, { scope: 'signEmergencyPhotos' });
      return '';
    }
  }));
  return { ...request, photos: photos.filter(Boolean) };
}
