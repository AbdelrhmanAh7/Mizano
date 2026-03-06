import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';

// ============ Types ============

export type InsightType =
  | 'ANOMALY'
  | 'TREND'
  | 'RECOMMENDATION'
  | 'FORECAST'
  | 'ALERT'
  | 'OPPORTUNITY';

export type InsightPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type InsightStatus = 'NEW' | 'VIEWED' | 'DISMISSED' | 'ACTIONED';

export interface AIInsight {
  id: string;
  type: InsightType;
  priority: InsightPriority;
  status: InsightStatus;
  title: string;
  description: string;
  impact?: string;
  recommendation?: string;
  data?: unknown;
  module?: string;
  entityType?: string;
  entityId?: string;
  confidence: number;
  createdAt: string;
  expiresAt?: string;
}

export interface CashFlowForecast {
  date: string;
  predictedInflow: number;
  predictedOutflow: number;
  predictedBalance: number;
  lowerBound: number;
  upperBound: number;
}

export interface RevenueForcast {
  date: string;
  predictedRevenue: number;
  actualRevenue?: number;
  variance?: number;
}

export interface ReconciliationSuggestion {
  id: string;
  bankTransactionId: string;
  suggestedEntity: {
    type: 'invoice' | 'bill' | 'expense' | 'payment';
    id: string;
    description: string;
    amount: number;
    date: string;
  };
  confidence: number;
  matchReasons: string[];
}

export interface CategorySuggestion {
  id: string;
  expenseId?: string;
  transactionId?: string;
  suggestedCategory: {
    id: string;
    name: string;
  };
  confidence: number;
  reason: string;
}

// ============ API Functions ============

const aiApi = {
  // Insights
  getInsights: async (params?: { type?: string; status?: string; limit?: number }) => {
    const response = await api.get('/ai/insights', { params });
    return response.data;
  },
  getInsight: async (id: string) => {
    const response = await api.get(`/ai/insights/${id}`);
    return response.data;
  },
  dismissInsight: async (id: string) => {
    const response = await api.post(`/ai/insights/${id}/dismiss`);
    return response.data;
  },
  actionInsight: async (id: string, action: string) => {
    const response = await api.post(`/ai/insights/${id}/action`, { action });
    return response.data;
  },

  // Forecasting
  getCashFlowForecast: async (days: number = 30) => {
    const response = await api.get('/ai/forecast/cash-flow', { params: { days } });
    return response.data;
  },
  getRevenueForecast: async (months: number = 6) => {
    const response = await api.get('/ai/forecast/revenue', { params: { months } });
    return response.data;
  },

  // Reconciliation
  getReconciliationSuggestions: async (bankTransactionId: string) => {
    const response = await api.get(`/ai/reconciliation/${bankTransactionId}/suggestions`);
    return response.data;
  },
  applyReconciliationSuggestion: async (suggestionId: string) => {
    const response = await api.post(`/ai/reconciliation/apply/${suggestionId}`);
    return response.data;
  },

  // Categorization
  getCategorySuggestions: async (transactionId: string) => {
    const response = await api.get(`/ai/categorization/${transactionId}/suggestions`);
    return response.data;
  },
  applyCategorySuggestion: async (suggestionId: string) => {
    const response = await api.post(`/ai/categorization/apply/${suggestionId}`);
    return response.data;
  },

  // Analysis
  runAnomalyDetection: async () => {
    const response = await api.post('/ai/anomalies/scan');
    return response.data;
  },
  getSpendingAnalysis: async (period: string = 'month') => {
    const response = await api.get('/ai/analysis/spending', { params: { period } });
    return response.data;
  },
  getCustomerAnalysis: async () => {
    const response = await api.get('/ai/analysis/customers');
    return response.data;
  },
};

// ============ Hooks ============

export function useAIInsights(params?: { type?: string; status?: string; limit?: number }) {
  return useQuery({
    queryKey: ['ai-insights', params],
    queryFn: () => aiApi.getInsights(params),
  });
}

export function useAIInsight(id: string) {
  return useQuery({
    queryKey: ['ai-insights', id],
    queryFn: () => aiApi.getInsight(id),
    enabled: !!id,
  });
}

