'use client';

import { useQuery } from '@tanstack/react-query';
import { accountingReportsApi } from '@/lib/api';

export function useTrialBalance(asOfDate?: string) {
  return useQuery({
    queryKey: ['accounting-reports', 'trial-balance', asOfDate],
    queryFn: async () => {
      const response = await accountingReportsApi.getTrialBalance(
        asOfDate ? { asOfDate } : undefined,
      );
      return response.data;
    },
  });
}

export function useGeneralLedger(
  accountId: string | undefined,
  dateFrom?: string,
  dateTo?: string,
) {
  return useQuery({
    queryKey: ['accounting-reports', 'general-ledger', accountId, dateFrom, dateTo],
    queryFn: async () => {
      if (!accountId) throw new Error('Account ID is required');
      const response = await accountingReportsApi.getGeneralLedger(accountId, { dateFrom, dateTo });
      return response.data;
    },
    enabled: !!accountId,
  });
}
