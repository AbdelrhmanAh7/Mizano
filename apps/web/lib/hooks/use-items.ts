'use client';

import { useToast } from '@/components/ui/use-toast';
import { itemsApi } from '@/lib/api';
import { useInfiniteTableData } from '@/lib/hooks/use-infinite-table-data';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

// Types
type ApiError = { response?: { data?: { message?: string } } };

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
  taxRateId: string | null;
  taxRate?: {
    id: string;
    name: string;
    rate: number;
  };
  trackInventory: boolean;
  stockLevel: number;
  reorderPoint: number | null;
  reorderQuantity: number | null;
  incomeAccountId: string | null;
  expenseAccountId: string | null;
  inventoryAccountId: string | null;
  isActive: boolean;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  incomeAccount?: {
    id: string;
    name: string;
    code: string;
  };
  expenseAccount?: {
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

export interface CreateItemData {
  sku?: string;
  name: string;
  description?: string;
  type: ItemType;
  unit?: string;
  salesPrice?: number;
  purchasePrice?: number;
  taxRateId?: string;
  trackInventory?: boolean;
  openingStock?: number;
  reorderPoint?: number;
  reorderQuantity?: number;
  incomeAccountId?: string;
  expenseAccountId?: string;
  inventoryAccountId?: string;
}

export interface UpdateItemData extends Partial<CreateItemData> {}

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
 * Hook to fetch active items for dropdowns (simplified query)
 */
export function useActiveItems() {
  return useQuery({
    queryKey: ['items', 'active'],
    queryFn: async () => {
      const response = await itemsApi.getAll({ isActive: true, limit: 1000 });
      return (response.data.data || response.data) as Item[];
    },
  });
}

/**
 * Hook to create a new item
 */
export function useCreateItem() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: CreateItemData) => {
      const response = await itemsApi.create(data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items'] });
      toast({
        title: 'Item created',
        description: 'The item has been created successfully.',
      });
    },
    onError: (error: ApiError) => {
      toast({
        variant: 'destructive',
        title: 'Error creating item',
        description: error.response?.data?.message || 'An error occurred',
      });
    },
  });
}

/**
 * Hook to update an existing item
 */
export function useUpdateItem() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateItemData }) => {
      const response = await itemsApi.update(id, data);
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['items'] });
      queryClient.invalidateQueries({ queryKey: ['items', variables.id] });
      toast({
        title: 'Item updated',
        description: 'The item has been updated successfully.',
      });
    },
    onError: (error: ApiError) => {
      toast({
        variant: 'destructive',
        title: 'Error updating item',
        description: error.response?.data?.message || 'An error occurred',
      });
    },
  });
}

/**
 * Hook to delete an item
 */
export function useDeleteItem() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await itemsApi.delete(id);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items'] });
      toast({
        title: 'Item deleted',
        description: 'The item has been deleted successfully.',
      });
    },
    onError: (error: ApiError) => {
      toast({
        variant: 'destructive',
        title: 'Error deleting item',
        description: error.response?.data?.message || 'An error occurred',
      });
    },
  });
}

/**
 * Get item type label
 */
export function getItemTypeLabel(type: ItemType): string {
  const labelMap: Record<ItemType, string> = {
    GOODS: 'Goods',
    SERVICE: 'Service',
    DIGITAL: 'Digital',
  };
  return labelMap[type] || type;
}

/**
 * Get item type color
 */
export function getItemTypeColor(type: ItemType): string {
  const colorMap: Record<ItemType, string> = {
    GOODS: 'bg-blue-100 text-blue-800',
    SERVICE: 'bg-green-100 text-green-800',
    DIGITAL: 'bg-purple-100 text-purple-800',
  };
  return colorMap[type] || 'bg-gray-100 text-gray-800';
}

/**
 * Get item type badge variant
 */
export function getTypeVariant(type: ItemType): 'default' | 'secondary' | 'outline' {
  switch (type) {
    case 'GOODS':
      return 'default';
    case 'SERVICE':
      return 'secondary';
    case 'DIGITAL':
      return 'outline';
    default:
      return 'default';
  }
}

/**
 * Get stock status
 */
export function getStockStatus(item: Item): {
  status: 'ok' | 'low' | 'out';
  label: string;
  color: string;
} {
  if (!item.trackInventory) {
    return { status: 'ok', label: 'N/A', color: 'text-gray-500' };
  }
  if (item.stockLevel <= 0) {
    return { status: 'out', label: 'Out of Stock', color: 'text-red-600' };
  }
  if (item.reorderPoint && item.stockLevel <= item.reorderPoint) {
    return { status: 'low', label: 'Low Stock', color: 'text-yellow-600' };
  }
  return { status: 'ok', label: 'In Stock', color: 'text-green-600' };
}

/**
 * Format currency amount
 */
export function formatCurrency(amount: string | number | null, currency: string = 'USD'): string {
  if (amount === null || amount === undefined) return '-';
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return '-';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(num);
}

/**
 * Item type options for dropdowns
 */
export const itemTypeOptions = [
  { value: 'GOODS', label: 'Goods', description: 'Physical products with inventory tracking' },
  { value: 'SERVICE', label: 'Service', description: 'Services without inventory' },
  { value: 'DIGITAL', label: 'Digital', description: 'Digital products' },
];

/**
 * Common unit options
 */
export const unitOptions = [
  { value: 'pcs', label: 'Pieces' },
  { value: 'kg', label: 'Kilograms' },
  { value: 'g', label: 'Grams' },
  { value: 'lb', label: 'Pounds' },
  { value: 'oz', label: 'Ounces' },
  { value: 'l', label: 'Liters' },
  { value: 'ml', label: 'Milliliters' },
  { value: 'm', label: 'Meters' },
  { value: 'cm', label: 'Centimeters' },
  { value: 'ft', label: 'Feet' },
  { value: 'in', label: 'Inches' },
  { value: 'box', label: 'Boxes' },
  { value: 'pack', label: 'Packs' },
  { value: 'hr', label: 'Hours' },
  { value: 'day', label: 'Days' },
];
