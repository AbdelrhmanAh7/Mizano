'use client';

import { billsApi, paymentsMadeApi } from '@/lib/api';
import { useInfiniteTableData } from '@/lib/hooks/use-infinite-table-data';
import { invalidateLedgerQueries } from '@/lib/hooks/use-journals';
import { useToastMutation } from '@/lib/hooks/use-toast-mutation';
import { useQuery } from '@tanstack/react-query';

// Types

export interface BillAllocation {
  billId: string;
  amount: string;
  bill?: {
    id: string;
    billNumber: string;
    date: string;
    dueDate: string;
    grandTotal: string;
    balanceDue: string;
    vendor?: {
      name: string;
    };
  };
}

export interface PaymentMade {
  id: string;
  paymentNumber: string;
  /** Set when the payment was voided; voided payments are read-only. */
  deletedAt?: string | null;
  vendorId: string;
  date: string;
  amount: string;
  paymentMode: 'CASH' | 'CHEQUE' | 'BANK_TRANSFER' | 'CREDIT_CARD' | 'OTHER';
  paidFromAccountId: string;
  reference: string | null;
  notes: string | null;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
  vendor?: {
    id: string;
    name: string;
    email: string | null;
    currency: string;
  };
  paidFromAccount?: {
    id: string;
    name: string;
    code: string;
  };
  allocations?: BillAllocation[];
}

export interface PaymentMadeParams {
  page?: number;
  limit?: number;
  search?: string;
  vendorId?: string;
  startDate?: string;
  endDate?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface CreatePaymentMadeData {
  vendorId: string;
  date: string;
  amount: number;
  paymentMode: string;
  paidFromAccountId: string;
  reference?: string;
  notes?: string;
  allocations?: Array<{
    billId: string;
    amount: number;
  }>;
}

/**
 * Hook to fetch all payments made with pagination
 */
export function usePaymentsMade(params?: PaymentMadeParams) {
  return useQuery({
    queryKey: ['payments-made', params],
    queryFn: async () => {
      const response = await paymentsMadeApi.getAll(params);
      return response.data;
    },
  });
}

/**
 * Hook to fetch all payments made with cursor-based pagination (virtual scroll)
 */
export function useInfinitePaymentsMade(params?: Record<string, unknown>) {
  return useInfiniteTableData<PaymentMade, Record<string, unknown>>({
    queryKey: ['payments-made'],
    fetchFn: async (p) => {
      const response = await paymentsMadeApi.getAllCursor(p);
      return response.data;
    },
    params: params || {},
  });
}

/**
 * Hook to fetch a single payment made by ID
 */
export function usePaymentMade(id: string | undefined) {
  return useQuery({
    queryKey: ['payments-made', id],
    queryFn: async () => {
      if (!id) throw new Error('Payment ID is required');
      const response = await paymentsMadeApi.getOne(id);
      return response.data as PaymentMade;
    },
    enabled: !!id,
  });
}

/**
 * Hook to fetch unpaid bills for a vendor
 */
export function useUnpaidBills(vendorId: string | undefined) {
  return useQuery({
    queryKey: ['bills', 'unpaid', vendorId],
    queryFn: async () => {
      if (!vendorId) throw new Error('Vendor ID is required');
      const response = await billsApi.getAll({
        vendorId,
        status: 'OPEN,OVERDUE,PARTIALLY_PAID',
        hasBalance: 'true',
        limit: 100,
      });
      return response.data;
    },
    enabled: !!vendorId,
  });
}

/**
 * Hook to create a new payment made
 */
export function useCreatePaymentMade() {
  return useToastMutation({
    namespace: 'purchases.payments.toast',
    mutationFn: async (data: CreatePaymentMadeData) => (await paymentsMadeApi.create(data)).data,
    // The payment posts a journal: refresh ledger views as well as the documents.
    beforeInvalidate: (queryClient) => void invalidateLedgerQueries(queryClient),
    invalidate: () => [['payments-made'], ['bills'], ['vendors']],
    success: 'recorded',
    error: 'recordError',
  });
}

/**
 * Hook to delete a payment made
 */
export function useDeletePaymentMade() {
  return useToastMutation({
    namespace: 'purchases.payments.toast',
    mutationFn: async (id: string) => (await paymentsMadeApi.delete(id)).data,
    // DELETE voids the payment: bill balances are restored and a reversal is posted.
    beforeInvalidate: (queryClient) => void invalidateLedgerQueries(queryClient),
    invalidate: () => [['vendors']],
    success: 'voided',
    error: 'voidError',
  });
}

/**
 * Payment mode options for dropdowns
 */
export const paymentModeOptions = [
  { value: 'CASH', label: 'Cash' },
  { value: 'CHEQUE', label: 'Cheque' },
  { value: 'BANK_TRANSFER', label: 'Bank Transfer' },
  { value: 'CREDIT_CARD', label: 'Credit Card' },
  { value: 'OTHER', label: 'Other' },
];
