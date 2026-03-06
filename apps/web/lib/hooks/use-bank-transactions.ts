'use client';

import { bankTransactionsApi } from '@/lib/api';
import { useInfiniteTableData } from '@/lib/hooks/use-infinite-table-data';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

type ApiError = { response?: { data?: { message?: string } } };

export interface BankTransaction {
  id: string;
  bankAccountId: string;
  date: string;
  description: string;
  payee: string | null;
  reference: string | null;
  amount: string | number;
  type: 'DEPOSIT' | 'WITHDRAWAL';
  status: 'UNMATCHED' | 'MATCHED' | 'RECONCILED' | 'EXCLUDED';
  matchedDocumentId: string | null;
  matchedDocumentType: 'INVOICE' | 'BILL' | 'EXPENSE' | 'JOURNAL' | null;
  confidence: number | null;
  suggestedMatches?: SuggestedMatch[];
  bankAccount?: {
    id: string;
    accountName: string;
    bankName: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface SuggestedMatch {
  id: string;
  type: 'INVOICE' | 'BILL' | 'EXPENSE';
  number: string;
  date: string;
  amount: string | number;
  balanceDue: string | number;
  counterpartyName: string;
  confidence: number;
}

export type TransactionStatus = BankTransaction['status'];

export interface TransactionFilters {
  bankAccountId?: string;
  status?: TransactionStatus;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

// Hooks
export function useBankTransactions(params?: TransactionFilters) {
  return useQuery({
    queryKey: ['bank-transactions', params],
    queryFn: async () => {
      const response = await bankTransactionsApi.getAll(params);
      return response.data;
    },
  });
}

export function useInfiniteBankTransactions(params?: Record<string, unknown>) {
  return useInfiniteTableData<BankTransaction, Record<string, unknown>>({
    queryKey: ['bank-transactions'],
    fetchFn: async (p) => {
      const response = await bankTransactionsApi.getAllCursor(p);
      return response.data;
    },
    params: params || {},
  });
}

export function useBankTransaction(id: string) {
  return useQuery({
    queryKey: ['bank-transactions', id],
    queryFn: async () => {
      const response = await bankTransactionsApi.getOne(id);
      return response.data?.data || response.data;
    },
    enabled: !!id,
  });
}

export function useUnmatchedTransactions(bankAccountId: string) {
  return useQuery({
    queryKey: ['bank-transactions', 'unmatched', bankAccountId],
    queryFn: async () => {
      const response = await bankTransactionsApi.getUnmatched(bankAccountId);
      return response.data;
    },
    enabled: !!bankAccountId,
  });
}

export function useSuggestedMatches(transactionId: string) {
  return useQuery({
    queryKey: ['bank-transactions', transactionId, 'suggested-matches'],
    queryFn: async () => {
      const response = await bankTransactionsApi.getSuggestedMatches(transactionId);
      return response.data;
    },
    enabled: !!transactionId,
  });
}

export function useMatchTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      documentId,
      documentType,
    }: {
      id: string;
      documentId: string;
      documentType: string;
    }) => bankTransactionsApi.match(id, { documentId, documentType }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bank-transactions'] });
      queryClient.invalidateQueries({ queryKey: ['bank-accounts'] });
      toast.success('Transaction matched successfully');
    },
    onError: (error: ApiError) => {
      toast.error(error.response?.data?.message || 'Failed to match transaction');
    },
  });
}

export function useUnmatchTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: bankTransactionsApi.unmatch,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bank-transactions'] });
      queryClient.invalidateQueries({ queryKey: ['bank-accounts'] });
      toast.success('Transaction unmatched successfully');
    },
    onError: (error: ApiError) => {
      toast.error(error.response?.data?.message || 'Failed to unmatch transaction');
    },
  });
}

export function useExcludeTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: bankTransactionsApi.exclude,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bank-transactions'] });
      toast.success('Transaction excluded');
    },
    onError: (error: ApiError) => {
      toast.error(error.response?.data?.message || 'Failed to exclude transaction');
    },
  });
}

export function useCreateExpenseFromTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      bankTransactionsApi.createExpense(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bank-transactions'] });
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      toast.success('Expense created and matched');
    },
    onError: (error: ApiError) => {
      toast.error(error.response?.data?.message || 'Failed to create expense');
    },
  });
}

export function useImportTransactions() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ bankAccountId, file }: { bankAccountId: string; file: File }) => {
      const formData = new FormData();
      formData.append('file', file);
      return bankTransactionsApi.import(bankAccountId, formData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bank-transactions'] });
      queryClient.invalidateQueries({ queryKey: ['bank-accounts'] });
      toast.success('Transactions imported successfully');
    },
    onError: (error: ApiError) => {
      toast.error(error.response?.data?.message || 'Failed to import transactions');
    },
  });
}

// Helper functions
export function getStatusLabel(status: TransactionStatus): string {
  const labels: Record<TransactionStatus, string> = {
    UNMATCHED: 'Unmatched',
    MATCHED: 'Matched',
    RECONCILED: 'Reconciled',
    EXCLUDED: 'Excluded',
  };
  return labels[status] || status;
}

export function getStatusColor(status: TransactionStatus): string {
  const colors: Record<TransactionStatus, string> = {
    UNMATCHED: 'bg-yellow-100 text-yellow-800',
    MATCHED: 'bg-blue-100 text-blue-800',
    RECONCILED: 'bg-green-100 text-green-800',
    EXCLUDED: 'bg-gray-100 text-gray-800',
  };
  return colors[status] || colors.UNMATCHED;
}

export function getConfidenceColor(confidence: number | null): string {
  if (confidence === null) return 'text-muted-foreground';
  if (confidence >= 80) return 'text-green-600';
  if (confidence >= 50) return 'text-yellow-600';
  return 'text-red-600';
}

export function getConfidenceLabel(confidence: number | null): string {
  if (confidence === null) return 'N/A';
  if (confidence >= 80) return 'High';
  if (confidence >= 50) return 'Medium';
  return 'Low';
}
