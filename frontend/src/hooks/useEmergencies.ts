import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getEmergencies,
  getEmergency,
  createEmergency,
  acceptEmergency,
  submitEmergencyBid,
  acceptEmergencyBid,
  markEmergencyArrived,
  submitEmergencyQuote,
  acceptEmergencyQuote,
  completeEmergencyWithCapture,
  getProviderSchedule,
} from '../api';
import type { CreateEmergencyPayload } from '../api/_client';
import { missionKeys } from './useMissions';

export const emergencyKeys = {
  all: ['emergencies'] as const,
  list: ['emergencies', 'list'] as const,
  detail: (id: string) => ['emergencies', 'detail', id] as const,
  schedule: ['emergencies', 'schedule'] as const,
};

export const useEmergencies = (forProvider?: boolean) =>
  useQuery({
    queryKey: emergencyKeys.list,
    queryFn: () => getEmergencies(forProvider),
  });

export const useEmergency = (id: string) =>
  useQuery({
    queryKey: emergencyKeys.detail(id),
    queryFn: () => getEmergency(id),
    enabled: !!id,
  });

export const useProviderSchedule = () =>
  useQuery({
    queryKey: emergencyKeys.schedule,
    queryFn: getProviderSchedule,
  });

export const useCreateEmergency = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateEmergencyPayload) => createEmergency(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: emergencyKeys.all });
      qc.invalidateQueries({ queryKey: missionKeys.all });
    },
  });
};

export const useAcceptEmergency = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { id: string; data: { displacement_fee?: number; diagnostic_fee?: number } }) => acceptEmergency(params.id, params.data),
    onSuccess: (_, params) => {
      qc.invalidateQueries({ queryKey: emergencyKeys.detail(params.id) });
      qc.invalidateQueries({ queryKey: emergencyKeys.list });
    },
  });
};

export const useSubmitEmergencyBid = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      emergencyId: string;
      data: { travel_cost: number; diagnostic_cost: number; estimated_arrival: string };
    }) => submitEmergencyBid(params.emergencyId, params.data),
    onSuccess: (_, params) => {
      qc.invalidateQueries({ queryKey: emergencyKeys.detail(params.emergencyId) });
    },
  });
};

export const useAcceptEmergencyBid = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { emergencyId: string; bidId: string; providerId: string }) =>
      acceptEmergencyBid(params.emergencyId, params.bidId, params.providerId),
    onSuccess: (_, params) => {
      qc.invalidateQueries({ queryKey: emergencyKeys.detail(params.emergencyId) });
    },
  });
};

export const useMarkEmergencyArrived = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => markEmergencyArrived(id),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: emergencyKeys.detail(id) });
    },
  });
};

export const useSubmitEmergencyQuote = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      emergencyId: string;
      data: { description: string; repair_cost: number; repair_delay_days: number; items?: unknown[] };
    }) => submitEmergencyQuote(params.emergencyId, params.data),
    onSuccess: (_, params) => {
      qc.invalidateQueries({ queryKey: emergencyKeys.detail(params.emergencyId) });
    },
  });
};

export const useAcceptEmergencyQuote = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { emergencyId: string; quoteId: string; paymentIntentId: string }) =>
      acceptEmergencyQuote(params.emergencyId, params.quoteId, params.paymentIntentId),
    onSuccess: (_, params) => {
      qc.invalidateQueries({ queryKey: emergencyKeys.detail(params.emergencyId) });
    },
  });
};

export const useCompleteEmergency = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => completeEmergencyWithCapture(id),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: emergencyKeys.detail(id) });
      qc.invalidateQueries({ queryKey: emergencyKeys.list });
      qc.invalidateQueries({ queryKey: missionKeys.all });
    },
  });
};
