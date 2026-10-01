import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';

// ============ Types ============

export type TaxRateType = 'OUTPUT' | 'INPUT' | 'BOTH';
export type VATReturnStatus = 'DRAFT' | 'CALCULATED' | 'SUBMITTED' | 'FILED';

export interface TaxRate {
  id: string;
  name: string;
  description?: string;
  rate: number | string;
  type: TaxRateType;
  accountId: string;
  account?: {
    id: string;
    name: string;
    code: string;
  };
  collectAccountId?: string;
  collectAccount?: {
    id: string;
    name: string;
    code: string;
  };
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface VATReturn {
  id: string;
  returnNumber?: string;
  period?: string;
  startDate: string;
  endDate: string;
  dueDate?: string;
  totalSales: number | string;
  outputVat: number | string;
  outputVAT?: number | string;
  totalPurchases: number | string;
  inputVat: number | string;
  inputVAT?: number | string;
  netVat: number | string;
  netPayable?: number | string;
  status: VATReturnStatus;
  filedAt?: string;
  submittedAt?: string;
  payment?: VATPayment;
  breakdown?: {
    invoices?: unknown[];
    creditNotes?: unknown[];
    bills?: unknown[];
    expenses?: unknown[];
  };
  createdAt: string;
  updatedAt: string;
}

export interface VATPayment {
  id: string;
  vatReturnId: string;
  vatReturn?: VATReturn;
  amount: number | string;
  date: string;
  paymentDate?: string;
  paidFromAccountId?: string;
  reference?: string;
  bankAccountId?: string;
  bankAccount?: {
    id: string;
    name: string;
  };
  createdAt: string;
}

export interface TaxDashboardStats {
  activeRates: number;
  totalRates: number;
  pendingReturns: number;
  totalReturns: number;
  outstandingVAT: number;
  totalPaid: number;
  upcomingDeadlines: Array<{
    id: string;
    returnNumber?: string;
    dueDate?: string;
    status: VATReturnStatus;
    startDate: string;
    endDate: string;
  }>;
  recentReturns: Array<{
    id: string;
    returnNumber?: string;
    status: VATReturnStatus;
    outputVAT: number | string;
    inputVAT: number | string;
    netPayable: number | string;
    startDate: string;
    endDate: string;
  }>;
}

// ============ API Functions ============

const taxRatesApi = {
  list: async (params?: { isActive?: boolean }) => {
    const response = await api.get('/tax-rates', { params });
    return response.data;
  },
  get: async (id: string) => {
    const response = await api.get(`/tax-rates/${id}`);
    return response.data;
  },
  create: async (data: Partial<TaxRate>) => {
    const response = await api.post('/tax-rates', data);
    return response.data;
  },
  update: async ({ id, data }: { id: string; data: Partial<TaxRate> }) => {
    const response = await api.put(`/tax-rates/${id}`, data);
    return response.data;
  },
  delete: async (id: string) => {
    const response = await api.delete(`/tax-rates/${id}`);
    return response.data;
  },
};

const vatReturnsApi = {
  list: async (params?: { status?: string; year?: number }) => {
    const response = await api.get('/vat-returns', { params });
    return response.data;
  },
  get: async (id: string) => {
    const response = await api.get(`/vat-returns/${id}`);
    return response.data;
  },
  dashboardStats: async () => {
    const response = await api.get('/vat-returns/dashboard-stats');
    return response.data;
  },
  generate: async (startDate: string, endDate: string) => {
    const response = await api.post('/vat-returns', {
      startDate,
      endDate,
    });
    return response.data;
  },
  calculate: async (id: string) => {
    const response = await api.post(`/vat-returns/${id}/calculate`);
    return response.data;
  },
  file: async (id: string) => {
    const response = await api.post(`/vat-returns/${id}/submit`);
    return response.data;
  },
  delete: async (id: string) => {
    const response = await api.delete(`/vat-returns/${id}`);
    return response.data;
  },
};

const vatPaymentsApi = {
  recordPayment: async (data: {
    vatReturnId: string;
    /** Exact net payable as a decimal string (max 4 decimals). */
    amount: string;
    date: string;
    paidFromAccountId: string;
    reference?: string;
  }) => {
    const { vatReturnId, ...paymentData } = data;
    const response = await api.post(`/vat-returns/${vatReturnId}/payment`, paymentData);
    return response.data;
  },
};

// ============ Hooks - Tax Rates ============

export function useTaxRates(params?: { isActive?: boolean }) {
  return useQuery({
    queryKey: ['tax-rates', params],
    queryFn: () => taxRatesApi.list(params),
  });
}

/**
 * Active SALES/BOTH tax rates as { id, name, rate (percent) } options for sales documents.
 * Reads the sales-authorized endpoint (sales.view), not /tax-rates (tax.view), so sales users
 * can pick a rate; the server already excludes purchase-only rates.
 */
export interface TaxRateOptionsState {
  options: { id: string; name: string; rate: number }[];
  isLoading: boolean;
  /** True when the lookup failed: forms must not save lines as if there were no tax rates. */
  isError: boolean;
}

export function useTaxRateOptions(): TaxRateOptionsState {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['tax-rates', 'sales-options'],
    queryFn: async () => {
      const response = await api.get('/invoices/tax-rate-options');
      return response.data as { id: string; name: string; rate: string }[];
    },
  });
  const options = useMemo(
    () => (data ?? []).map((r) => ({ id: r.id, name: r.name, rate: Number(r.rate) })),
    [data],
  );
  return { options, isLoading, isError };
}

