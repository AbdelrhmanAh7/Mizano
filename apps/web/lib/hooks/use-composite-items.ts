'use client';

import { useTranslations } from 'next-intl';
import { useToast } from '@/components/ui/use-toast';
import { getLocalizedApiErrorMessage } from '@/lib/api-error';
import { compositeItemsApi } from '@/lib/api';
import { useInfiniteTableData } from '@/lib/hooks/use-infinite-table-data';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

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
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const t = useTranslations('inventory.compositeItems.toast');
  const tApiErrors = useTranslations('common.apiErrors');

  return useMutation({
    mutationFn: async (data: CreateCompositeItemData) => {
      const response = await compositeItemsApi.create(data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['composite-items'] });
      toast({
        title: t('created'),
        description: t('createdDescription'),
      });
    },
    onError: (error: unknown) => {
      toast({
        variant: 'destructive',
        title: t('createError'),
        description: getLocalizedApiErrorMessage(error, t('genericError'), tApiErrors),
      });
    },
  });
}

export function useUpdateCompositeItem() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const t = useTranslations('inventory.compositeItems.toast');
  const tApiErrors = useTranslations('common.apiErrors');

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateCompositeItemData }) => {
      const response = await compositeItemsApi.update(id, data);
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['composite-items'] });
      queryClient.invalidateQueries({ queryKey: ['composite-items', variables.id] });
      toast({
        title: t('updated'),
        description: t('updatedDescription'),
      });
    },
    onError: (error: unknown) => {
      toast({
        variant: 'destructive',
        title: t('updateError'),
        description: getLocalizedApiErrorMessage(error, t('genericError'), tApiErrors),
      });
    },
  });
}

export function useDeleteCompositeItem() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const t = useTranslations('inventory.compositeItems.toast');
  const tApiErrors = useTranslations('common.apiErrors');

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await compositeItemsApi.delete(id);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['composite-items'] });
      toast({
        title: t('deleted'),
        description: t('deletedDescription'),
      });
    },
    onError: (error: unknown) => {
      toast({
        variant: 'destructive',
        title: t('deleteError'),
        description: getLocalizedApiErrorMessage(error, t('genericError'), tApiErrors),
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
  const t = useTranslations('inventory.compositeItems.toast');
  const tApiErrors = useTranslations('common.apiErrors');

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
        title: t('assembled'),
        description: t('assembledDescription'),
      });
    },
    onError: (error: unknown) => {
      toast({
        variant: 'destructive',
        title: t('assembleError'),
        description: getLocalizedApiErrorMessage(error, t('genericError'), tApiErrors),
      });
    },
  });
}

export function formatCurrency(amount: string | number | null | undefined): string {
  if (amount === null || amount === undefined) return '$0.00';
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num);
}
