'use client';

import { useTranslations } from 'next-intl';
import { useCallback } from 'react';

import { useToastMutation } from '@/lib/hooks/use-toast-mutation';
import { accountsApi } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';

// Types
export type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'INCOME' | 'EXPENSE';

export interface Account {
  id: string;
  code: string;
  /** In the UI language for accounts Mizano seeded; as typed for the organization's own. */
  name: string;
  nameAr?: string | null;
  nameEn?: string | null;
  type: AccountType;
  parentId: string | null;
  currency: string;
  description: string | null;
  isActive: boolean;
  isSystem: boolean;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
  children?: Account[];
  parent?: Account;
}

interface AccountParams {
  page?: number;
  limit?: number;
  search?: string;
  type?: AccountType;
  isActive?: boolean;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

interface CreateAccountData {
  code: string;
  name: string;
  type: AccountType;
  parentId?: string;
  currency?: string;
  description?: string;
}

interface UpdateAccountData {
  code?: string;
  name?: string;
  parentId?: string | null;
  currency?: string;
  description?: string;
  isActive?: boolean;
}

/**
 * Parameters for an account picker: the whole chart in code order. The list endpoint returns 20
 * rows by default, which cut the 35-account starter chart off before tax, bank and equity
 * accounts (500 is the endpoint's maximum).
 */
export const ACCOUNT_PICKER_PARAMS = { limit: 500, sortBy: 'code', sortOrder: 'asc' } as const;

/**
 * Hook to fetch all accounts with pagination
 */
export function useAccounts(params?: AccountParams) {
  return useQuery({
    queryKey: ['accounts', params],
    queryFn: async () => {
      const response = await accountsApi.getAll(params);
      return response.data;
    },
  });
}

/**
 * Hook to fetch accounts as tree structure
 */
export function useAccountsTree() {
  return useQuery({
    queryKey: ['accounts', 'tree'],
    queryFn: async () => {
      const response = await accountsApi.getTree();
      return response.data as Account[];
    },
  });
}

/**
 * Hook to fetch accounts by type
 */
export function useAccountsByType(type: AccountType | undefined) {
  return useQuery({
    queryKey: ['accounts', 'by-type', type],
    queryFn: async () => {
      if (!type) throw new Error('Account type is required');
      const response = await accountsApi.getByType(type);
      return response.data as Account[];
    },
    enabled: !!type,
  });
}

/**
 * Hook to fetch a single account by ID
 */
export function useAccount(id: string | undefined) {
  return useQuery({
    queryKey: ['accounts', id],
    queryFn: async () => {
      if (!id) throw new Error('Account ID is required');
      const response = await accountsApi.getOne(id);
      return response.data as Account;
    },
    enabled: !!id,
  });
}

const ACCOUNT_TOAST = 'accounting.accounts.toast';

/**
 * Hook to create a new account
 */
export function useCreateAccount() {
  return useToastMutation({
    namespace: ACCOUNT_TOAST,
    mutationFn: async (data: CreateAccountData) => (await accountsApi.create(data)).data,
    invalidate: () => [['accounts']],
    success: 'created',
    error: 'createError',
  });
}

/**
 * Hook to update an existing account
 */
export function useUpdateAccount() {
  return useToastMutation({
    namespace: ACCOUNT_TOAST,
    mutationFn: async ({ id, data }: { id: string; data: UpdateAccountData }) =>
      (await accountsApi.update(id, data)).data,
    invalidate: ({ id }) => [['accounts'], ['accounts', id]],
    success: 'updated',
    error: 'updateError',
  });
}

/**
 * Hook to delete an account
 */
export function useDeleteAccount() {
  return useToastMutation({
    namespace: ACCOUNT_TOAST,
    mutationFn: async (id: string) => (await accountsApi.delete(id)).data,
    invalidate: () => [['accounts']],
    success: 'deleted',
    error: 'deleteError',
  });
}

/**
 * Hook to fetch account balance
 */
export function useAccountBalance(id: string | undefined, asOfDate?: string) {
  return useQuery({
    queryKey: ['accounts', id, 'balance', asOfDate],
    queryFn: async () => {
      if (!id) throw new Error('Account ID is required');
      const response = await accountsApi.getBalance(id, asOfDate ? { asOfDate } : undefined);
      return response.data;
    },
    enabled: !!id,
  });
}

/**
 * Hook to seed default accounts
 */
export function useSeedAccounts() {
  return useToastMutation({
    namespace: ACCOUNT_TOAST,
    mutationFn: async (industry?: string) =>
      (industry ? await accountsApi.seedByIndustry(industry) : await accountsApi.seedDefaults())
        .data,
    invalidate: () => [['accounts']],
    success: 'seeded',
    error: 'seedError',
  });
}

/**
 * Helper to get account type badge color
 */
export function getAccountTypeColor(type: AccountType): string {
  const colorMap: Record<AccountType, string> = {
    ASSET: 'bg-blue-100 text-blue-800',
    LIABILITY: 'bg-orange-100 text-orange-800',
    EQUITY: 'bg-purple-100 text-purple-800',
    REVENUE: 'bg-green-100 text-green-800',
    INCOME: 'bg-green-100 text-green-800',
    EXPENSE: 'bg-red-100 text-red-800',
  };
  return colorMap[type] || 'bg-gray-100 text-gray-800';
}

/** Translated account type label (common.accountTypes); unknown types show as sent. */
export function useAccountTypeLabel(): (type: AccountType | string) => string {
  const t = useTranslations('common.accountTypes');
  return useCallback(
    (type: AccountType | string) => {
      const key = String(type).toLowerCase();
      return t.has(key) ? t(key) : String(type);
    },
    [t],
  );
}

/**
 * Flatten accounts tree for select dropdown
 */
export function flattenAccountsTree(
  accounts: Account[],
  level = 0,
): Array<Account & { level: number }> {
  const result: Array<Account & { level: number }> = [];

  for (const account of accounts) {
    result.push({ ...account, level });
    if (account.children && account.children.length > 0) {
      result.push(...flattenAccountsTree(account.children, level + 1));
    }
  }

  return result;
}
