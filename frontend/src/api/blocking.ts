import { supabase, checkError, requireAuth } from './_client';

export const blockUser = async (blockedId: string, reason?: string) => {
  const user = await requireAuth();
  const { data, error } = await supabase
    .from('blocked_users')
    .insert({
      blocker_id: user.id,
      blocked_id: blockedId,
      reason: reason || null,
    })
    .select()
    .single();
  checkError(error);
  return data;
};

export const unblockUser = async (blockedId: string) => {
  const user = await requireAuth();
  const { error } = await supabase
    .from('blocked_users')
    .delete()
    .eq('blocker_id', user.id)
    .eq('blocked_id', blockedId);
  checkError(error);
};

export const getBlockedUsers = async () => {
  const user = await requireAuth();
  const { data, error } = await supabase
    .from('blocked_users')
    .select('*')
    .eq('blocker_id', user.id);
  checkError(error);
  return data || [];
};

export const isUserBlocked = async (userId: string): Promise<boolean> => {
  const user = await requireAuth();
  const { data, error } = await supabase
    .from('blocked_users')
    .select('id')
    .eq('blocker_id', user.id)
    .eq('blocked_id', userId)
    .maybeSingle();
  checkError(error);
  return !!data;
};
