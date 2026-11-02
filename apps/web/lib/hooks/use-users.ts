'use client';

import { useQuery } from '@tanstack/react-query';
import { usersApi } from '@/lib/api';
import { useToastMutation } from '@/lib/hooks/use-toast-mutation';

interface UserParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  roleId?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

interface CreateUserData {
  email: string;
  name: string;
  password: string;
  roleId: string;
}

interface UpdateUserData {
  email?: string;
  name?: string;
  status?: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  roleId?: string;
}

/**
 * Hook to fetch all users with pagination
 */
export function useUsers(params?: UserParams) {
  return useQuery({
    queryKey: ['users', params],
    queryFn: async () => {
      const response = await usersApi.getAll(params);
      return response.data;
    },
  });
}

/**
 * Hook to fetch a single user by ID
 */
export function useUser(id: string | undefined) {
  return useQuery({
    queryKey: ['users', id],
    queryFn: async () => {
      if (!id) throw new Error('User ID is required');
      const response = await usersApi.getOne(id);
      return response.data;
    },
    enabled: !!id,
  });
}

/**
 * Hook to create a new user
 */
export function useCreateUser() {
  return useToastMutation({
    namespace: 'settings.team.toast',
    mutationFn: async (data: CreateUserData) => (await usersApi.create(data)).data,
    invalidate: () => [['users']],
    success: 'userCreated',
    error: 'userCreateError',
  });
}

/**
 * Hook to update an existing user
 */
export function useUpdateUser() {
  return useToastMutation({
    namespace: 'settings.team.toast',
    mutationFn: async ({ id, data }: { id: string; data: UpdateUserData }) =>
      (await usersApi.update(id, data)).data,
    invalidate: ({ id }) => [['users'], ['users', id]],
    success: 'userUpdated',
    error: 'userUpdateError',
  });
}

/**
 * Hook to delete a user
 */
export function useDeleteUser() {
  return useToastMutation({
    namespace: 'settings.team.toast',
    mutationFn: async (id: string) => (await usersApi.delete(id)).data,
    invalidate: () => [['users']],
    success: 'userDeleted',
    error: 'userDeleteError',
  });
}

/**
 * Hook to create a one-time password reset link for a member (shown once, to copy)
 */
export function useCreateResetLink() {
  return useToastMutation({
    namespace: 'settings.team.toast',
    mutationFn: async ({ id, locale }: { id: string; locale: string }) =>
      (await usersApi.createResetLink(id, locale)).data,
    invalidate: () => [],
    success: 'resetLinkCreated',
    error: 'resetLinkError',
  });
}

/**
 * Helper to get user status badge color
 */
export function getUserStatusColor(status: string): string {
  const colorMap: Record<string, string> = {
    ACTIVE: 'bg-success/10 text-success',
    INACTIVE: 'bg-muted text-foreground',
    SUSPENDED: 'bg-destructive/10 text-destructive',
  };
  return colorMap[status] || 'bg-muted text-foreground';
}
