'use client';

import { useToastMutation } from './use-toast-mutation';
import { compositeItemsApi } from '@/lib/api';
import { useInfiniteTableData } from '@/lib/hooks/use-infinite-table-data';
import { useQuery } from '@tanstack/react-query';

// Types
export interface CompositeItemComponent {
  id: string;
  itemId: string;
  /** Whole units (the column is an integer). */
  quantity: number;
  item?: {
    id: string;
    name: string;
    sku: string;
    unit: string;
  };
}

export interface CompositeItem {
  id: string;
  name: string;
  sku: string;
  sellingPrice: string;
  description: string | null;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
  components: CompositeItemComponent[];
}

/** POST/PATCH /composite-items: price as a decimal string, component quantities as whole units. */
export interface CreateCompositeItemData {
  name: string;
  sku: string;
  sellingPrice: string;
  description?: string;
  components: Array<{ itemId: string; quantity: number }>;
}

interface UpdateCompositeItemData extends Partial<CreateCompositeItemData> {}

interface AvailabilityResult {
  available: boolean;
  maxAssemblyQuantity: number;
  components: Array<{
    itemId: string;
    itemName: string;
    required: number;
    available: number;
    sufficient: boolean;
  }>;
}

export function useInfiniteCompositeItems(params?: Record<string, unknown>) {
  return useInfiniteTableData<CompositeItem, Record<string, unknown>>({
    queryKey: ['composite-items'],
    fetchFn: async (p) => {
      const response = await compositeItemsApi.getAllCursor(p);
      return response.data;
    },
    params: params || {},
  });
}

export function useCompositeItem(id: string | undefined) {
  return useQuery({
    queryKey: ['composite-items', id],
    queryFn: async () => {
      if (!id) throw new Error('Composite item ID is required');
      const response = await compositeItemsApi.getOne(id);
      return response.data as CompositeItem;
    },
    enabled: !!id,
  });
}

export function useCreateCompositeItem() {
  return useToastMutation({
    namespace: 'inventory.compositeItems.toast',
    mutationFn: async (data: CreateCompositeItemData) => {
      const response = await compositeItemsApi.create(data);
      return response.data;
    },
    invalidate: () => [['composite-items']],
    success: 'created',
    error: 'createError',
  });
}

export function useUpdateCompositeItem() {
  return useToastMutation({
    namespace: 'inventory.compositeItems.toast',
    mutationFn: async ({ id, data }: { id: string; data: UpdateCompositeItemData }) => {
      const response = await compositeItemsApi.update(id, data);
      return response.data;
    },
    invalidate: (variables) => [['composite-items'], ['composite-items', variables.id]],
    success: 'updated',
    error: 'updateError',
  });
}

export function useDeleteCompositeItem() {
  return useToastMutation({
    namespace: 'inventory.compositeItems.toast',
    mutationFn: async (id: string) => {
      const response = await compositeItemsApi.delete(id);
      return response.data;
    },
    invalidate: () => [['composite-items']],
    success: 'deleted',
    error: 'deleteError',
  });
}

export function useCheckAvailability(id: string | undefined, quantity?: number) {
  return useQuery({
    queryKey: ['composite-items', id, 'availability', quantity],
    queryFn: async () => {
      if (!id) throw new Error('Composite item ID is required');
      const response = await compositeItemsApi.checkAvailability(id, quantity);
      return response.data as AvailabilityResult;
    },
    enabled: !!id,
  });
}

export function useAssembleCompositeItem() {
  return useToastMutation({
    namespace: 'inventory.compositeItems.toast',
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: { quantity: number; warehouseId: string };
    }) => {
      const response = await compositeItemsApi.assemble(id, data);
      return response.data;
    },
    invalidate: (variables) => [
      ['composite-items'],
      ['composite-items', variables.id],
      ['inventory-levels'],
      ['inventory-movements'],
    ],
    success: 'assembled',
    error: 'assembleError',
  });
}
