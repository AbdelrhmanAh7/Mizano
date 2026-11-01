'use client';

import { useTranslations } from 'next-intl';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { rolesApi } from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';
import { getLocalizedApiErrorMessage } from '@/lib/api-error';
import { useToastMutation } from '@/lib/hooks/use-toast-mutation';

interface RoleParams {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

interface CreateRoleData {
  name: string;
  description?: string;
  permissions: Array<{
    module: string;
    actions: string[];
  }>;
}

interface UpdateRoleData extends Partial<CreateRoleData> {}

interface AssignRoleData {
  userId: string;
  roleId: string;
}

/**
 * Hook to fetch all roles with pagination
 */
export function useRoles(params?: RoleParams) {
  return useQuery({
    queryKey: ['roles', params],
    queryFn: async () => {
      const response = await rolesApi.getAll(params);
      return response.data;
    },
  });
}

/**
 * Hook to fetch a single role by ID
 */
export function useRole(id: string | undefined) {
  return useQuery({
    queryKey: ['roles', id],
    queryFn: async () => {
      if (!id) throw new Error('Role ID is required');
      const response = await rolesApi.getOne(id);
      return response.data;
    },
    enabled: !!id,
  });
}

/**
 * Hook to create a new role
 */
export function useCreateRole() {
  return useToastMutation({
    namespace: 'settings.team.toast',
    mutationFn: async (data: CreateRoleData) => (await rolesApi.create(data)).data,
    invalidate: () => [['roles']],
    success: 'roleCreated',
    error: 'roleCreateError',
  });
}

/**
 * Hook to update an existing role
 */
export function useUpdateRole() {
  return useToastMutation({
    namespace: 'settings.team.toast',
    mutationFn: async ({ id, data }: { id: string; data: UpdateRoleData }) =>
      (await rolesApi.update(id, data)).data,
    invalidate: ({ id }) => [['roles'], ['roles', id]],
    success: 'roleUpdated',
    error: 'roleUpdateError',
  });
}

/**
 * Hook to delete a role
 */
export function useDeleteRole() {
  return useToastMutation({
    namespace: 'settings.team.toast',
    mutationFn: async (id: string) => (await rolesApi.delete(id)).data,
    invalidate: () => [['roles']],
    success: 'roleDeleted',
    error: 'roleDeleteError',
  });
}

/**
 * Hook to seed default roles
 */
export function useSeedDefaultRoles() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const t = useTranslations('settings.team.toast');
  const tApiErrors = useTranslations('common.apiErrors');

  return useMutation({
    mutationFn: async () => {
      const response = await rolesApi.seedDefaults();
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      toast({
        title: t('rolesSeeded'),
        description: data.message || t('rolesSeededDescription'),
      });
    },
    onError: (error: unknown) => {
      toast({
        variant: 'destructive',
        title: t('rolesSeedError'),
        description: getLocalizedApiErrorMessage(error, t('genericError'), tApiErrors),
      });
    },
  });
}

/**
 * Hook to assign a role to a user
 */
export function useAssignRole() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const t = useTranslations('settings.team.toast');
  const tApiErrors = useTranslations('common.apiErrors');

  return useMutation({
    mutationFn: async (data: AssignRoleData) => {
      const response = await rolesApi.assignRole(data);
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast({
        title: t('roleAssigned'),
        description: data.message || t('roleAssignedDescription'),
      });
    },
    onError: (error: unknown) => {
      toast({
        variant: 'destructive',
        title: t('roleAssignError'),
        description: getLocalizedApiErrorMessage(error, t('genericError'), tApiErrors),
      });
    },
  });
}
