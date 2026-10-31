'use client';

import { useTranslations } from 'next-intl';
import { useToast } from '@/components/ui/use-toast';
import { getLocalizedApiErrorMessage } from '@/lib/api-error';
import { vendorCreditsApi } from '@/lib/api';
import { useInfiniteTableData } from '@/lib/hooks/use-infinite-table-data';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateVendorCreditPayload } from '@/components/purchases/vendor-credit-payload';

// Types
export type VendorCreditStatus = 'OPEN' | 'APPLIED' | 'REFUNDED';

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
  appliedToBillId?: string | null;
  date: string;
  /** Actual Prisma field — use this for Total/Balance rendering */
  amount: string;
  status?: VendorCreditStatus;
  refundedAt?: string | null;
  reason: string | null;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
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

/** Exactly the API DTO (POST /vendor-credits): decimal-string amount, gross of VAT. */
export type CreateVendorCreditData = CreateVendorCreditPayload;

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
 * Hook to fetch all vendor credits with cursor-based pagination (virtual scroll)
 */
export function useInfiniteVendorCredits(params?: Record<string, unknown>) {
  return useInfiniteTableData<VendorCredit, Record<string, unknown>>({
    queryKey: ['vendor-credits'],
    fetchFn: async (p) => {
      const response = await vendorCreditsApi.getAllCursor(p);
      return response.data;
    },
    params: params || {},
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
  const t = useTranslations('purchases.credits.toast');
  const tApiErrors = useTranslations('common.apiErrors');

  return useMutation({
    mutationFn: async (data: CreateVendorCreditData) => {
      const response = await vendorCreditsApi.create(data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendor-credits'] });
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
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
 * Hook to apply vendor credit to a bill
 */
export function useApplyVendorCredit() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const t = useTranslations('purchases.credits.toast');
  const tApiErrors = useTranslations('common.apiErrors');

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
        title: t('applied'),
        description: t('appliedDescription'),
      });
    },
    onError: (error: unknown) => {
      toast({
        variant: 'destructive',
        title: t('applyError'),
        description: getLocalizedApiErrorMessage(error, t('genericError'), tApiErrors),
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
  const t = useTranslations('purchases.credits.toast');
  const tApiErrors = useTranslations('common.apiErrors');

  return useMutation({
    mutationFn: async ({
      id,
      bankAccountId,
      date,
    }: {
      id: string;
      bankAccountId: string;
      date?: string;
    }) => {
      const response = await vendorCreditsApi.refund(id, bankAccountId, date);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendor-credits'] });
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
      toast({
        title: t('refunded'),
        description: t('refundedDescription'),
      });
    },
    onError: (error: unknown) => {
      toast({
        variant: 'destructive',
        title: t('refundError'),
        description: getLocalizedApiErrorMessage(error, t('genericError'), tApiErrors),
      });
    },
  });
}

/**
 * Hook to void an unapplied, unrefunded vendor credit (reverses its journal)
 */
export function useVoidVendorCredit() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const t = useTranslations('purchases.credits.toast');
  const tApiErrors = useTranslations('common.apiErrors');

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await vendorCreditsApi.void(id);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendor-credits'] });
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
      toast({
        title: t('voided'),
        description: t('voidedDescription'),
      });
    },
    onError: (error: unknown) => {
      toast({
        variant: 'destructive',
        title: t('voidError'),
        description: getLocalizedApiErrorMessage(error, t('genericError'), tApiErrors),
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
 * Format currency amount — null/undefined/NaN-safe
 */
export function formatCurrency(
  amount: string | number | null | undefined,
  currency: string = 'USD',
): string {
  const num =
    amount === null || amount === undefined
      ? 0
      : typeof amount === 'string'
        ? parseFloat(amount)
        : amount;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(isNaN(num) ? 0 : num);
}
