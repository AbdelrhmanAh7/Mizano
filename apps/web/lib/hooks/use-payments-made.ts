'use client';

import { useToast } from '@/components/ui/use-toast';
import { billsApi, paymentsMadeApi } from '@/lib/api';
import { useInfiniteTableData } from '@/lib/hooks/use-infinite-table-data';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

// Types
type ApiError = { response?: { data?: { message?: string } } };

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
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: CreatePaymentMadeData) => {
      const response = await paymentsMadeApi.create(data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments-made'] });
      queryClient.invalidateQueries({ queryKey: ['bills'] });
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
      toast({
        title: 'Payment recorded',
        description: 'The payment has been recorded successfully.',
      });
    },
    onError: (error: ApiError) => {
      toast({
        variant: 'destructive',
        title: 'Error recording payment',
        description: error.response?.data?.message || 'An error occurred',
      });
    },
  });
}

/**
 * Hook to delete a payment made
 */
export function useDeletePaymentMade() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await paymentsMadeApi.delete(id);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments-made'] });
      queryClient.invalidateQueries({ queryKey: ['bills'] });
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
      toast({
        title: 'Payment deleted',
        description: 'The payment has been deleted successfully.',
      });
    },
    onError: (error: ApiError) => {
      toast({
        variant: 'destructive',
        title: 'Error deleting payment',
        description: error.response?.data?.message || 'An error occurred',
      });
    },
  });
}

/**
 * Format payment mode for display
 */
export function formatPaymentMode(mode: string): string {
  const modes: Record<string, string> = {
    CASH: 'Cash',
    CHEQUE: 'Cheque',
    BANK_TRANSFER: 'Bank Transfer',
    CREDIT_CARD: 'Credit Card',
    OTHER: 'Other',
  };
  return modes[mode] || mode;
}

/**
 * Format currency amount
 */
export function formatCurrency(amount: string | number, currency: string = 'USD'): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(num);
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
