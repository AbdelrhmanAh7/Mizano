'use client';

import { useToastMutation } from './use-toast-mutation';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

// Types
export interface AccountSettings {
  defaultArAccountId: string | null;
  defaultRevenueAccountId: string | null;
  defaultVatPayableAccountId: string | null;
  defaultApAccountId: string | null;
  defaultVatReceivableAccountId: string | null;
  defaultBankAccountId: string | null;
  defaultCashAccountId: string | null;
  defaultSalesReturnsAccountId: string | null;
}

interface UpdateAccountSettingsData {
  defaultArAccountId?: string | null;
  defaultRevenueAccountId?: string | null;
  defaultVatPayableAccountId?: string | null;
  defaultApAccountId?: string | null;
  defaultVatReceivableAccountId?: string | null;
  defaultBankAccountId?: string | null;
  defaultCashAccountId?: string | null;
  defaultSalesReturnsAccountId?: string | null;
}

/**
 * Hook to fetch organization account settings
 */
export function useAccountSettings() {
  return useQuery({
    queryKey: ['organization', 'account-settings'],
    queryFn: async () => {
      const response = await api.get('/organization/account-settings');
      return response.data as AccountSettings;
    },
  });
}

/**
 * Hook to update organization account settings
 */
export function useUpdateAccountSettings() {
  return useToastMutation({
    namespace: 'settings.accountSettings.toast',
    mutationFn: async (data: UpdateAccountSettingsData) => {
      const response = await api.patch('/organization/account-settings', data);
      return response.data;
    },
    invalidate: () => [['organization', 'account-settings']],
    success: 'saved',
    error: 'saveError',
  });
}
