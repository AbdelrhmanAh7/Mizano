import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';

// ============ Types ============

export interface ExchangeRate {
  id: string;
  fromCurrency: string;
  toCurrency: string;
  rate: number;
  date: string;
  source: 'MANUAL' | 'AUTO';
  createdAt: string;
  updatedAt: string;
}

export interface CreateExchangeRateDto {
  fromCurrency: string;
  toCurrency: string;
  rate: number;
  date: string;
}

export interface UpdateExchangeRateDto {
  rate: number;
  date?: string;
}

export interface ConversionResult {
  fromAmount: number;
  toAmount: number;
  fromCurrency: string;
  toCurrency: string;
  rate: number;
  date: string;
  source: string;
}

export interface GainLossResult {
  originalAmount: number;
  currentAmount: number;
  gainLoss: number;
  isGain: boolean;
  percentage: number;
}

export interface UnrealizedGainLoss {
  totalGainLoss: number;
  byAccount: Array<{
    accountId: string;
    accountName: string;
    currency: string;
    originalAmount: number;
    currentAmount: number;
    gainLoss: number;
  }>;
  byCustomer: Array<{
    customerId: string;
    customerName: string;
    currency: string;
    originalAmount: number;
    currentAmount: number;
    gainLoss: number;
  }>;
  byVendor: Array<{
    vendorId: string;
    vendorName: string;
    currency: string;
    originalAmount: number;
    currentAmount: number;
    gainLoss: number;
  }>;
}

export interface CurrencyInfo {
  code: string;
  name: string;
  symbol: string;
  decimals: number;
}

// Supported currencies
export const SUPPORTED_CURRENCIES: CurrencyInfo[] = [
  { code: 'SAR', name: 'Saudi Riyal', symbol: '﷼', decimals: 2 },
  { code: 'USD', name: 'US Dollar', symbol: '$', decimals: 2 },
  { code: 'EUR', name: 'Euro', symbol: '€', decimals: 2 },
  { code: 'GBP', name: 'British Pound', symbol: '£', decimals: 2 },
  { code: 'AED', name: 'UAE Dirham', symbol: 'د.إ', decimals: 2 },
  { code: 'KWD', name: 'Kuwaiti Dinar', symbol: 'د.ك', decimals: 3 },
  { code: 'QAR', name: 'Qatari Riyal', symbol: '﷼', decimals: 2 },
  { code: 'BHD', name: 'Bahraini Dinar', symbol: 'BD', decimals: 3 },
  { code: 'OMR', name: 'Omani Rial', symbol: '﷼', decimals: 3 },
  { code: 'EGP', name: 'Egyptian Pound', symbol: 'E£', decimals: 2 },
  { code: 'JOD', name: 'Jordanian Dinar', symbol: 'JD', decimals: 3 },
  { code: 'LBP', name: 'Lebanese Pound', symbol: 'ل.ل', decimals: 2 },
  { code: 'INR', name: 'Indian Rupee', symbol: '₹', decimals: 2 },
  { code: 'PKR', name: 'Pakistani Rupee', symbol: '₨', decimals: 2 },
  { code: 'CNY', name: 'Chinese Yuan', symbol: '¥', decimals: 2 },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥', decimals: 0 },
  { code: 'KRW', name: 'South Korean Won', symbol: '₩', decimals: 0 },
  { code: 'TRY', name: 'Turkish Lira', symbol: '₺', decimals: 2 },
  { code: 'CHF', name: 'Swiss Franc', symbol: 'CHF', decimals: 2 },
  { code: 'AUD', name: 'Australian Dollar', symbol: 'A$', decimals: 2 },
  { code: 'CAD', name: 'Canadian Dollar', symbol: 'C$', decimals: 2 },
  { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$', decimals: 2 },
  { code: 'HKD', name: 'Hong Kong Dollar', symbol: 'HK$', decimals: 2 },
  { code: 'MYR', name: 'Malaysian Ringgit', symbol: 'RM', decimals: 2 },
  { code: 'ZAR', name: 'South African Rand', symbol: 'R', decimals: 2 },
];

// ============ API Functions ============

const currencyApi = {
  // Exchange Rates
  getExchangeRates: async (params?: {
    fromCurrency?: string;
    toCurrency?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    limit?: number;
  }) => {
    const response = await api.get('/currency/exchange-rates', { params });
    return response.data;
  },
  getExchangeRate: async (id: string) => {
    const response = await api.get(`/currency/exchange-rates/${id}`);
    return response.data;
  },
  getRate: async (fromCurrency: string, toCurrency: string, date?: string) => {
    const response = await api.get('/currency/rate', {
      params: { fromCurrency, toCurrency, date },
    });
    return response.data;
  },
  createExchangeRate: async (data: CreateExchangeRateDto) => {
    const response = await api.post('/currency/exchange-rates', data);
    return response.data;
  },
  updateExchangeRate: async (id: string, data: UpdateExchangeRateDto) => {
    const response = await api.put(`/currency/exchange-rates/${id}`, data);
    return response.data;
  },
  deleteExchangeRate: async (id: string) => {
    const response = await api.delete(`/currency/exchange-rates/${id}`);
    return response.data;
  },
  bulkCreateRates: async (rates: CreateExchangeRateDto[]) => {
    const response = await api.post('/currency/exchange-rates/bulk', { rates });
    return response.data;
  },

  // Conversion
  convertAmount: async (data: {
    amount: number;
    fromCurrency: string;
    toCurrency: string;
    date?: string;
  }) => {
    const response = await api.post('/currency/convert', data);
    return response.data;
  },

  // Gain/Loss
  calculateGainLoss: async (data: {
    originalAmount: number;
    currency: string;
    originalRate: number;
    currentRate?: number;
    date?: string;
  }) => {
    const response = await api.post('/currency/gain-loss', data);
    return response.data;
  },
  getUnrealizedGainLoss: async (date?: string) => {
    const response = await api.get('/currency/unrealized-gain-loss', {
      params: { date },
    });
    return response.data;
  },
  recordGainLossJournal: async (date?: string) => {
    const response = await api.post('/currency/record-gain-loss', { date });
    return response.data;
  },

  // Rate History
  getRateHistory: async (fromCurrency: string, toCurrency: string, days: number = 30) => {
    const response = await api.get('/currency/rate-history', {
      params: { fromCurrency, toCurrency, days },
    });
    return response.data;
  },
};

// ============ Hooks - Exchange Rates ============

export function useExchangeRates(params?: {
  fromCurrency?: string;
  toCurrency?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
}) {
  return useQuery({
    queryKey: ['exchange-rates', params],
    queryFn: () => currencyApi.getExchangeRates(params),
  });
}

export function useExchangeRate(id: string) {
  return useQuery({
    queryKey: ['exchange-rates', id],
    queryFn: () => currencyApi.getExchangeRate(id),
    enabled: !!id,
  });
}

export function useGetRate(fromCurrency: string, toCurrency: string, date?: string) {
  return useQuery({
    queryKey: ['currency-rate', fromCurrency, toCurrency, date],
    queryFn: () => currencyApi.getRate(fromCurrency, toCurrency, date),
    enabled: !!fromCurrency && !!toCurrency && fromCurrency !== toCurrency,
  });
}

export function useCreateExchangeRate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: currencyApi.createExchangeRate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exchange-rates'] });
      queryClient.invalidateQueries({ queryKey: ['currency-rate'] });
    },
  });
}

