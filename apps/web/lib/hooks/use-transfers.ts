'use client';

import { useTranslations } from 'next-intl';
import { useToast } from '@/components/ui/use-toast';
import { getLocalizedApiErrorMessage } from '@/lib/api-error';
import { transfersApi } from '@/lib/api';
import { useInfiniteTableData } from '@/lib/hooks/use-infinite-table-data';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

// Types
export type TransferStatus = 'PENDING' | 'IN_TRANSIT' | 'COMPLETED' | 'CANCELLED';

export interface TransferLine {
  id: string;
  transferId: string;
  itemId: string;
  quantity: number;
  item: {
    id: string;
    name: string;
    sku: string | null;
    unit: string | null;
  };
}

export interface Transfer {
  id: string;
  transferNumber: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  date: string;
  status: TransferStatus;
  notes: string | null;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
  fromWarehouse: {
    id: string;
    name: string;
    code: string;
  };
  toWarehouse: {
    id: string;
    name: string;
    code: string;
  };
  lines?: TransferLine[];
}

export interface CreateTransferData {
  fromWarehouseId: string;
  toWarehouseId: string;
  date: string;
  notes?: string;
  lines: Array<{
    itemId: string;
    quantity: number;
  }>;
}

/**
 * Hook to fetch all transfers with cursor-based pagination (virtual scroll)
 */
export function useInfiniteTransfers(params?: Record<string, unknown>) {
  return useInfiniteTableData<Transfer, Record<string, unknown>>({
    queryKey: ['transfers'],
    fetchFn: async (p) => {
      const response = await transfersApi.getAllCursor(p);
      return response.data;
    },
    params: params || {},
  });
}

/**
 * Hook to fetch a single transfer by ID
 */
export function useTransfer(id: string | undefined) {
  return useQuery({
    queryKey: ['transfers', id],
    queryFn: async () => {
      if (!id) throw new Error('Transfer ID is required');
      const response = await transfersApi.getOne(id);
      return response.data as Transfer;
    },
    enabled: !!id,
  });
}

/**
 * Hook to create a new transfer
 */
export function useCreateTransfer() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const t = useTranslations('inventory.transfers.toast');
  const tApiErrors = useTranslations('common.apiErrors');

  return useMutation({
    mutationFn: async (data: CreateTransferData) => {
      const response = await transfersApi.create(data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transfers'] });
      queryClient.invalidateQueries({ queryKey: ['warehouses'] });
      queryClient.invalidateQueries({ queryKey: ['items'] });
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

/**
 * Hook to complete a transfer
 */
export function useCompleteTransfer() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const t = useTranslations('inventory.transfers.toast');
  const tApiErrors = useTranslations('common.apiErrors');

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await transfersApi.complete(id);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transfers'] });
      queryClient.invalidateQueries({ queryKey: ['warehouses'] });
      queryClient.invalidateQueries({ queryKey: ['items'] });
      toast({
        title: t('completed'),
        description: t('completedDescription'),
      });
    },
    onError: (error: unknown) => {
      toast({
        variant: 'destructive',
        title: t('completeError'),
        description: getLocalizedApiErrorMessage(error, t('genericError'), tApiErrors),
      });
    },
  });
}

/**
 * Hook to cancel a transfer
 */
export function useCancelTransfer() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const t = useTranslations('inventory.transfers.toast');
  const tApiErrors = useTranslations('common.apiErrors');

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await transfersApi.cancel(id);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transfers'] });
      toast({
        title: t('cancelled'),
        description: t('cancelledDescription'),
      });
    },
    onError: (error: unknown) => {
      toast({
        variant: 'destructive',
        title: t('cancelError'),
        description: getLocalizedApiErrorMessage(error, t('genericError'), tApiErrors),
      });
    },
  });
}

/**
 * Get status display text
 */
export function getTransferStatusLabel(status: TransferStatus): string {
  switch (status) {
    case 'PENDING':
      return 'Pending';
    case 'IN_TRANSIT':
      return 'In Transit';
    case 'COMPLETED':
      return 'Completed';
    case 'CANCELLED':
      return 'Cancelled';
    default:
      return status;
  }
}

export function getTransferStatusColor(status: TransferStatus): string {
  switch (status) {
    case 'PENDING':
      return 'bg-gray-100 text-gray-800';
    case 'IN_TRANSIT':
      return 'bg-blue-100 text-blue-800';
    case 'COMPLETED':
      return 'bg-green-100 text-green-800';
    case 'CANCELLED':
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}
