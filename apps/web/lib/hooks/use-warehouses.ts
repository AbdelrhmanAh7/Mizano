'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';

// Types
export interface Warehouse {
  id: string;
  name: string;
  code: string;
  address: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  isDefault: boolean;
  isActive: boolean;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
  _count?: {
    stockLevels: number;
  };
}

export interface WarehouseStock {
  itemId: string;
  warehouseId: string;
  quantity: number;
  item: {
    id: string;
    name: string;
    sku: string | null;
    unit: string | null;
  };
}

export interface WarehouseParams {
  page?: number;
  limit?: number;
  search?: string;
  isActive?: boolean;
}

export interface CreateWarehouseData {
  name: string;
  code?: string;
  address?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  isDefault?: boolean;
}

export interface UpdateWarehouseData extends Partial<CreateWarehouseData> {}

// Warehouses API
const warehousesApi = {
  getAll: (params?: Record<string, any>) => api.get('/warehouses', { params }),
  getOne: (id: string) => api.get(`/warehouses/${id}`),
  getStock: (id: string) => api.get(`/warehouses/${id}/stock`),
  create: (data: any) => api.post('/warehouses', data),
  update: (id: string, data: any) => api.patch(`/warehouses/${id}`, data),
  delete: (id: string) => api.delete(`/warehouses/${id}`),
};

/**
 * Hook to fetch all warehouses
 */
export function useWarehouses(params?: WarehouseParams) {
  return useQuery({
    queryKey: ['warehouses', params],
    queryFn: async () => {
      const response = await warehousesApi.getAll(params);
      return response.data;
    },
  });
}

/**
 * Hook to fetch a single warehouse by ID
 */
export function useWarehouse(id: string | undefined) {
  return useQuery({
    queryKey: ['warehouses', id],
    queryFn: async () => {
      if (!id) throw new Error('Warehouse ID is required');
      const response = await warehousesApi.getOne(id);
      return response.data as Warehouse;
    },
    enabled: !!id,
  });
}

/**
 * Hook to fetch warehouse stock levels
 */
export function useWarehouseStock(id: string | undefined) {
  return useQuery({
    queryKey: ['warehouses', id, 'stock'],
    queryFn: async () => {
      if (!id) throw new Error('Warehouse ID is required');
      const response = await warehousesApi.getStock(id);
      return response.data as WarehouseStock[];
    },
    enabled: !!id,
  });
}

/**
 * Hook to create a new warehouse
 */
export function useCreateWarehouse() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: CreateWarehouseData) => {
      const response = await warehousesApi.create(data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouses'] });
      toast({
        title: 'Warehouse created',
        description: 'The warehouse has been created successfully.',
      });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error creating warehouse',
        description: error.response?.data?.message || 'An error occurred',
      });
    },
  });
}

/**
 * Hook to update an existing warehouse
 */
export function useUpdateWarehouse() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateWarehouseData }) => {
      const response = await warehousesApi.update(id, data);
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['warehouses'] });
      queryClient.invalidateQueries({ queryKey: ['warehouses', variables.id] });
      toast({
        title: 'Warehouse updated',
        description: 'The warehouse has been updated successfully.',
      });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error updating warehouse',
        description: error.response?.data?.message || 'An error occurred',
      });
    },
  });
}

/**
 * Hook to delete a warehouse
 */
export function useDeleteWarehouse() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await warehousesApi.delete(id);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouses'] });
      toast({
        title: 'Warehouse deleted',
        description: 'The warehouse has been deleted successfully.',
      });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error deleting warehouse',
        description: error.response?.data?.message || 'An error occurred',
      });
    },
  });
}

/**
 * Format warehouse address
 */
export function formatWarehouseAddress(warehouse: Warehouse): string {
  const parts = [
    warehouse.address,
    warehouse.city,
    warehouse.state,
    warehouse.postalCode,
    warehouse.country,
  ].filter(Boolean);
  return parts.join(', ') || '-';
}
