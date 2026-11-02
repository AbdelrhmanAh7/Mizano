'use client';

import { useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { itemsApi } from '@/lib/api';
import { useInfiniteTableData } from '@/lib/hooks/use-infinite-table-data';
import { useToastMutation } from '@/lib/hooks/use-toast-mutation';
import { useQuery, UseMutationResult } from '@tanstack/react-query';

export type ItemType = 'GOODS' | 'SERVICE' | 'DIGITAL';

export interface Item {
  id: string;
  sku: string | null;
  name: string;
  description: string | null;
  type: ItemType;
  unit: string | null;
  sellingPrice: string;
  salesPrice: string | null;
  purchasePrice: string | null;
  costPrice: string | null;
  taxRate: string | null;
  trackInventory: boolean;
  currentStock: number;
  reorderPoint: number | null;
  reorderLevel: number | null;
  salesAccountId: string | null;
  purchaseAccountId: string | null;
  inventoryAccountId: string | null;
  isActive: boolean;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  salesAccount?: {
    id: string;
    name: string;
    code: string;
  };
  purchaseAccount?: {
    id: string;
    name: string;
    code: string;
  };
  inventoryAccount?: {
    id: string;
    name: string;
    code: string;
  };
}

export interface ItemParams {
  page?: number;
  limit?: number;
  search?: string;
  type?: ItemType;
  isActive?: boolean;
  lowStock?: boolean;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export const ITEM_TYPES = ['GOODS', 'SERVICE', 'DIGITAL'] as const;

export const UNIT_CODES = [
  'pcs',
  'kg',
  'g',
  'lb',
  'oz',
  'l',
  'ml',
  'm',
  'cm',
  'ft',
  'in',
  'box',
  'pack',
  'hr',
  'day',
] as const;

/** The items API body (CreateItemDto): decimal-string prices, null clears an optional field. */
export interface CreateItemData {
  name: string;
  sku: string;
  type: ItemType;
  unit?: string;
  description?: string | null;
  sellingPrice: string;
  costPrice?: string;
  reorderPoint?: number | null;
  salesAccountId?: string | null;
  purchaseAccountId?: string | null;
  inventoryAccountId?: string | null;
}

export type UpdateItemData = Partial<CreateItemData>;

/**
 * Hook to fetch all items with pagination
 */
export function useItems(params?: ItemParams) {
  return useQuery({
    queryKey: ['items', params],
    queryFn: async () => {
      const response = await itemsApi.getAll(params);
      return response.data;
    },
  });
}

/**
 * Hook to fetch all items with cursor-based pagination (virtual scroll)
 */
export function useInfiniteItems(params?: Record<string, unknown>) {
  return useInfiniteTableData<Item, Record<string, unknown>>({
    queryKey: ['items'],
    fetchFn: async (p) => {
      const response = await itemsApi.getAllCursor(p);
      return response.data;
    },
    params: params || {},
  });
}

/**
 * Hook to fetch a single item by ID
 */
export function useItem(id: string | undefined) {
  return useQuery({
    queryKey: ['items', id],
    queryFn: async () => {
      if (!id) throw new Error('Item ID is required');
      const response = await itemsApi.getOne(id);
      return response.data as Item;
    },
    enabled: !!id,
  });
}

/**
 * Hook to create a new item
 */
export function useCreateItem(): UseMutationResult<Item, unknown, CreateItemData> {
  return useToastMutation({
    namespace: 'inventory.items.toast',
    mutationFn: async (data: CreateItemData) => (await itemsApi.create(data)).data as Item,
    invalidate: () => [['items']],
    success: 'created',
    error: 'createError',
  });
}

/**
 * Hook to update an existing item
 */
export function useUpdateItem(): UseMutationResult<
  Item,
  unknown,
  { id: string; data: UpdateItemData }
> {
  return useToastMutation({
    namespace: 'inventory.items.toast',
    mutationFn: async ({ id, data }: { id: string; data: UpdateItemData }) =>
      (await itemsApi.update(id, data)).data as Item,
    invalidate: ({ id }) => [['items'], ['items', id]],
    success: 'updated',
    error: 'updateError',
  });
}

/**
 * Hook to delete an item
 */
export function useDeleteItem(): UseMutationResult<unknown, unknown, string> {
  return useToastMutation({
    namespace: 'inventory.items.toast',
    mutationFn: async (id: string) => (await itemsApi.delete(id)).data,
    invalidate: () => [['items']],
    success: 'deleted',
    error: 'deleteError',
  });
}

/** Translated item type label. */
export function useItemTypeLabel(): (type: ItemType) => string {
  const t = useTranslations('inventory.items.types');
  return useCallback(
    (type: ItemType) => (t.has(type.toLowerCase()) ? t(type.toLowerCase()) : type),
    [t],
  );
}

/**
 * Get item type color
 */
export function getItemTypeColor(type: ItemType): string {
  const colorMap: Record<ItemType, string> = {
    GOODS: 'bg-info/10 text-info',
    SERVICE: 'bg-success/10 text-success',
    DIGITAL: 'bg-primary/10 text-primary',
  };
  return colorMap[type] || 'bg-muted text-foreground';
}

/**
 * Stock status of an item (`inventory.items.stockStatus.<status>` is its label).
 */
export function getStockStatus(item: Item): {
  status: 'ok' | 'low' | 'out';
  color: string;
} {
  if (!item.trackInventory) {
    return { status: 'ok', color: 'text-muted-foreground' };
  }
  if (item.currentStock <= 0) {
    return { status: 'out', color: 'text-destructive' };
  }
  if (item.reorderPoint && item.currentStock <= item.reorderPoint) {
    return { status: 'low', color: 'text-warning' };
  }
  return { status: 'ok', color: 'text-success' };
}
