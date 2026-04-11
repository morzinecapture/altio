import { supabase, checkError, captureError } from './_client';
import { sendPushNotification } from './notifications';
import { getBlockedUsers } from './blocking';

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
    if (__DEV__) console.error('Error fetching messages:', error);
    return [];
  }

  // Sort conversations with blocked users to the end
  try {
    const blockedUsers = await getBlockedUsers();
    const blockedIds = new Set(blockedUsers.map((b: { blocked_id: string }) => b.blocked_id));
    if (blockedIds.size > 0 && data) {
      const normal = data.filter((m: { sender_id: string }) => !blockedIds.has(m.sender_id));
      const blocked = data.filter((m: { sender_id: string }) => blockedIds.has(m.sender_id));
      return [...normal, ...blocked.map((m: Record<string, unknown>) => ({ ...m, _blocked: true }))];
    }
  } catch {
    // Fail silently — blocking filter is non-critical
  }

  return data || [];
};

export const sendMessage = async (content: string, receiverId: string, missionId?: string, emergencyId?: string) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');

  // Anti-pattern #13: Vérifier que la mission est au moins en état 'assigned' avant d'autoriser les messages
  if (missionId) {
    const { data: mission } = await supabase
      .from('missions')
      .select('status')
      .eq('id', missionId)
      .single();
    if (mission && ['pending', 'expired', 'cancelled'].includes(mission.status)) {
      throw new Error('La messagerie n\'est disponible qu\'après l\'attribution de la mission.');
    }
  }

  const { data, error } = await supabase.from('messages').insert({
    sender_id: session.user.id,
    receiver_id: receiverId,
    content,
    mission_id: missionId || null,
    emergency_id: emergencyId || null,
  }).select().single();

  checkError(error);

  // Notification #12: Nouveau message
  const { data: senderUser } = await supabase
    .from('users')
    .select('name')
    .eq('id', session.user.id)
    .single();
  sendPushNotification(
    receiverId,
    '💬 Nouveau message',
    `${senderUser?.name || 'Quelqu\'un'} vous a envoyé un message.`,
    { missionId, emergencyId }
  ).catch(err => captureError(err, { context: 'push-notification-new-message', userId: receiverId }));

  return data;
};
