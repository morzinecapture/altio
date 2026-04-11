import { supabase, checkError, requireAuth, requireAdmin } from './_client';
import type { UpdatePartnerPayload } from './_client';

export const getPartners = async (zone?: string, category?: string) => {
  await requireAuth();
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
  await requireAdmin();
  const { data, error } = await supabase
    .from('local_partners')
    .insert(partner)
    .select()
    .single();
  checkError(error);
  return data;
};

export const updatePartner = async (id: string, updates: UpdatePartnerPayload) => {
  await requireAdmin();
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
  await requireAdmin();
  const { error } = await supabase
    .from('local_partners')
    .delete()
    .eq('id', id);
  checkError(error);
};

export const getPartner = async (id: string) => {
  await requireAuth();
  const { data, error } = await supabase
    .from('local_partners')
    .select('*')
    .eq('id', id)
    .single();
  checkError(error);
  return data;
};

export const uploadPartnerFile = async (
  bucket: 'partner-logos' | 'partner-brochures',
  partnerId: string,
  uri: string,
  mimeType: string
): Promise<string> => {
  await requireAdmin();
  const ext = mimeType === 'application/pdf' ? 'pdf' : 'jpg';
  const path = `${partnerId}/${Date.now()}.${ext}`;

  const response = await fetch(uri);
  if (!response.ok) throw new Error(`Impossible de lire le fichier (${response.status})`);
  const blob = await response.blob();

  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, blob, { contentType: mimeType, upsert: true });
  checkError(error);

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
};

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

export const connectGoogleCalendar = async (code: string, codeVerifier?: string) => {
  const { data, error } = await supabase.functions.invoke('connect-google-calendar', {
    body: { code, code_verifier: codeVerifier },
  });
  checkError(error);
  return data;
};

export const disconnectGoogleCalendar = async () => {
  const { error } = await supabase
    .from('users')
    .update({ google_calendar_token: null, google_calendar_refresh_token: null })
    .eq('id', (await supabase.auth.getSession()).data.session?.user.id);
  checkError(error);
};

export const syncMissionToGoogleCalendar = async (missionId: string, action: 'create' | 'delete') => {
  const { data, error } = await supabase.functions.invoke('sync-google-calendar', {
    body: { mission_id: missionId, action },
  });
  checkError(error);
  return data;
};