export function useDismissInsight() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: aiApi.dismissInsight,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-insights'] });
    },
  });
}

export function useActionInsight() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: string }) => aiApi.actionInsight(id, action),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-insights'] });
    },
  });
}

export function useCashFlowForecast(days: number = 30) {
  return useQuery({
    queryKey: ['ai-forecast', 'cash-flow', days],
    queryFn: () => aiApi.getCashFlowForecast(days),
  });
}

export function useRevenueForecast(months: number = 6) {
  return useQuery({
    queryKey: ['ai-forecast', 'revenue', months],
    queryFn: () => aiApi.getRevenueForecast(months),
  });
}

export function useReconciliationSuggestions(bankTransactionId: string) {
  return useQuery({
    queryKey: ['ai-reconciliation', bankTransactionId],
    queryFn: () => aiApi.getReconciliationSuggestions(bankTransactionId),
    enabled: !!bankTransactionId,
  });
}

export function useApplyReconciliationSuggestion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: aiApi.applyReconciliationSuggestion,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-reconciliation'] });
      queryClient.invalidateQueries({ queryKey: ['bank-transactions'] });
    },
  });
}

export function useCategorySuggestions(transactionId: string) {
  return useQuery({
    queryKey: ['ai-categorization', transactionId],
    queryFn: () => aiApi.getCategorySuggestions(transactionId),
    enabled: !!transactionId,
  });
}

export function useApplyCategorySuggestion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: aiApi.applyCategorySuggestion,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-categorization'] });
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
    },
  });
}

export function useRunAnomalyDetection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: aiApi.runAnomalyDetection,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-insights'] });
    },
  });
}

export function useSpendingAnalysis(period: string = 'month') {
  return useQuery({
    queryKey: ['ai-analysis', 'spending', period],
    queryFn: () => aiApi.getSpendingAnalysis(period),
  });
}

export function useCustomerAnalysis() {
  return useQuery({
    queryKey: ['ai-analysis', 'customers'],
    queryFn: () => aiApi.getCustomerAnalysis(),
  });
}

// ============ Helper Functions ============

export function getInsightTypeLabel(type: InsightType): string {
  const labels: Record<InsightType, string> = {
    ANOMALY: 'Anomaly',
    TREND: 'Trend',
    RECOMMENDATION: 'Recommendation',
    FORECAST: 'Forecast',
    ALERT: 'Alert',
    OPPORTUNITY: 'Opportunity',
  };
  return labels[type] || type;
}

export function getInsightTypeIcon(type: InsightType): string {
  const icons: Record<InsightType, string> = {
    ANOMALY: '⚠️',
    TREND: '📈',
    RECOMMENDATION: '💡',
    FORECAST: '🔮',
    ALERT: '🔔',
    OPPORTUNITY: '🎯',
  };
  return icons[type] || '📊';
}

export function getInsightTypeColor(type: InsightType): string {
  const colors: Record<InsightType, string> = {
    ANOMALY: 'bg-red-100 text-red-800 border-red-200',
    TREND: 'bg-blue-100 text-blue-800 border-blue-200',
    RECOMMENDATION: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    FORECAST: 'bg-purple-100 text-purple-800 border-purple-200',
    ALERT: 'bg-orange-100 text-orange-800 border-orange-200',
    OPPORTUNITY: 'bg-green-100 text-green-800 border-green-200',
  };
  return colors[type] || '';
}

export function getInsightPriorityLabel(priority: InsightPriority): string {
  const labels: Record<InsightPriority, string> = {
    LOW: 'Low',
    MEDIUM: 'Medium',
    HIGH: 'High',
    CRITICAL: 'Critical',
  };
  return labels[priority] || priority;
}

export function getInsightPriorityColor(priority: InsightPriority): string {
  const colors: Record<InsightPriority, string> = {
    LOW: 'bg-gray-100 text-gray-800',
    MEDIUM: 'bg-blue-100 text-blue-800',
    HIGH: 'bg-orange-100 text-orange-800',
    CRITICAL: 'bg-red-100 text-red-800',
  };
  return colors[priority] || '';
}

export function formatConfidence(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}

export function formatCurrency(amount: number | string | undefined): string {
  if (amount === undefined || amount === null) return '$0.00';
  const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(numAmount);
}
