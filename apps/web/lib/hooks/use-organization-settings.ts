'use client';

import { useTranslations } from 'next-intl';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';
import { getLocalizedApiErrorMessage } from '@/lib/api-error';

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
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const t = useTranslations('settings.accountSettings.toast');
  const tApiErrors = useTranslations('common.apiErrors');

  return useMutation({
    mutationFn: async (data: UpdateAccountSettingsData) => {
      const response = await api.patch('/organization/account-settings', data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization', 'account-settings'] });
      toast({
        title: t('saved'),
        description: t('savedDescription'),
      });
    },
    onError: (error: unknown) => {
      toast({
        variant: 'destructive',
        title: t('saveError'),
        description: getLocalizedApiErrorMessage(error, t('genericError'), tApiErrors),
      });
    },
  });
}
