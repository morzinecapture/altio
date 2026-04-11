import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getProfile,
  getProviders,
  getProviderProfile,
  getProviderStats,
  updateProviderProfile,
  toggleAvailability,
  updateBillingInfo,
} from '../api';

export const profileKeys = {
  current: ['profile'] as const,
  provider: (id: string) => ['profile', 'provider', id] as const,
  providerStats: ['profile', 'provider-stats'] as const,
  providers: (filters?: { specialty?: string }) =>
    ['providers', filters] as const,
};

export const useProfile = () =>
  useQuery({
    queryKey: profileKeys.current,
    queryFn: getProfile,
  });

export const useProviderProfile = (id: string) =>
  useQuery({
    queryKey: profileKeys.provider(id),
    queryFn: () => getProviderProfile(id),
    enabled: !!id,
  });

export const useProviderStats = () =>
  useQuery({
    queryKey: profileKeys.providerStats,
    queryFn: getProviderStats,
    staleTime: 60_000,
    refetchOnMount: 'always',
  });

export const useProviders = (specialty?: string) =>
  useQuery({
    queryKey: profileKeys.providers({ specialty }),
    queryFn: () => getProviders(specialty),
  });

export const useUpdateProviderProfile = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Parameters<typeof updateProviderProfile>[0]) =>
      updateProviderProfile(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: profileKeys.current });
    },
  });
};

export const useToggleAvailability = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: toggleAvailability,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: profileKeys.current });
    },
  });
};

export const useUpdateBillingInfo = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Parameters<typeof updateBillingInfo>[0]) =>
      updateBillingInfo(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: profileKeys.current });
    },
  });
};
