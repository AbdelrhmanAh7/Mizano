'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usersApi } from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';

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
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: CreateUserData) => {
      const response = await usersApi.create(data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast({
        title: 'User created',
        description: 'The user has been created successfully.',
      });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error creating user',
        description: error.response?.data?.message || 'An error occurred',
      });
    },
  });
}

/**
 * Hook to update an existing user
 */
export function useUpdateUser() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateUserData }) => {
      const response = await usersApi.update(id, data);
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['users', variables.id] });
      toast({
        title: 'User updated',
        description: 'The user has been updated successfully.',
      });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error updating user',
        description: error.response?.data?.message || 'An error occurred',
      });
    },
  });
}

/**
 * Hook to delete a user
 */
export function useDeleteUser() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await usersApi.delete(id);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast({
        title: 'User deleted',
        description: 'The user has been deleted successfully.',
      });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error deleting user',
        description: error.response?.data?.message || 'An error occurred',
      });
    },
  });
}

/**
 * Helper to get user status badge color
 */
export function getUserStatusColor(status: string): string {
  const colorMap: Record<string, string> = {
    ACTIVE: 'bg-green-100 text-green-800',
    INACTIVE: 'bg-gray-100 text-gray-800',
    SUSPENDED: 'bg-red-100 text-red-800',
  };
  return colorMap[status] || 'bg-gray-100 text-gray-800';
}
