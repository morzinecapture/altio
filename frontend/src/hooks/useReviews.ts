import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  submitReview,
  getProviderReviews,
  getMissionReview,
  respondToReview,
} from '../api';
import { profileKeys } from './useProfile';

export const reviewKeys = {
  provider: (id: string) => ['reviews', 'provider', id] as const,
  mission: (id: string) => ['reviews', 'mission', id] as const,
};

export const useProviderReviews = (providerId: string) =>
  useQuery({
    queryKey: reviewKeys.provider(providerId),
    queryFn: () => getProviderReviews(providerId),
    enabled: !!providerId,
  });

export const useMissionReview = (missionId: string) =>
  useQuery({
    queryKey: reviewKeys.mission(missionId),
    queryFn: () => getMissionReview(missionId),
    enabled: !!missionId,
  });

export const useSubmitReview = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { missionId: string; providerId: string; rating: number; comment?: string }) =>
      submitReview(params),
    onSuccess: (_, params) => {
      qc.invalidateQueries({ queryKey: reviewKeys.mission(params.missionId) });
      qc.invalidateQueries({ queryKey: reviewKeys.provider(params.providerId) });
      qc.invalidateQueries({ queryKey: profileKeys.provider(params.providerId) });
    },
  });
};

export const useRespondToReview = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { reviewId: string; response: string; providerId: string }) =>
      respondToReview(params.reviewId, params.response),
    onSuccess: (_, params) => {
      qc.invalidateQueries({ queryKey: reviewKeys.provider(params.providerId) });
    },
  });
};
