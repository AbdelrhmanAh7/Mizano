'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { userPreferencesApi } from '../api/user-preferences';

export function useUserPreferences() {
  return useQuery({
    queryKey: ['user-preferences'],
    queryFn: async () => {
      const response = await userPreferencesApi.get();
      return response.data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
  });
}

export function useUpdateTourProgress() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      tourId,
      completed,
      currentStep,
    }: {
      tourId: string;
      completed: boolean;
      currentStep?: number;
    }) => {
      const response = await userPreferencesApi.updateTour(tourId, {
        completed,
        currentStep,
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-preferences'] });
    },
  });
}

export function useDismissTour() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (tourId: string) => {
      const response = await userPreferencesApi.dismissTour(tourId);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-preferences'] });
    },
  });
}
