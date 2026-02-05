'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { accountsApi } from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';

// Types
export type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'INCOME' | 'EXPENSE';

export interface Account {
  id: string;
  code: string;
  name: string;
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

/**
 * Hook to create a new account
 */
export function useCreateAccount() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: CreateAccountData) => {
      const response = await accountsApi.create(data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      toast({
        title: 'Account created',
        description: 'The account has been created successfully.',
      });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error creating account',
        description: error.response?.data?.message || 'An error occurred',
      });
    },
  });
}

/**
 * Hook to update an existing account
 */
export function useUpdateAccount() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateAccountData }) => {
      const response = await accountsApi.update(id, data);
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['accounts', variables.id] });
      toast({
        title: 'Account updated',
        description: 'The account has been updated successfully.',
      });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error updating account',
        description: error.response?.data?.message || 'An error occurred',
      });
    },
  });
}

/**
 * Hook to delete an account
 */
export function useDeleteAccount() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await accountsApi.delete(id);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      toast({
        title: 'Account deleted',
        description: 'The account has been deleted successfully.',
      });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error deleting account',
        description: error.response?.data?.message || 'An error occurred',
      });
    },
  });
}

/**
 * Hook to seed default accounts
 */
export function useSeedAccounts() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (industry?: string) => {
      const response = industry
        ? await accountsApi.seedByIndustry(industry)
        : await accountsApi.seedDefaults();
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      toast({
        title: 'Accounts seeded',
        description: 'Default accounts have been created successfully.',
      });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error seeding accounts',
        description: error.response?.data?.message || 'An error occurred',
      });
    },
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

/**
 * Helper to get account type label
 */
export function getAccountTypeLabel(type: AccountType): string {
  const labelMap: Record<AccountType, string> = {
    ASSET: 'Asset',
    LIABILITY: 'Liability',
    EQUITY: 'Equity',
    REVENUE: 'Revenue',
    INCOME: 'Income',
    EXPENSE: 'Expense',
  };
  return labelMap[type] || type;
}

/**
 * Flatten accounts tree for select dropdown
 */
export function flattenAccountsTree(accounts: Account[], level = 0): Array<Account & { level: number }> {
  const result: Array<Account & { level: number }> = [];

  for (const account of accounts) {
    result.push({ ...account, level });
    if (account.children && account.children.length > 0) {
      result.push(...flattenAccountsTree(account.children, level + 1));
    }
  }

  return result;
}
