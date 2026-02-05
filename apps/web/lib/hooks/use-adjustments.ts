'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';

// Types
export type AdjustmentType = 'INCREASE' | 'DECREASE';
export type AdjustmentReason = 'STOCKTAKE' | 'DAMAGE' | 'THEFT' | 'RETURN' | 'OTHER';
export type AdjustmentStatus = 'DRAFT' | 'POSTED';

export interface AdjustmentLine {
  id: string;
  adjustmentId: string;
  itemId: string;
  warehouseId: string;
  quantityBefore: number;
  quantityAdjusted: number;
  quantityAfter: number;
  item: {
    id: string;
    name: string;
    sku: string | null;
    unit: string | null;
  };
  warehouse: {
    id: string;
    name: string;
    code: string;
  };
}

export interface Adjustment {
  id: string;
  adjustmentNumber: string;
  date: string;
  type: AdjustmentType;
  reason: AdjustmentReason;
  status: AdjustmentStatus;
  description: string | null;
  reference: string | null;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
  lines?: AdjustmentLine[];
}

export interface AdjustmentParams {
  page?: number;
  limit?: number;
  search?: string;
  type?: AdjustmentType;
  status?: AdjustmentStatus;
  reason?: AdjustmentReason;
}

export interface CreateAdjustmentData {
  date: string;
  type: AdjustmentType;
  reason: AdjustmentReason;
  description?: string;
  reference?: string;
  lines: Array<{
    itemId: string;
    warehouseId: string;
    quantityAdjusted: number;
  }>;
}

// Adjustments API
const adjustmentsApi = {
  getAll: (params?: Record<string, any>) => api.get('/adjustments', { params }),
  getOne: (id: string) => api.get(`/adjustments/${id}`),
  create: (data: any) => api.post('/adjustments', data),
  post: (id: string) => api.patch(`/adjustments/${id}/post`),
  delete: (id: string) => api.delete(`/adjustments/${id}`),
};

/**
 * Hook to fetch all adjustments
 */
export function useAdjustments(params?: AdjustmentParams) {
  return useQuery({
    queryKey: ['adjustments', params],
    queryFn: async () => {
      const response = await adjustmentsApi.getAll(params);
      return response.data;
    },
  });
}

/**
 * Hook to fetch a single adjustment by ID
 */
export function useAdjustment(id: string | undefined) {
  return useQuery({
    queryKey: ['adjustments', id],
    queryFn: async () => {
      if (!id) throw new Error('Adjustment ID is required');
      const response = await adjustmentsApi.getOne(id);
      return response.data as Adjustment;
    },
    enabled: !!id,
  });
}

/**
 * Hook to create a new adjustment
 */
export function useCreateAdjustment() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: CreateAdjustmentData) => {
      const response = await adjustmentsApi.create(data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adjustments'] });
      queryClient.invalidateQueries({ queryKey: ['items'] });
      queryClient.invalidateQueries({ queryKey: ['warehouses'] });
      toast({
        title: 'Adjustment created',
        description: 'The inventory adjustment has been created.',
      });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error creating adjustment',
        description: error.response?.data?.message || 'An error occurred',
      });
    },
  });
}

/**
 * Hook to post an adjustment
 */
export function usePostAdjustment() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await adjustmentsApi.post(id);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adjustments'] });
      queryClient.invalidateQueries({ queryKey: ['items'] });
      queryClient.invalidateQueries({ queryKey: ['warehouses'] });
      toast({
        title: 'Adjustment posted',
        description: 'The inventory adjustment has been posted and stock levels updated.',
      });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error posting adjustment',
        description: error.response?.data?.message || 'An error occurred',
      });
    },
  });
}

/**
 * Hook to delete an adjustment
 */
export function useDeleteAdjustment() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await adjustmentsApi.delete(id);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adjustments'] });
      toast({
        title: 'Adjustment deleted',
        description: 'The inventory adjustment has been deleted.',
      });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error deleting adjustment',
        description: error.response?.data?.message || 'An error occurred',
      });
    },
  });
}

/**
 * Get type badge color
 */
export function getTypeColor(type: AdjustmentType): string {
  return type === 'INCREASE' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800';
}

/**
 * Get type display text
 */
export function getTypeText(type: AdjustmentType): string {
  return type === 'INCREASE' ? 'Increase' : 'Decrease';
}

/**
 * Get status badge variant
 */
export function getStatusVariant(status: AdjustmentStatus): 'default' | 'secondary' {
  return status === 'POSTED' ? 'default' : 'secondary';
}

/**
 * Get status display text
 */
export function getStatusText(status: AdjustmentStatus): string {
  return status === 'POSTED' ? 'Posted' : 'Draft';
}

/**
 * Get reason display text
 */
export function getReasonText(reason: AdjustmentReason): string {
  const reasons: Record<AdjustmentReason, string> = {
    STOCKTAKE: 'Stocktake',
    DAMAGE: 'Damage',
    THEFT: 'Theft',
    RETURN: 'Return',
    OTHER: 'Other',
  };
  return reasons[reason] || reason;
}

/**
 * Reason options for dropdowns
 */
export const reasonOptions = [
  { value: 'STOCKTAKE', label: 'Stocktake / Physical Count' },
  { value: 'DAMAGE', label: 'Damaged Goods' },
  { value: 'THEFT', label: 'Theft / Loss' },
  { value: 'RETURN', label: 'Customer Return' },
  { value: 'OTHER', label: 'Other' },
];
