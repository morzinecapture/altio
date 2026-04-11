import { supabase, checkError, captureError } from './_client';
import { sendPushNotification } from './notifications';
import { getBlockedUsers } from './blocking';

export const submitReview = async (params: {
  missionId?: string;
  emergencyId?: string;
  providerId: string;
  rating: number;
  comment?: string;
}) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');
  const { data, error } = await supabase
    .from('reviews')
    .insert({
      mission_id:  params.missionId || null,
      emergency_request_id: params.emergencyId || null,
      owner_id:    session.user.id,
      provider_id: params.providerId,
      rating:      params.rating,
      comment:     params.comment || null,
    })
    .select()
    .single();
  checkError(error);

  sendPushNotification(
    params.providerId,
    '⭐ Nouvel avis reçu',
    `Vous avez reçu un avis (${params.rating}/5) pour votre intervention.`,
    { missionId: params.missionId || params.emergencyId }
  ).catch(err => captureError(err, { context: 'push-notification-review', userId: params.providerId }));

  return data;
};

export const getProviderReviews = async (providerId: string) => {
  const { data, error } = await supabase
    .from('reviews')
    .select('*, owner:users!reviews_owner_id_fkey(name, picture)')
    .eq('provider_id', providerId)
    .order('created_at', { ascending: false })
    .limit(20);
  checkError(error);

  // Filter out reviews from blocked users
  try {
    const blockedUsers = await getBlockedUsers();
    const blockedIds = new Set(blockedUsers.map((b: { blocked_id: string }) => b.blocked_id));
    if (blockedIds.size > 0 && data) {
      return data.filter((r: { owner_id: string }) => !blockedIds.has(r.owner_id));
    }
  } catch {
    // Fail silently — blocking filter is non-critical
  }

  return data || [];
};

export const getMissionReview = async (missionId?: string, emergencyId?: string) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return null;
  let query = supabase.from('reviews').select('*').eq('owner_id', session.user.id);
  if (missionId) query = query.eq('mission_id', missionId);
  if (emergencyId) query = query.eq('emergency_request_id', emergencyId);
  const { data } = await query.maybeSingle();
  return data;
};

export const respondToReview = async (reviewId: string, response: string) => {
  const { data, error } = await supabase
    .from('reviews')
    .update({ provider_response: response, provider_response_at: new Date().toISOString() })
    .eq('id', reviewId)
    .select()
    .single();
  checkError(error);
  return data;
};

export const createProviderReview = async (data: { mission_id: string; owner_id: string; rating: number; comment?: string }) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');
  const { data: review, error } = await supabase
    .from('provider_reviews')
    .insert({ ...data, provider_id: session.user.id })
    .select()
    .single();
  checkError(error);
  return review;
};
