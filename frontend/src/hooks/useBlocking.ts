import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { blockUser, unblockUser, getBlockedUsers, isUserBlocked } from '../api/blocking';

export const blockingKeys = {
  all: ['blocked-users'] as const,
  isBlocked: (userId: string) => ['blocked-users', 'is-blocked', userId] as const,
};

export const useBlockedUsers = () =>
  useQuery({
    queryKey: blockingKeys.all,
    queryFn: getBlockedUsers,
  });

export const useBlockUser = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { blockedId: string; reason?: string }) =>
      blockUser(params.blockedId, params.reason),
    onSuccess: (_, params) => {
      qc.invalidateQueries({ queryKey: blockingKeys.all });
      qc.invalidateQueries({ queryKey: blockingKeys.isBlocked(params.blockedId) });
      qc.invalidateQueries({ queryKey: ['reviews'] });
      qc.invalidateQueries({ queryKey: ['messages'] });
    },
  });
};

export const useUnblockUser = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (blockedId: string) => unblockUser(blockedId),
    onSuccess: (_, blockedId) => {
      qc.invalidateQueries({ queryKey: blockingKeys.all });
      qc.invalidateQueries({ queryKey: blockingKeys.isBlocked(blockedId) });
      qc.invalidateQueries({ queryKey: ['reviews'] });
      qc.invalidateQueries({ queryKey: ['messages'] });
    },
  });
};

export const useIsBlocked = (userId: string) =>
  useQuery({
    queryKey: blockingKeys.isBlocked(userId),
    queryFn: () => isUserBlocked(userId),
    enabled: !!userId,
  });
