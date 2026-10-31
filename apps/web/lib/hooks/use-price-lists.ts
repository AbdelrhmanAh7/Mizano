import { useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery, UseMutationResult } from '@tanstack/react-query';
import api from '@/lib/api';
import { useToastMutation } from '@/lib/hooks/use-toast-mutation';

export const PRICE_LIST_TYPES = ['PERCENTAGE', 'FIXED'] as const;
export type PriceListType = (typeof PRICE_LIST_TYPES)[number];

const priceListsApi = {
  list: async () => {
    const response = await api.get('/price-lists');
    return response.data;
  },
  get: async (id: string) => {
    const response = await api.get(`/price-lists/${id}`);
    return response.data;
  },
  create: async (data: Record<string, unknown>) => {
    const response = await api.post('/price-lists', data);
    return response.data;
  },
  update: async ({ id, data }: { id: string; data: Record<string, unknown> }) => {
    const response = await api.patch(`/price-lists/${id}`, data);
    return response.data;
  },
  delete: async (id: string) => {
    const response = await api.delete(`/price-lists/${id}`);
    return response.data;
  },
};

export function usePriceLists() {
  return useQuery({
    queryKey: ['price-lists'],
    queryFn: priceListsApi.list,
  });
}

export function usePriceList(id: string) {
  return useQuery({
    queryKey: ['price-lists', id],
    queryFn: () => priceListsApi.get(id),
    enabled: !!id,
  });
}

/** The price-lists API body (CreatePriceListDto): the adjustment travels as a decimal string. */
export interface CreatePriceListData {
  name: string;
  description?: string;
  type: PriceListType;
  adjustment: string;
}

export function useCreatePriceList(): UseMutationResult<unknown, unknown, CreatePriceListData> {
  return useToastMutation({
    namespace: 'inventory.priceLists.toast',
    mutationFn: (data: CreatePriceListData) => priceListsApi.create({ ...data }),
    invalidate: () => [['price-lists']],
    success: 'created',
    error: 'createError',
  });
}

export function useDeletePriceList(): UseMutationResult<unknown, unknown, string> {
  return useToastMutation({
    namespace: 'inventory.priceLists.toast',
    mutationFn: priceListsApi.delete,
    invalidate: () => [['price-lists']],
    success: 'deleted',
    error: 'deleteError',
  });
}

/** Translated price list type (PERCENTAGE / FIXED). */
export function usePriceListTypeLabel(): (type: string) => string {
  const t = useTranslations('inventory.priceLists.types');
  return useCallback(
    (type: string) => (t.has(type.toLowerCase()) ? t(type.toLowerCase()) : type),
    [t],
  );
}
