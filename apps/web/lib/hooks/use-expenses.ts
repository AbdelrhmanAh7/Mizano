'use client';

import { useToast } from '@/components/ui/use-toast';
import { expensesApi } from '@/lib/api';
import { useInfiniteTableData } from '@/lib/hooks/use-infinite-table-data';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateExpensePayload } from '@/components/purchases/expense-payload';
import { formatMoney } from '@/lib/format-money';

// Types
type ApiError = { response?: { data?: { message?: string } } };

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
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: CreateExpenseData) => {
      const response = await expensesApi.create(data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      toast({
        title: 'Expense recorded',
        description: 'The expense has been recorded successfully.',
      });
    },
    onError: (error: ApiError) => {
      toast({
        variant: 'destructive',
        title: 'Error recording expense',
        description: error.response?.data?.message || 'An error occurred',
      });
    },
  });
}

/**
 * Hook to post a pending expense
 */
export function usePostExpense() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await expensesApi.post(id);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      toast({ title: 'Expense posted', description: 'The expense was posted to the ledger.' });
    },
    onError: (error: ApiError) => {
      toast({
        variant: 'destructive',
        title: 'Error posting expense',
        description: error.response?.data?.message || 'An error occurred',
      });
    },
  });
}

/**
 * Hook to delete an expense
 */
export function useDeleteExpense() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await expensesApi.delete(id);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      toast({
        title: 'Expense voided',
        description: 'The expense was voided and its journal reversed.',
      });
    },
    onError: (error: ApiError) => {
      toast({
        variant: 'destructive',
        title: 'Error voiding expense',
        description: error.response?.data?.message || 'An error occurred',
      });
    },
  });
}

/**
 * Format currency amount
 */
export function formatCurrency(amount: string | number, currency: string): string {
  return formatMoney(amount, currency);
}

/**
 * Calculate total with tax
 */
export function calculateTotal(amount: number, taxAmount: number, taxInclusive: boolean): number {
  if (taxInclusive) {
    return amount;
  }
  return amount + taxAmount;
}
