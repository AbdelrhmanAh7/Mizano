'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { vendorCreditsApi } from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';

// Types
export type VendorCreditStatus = 'OPEN' | 'APPLIED' | 'REFUNDED';
export type VendorCreditType = 'CREDIT' | 'REFUND';

export interface VendorCreditLine {
  id: string;
  vendorCreditId: string;
  itemId: string | null;
  accountId: string | null;
  description: string | null;
  quantity: string;
  rate: string;
  amount: string;
  taxRate: string;
  item?: {
    id: string;
    name: string;
    sku: string | null;
  };
  account?: {
    id: string;
    name: string;
    code: string;
  };
}

export interface VendorCredit {
  id: string;
  creditNumber: string;
  vendorId: string;
  billId: string | null;
  date: string;
  type: VendorCreditType;
  status: VendorCreditStatus;
  subtotal: string;
  taxAmount: string;
  total: string;
  balanceRemaining: string;
  reason: string | null;
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
  bill?: {
    id: string;
    billNumber: string;
  };
  lines?: VendorCreditLine[];
}

export interface VendorCreditParams {
  page?: number;
  limit?: number;
  search?: string;
  vendorId?: string;
  status?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface CreateVendorCreditData {
  vendorId: string;
  billId?: string;
  date: string;
  type: string;
  reason?: string;
  notes?: string;
  lines: Array<{
    itemId?: string;
    accountId?: string;
    description?: string;
    quantity: number;
    rate: number;
    taxRate?: number;
  }>;
}

/**
 * Hook to fetch all vendor credits with pagination
 */
export function useVendorCredits(params?: VendorCreditParams) {
  return useQuery({
    queryKey: ['vendor-credits', params],
    queryFn: async () => {
      const response = await vendorCreditsApi.getAll(params);
      return response.data;
    },
  });
}

/**
 * Hook to fetch a single vendor credit by ID
 */
export function useVendorCredit(id: string | undefined) {
  return useQuery({
    queryKey: ['vendor-credits', id],
    queryFn: async () => {
      if (!id) throw new Error('Vendor Credit ID is required');
      const response = await vendorCreditsApi.getOne(id);
      return response.data as VendorCredit;
    },
    enabled: !!id,
  });
}

/**
 * Hook to create a new vendor credit
 */
export function useCreateVendorCredit() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: CreateVendorCreditData) => {
      const response = await vendorCreditsApi.create(data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendor-credits'] });
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
      toast({
        title: 'Vendor credit created',
        description: 'The vendor credit has been created successfully.',
      });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error creating vendor credit',
        description: error.response?.data?.message || 'An error occurred',
      });
    },
  });
}

/**
 * Hook to apply vendor credit to a bill
 */
export function useApplyVendorCredit() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, billId }: { id: string; billId: string }) => {
      const response = await vendorCreditsApi.applyToBill(id, billId);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendor-credits'] });
      queryClient.invalidateQueries({ queryKey: ['bills'] });
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
      toast({
        title: 'Credit applied',
        description: 'The vendor credit has been applied to the bill.',
      });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error applying credit',
        description: error.response?.data?.message || 'An error occurred',
      });
    },
  });
}

/**
 * Hook to refund vendor credit
 */
export function useRefundVendorCredit() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, bankAccountId }: { id: string; bankAccountId: string }) => {
      const response = await vendorCreditsApi.refund(id, bankAccountId);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendor-credits'] });
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
      toast({
        title: 'Refund processed',
        description: 'The vendor credit has been refunded.',
      });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error processing refund',
        description: error.response?.data?.message || 'An error occurred',
      });
    },
  });
}

/**
 * Get status badge variant
 */
export function getStatusVariant(status: VendorCreditStatus): 'default' | 'secondary' | 'outline' {
  switch (status) {
    case 'OPEN':
      return 'default';
    case 'APPLIED':
      return 'secondary';
    case 'REFUNDED':
      return 'outline';
    default:
      return 'default';
  }
}

/**
 * Get status display text
 */
export function getStatusText(status: VendorCreditStatus): string {
  switch (status) {
    case 'OPEN':
      return 'Open';
    case 'APPLIED':
      return 'Applied';
    case 'REFUNDED':
      return 'Refunded';
    default:
      return status;
  }
}

/**
 * Get type display text
 */
export function getTypeText(type: VendorCreditType): string {
  switch (type) {
    case 'CREDIT':
      return 'Credit';
    case 'REFUND':
      return 'Refund';
    default:
      return type;
  }
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
