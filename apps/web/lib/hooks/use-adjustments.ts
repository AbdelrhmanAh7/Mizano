'use client';

import { useToastMutation } from './use-toast-mutation';
import { adjustmentsApi } from '@/lib/api';
import { useInfiniteTableData } from '@/lib/hooks/use-infinite-table-data';
import { useQuery } from '@tanstack/react-query';

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
  return useToastMutation({
    namespace: 'inventory.adjustments.toast',
    mutationFn: async (data: CreateAdjustmentData) => {
      const response = await adjustmentsApi.create(data);
      return response.data;
    },
    invalidate: () => [['adjustments'], ['items'], ['warehouses']],
    success: 'created',
    error: 'createError',
  });
}

/**
 * Hook to void an adjustment (reverses the journal and restores stock)
 */
export function useVoidAdjustment() {
  return useToastMutation({
    namespace: 'inventory.adjustments.toast',
    mutationFn: async (id: string) => {
      const response = await adjustmentsApi.void(id);
      return response.data;
    },
    invalidate: () => [['adjustments'], ['items'], ['warehouses'], ['journals']],
    success: 'voided',
    error: 'voidError',
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

export function getAdjustmentStatusLabel(status: AdjustmentStatus): string {
  return status === 'VOIDED' ? 'Voided' : 'Posted';
}

export function getReasonLabel(reason: AdjustmentReason): string {
  const found = reasonOptions.find((o) => o.value === reason);
  return found ? found.label : reason;
}

export function getAdjustmentStatusColor(status: AdjustmentStatus): string {
  return status === 'VOIDED' ? 'bg-muted text-foreground' : 'bg-success/10 text-success';
}
