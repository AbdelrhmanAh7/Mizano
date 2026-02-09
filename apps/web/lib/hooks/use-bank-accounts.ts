'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { bankAccountsApi } from '@/lib/api';
import { toast } from 'sonner';

export interface BankAccount {
  id: string;
  accountName: string;
  accountNumber: string;
  bankName: string;
  accountType: 'CHECKING' | 'SAVINGS' | 'CREDIT_CARD' | 'CASH' | 'OTHER';
  currency: string;
  currentBalance: string | number;
  bankBalance: string | number;
  lastReconciled: string | null;
  isActive: boolean;
  glAccountId: string | null;
  glAccount?: {
    id: string;
    name: string;
    code: string;
  };
  createdAt: string;
  updatedAt: string;
}

export type BankAccountType = BankAccount['accountType'];

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

export function useBankAccountTransactions(id: string, params?: any) {
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
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to create bank account');
    },
  });
}

export function useUpdateBankAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      bankAccountsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bank-accounts'] });
      toast.success('Bank account updated successfully');
    },
    onError: (error: any) => {
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
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to delete bank account');
    },
  });
}

// Helper functions
export const accountTypeOptions = [
  { value: 'CHECKING', label: 'Checking Account' },
  { value: 'SAVINGS', label: 'Savings Account' },
  { value: 'CREDIT_CARD', label: 'Credit Card' },
  { value: 'CASH', label: 'Cash' },
  { value: 'OTHER', label: 'Other' },
];

export function getAccountTypeLabel(type: BankAccountType): string {
  return accountTypeOptions.find((t) => t.value === type)?.label || type;
}

export function getAccountTypeColor(type: BankAccountType): string {
  const colors: Record<BankAccountType, string> = {
    CHECKING: 'bg-blue-100 text-blue-800',
    SAVINGS: 'bg-green-100 text-green-800',
    CREDIT_CARD: 'bg-purple-100 text-purple-800',
    CASH: 'bg-yellow-100 text-yellow-800',
    OTHER: 'bg-gray-100 text-gray-800',
  };
  return colors[type] || colors.OTHER;
}

export function formatCurrency(amount: string | number | null | undefined): string {
  if (amount === null || amount === undefined) return '$0.00';
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(num);
}
