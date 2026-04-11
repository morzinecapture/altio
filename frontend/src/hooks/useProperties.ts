import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getProperties,
  getProperty,
  createProperty,
  updateProperty,
  deleteProperty,
  syncIcal,
  getReservations,
} from '../api';
import { getPropertyReservations, getUpcomingReservations, getMonthReservations } from '../api/properties';
import type { CreatePropertyPayload, UpdatePropertyPayload } from '../api/_client';

export const propertyKeys = {
  all: ['properties'] as const,
  list: ['properties', 'list'] as const,
  detail: (id: string) => ['properties', 'detail', id] as const,
  reservations: (id: string) => ['properties', 'reservations', id] as const,
};

export const useProperties = () =>
  useQuery({
    queryKey: propertyKeys.list,
    queryFn: getProperties,
  });

export const useProperty = (id: string) =>
  useQuery({
    queryKey: propertyKeys.detail(id),
    queryFn: () => getProperty(id),
    enabled: !!id,
  });

export const useReservations = (propertyId: string) =>
  useQuery({
    queryKey: propertyKeys.reservations(propertyId),
    queryFn: () => getReservations(propertyId),
    enabled: !!propertyId,
  });

export const usePropertyReservations = (propertyId: string) =>
  useQuery({
    queryKey: ['properties', 'reservations-with-missions', propertyId],
    queryFn: () => getPropertyReservations(propertyId),
    enabled: !!propertyId,
  });

export const useUpcomingReservations = () =>
  useQuery({
    queryKey: ['reservations', 'upcoming'],
    queryFn: getUpcomingReservations,
  });

export const useMonthReservations = (year: number, month: number, propertyId?: string) =>
  useQuery({
    queryKey: ['reservations', 'month', year, month, propertyId],
    queryFn: () => getMonthReservations(year, month, propertyId),
  });

export const useCreateProperty = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreatePropertyPayload) => createProperty(data),
    onSuccess: () => {
      console.error('[useCreateProperty] onSuccess — invalidating cache');
      qc.invalidateQueries({ queryKey: propertyKeys.all });
    },
    onError: (error: Error) => {
      console.error('[useCreateProperty] onError:', error.message);
    },
  });
};

export const useUpdateProperty = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { id: string; data: UpdatePropertyPayload }) =>
      updateProperty(params.id, params.data),
    onSuccess: (_, params) => {
      qc.invalidateQueries({ queryKey: propertyKeys.detail(params.id) });
      qc.invalidateQueries({ queryKey: propertyKeys.list });
    },
  });
};

export const useDeleteProperty = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteProperty(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: propertyKeys.all });
    },
  });
};

export const useSyncIcal = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (propertyId: string) => syncIcal(propertyId),
    onSuccess: (_, propertyId) => {
      qc.invalidateQueries({ queryKey: propertyKeys.reservations(propertyId) });
    },
  });
};
