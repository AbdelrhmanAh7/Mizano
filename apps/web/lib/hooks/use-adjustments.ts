'use client';

import { useToast } from '@/components/ui/use-toast';
import { adjustmentsApi } from '@/lib/api';
import { useInfiniteTableData } from '@/lib/hooks/use-infinite-table-data';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

type ApiError = { response?: { data?: { message?: string } } };

// Types (mirror the API: one item per adjustment; status is derived from the ledger)
export type AdjustmentType = 'INCREASE' | 'DECREASE';
export type AdjustmentReason =
  | 'DAMAGED'
  | 'STOLEN'
  | 'STOCKTAKE'
  | 'RETURNED'
  | 'EXPIRED'
  | 'OTHER';
export type AdjustmentStatus = 'POSTED' | 'VOIDED';

export interface Adjustment {
  id: string;
  adjustmentNumber: string;
  date: string;
  type: AdjustmentType;
  quantity: number;
  reason: AdjustmentReason;
  notes: string | null;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
  status: AdjustmentStatus;
  /** Value of the stock change as a decimal string. */
  value: string | null;
  journalId: string | null;
  journalNumber: string | null;
  voidJournalId: string | null;
  item: { id: string; name: string; sku: string | null; unit: string | null };
  warehouse: { id: string; name: string; code: string };
  account: { id: string; name: string; code: string };
}

export interface AdjustmentParams {
  page?: number;
  limit?: number;
  search?: string;
  type?: AdjustmentType;
}

/** Exact payload of POST /inventory-adjustments. */
export interface CreateAdjustmentData {
  date: string;
  warehouseId: string;
  itemId: string;
  type: AdjustmentType;
  quantity: number;
  reason: AdjustmentReason;
  accountId: string;
  notes?: string;
}

export interface AdjustmentAccountOption {
  id: string;
  code: string;
  name: string;
  type: string;
}

/** Accounts that may take the other side of an adjustment (needs inventory.create only). */
export function useAdjustmentAccountOptions() {
  return useQuery({
    queryKey: ['adjustments', 'account-options'],
    queryFn: async (): Promise<AdjustmentAccountOption[]> => {
      const response = await adjustmentsApi.accountOptions();
      return response.data;
    },
  });
}

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
 * Hook to fetch all adjustments with cursor-based pagination (virtual scroll)
 */
export function useInfiniteAdjustments(params?: Record<string, unknown>) {
  return useInfiniteTableData<Adjustment, Record<string, unknown>>({
    queryKey: ['adjustments'],
    fetchFn: async (p) => {
      const response = await adjustmentsApi.getAllCursor(p);
      return response.data;
    },
    params: params || {},
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
        title: 'Adjustment posted',
        description: 'Stock updated and the journal entry posted.',
      });
    },
    onError: (error: ApiError) => {
      toast({
        variant: 'destructive',
        title: 'Error creating adjustment',
        description: error.response?.data?.message || 'An error occurred',
      });
    },
  });
}

/**
 * Hook to void an adjustment (reverses the journal and restores stock)
 */
export function useVoidAdjustment() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await adjustmentsApi.void(id);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adjustments'] });
      queryClient.invalidateQueries({ queryKey: ['items'] });
      queryClient.invalidateQueries({ queryKey: ['warehouses'] });
      queryClient.invalidateQueries({ queryKey: ['journals'] });
      toast({
        title: 'Adjustment voided',
        description: 'The journal was reversed and stock restored.',
      });
    },
    onError: (error: ApiError) => {
      toast({
        variant: 'destructive',
        title: 'Error voiding adjustment',
        description: error.response?.data?.message || 'An error occurred',
      });
    },
  });
}

/** Reason options for dropdowns */
export const reasonOptions: Array<{ value: AdjustmentReason; label: string }> = [
  { value: 'STOCKTAKE', label: 'Stocktake / Physical Count' },
  { value: 'DAMAGED', label: 'Damaged Goods' },
  { value: 'STOLEN', label: 'Stolen / Lost' },
  { value: 'RETURNED', label: 'Customer Return' },
  { value: 'EXPIRED', label: 'Expired' },
  { value: 'OTHER', label: 'Other' },
];

export function getTypeColor(type: AdjustmentType): string {
  return type === 'INCREASE' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800';
}

export function getTypeText(type: AdjustmentType): string {
  return type === 'INCREASE' ? 'Increase' : 'Decrease';
}

export function getStatusText(status: AdjustmentStatus): string {
  return status === 'VOIDED' ? 'Voided' : 'Posted';
}

export function getReasonText(reason: AdjustmentReason): string {
  const found = reasonOptions.find((o) => o.value === reason);
  return found ? found.label : reason;
}

// Alias functions for backward compatibility
export const getReasonLabel = getReasonText;
export const getAdjustmentStatusLabel = getStatusText;
export function getAdjustmentStatusColor(status: AdjustmentStatus): string {
  return status === 'VOIDED' ? 'bg-gray-100 text-gray-800' : 'bg-green-100 text-green-800';
}
