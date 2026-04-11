import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { profileKeys } from './useProfile';
import {
  getMissions,
  getMission,
  createMission,
  applyToMission,
  startMission,
  completeMission,
  cancelMission,
  validateMission,
  openDispute,
  republishMission,
  getOwnerDashboard,
  addMissionExtraHours,
  getProviderDaySchedule,
} from '../api';
import type { CreateMissionPayload } from '../api/_client';

export const missionKeys = {
  all: ['missions'] as const,
  list: (filters?: { status?: string; type?: string; forProvider?: boolean }) =>
    ['missions', 'list', filters] as const,
  detail: (id: string) => ['missions', 'detail', id] as const,
  ownerDashboard: ['missions', 'owner-dashboard'] as const,
};

export const useMissions = (status?: string, missionType?: string, forProvider?: boolean) =>
  useQuery({
    queryKey: missionKeys.list({ status, type: missionType, forProvider }),
    queryFn: () => getMissions(status, missionType, forProvider),
  });

export const useMission = (id: string) =>
  useQuery({
    queryKey: missionKeys.detail(id),
    queryFn: () => getMission(id),
    enabled: !!id,
  });

export const useOwnerDashboard = () =>
  useQuery({
    queryKey: missionKeys.ownerDashboard,
    queryFn: getOwnerDashboard,
  });

export const useCreateMission = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateMissionPayload) => createMission(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: missionKeys.all });
    },
  });
};

export const useApplyToMission = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { missionId: string; message?: string; proposed_rate?: number }) =>
      applyToMission(params.missionId, params),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: missionKeys.detail(vars.missionId) });
      qc.invalidateQueries({ queryKey: missionKeys.all });
    },
  });
};

export const useStartMission = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (missionId: string) => startMission(missionId),
    onSuccess: (_, missionId) => {
      qc.invalidateQueries({ queryKey: missionKeys.detail(missionId) });
      qc.invalidateQueries({ queryKey: missionKeys.all });
    },
  });
};

export const useCompleteMission = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { missionId: string; photoUrls?: string[] }) =>
      completeMission(params.missionId, params.photoUrls),
    onSuccess: (_, params) => {
      qc.invalidateQueries({ queryKey: missionKeys.detail(params.missionId) });
      qc.invalidateQueries({ queryKey: missionKeys.all });
    },
  });
};

export const useCancelMission = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (missionId: string) => cancelMission(missionId),
    onSuccess: (_, missionId) => {
      qc.invalidateQueries({ queryKey: missionKeys.detail(missionId) });
      qc.invalidateQueries({ queryKey: missionKeys.all });
    },
  });
};

export const useValidateMission = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (missionId: string) => validateMission(missionId),
    onSuccess: (_, missionId) => {
      qc.invalidateQueries({ queryKey: missionKeys.detail(missionId) });
      qc.invalidateQueries({ queryKey: missionKeys.all });
    },
  });
};

export const useOpenDispute = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { missionId: string; reason: string }) =>
      openDispute(params.missionId, params.reason),
    onSuccess: (_, params) => {
      qc.invalidateQueries({ queryKey: missionKeys.detail(params.missionId) });
      qc.invalidateQueries({ queryKey: missionKeys.all });
    },
  });
};

export const useRepublishMission = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (missionId: string) => republishMission(missionId),
    onSuccess: (_, missionId) => {
      qc.invalidateQueries({ queryKey: missionKeys.detail(missionId) });
      qc.invalidateQueries({ queryKey: missionKeys.all });
    },
  });
};

export const useProviderDaySchedule = (providerId: string, date: string) =>
  useQuery({
    queryKey: [...missionKeys.all, 'day-schedule', providerId, date],
    queryFn: () => getProviderDaySchedule(providerId, date),
    staleTime: 30_000,
    enabled: !!providerId && !!date,
  });

export const useAddExtraHours = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { missionId: string; newRate: number }) =>
      addMissionExtraHours(params.missionId, params.newRate),
    onSuccess: (_, params) => {
      qc.invalidateQueries({ queryKey: missionKeys.detail(params.missionId) });
      qc.invalidateQueries({ queryKey: missionKeys.all });
      qc.invalidateQueries({ queryKey: profileKeys.providerStats });
    },
  });
};
