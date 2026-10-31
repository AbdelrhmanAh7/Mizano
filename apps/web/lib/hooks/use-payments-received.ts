'use client';

import { paymentsReceivedApi } from '@/lib/api';
import { invalidateLedgerQueries } from '@/lib/hooks/use-journals';
import { useToastMutation } from '@/lib/hooks/use-toast-mutation';
import { useInfiniteTableData } from '@/lib/hooks/use-infinite-table-data';
import { useQuery } from '@tanstack/react-query';

// Types
export type PaymentMode =
  | 'CASH'
  | 'BANK_TRANSFER'
  | 'CREDIT_CARD'
  | 'DEBIT_CARD'
  | 'CHEQUE'
  | 'ONLINE'
  | 'OTHER';

export interface PaymentAllocation {
  invoiceId: string;
  amount: string;
  invoice?: {
    id: string;
    invoiceNumber: string;
    grandTotal: string;
    balanceDue: string;
  };
}

export interface PaymentReceived {
  id: string;
  paymentNumber: string;
  customerId: string;
  customer?: {
    id: string;
    name: string;
    email: string | null;
  };
  date: string;
  amount: string;
  paymentMode: PaymentMode;
  depositToAccountId: string;
  depositToAccount?: {
    id: string;
    name: string;
    code: string;
  };
  reference: string | null;
  notes: string | null;
  allocations: PaymentAllocation[];
  organizationId: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface PaymentReceivedParams {
  page?: number;
  limit?: number;
  search?: string;
  customerId?: string;
  paymentMode?: PaymentMode;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

interface CreatePaymentReceivedData {
  customerId: string;
  date: string;
  amount: string;
  paymentMode: PaymentMode;
  depositToAccountId: string;
  reference?: string;
  notes?: string;
  allocations: Array<{
    invoiceId: string;
    amount: string;
  }>;
}

/**
 * Hook to fetch all payments received with pagination
 */
export function usePaymentsReceived(params?: PaymentReceivedParams) {
  return useQuery({
    queryKey: ['payments-received', params],
    queryFn: async () => {
      const response = await paymentsReceivedApi.getAll(params);
      return response.data;
    },
  });
}

/**
 * Hook to fetch all payments received with cursor-based pagination (virtual scroll)
 */
export function useInfinitePaymentsReceived(params?: Record<string, unknown>) {
  return useInfiniteTableData<PaymentReceived, Record<string, unknown>>({
    queryKey: ['payments-received'],
    fetchFn: async (p) => {
      const response = await paymentsReceivedApi.getAllCursor(p);
      return response.data;
    },
    params: params || {},
  });
}

/**
 * Hook to fetch a single payment by ID
 */
export function usePaymentReceived(id: string | undefined) {
  return useQuery({
    queryKey: ['payments-received', id],
    queryFn: async () => {
      if (!id) throw new Error('Payment ID is required');
      const response = await paymentsReceivedApi.getOne(id);
      return response.data as PaymentReceived;
    },
    enabled: !!id,
  });
}

/**
 * Hook to create a new payment received
 */
export function useCreatePaymentReceived() {
  return useToastMutation({
    namespace: 'sales.payments.toast',
    mutationFn: async (data: CreatePaymentReceivedData) =>
      (await paymentsReceivedApi.create(data)).data,
    invalidate: () => [['payments-received'], ['invoices'], ['customers']],
    success: 'recorded',
    error: 'recordError',
  });
}

/**
 * Hook to void a payment received (restores invoice balances, posts a reversal journal)
 */
export function useVoidPaymentReceived() {
  return useToastMutation({
    namespace: 'sales.payments.toast',
    mutationFn: async (id: string) => (await paymentsReceivedApi.void(id)).data,
    beforeInvalidate: (queryClient) => void invalidateLedgerQueries(queryClient),
    invalidate: () => [['payments-received'], ['invoices'], ['customers']],
    success: 'voided',
    error: 'voidError',
  });
}

/**
 * Get payment mode label
 */
export function getPaymentModeLabel(mode: PaymentMode): string {
  const labelMap: Record<PaymentMode, string> = {
    CASH: 'Cash',
    BANK_TRANSFER: 'Bank Transfer',
    CREDIT_CARD: 'Credit Card',
    DEBIT_CARD: 'Debit Card',
    CHEQUE: 'Cheque',
    ONLINE: 'Online',
    OTHER: 'Other',
  };
  return labelMap[mode] || mode;
}

/**
 * Get payment mode options for dropdown
 */
export function getPaymentModeOptions(): Array<{ value: PaymentMode; label: string }> {
  return [
    { value: 'CASH', label: 'Cash' },
    { value: 'BANK_TRANSFER', label: 'Bank Transfer' },
    { value: 'CREDIT_CARD', label: 'Credit Card' },
    { value: 'DEBIT_CARD', label: 'Debit Card' },
    { value: 'CHEQUE', label: 'Cheque' },
    { value: 'ONLINE', label: 'Online' },
    { value: 'OTHER', label: 'Other' },
  ];
}

/**
 * Validate allocations total matches payment amount
 */
export function validateAllocations(
  paymentAmount: string,
  allocations: Array<{ amount: string }>,
): { isValid: boolean; difference: number } {
  const total = parseFloat(paymentAmount) || 0;
  const allocated = allocations.reduce((sum, a) => sum + (parseFloat(a.amount) || 0), 0);
  const difference = Math.abs(total - allocated);
  return {
    isValid: difference < 0.01,
    difference,
  };
}
