'use client';

import { useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { recurringProfilesApi } from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';
import { getLocalizedApiErrorMessage } from '@/lib/api-error';
import { useToastMutation } from '@/lib/hooks/use-toast-mutation';
import { idempotencyKeyFor, releaseIdempotencyKey } from '@/lib/utils/idempotency';

// Types

export type RecurringFrequency = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';

export interface RecurringProfileLine {
  accountId: string;
  debit: string;
  credit: string;
  description?: string;
  account?: {
    id: string;
    code: string;
    name: string;
    type: string;
  };
}

export interface RecurringProfile {
  id: string;
  name: string;
  description: string | null;
  frequency: RecurringFrequency;
  nextRunDate: string;
  autoPost: boolean;
  isActive: boolean;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
  lines: RecurringProfileLine[];
}

interface RecurringProfileParams {
  page?: number;
  limit?: number;
  search?: string;
  isActive?: boolean;
  frequency?: RecurringFrequency;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

interface CreateRecurringProfileData {
  name: string;
  description?: string;
  frequency: RecurringFrequency;
  startDate: string;
  autoPost?: boolean;
  lines: Array<{
    accountId: string;
    debit: string;
    credit: string;
    description?: string;
  }>;
}

interface UpdateRecurringProfileData {
  name?: string;
  description?: string;
  frequency?: RecurringFrequency;
  autoPost?: boolean;
  lines?: Array<{
    accountId: string;
    debit: string;
    credit: string;
    description?: string;
  }>;
}

/**
 * Hook to fetch all recurring profiles with pagination
 */
export function useRecurringProfiles(params?: RecurringProfileParams) {
  return useQuery({
    queryKey: ['recurring-profiles', params],
    queryFn: async () => {
      const response = await recurringProfilesApi.getAll(params);
      return response.data;
    },
  });
}

/**
 * Hook to fetch a single recurring profile by ID
 */
export function useRecurringProfile(id: string | undefined) {
  return useQuery({
    queryKey: ['recurring-profiles', id],
    queryFn: async () => {
      if (!id) throw new Error('Profile ID is required');
      const response = await recurringProfilesApi.getOne(id);
      return response.data as RecurringProfile;
    },
    enabled: !!id,
  });
}

const RECURRING_TOAST = 'accounting.recurring.toast';

/**
 * Hook to create a new recurring profile
 */
export function useCreateRecurringProfile() {
  return useToastMutation({
    namespace: RECURRING_TOAST,
    mutationFn: async (data: CreateRecurringProfileData) =>
      (await recurringProfilesApi.create(data)).data,
    invalidate: () => [['recurring-profiles']],
    success: 'created',
    error: 'createError',
  });
}

/**
 * Hook to update an existing recurring profile
 */
export function useUpdateRecurringProfile() {
  return useToastMutation({
    namespace: RECURRING_TOAST,
    mutationFn: async ({ id, data }: { id: string; data: UpdateRecurringProfileData }) =>
      (await recurringProfilesApi.update(id, data)).data,
    invalidate: ({ id }) => [['recurring-profiles'], ['recurring-profiles', id]],
    success: 'updated',
    error: 'updateError',
  });
}

/**
 * Hook to toggle recurring profile active state (the toast names the new state).
 */
export function useToggleRecurringProfile() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const t = useTranslations(RECURRING_TOAST);
  const tApiErrors = useTranslations('common.apiErrors');

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await recurringProfilesApi.toggle(id);
      return response.data as { isActive?: boolean };
    },
    onSuccess: (data, id) => {
      void queryClient.invalidateQueries({ queryKey: ['recurring-profiles'] });
      void queryClient.invalidateQueries({ queryKey: ['recurring-profiles', id] });
      const state = data?.isActive ? 'activated' : 'paused';
      toast({ title: t(state), description: t(`${state}Description`) });
    },
    onError: (error: unknown) => {
      toast({
        variant: 'destructive',
        title: t('toggleError'),
        description: getLocalizedApiErrorMessage(error, t('genericError'), tApiErrors),
      });
    },
  });
}

/**
 * Hook to delete a recurring profile
 */
export function useDeleteRecurringProfile() {
  return useToastMutation({
    namespace: RECURRING_TOAST,
    mutationFn: async (id: string) => (await recurringProfilesApi.delete(id)).data,
    invalidate: () => [['recurring-profiles']],
    success: 'deleted',
    error: 'deleteError',
  });
}

/**
 * Hook to execute a recurring profile immediately
 */
export function useExecuteRecurringProfile() {
  return useToastMutation({
    namespace: RECURRING_TOAST,
    mutationFn: async (id: string) => {
      const response = await recurringProfilesApi.execute(id, idempotencyKeyFor(`execute:${id}`));
      // A completed run frees its key; a failed one keeps it so a retry is the same request.
      releaseIdempotencyKey(`execute:${id}`);
      return response.data;
    },
    invalidate: (id) => [['recurring-profiles'], ['recurring-profiles', id]],
    success: 'executed',
    error: 'executeError',
  });
}

/**
 * Hook to fetch recurring profile statistics
 */
export function useRecurringProfileStatistics() {
  return useQuery({
    queryKey: ['recurring-profiles', 'statistics'],
    queryFn: async () => {
      const response = await recurringProfilesApi.getStatistics();
      return response.data;
    },
  });
}

/**
 * Hook to fetch execution history for a recurring profile
 */
export function useRecurringProfileExecutions(id: string | undefined, limit?: number) {
  return useQuery({
    queryKey: ['recurring-profiles', id, 'executions', limit],
    queryFn: async () => {
      if (!id) throw new Error('Profile ID is required');
      const response = await recurringProfilesApi.getExecutionHistory(
        id,
        limit ? { limit } : undefined,
      );
      return response.data;
    },
    enabled: !!id,
  });
}

/**
 * Translated frequency label (accounting.recurring.frequencies); unknown values show as sent.
 */
export function useFrequencyLabel(): (frequency: RecurringFrequency | string) => string {
  const t = useTranslations('accounting.recurring.frequencies');
  return useCallback(
    (frequency: RecurringFrequency | string) => {
      const key = String(frequency).toLowerCase();
      return t.has(key) ? t(key) : String(frequency);
    },
    [t],
  );
}
