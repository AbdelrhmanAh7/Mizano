import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';

// ============ Types ============

export type TaxRateType = 'OUTPUT' | 'INPUT' | 'BOTH';
export type VATReturnStatus = 'DRAFT' | 'FILED' | 'PAID';

export interface TaxRate {
  id: string;
  name: string;
  rate: number | string;
  type: TaxRateType;
  accountId: string;
  account?: {
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
  startDate: string;
  endDate: string;
  outputVat: number | string;
  inputVat: number | string;
  netVat: number | string;
  status: VATReturnStatus;
  filedAt?: string;
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
  paymentDate: string;
  reference?: string;
  bankAccountId: string;
  bankAccount?: {
    id: string;
    name: string;
  };
  createdAt: string;
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
  generate: async (startDate: string, endDate: string) => {
    const response = await api.post('/vat-returns', {
      startDate,
      endDate,
    });
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
    amount: number;
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
    },
  });
}

export function useDeleteTaxRate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: taxRatesApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tax-rates'] });
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

export function useGenerateVATReturn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ startDate, endDate }: { startDate: string; endDate: string }) =>
      vatReturnsApi.generate(startDate, endDate),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vat-returns'] });
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
    },
  });
}

export function useDeleteVATReturn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: vatReturnsApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vat-returns'] });
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
    FILED: 'Filed',
    PAID: 'Paid',
  };
  return labels[status] || status;
}

export function getVATReturnStatusColor(status: VATReturnStatus): string {
  const colors: Record<VATReturnStatus, string> = {
    DRAFT: 'bg-gray-100 text-gray-800 border-gray-200',
    FILED: 'bg-blue-100 text-blue-800 border-blue-200',
    PAID: 'bg-green-100 text-green-800 border-green-200',
  };
  return colors[status] || '';
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
