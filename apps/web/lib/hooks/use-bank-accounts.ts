'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { bankAccountsApi } from '@/lib/api';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { getLocalizedApiErrorMessage } from '@/lib/api-error';

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
  const t = useTranslations('banking.toast');
  const tApiErrors = useTranslations('common.apiErrors');

  return useMutation({
    mutationFn: bankAccountsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bank-accounts'] });
      toast.success(t('accountCreated'));
    },
    onError: (error: unknown) => {
      toast.error(getLocalizedApiErrorMessage(error, t('accountCreateError'), tApiErrors));
    },
  });
}

export function useUpdateBankAccount() {
  const queryClient = useQueryClient();
  const t = useTranslations('banking.toast');
  const tApiErrors = useTranslations('common.apiErrors');

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      bankAccountsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bank-accounts'] });
      toast.success(t('accountUpdated'));
    },
    onError: (error: unknown) => {
      toast.error(getLocalizedApiErrorMessage(error, t('accountUpdateError'), tApiErrors));
    },
  });
}

export function useDeleteBankAccount() {
  const queryClient = useQueryClient();
  const t = useTranslations('banking.toast');
  const tApiErrors = useTranslations('common.apiErrors');

  return useMutation({
    mutationFn: bankAccountsApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bank-accounts'] });
      toast.success(t('accountDeleted'));
    },
    onError: (error: unknown) => {
      toast.error(getLocalizedApiErrorMessage(error, t('accountDeleteError'), tApiErrors));
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
/** Bank account types; `labelKey` is a key under the `banking` messages namespace. */
export const accountTypeOptions: { value: BankAccountType; labelKey: string }[] = [
  { value: 'BANK', labelKey: 'accounts.types.bank' },
  { value: 'CREDIT_CARD', labelKey: 'accounts.types.creditCard' },
  { value: 'PETTY_CASH', labelKey: 'accounts.types.pettyCash' },
];

/** The translated label of a bank account type; `t` is `useTranslations('banking')`. */
export function getAccountTypeLabel(type: BankAccountType, t: (key: string) => string): string {
  const option = accountTypeOptions.find((o) => o.value === type);
  return option ? t(option.labelKey) : type;
}

export function getAccountTypeColor(type: BankAccountType): string {
  const colors: Record<BankAccountType, string> = {
    BANK: 'bg-blue-100 text-blue-800',
    CREDIT_CARD: 'bg-purple-100 text-purple-800',
    PETTY_CASH: 'bg-yellow-100 text-yellow-800',
  };
  return colors[type] || 'bg-gray-100 text-gray-800';
}
