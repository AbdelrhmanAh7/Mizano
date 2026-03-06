'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { rolesApi } from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';

type ApiError = { response?: { data?: { message?: string } } };

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
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: CreateRoleData) => {
      const response = await rolesApi.create(data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      toast({
        title: 'Role created',
        description: 'The role has been created successfully.',
      });
    },
    onError: (error: ApiError) => {
      toast({
        variant: 'destructive',
        title: 'Error creating role',
        description: error.response?.data?.message || 'An error occurred',
      });
    },
  });
}

/**
 * Hook to update an existing role
 */
export function useUpdateRole() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateRoleData }) => {
      const response = await rolesApi.update(id, data);
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      queryClient.invalidateQueries({ queryKey: ['roles', variables.id] });
      toast({
        title: 'Role updated',
        description: 'The role has been updated successfully.',
      });
    },
    onError: (error: ApiError) => {
      toast({
        variant: 'destructive',
        title: 'Error updating role',
        description: error.response?.data?.message || 'An error occurred',
      });
    },
  });
}

/**
 * Hook to delete a role
 */
export function useDeleteRole() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await rolesApi.delete(id);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      toast({
        title: 'Role deleted',
        description: 'The role has been deleted successfully.',
      });
    },
    onError: (error: ApiError) => {
      toast({
        variant: 'destructive',
        title: 'Error deleting role',
        description: error.response?.data?.message || 'An error occurred',
      });
    },
  });
}

/**
 * Hook to seed default roles
 */
export function useSeedDefaultRoles() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async () => {
      const response = await rolesApi.seedDefaults();
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      toast({
        title: 'Roles seeded',
        description: data.message || 'Default roles have been created.',
      });
    },
    onError: (error: ApiError) => {
      toast({
        variant: 'destructive',
        title: 'Error seeding roles',
        description: error.response?.data?.message || 'An error occurred',
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

  return useMutation({
    mutationFn: async (data: AssignRoleData) => {
      const response = await rolesApi.assignRole(data);
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast({
        title: 'Role assigned',
        description: data.message || 'The role has been assigned successfully.',
      });
    },
    onError: (error: ApiError) => {
      toast({
        variant: 'destructive',
        title: 'Error assigning role',
        description: error.response?.data?.message || 'An error occurred',
      });
    },
  });
}
