'use client';

import { useTranslations } from 'next-intl';
import { useToastMutation } from './use-toast-mutation';
import { useToast } from '@/components/ui/use-toast';
import { getLocalizedApiErrorMessage } from '@/lib/api-error';
import { expensesApi } from '@/lib/api';
import { useInfiniteTableData } from '@/lib/hooks/use-infinite-table-data';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateExpensePayload } from '@/components/purchases/expense-payload';

// Types
export interface Expense {
  id: string;
  date: string;
  accountId: string;
  vendorId: string | null;
  amount: string;
  taxAmount: string;
  taxInclusive: boolean;
  status?: string;
  paidThroughAccountId: string;
  description: string | null;
  reference: string | null;
  receiptUrl: string | null;
  projectId: string | null;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  // Relations
  account?: {
    id: string;
    code: string;
    name: string;
  };
  paidThroughAccount?: {
    id: string;
    code: string;
    name: string;
  };
  vendor?: {
    id: string;
    name: string;
  } | null;
  project?: {
    id: string;
    name: string;
  } | null;
}

export interface ExpenseParams {
  page?: number;
  limit?: number;
  search?: string;
  vendorId?: string;
  accountId?: string;
  startDate?: string;
  endDate?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/** Exactly the API DTO (POST /expenses): decimal strings, VAT computed by the server. */
export type CreateExpenseData = CreateExpensePayload;

/**
 * Hook to fetch all expenses with pagination
 */
export function useExpenses(params?: ExpenseParams) {
  return useQuery({
    queryKey: ['expenses', params],
    queryFn: async () => {
      const response = await expensesApi.getAll(params);
      return response.data;
    },
  });
}

/**
 * Hook to fetch all expenses with cursor-based pagination (virtual scroll)
 */
export function useInfiniteExpenses(params?: Record<string, unknown>) {
  return useInfiniteTableData<Expense, Record<string, unknown>>({
    queryKey: ['expenses'],
    fetchFn: async (p) => {
      const response = await expensesApi.getAllCursor(p);
      return response.data;
    },
    params: params || {},
  });
}

/**
 * Hook to fetch a single expense by ID
 */
export function useExpense(id: string | undefined) {
  return useQuery({
    queryKey: ['expenses', id],
    queryFn: async () => {
      if (!id) throw new Error('Expense ID is required');
      const response = await expensesApi.getOne(id);
      return response.data as Expense;
    },
    enabled: !!id,
  });
}

/**
 * Hook to create a new expense
 */
export function useCreateExpense() {
  return useToastMutation({
    namespace: 'purchases.expenses.toast',
    mutationFn: async (data: CreateExpenseData) => {
      const response = await expensesApi.create(data);
      return response.data;
    },
    invalidate: () => [['expenses']],
    success: 'recorded',
    error: 'recordError',
  });
}

/**
 * Hook to post a pending expense
 */
export function usePostExpense() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const t = useTranslations('purchases.expenses.toast');
  const tApiErrors = useTranslations('common.apiErrors');

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await expensesApi.post(id);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      toast({ title: t('posted'), description: t('postedDescription') });
    },
    onError: (error: unknown) => {
      toast({
        variant: 'destructive',
        title: t('postError'),
        description: getLocalizedApiErrorMessage(error, t('genericError'), tApiErrors),
      });
    },
  });
}

/**
 * Hook to delete an expense
 */
export function useDeleteExpense() {
  return useToastMutation({
    namespace: 'purchases.expenses.toast',
    mutationFn: async (id: string) => {
      const response = await expensesApi.delete(id);
      return response.data;
    },
    invalidate: () => [['expenses']],
    success: 'voided',
    error: 'voidError',
  });
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
