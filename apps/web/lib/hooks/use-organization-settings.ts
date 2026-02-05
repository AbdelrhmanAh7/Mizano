'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';

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
      const response = await api.get('/organizations/account-settings');
      return response.data as AccountSettings;
    },
  });
}

/**
 * Hook to update organization account settings
 */
export function useUpdateAccountSettings() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: UpdateAccountSettingsData) => {
      const response = await api.patch('/organizations/account-settings', data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization', 'account-settings'] });
      toast({
        title: 'Settings saved',
        description: 'Account settings have been updated successfully.',
      });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error saving settings',
        description: error.response?.data?.message || 'An error occurred',
      });
    },
  });
}
