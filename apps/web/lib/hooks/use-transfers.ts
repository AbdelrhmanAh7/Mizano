'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';

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

export interface TransferParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: TransferStatus;
  fromWarehouseId?: string;
  toWarehouseId?: string;
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

// Transfers API
const transfersApi = {
  getAll: (params?: Record<string, any>) => api.get('/transfers', { params }),
  getOne: (id: string) => api.get(`/transfers/${id}`),
  create: (data: any) => api.post('/transfers', data),
  complete: (id: string) => api.patch(`/transfers/${id}/complete`),
  cancel: (id: string) => api.patch(`/transfers/${id}/cancel`),
};

/**
 * Hook to fetch all transfers
 */
export function useTransfers(params?: TransferParams) {
  return useQuery({
    queryKey: ['transfers', params],
    queryFn: async () => {
      const response = await transfersApi.getAll(params);
      return response.data;
    },
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
        title: 'Transfer created',
        description: 'The stock transfer has been created successfully.',
      });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error creating transfer',
        description: error.response?.data?.message || 'An error occurred',
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
        title: 'Transfer completed',
        description: 'The stock transfer has been completed.',
      });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error completing transfer',
        description: error.response?.data?.message || 'An error occurred',
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

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await transfersApi.cancel(id);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transfers'] });
      toast({
        title: 'Transfer cancelled',
        description: 'The stock transfer has been cancelled.',
      });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error cancelling transfer',
        description: error.response?.data?.message || 'An error occurred',
      });
    },
  });
}

/**
 * Get status badge variant
 */
export function getStatusVariant(status: TransferStatus): 'default' | 'secondary' | 'outline' | 'destructive' {
  switch (status) {
    case 'PENDING':
      return 'secondary';
    case 'IN_TRANSIT':
      return 'default';
    case 'COMPLETED':
      return 'outline';
    case 'CANCELLED':
      return 'destructive';
    default:
      return 'default';
  }
}

/**
 * Get status display text
 */
export function getStatusText(status: TransferStatus): string {
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
