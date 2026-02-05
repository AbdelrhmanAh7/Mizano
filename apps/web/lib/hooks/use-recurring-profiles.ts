'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { recurringProfilesApi } from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';

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
  nextExecutionDate: string;
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

/**
 * Hook to create a new recurring profile
 */
export function useCreateRecurringProfile() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: CreateRecurringProfileData) => {
      const response = await recurringProfilesApi.create(data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurring-profiles'] });
      toast({
        title: 'Profile created',
        description: 'The recurring profile has been created successfully.',
      });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error creating profile',
        description: error.response?.data?.message || 'An error occurred',
      });
    },
  });
}

/**
 * Hook to update an existing recurring profile
 */
export function useUpdateRecurringProfile() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateRecurringProfileData }) => {
      const response = await recurringProfilesApi.update(id, data);
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['recurring-profiles'] });
      queryClient.invalidateQueries({ queryKey: ['recurring-profiles', variables.id] });
      toast({
        title: 'Profile updated',
        description: 'The recurring profile has been updated successfully.',
      });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error updating profile',
        description: error.response?.data?.message || 'An error occurred',
      });
    },
  });
}

/**
 * Hook to toggle recurring profile active state
 */
export function useToggleRecurringProfile() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await recurringProfilesApi.toggle(id);
      return response.data;
    },
    onSuccess: (data, id) => {
      queryClient.invalidateQueries({ queryKey: ['recurring-profiles'] });
      queryClient.invalidateQueries({ queryKey: ['recurring-profiles', id] });
      toast({
        title: data.isActive ? 'Profile activated' : 'Profile deactivated',
        description: `The recurring profile has been ${data.isActive ? 'activated' : 'deactivated'} successfully.`,
      });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error toggling profile',
        description: error.response?.data?.message || 'An error occurred',
      });
    },
  });
}

/**
 * Hook to delete a recurring profile
 */
export function useDeleteRecurringProfile() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await recurringProfilesApi.delete(id);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurring-profiles'] });
      toast({
        title: 'Profile deleted',
        description: 'The recurring profile has been deleted successfully.',
      });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error deleting profile',
        description: error.response?.data?.message || 'An error occurred',
      });
    },
  });
}

/**
 * Get frequency display label
 */
export function getFrequencyLabel(frequency: RecurringFrequency): string {
  const labelMap: Record<RecurringFrequency, string> = {
    DAILY: 'Daily',
    WEEKLY: 'Weekly',
    MONTHLY: 'Monthly',
    YEARLY: 'Yearly',
  };
  return labelMap[frequency] || frequency;
}

/**
 * Get frequency badge color
 */
export function getFrequencyColor(frequency: RecurringFrequency): string {
  const colorMap: Record<RecurringFrequency, string> = {
    DAILY: 'bg-blue-100 text-blue-800',
    WEEKLY: 'bg-purple-100 text-purple-800',
    MONTHLY: 'bg-green-100 text-green-800',
    YEARLY: 'bg-orange-100 text-orange-800',
  };
  return colorMap[frequency] || 'bg-gray-100 text-gray-800';
}

/**
 * Get status badge color
 */
export function getProfileStatusColor(isActive: boolean): string {
  return isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800';
}

/**
 * Format next execution date
 */
export function formatNextExecution(date: string): string {
  const nextDate = new Date(date);
  const now = new Date();
  const diffTime = nextDate.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return 'Overdue';
  } else if (diffDays === 0) {
    return 'Today';
  } else if (diffDays === 1) {
    return 'Tomorrow';
  } else if (diffDays <= 7) {
    return `In ${diffDays} days`;
  } else {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(nextDate);
  }
}
