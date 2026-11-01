'use client';

import { useToastMutation } from './use-toast-mutation';
import { useQuery } from '@tanstack/react-query';
import { warehousesApi } from '@/lib/api';

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
  return useToastMutation({
    namespace: 'inventory.warehouses.toast',
    mutationFn: async (data: CreateWarehouseData) => {
      const response = await warehousesApi.create(data);
      return response.data;
    },
    invalidate: () => [['warehouses']],
    success: 'created',
    error: 'createError',
  });
}

/**
 * Hook to update an existing warehouse
 */
export function useUpdateWarehouse() {
  return useToastMutation({
    namespace: 'inventory.warehouses.toast',
    mutationFn: async ({ id, data }: { id: string; data: UpdateWarehouseData }) => {
      const response = await warehousesApi.update(id, data);
      return response.data;
    },
    invalidate: (variables) => [['warehouses'], ['warehouses', variables.id]],
    success: 'updated',
    error: 'updateError',
  });
}

/**
 * Hook to delete a warehouse
 */
export function useDeleteWarehouse() {
  return useToastMutation({
    namespace: 'inventory.warehouses.toast',
    mutationFn: async (id: string) => {
      const response = await warehousesApi.delete(id);
      return response.data;
    },
    invalidate: () => [['warehouses']],
    success: 'deleted',
    error: 'deleteError',
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