export function useUpdateExchangeRate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateExchangeRateDto }) =>
      currencyApi.updateExchangeRate(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exchange-rates'] });
      queryClient.invalidateQueries({ queryKey: ['currency-rate'] });
    },
  });
}

export function useDeleteExchangeRate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: currencyApi.deleteExchangeRate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exchange-rates'] });
    },
  });
}

export function useBulkCreateRates() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: currencyApi.bulkCreateRates,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exchange-rates'] });
      queryClient.invalidateQueries({ queryKey: ['currency-rate'] });
    },
  });
}

// ============ Hooks - Conversion ============

export function useConvertAmount() {
  return useMutation({
    mutationFn: currencyApi.convertAmount,
  });
}

// ============ Hooks - Gain/Loss ============

export function useCalculateGainLoss() {
  return useMutation({
    mutationFn: currencyApi.calculateGainLoss,
  });
}

export function useUnrealizedGainLoss(date?: string) {
  return useQuery({
    queryKey: ['unrealized-gain-loss', date],
    queryFn: () => currencyApi.getUnrealizedGainLoss(date),
  });
}

export function useRecordGainLossJournal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: currencyApi.recordGainLossJournal,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['unrealized-gain-loss'] });
      queryClient.invalidateQueries({ queryKey: ['journals'] });
    },
  });
}

// ============ Hooks - Rate History ============

export function useRateHistory(fromCurrency: string, toCurrency: string, days: number = 30) {
  return useQuery({
    queryKey: ['rate-history', fromCurrency, toCurrency, days],
    queryFn: () => currencyApi.getRateHistory(fromCurrency, toCurrency, days),
    enabled: !!fromCurrency && !!toCurrency && fromCurrency !== toCurrency,
  });
}

// ============ Helper Functions ============

export function getCurrencyInfo(code: string): CurrencyInfo | undefined {
  return SUPPORTED_CURRENCIES.find((c) => c.code === code);
}

export function getCurrencySymbol(code: string): string {
  const info = getCurrencyInfo(code);
  return info?.symbol || code;
}

export function getCurrencyName(code: string): string {
  const info = getCurrencyInfo(code);
  return info?.name || code;
}

export function formatCurrencyAmount(
  amount: number | string | undefined,
  currencyCode: string = 'SAR',
  showSymbol: boolean = true,
): string {
  if (amount === undefined || amount === null) {
    return showSymbol ? `${getCurrencySymbol(currencyCode)}0.00` : '0.00';
  }

  const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
  const info = getCurrencyInfo(currencyCode);
  const decimals = info?.decimals ?? 2;

  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(numAmount);

  return showSymbol ? `${getCurrencySymbol(currencyCode)} ${formatted}` : formatted;
}

export function formatExchangeRate(rate: number): string {
  return rate.toFixed(6);
}

export function calculateInverseRate(rate: number): number {
  return 1 / rate;
}

export function getGainLossColor(amount: number): string {
  if (amount > 0) return 'text-green-600';
  if (amount < 0) return 'text-red-600';
  return 'text-gray-600';
}

export function getGainLossLabel(amount: number): string {
  if (amount > 0) return 'Gain';
  if (amount < 0) return 'Loss';
  return 'No Change';
}

export function getGainLossIcon(amount: number): string {
  if (amount > 0) return '📈';
  if (amount < 0) return '📉';
  return '➡️';
}

export function isValidCurrencyCode(code: string): boolean {
  return SUPPORTED_CURRENCIES.some((c) => c.code === code);
}

export function getCurrencyOptions(): Array<{ value: string; label: string }> {
  return SUPPORTED_CURRENCIES.map((c) => ({
    value: c.code,
    label: `${c.code} - ${c.name}`,
  }));
}
