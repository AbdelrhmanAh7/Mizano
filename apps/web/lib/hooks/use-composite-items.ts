'use client';

import { useToast } from '@/components/ui/use-toast';
import { compositeItemsApi } from '@/lib/api';
import { useInfiniteTableData } from '@/lib/hooks/use-infinite-table-data';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

// Types
type ApiError = { response?: { data?: { message?: string } } };

export interface CompositeItemComponent {
  id: string;
  itemId: string;
  quantity: string;
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

export interface CompositeItemParams {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

interface CreateCompositeItemData {
  name: string;
  sku: string;
  sellingPrice: string;
  description?: string;
  components: Array<{ itemId: string; quantity: string }>;
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

export function useCompositeItems(params?: CompositeItemParams) {
  return useQuery({
    queryKey: ['composite-items', params],
    queryFn: async () => {
      const response = await compositeItemsApi.getAll(params);
      return response.data;
    },
  });
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
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: CreateCompositeItemData) => {
      const response = await compositeItemsApi.create(data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['composite-items'] });
      toast({
        title: 'Composite item created',
        description: 'The composite item has been created successfully.',
      });
    },
    onError: (error: ApiError) => {
      toast({
        variant: 'destructive',
        title: 'Error creating composite item',
        description: error.response?.data?.message || 'An error occurred',
      });
    },
  });
}

export function useUpdateCompositeItem() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateCompositeItemData }) => {
      const response = await compositeItemsApi.update(id, data);
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['composite-items'] });
      queryClient.invalidateQueries({ queryKey: ['composite-items', variables.id] });
      toast({
        title: 'Composite item updated',
        description: 'The composite item has been updated successfully.',
      });
    },
    onError: (error: ApiError) => {
      toast({
        variant: 'destructive',
        title: 'Error updating composite item',
        description: error.response?.data?.message || 'An error occurred',
      });
    },
  });
}

export function useDeleteCompositeItem() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await compositeItemsApi.delete(id);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['composite-items'] });
      toast({
        title: 'Composite item deleted',
        description: 'The composite item has been deleted successfully.',
      });
    },
    onError: (error: ApiError) => {
      toast({
        variant: 'destructive',
        title: 'Error deleting composite item',
        description: error.response?.data?.message || 'An error occurred',
      });
    },
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
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
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
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['composite-items'] });
      queryClient.invalidateQueries({ queryKey: ['composite-items', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['inventory-levels'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-movements'] });
      toast({
        title: 'Assembly completed',
        description: 'The composite item has been assembled successfully.',
      });
    },
    onError: (error: ApiError) => {
      toast({
        variant: 'destructive',
        title: 'Error assembling composite item',
        description: error.response?.data?.message || 'An error occurred',
      });
    },
  });
}

export function formatCurrency(amount: string | number | null | undefined): string {
  if (amount === null || amount === undefined) return '$0.00';
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num);
}