export function useTaxRate(id: string) {
  return useQuery({
    queryKey: ['tax-rates', id],
    queryFn: () => taxRatesApi.get(id),
    enabled: !!id,
  });
}

export function useCreateTaxRate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: taxRatesApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tax-rates'] });
      queryClient.invalidateQueries({ queryKey: ['tax-dashboard-stats'] });
    },
  });
}

export function useUpdateTaxRate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: taxRatesApi.update,
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['tax-rates'] });
      queryClient.invalidateQueries({ queryKey: ['tax-rates', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['tax-dashboard-stats'] });
    },
  });
}

export function useDeleteTaxRate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: taxRatesApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tax-rates'] });
      queryClient.invalidateQueries({ queryKey: ['tax-dashboard-stats'] });
    },
  });
}

// ============ Hooks - VAT Returns ============

export function useVATReturns(params?: { status?: string; year?: number }) {
  return useQuery({
    queryKey: ['vat-returns', params],
    queryFn: () => vatReturnsApi.list(params),
  });
}

export function useVATReturn(id: string) {
  return useQuery({
    queryKey: ['vat-returns', id],
    queryFn: () => vatReturnsApi.get(id),
    enabled: !!id,
  });
}

export function useTaxDashboardStats() {
  return useQuery({
    queryKey: ['tax-dashboard-stats'],
    queryFn: () => vatReturnsApi.dashboardStats(),
  });
}

export function useGenerateVATReturn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ startDate, endDate }: { startDate: string; endDate: string }) =>
      vatReturnsApi.generate(startDate, endDate),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vat-returns'] });
      queryClient.invalidateQueries({ queryKey: ['tax-dashboard-stats'] });
    },
  });
}

export function useCalculateVATReturn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: vatReturnsApi.calculate,
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['vat-returns'] });
      queryClient.invalidateQueries({ queryKey: ['vat-returns', id] });
      queryClient.invalidateQueries({ queryKey: ['tax-dashboard-stats'] });
    },
  });
}

export function useFileVATReturn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: vatReturnsApi.file,
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['vat-returns'] });
      queryClient.invalidateQueries({ queryKey: ['vat-returns', id] });
      queryClient.invalidateQueries({ queryKey: ['tax-dashboard-stats'] });
    },
  });
}

export function useDeleteVATReturn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: vatReturnsApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vat-returns'] });
      queryClient.invalidateQueries({ queryKey: ['tax-dashboard-stats'] });
    },
  });
}

// ============ Hooks - VAT Payments ============

export function useRecordVATPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: vatPaymentsApi.recordPayment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vat-returns'] });
      queryClient.invalidateQueries({ queryKey: ['tax-dashboard-stats'] });
    },
  });
}

// ============ Helper Functions ============

export function getTaxRateTypeLabel(type: TaxRateType): string {
  const labels: Record<TaxRateType, string> = {
    OUTPUT: 'Output (Sales)',
    INPUT: 'Input (Purchases)',
    BOTH: 'Both',
  };
  return labels[type] || type;
}

export function getVATReturnStatusLabel(status: VATReturnStatus): string {
  const labels: Record<VATReturnStatus, string> = {
    DRAFT: 'Draft',
    CALCULATED: 'Calculated',
    SUBMITTED: 'Submitted',
    FILED: 'Filed',
  };
  return labels[status] || status;
}

export function getVATReturnStatusColor(status: VATReturnStatus): string {
  const colors: Record<VATReturnStatus, string> = {
    DRAFT: 'bg-gray-100 text-gray-800 border-gray-200',
    CALCULATED: 'bg-amber-100 text-amber-800 border-amber-200',
    SUBMITTED: 'bg-blue-100 text-blue-800 border-blue-200',
    FILED: 'bg-green-100 text-green-800 border-green-200',
  };
  return colors[status] || '';
}

export function getVATReturnStatusStep(status: VATReturnStatus): number {
  const steps: Record<VATReturnStatus, number> = {
    DRAFT: 0,
    CALCULATED: 1,
    SUBMITTED: 2,
    FILED: 3,
  };
  return steps[status] ?? 0;
}

export function formatCurrency(amount: number | string | undefined): string {
  if (amount === undefined || amount === null) return '$0.00';
  const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(numAmount);
}

export function formatPercentage(rate: number | string | undefined): string {
  if (rate === undefined || rate === null) return '0%';
  const numRate = typeof rate === 'string' ? parseFloat(rate) : rate;
  return `${numRate}%`;
}

/** Normalize VAT return field names (backend uses outputVAT, frontend expects outputVat) */
export function normalizeVATReturn(r: VATReturn): VATReturn {
  return {
    ...r,
    outputVat: r.outputVat ?? r.outputVAT ?? 0,
    inputVat: r.inputVat ?? r.inputVAT ?? 0,
    netVat: r.netVat ?? r.netPayable ?? 0,
  };
}
