'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { bankAccountsApi } from '@/lib/api';

export interface BankingDashboardStats {
  totalAccounts: number;
  totalSystemBalance: string;
  pendingTransactionCount: number;
  monthlyTransactionCount: number;
}

export interface BalanceHistoryPoint {
  date: string;
  runningBalance: number;
}
import { toast } from 'sonner';

type ApiError = { response?: { data?: { message?: string } } };

export interface BankAccount {
  id: string;
  name: string;
  accountNumber: string | null;
  type: 'BANK' | 'CREDIT_CARD' | 'PETTY_CASH';
  currency: string;
  systemBalance: string | number;
  bankBalance: string | number;
  linkedAccountId: string;
  linkedAccount?: {
    id: string;
    name: string;
    code: string;
  };
  isActive: boolean;
  lastReconciled?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type BankAccountType = BankAccount['type'];

export interface BankAccountFilters {
  search?: string;
  type?: BankAccountType;
  isActive?: boolean;
}

// Hooks
export function useBankAccounts(params?: BankAccountFilters) {
  return useQuery({
    queryKey: ['bank-accounts', params],
    queryFn: async () => {
      const response = await bankAccountsApi.getAll(params);
      return response.data;
    },
  });
}

export function useBankAccount(id: string) {
  return useQuery({
    queryKey: ['bank-accounts', id],
    queryFn: async () => {
      const response = await bankAccountsApi.getOne(id);
      return response.data?.data || response.data;
    },
    enabled: !!id,
  });
}

export function useBankAccountTransactions(id: string, params?: Record<string, unknown>) {
  return useQuery({
    queryKey: ['bank-accounts', id, 'transactions', params],
    queryFn: async () => {
      const response = await bankAccountsApi.getTransactions(id, params);
      return response.data;
    },
    enabled: !!id,
  });
}

export function useCreateBankAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: bankAccountsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bank-accounts'] });
      toast.success('Bank account created successfully');
    },
    onError: (error: ApiError) => {
      toast.error(error.response?.data?.message || 'Failed to create bank account');
    },
  });
}

export function useUpdateBankAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      bankAccountsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bank-accounts'] });
      toast.success('Bank account updated successfully');
    },
    onError: (error: ApiError) => {
      toast.error(error.response?.data?.message || 'Failed to update bank account');
    },
  });
}

export function useDeleteBankAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: bankAccountsApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bank-accounts'] });
      toast.success('Bank account deleted successfully');
    },
    onError: (error: ApiError) => {
      toast.error(error.response?.data?.message || 'Failed to delete bank account');
    },
  });
}

export function useBankingStats() {
  return useQuery({
    queryKey: ['bank-accounts', 'stats'],
    queryFn: async () => {
      const response = await bankAccountsApi.getStats();
      return response.data?.data || response.data;
    },
  });
}

export function useBankAccountBalanceHistory(id: string) {
  return useQuery({
    queryKey: ['bank-accounts', id, 'balance-history'],
    queryFn: async () => {
      const response = await bankAccountsApi.getBalanceHistory(id);
      return response.data?.data || response.data;
    },
    enabled: !!id,
  });
}

// Helper functions
export const accountTypeOptions = [
  { value: 'BANK', label: 'Bank Account' },
  { value: 'CREDIT_CARD', label: 'Credit Card' },
  { value: 'PETTY_CASH', label: 'Petty Cash' },
];

export function getAccountTypeLabel(type: BankAccountType): string {
  return accountTypeOptions.find((t) => t.value === type)?.label || type;
}

export function getAccountTypeColor(type: BankAccountType): string {
  const colors: Record<BankAccountType, string> = {
    BANK: 'bg-blue-100 text-blue-800',
    CREDIT_CARD: 'bg-purple-100 text-purple-800',
    PETTY_CASH: 'bg-yellow-100 text-yellow-800',
  };
  return colors[type] || 'bg-gray-100 text-gray-800';
}

export function formatCurrency(amount: string | number | null | undefined): string {
  if (amount === null || amount === undefined) return '$0.00';
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(num);
}
