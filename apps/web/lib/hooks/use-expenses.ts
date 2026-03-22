'use client';

import { useToast } from '@/components/ui/use-toast';
import { expensesApi } from '@/lib/api';
import { useInfiniteTableData } from '@/lib/hooks/use-infinite-table-data';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

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

interface CreateExpenseData {
  date: string;
  accountId: string;
  vendorId?: string | null;
  amount: number | string;
  taxAmount?: number | string;
  taxInclusive?: boolean;
  paidThroughAccountId: string;
  description?: string | null;
  reference?: string | null;
  projectId?: string | null;
}

interface UpdateExpenseData extends Partial<CreateExpenseData> {}

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
 * Hook to update an existing expense
 */
export function useUpdateExpense() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateExpenseData }) => {
      const response = await expensesApi.update(id, data);
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['expenses', variables.id] });
      toast({
        title: 'Expense updated',
        description: 'The expense has been updated successfully.',
      });
    },
    onError: (error: ApiError) => {
      toast({
        variant: 'destructive',
        title: 'Error updating expense',
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
        title: 'Expense deleted',
        description: 'The expense has been deleted successfully.',
      });
    },
    onError: (error: ApiError) => {
      toast({
        variant: 'destructive',
        title: 'Error deleting expense',
        description: error.response?.data?.message || 'An error occurred',
      });
    },
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

/**
 * Calculate total with tax
 */
export function calculateTotal(amount: number, taxAmount: number, taxInclusive: boolean): number {
  if (taxInclusive) {
    return amount;
  }
  return amount + taxAmount;
}
