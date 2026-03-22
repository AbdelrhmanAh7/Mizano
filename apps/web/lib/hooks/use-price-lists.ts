import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';

export interface PriceList {
  id: string;
  name: string;
  description?: string;
  type: 'SALES' | 'PURCHASE';
  isActive: boolean;
  startDate?: string;
  endDate?: string;
  items?: PriceListItem[];
  createdAt: string;
  updatedAt: string;
}

export interface PriceListItem {
  id: string;
  itemId: string;
  item?: { id: string; name: string; sku: string };
  price: number | string;
  minQuantity?: number;
}

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

export function useCreatePriceList() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: priceListsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['price-lists'] });
    },
  });
}

export function useUpdatePriceList() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: priceListsApi.update,
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['price-lists'] });
      queryClient.invalidateQueries({ queryKey: ['price-lists', variables.id] });
    },
  });
}

export function useDeletePriceList() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: priceListsApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['price-lists'] });
    },
  });
}
