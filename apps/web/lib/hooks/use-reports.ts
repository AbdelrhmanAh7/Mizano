'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface DateRange {
  startDate: string;
  endDate: string;
}

export interface ReportAccount {
  id: string;
  code: string;
  name: string;
  type: string;
  balance: number;
  children?: ReportAccount[];
}

export interface ProfitLossReport {
  income: ReportAccount[];
  expenses: ReportAccount[];
  totalIncome: number;
  totalExpenses: number;
  netProfit: number;
  period: DateRange;
}

export interface BalanceSheetReport {
  assets: ReportAccount[];
  liabilities: ReportAccount[];
  equity: ReportAccount[];
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  asOfDate: string;
}

export interface CashFlowReport {
  operations: {
    netIncome: number;
    adjustments: Array<{ name: string; amount: number }>;
    total: number;
  };
  investing: {
    items: Array<{ name: string; amount: number }>;
    total: number;
  };
  financing: {
    items: Array<{ name: string; amount: number }>;
    total: number;
  };
  netChange: number;
  openingBalance: number;
  closingBalance: number;
  period: DateRange;
}

export interface AgingBucket {
  range: string;
  amount: number;
  count: number;
  items: Array<{
    id: string;
    number: string;
    date: string;
    dueDate: string;
    counterpartyName: string;
    amount: number;
    balanceDue: number;
    daysOverdue: number;
  }>;
}

export interface AgingReport {
  buckets: AgingBucket[];
  total: number;
  totalCount: number;
  asOfDate: string;
}

export interface GeneralLedgerEntry {
  date: string;
  reference: string;
  description: string;
  debit: number;
  credit: number;
  runningBalance: number;
  journalId: string;
}

export interface GeneralLedgerReport {
  account: {
    id: string;
    code: string;
    name: string;
    type: string;
  };
  openingBalance: number;
  entries: GeneralLedgerEntry[];
  closingBalance: number;
  totalDebits: number;
  totalCredits: number;
  period: DateRange;
}

export interface TrialBalanceAccount {
  id: string;
  code: string;
  name: string;
  type: string;
  debit: number;
  credit: number;
}

export interface TrialBalanceReport {
  accounts: TrialBalanceAccount[];
  totalDebits: number;
  totalCredits: number;
  isBalanced: boolean;
  asOfDate: string;
}

// API functions
const reportsApi = {
  getProfitLoss: (params: DateRange) =>
    api.get('/reports/profit-loss', { params }),
  getBalanceSheet: (params: { asOfDate: string }) =>
    api.get('/reports/balance-sheet', { params }),
  getCashFlow: (params: DateRange) =>
    api.get('/reports/cash-flow', { params }),
  getARaging: (params?: { asOfDate?: string }) =>
    api.get('/reports/ar-aging', { params }),
  getAPAging: (params?: { asOfDate?: string }) =>
    api.get('/reports/ap-aging', { params }),
  getGeneralLedger: (accountId: string, params: DateRange) =>
    api.get(`/reports/general-ledger/${accountId}`, { params }),
  getTrialBalance: (params: { asOfDate: string }) =>
    api.get('/reports/trial-balance', { params }),
  getSalesByCustomer: (params: DateRange) =>
    api.get('/reports/sales-by-customer', { params }),
  getSalesByItem: (params: DateRange) =>
    api.get('/reports/sales-by-item', { params }),
  getPurchasesByVendor: (params: DateRange) =>
    api.get('/reports/purchases-by-vendor', { params }),
};

// Hooks
export function useProfitLossReport(params: DateRange) {
  return useQuery({
    queryKey: ['reports', 'profit-loss', params],
    queryFn: async () => {
      const response = await reportsApi.getProfitLoss(params);
      return response.data?.data || response.data;
    },
    enabled: !!params.startDate && !!params.endDate,
  });
}

export function useBalanceSheetReport(asOfDate: string) {
  return useQuery({
    queryKey: ['reports', 'balance-sheet', asOfDate],
    queryFn: async () => {
      const response = await reportsApi.getBalanceSheet({ asOfDate });
      return response.data?.data || response.data;
    },
    enabled: !!asOfDate,
  });
}

export function useCashFlowReport(params: DateRange) {
  return useQuery({
    queryKey: ['reports', 'cash-flow', params],
    queryFn: async () => {
      const response = await reportsApi.getCashFlow(params);
      return response.data?.data || response.data;
    },
    enabled: !!params.startDate && !!params.endDate,
  });
}

export function useARAgingReport(asOfDate?: string) {
  return useQuery({
    queryKey: ['reports', 'ar-aging', asOfDate],
    queryFn: async () => {
      const response = await reportsApi.getARaging({ asOfDate });
      return response.data?.data || response.data;
    },
  });
}

export function useAPAgingReport(asOfDate?: string) {
  return useQuery({
    queryKey: ['reports', 'ap-aging', asOfDate],
    queryFn: async () => {
      const response = await reportsApi.getAPAging({ asOfDate });
      return response.data?.data || response.data;
    },
  });
}

export function useGeneralLedgerReport(accountId: string, params: DateRange) {
  return useQuery({
    queryKey: ['reports', 'general-ledger', accountId, params],
    queryFn: async () => {
      const response = await reportsApi.getGeneralLedger(accountId, params);
      return response.data?.data || response.data;
    },
    enabled: !!accountId && !!params.startDate && !!params.endDate,
  });
}

export function useTrialBalanceReport(asOfDate: string) {
  return useQuery({
    queryKey: ['reports', 'trial-balance', asOfDate],
    queryFn: async () => {
      const response = await reportsApi.getTrialBalance({ asOfDate });
      return response.data?.data || response.data;
    },
    enabled: !!asOfDate,
  });
}

// Helper functions
export function formatCurrency(amount: number | string | null | undefined): string {
  if (amount === null || amount === undefined) return '$0.00';
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(num);
}

export function getAgingBucketLabel(bucket: string): string {
  const labels: Record<string, string> = {
    current: 'Current',
    '1-15': '1-15 Days',
    '16-30': '16-30 Days',
    '31-60': '31-60 Days',
    '61-90': '61-90 Days',
    '90+': 'Over 90 Days',
  };
  return labels[bucket] || bucket;
}

export function getAgingBucketColor(bucket: string): string {
  const colors: Record<string, string> = {
    current: 'bg-green-100 text-green-800',
    '1-15': 'bg-blue-100 text-blue-800',
    '16-30': 'bg-yellow-100 text-yellow-800',
    '31-60': 'bg-orange-100 text-orange-800',
    '61-90': 'bg-red-100 text-red-800',
    '90+': 'bg-red-200 text-red-900',
  };
  return colors[bucket] || 'bg-gray-100 text-gray-800';
}
