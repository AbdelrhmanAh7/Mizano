import { useQuery, useMutation } from '@tanstack/react-query';
import api from '@/lib/api';

// ============ Types ============

export interface NarrativeSection {
  id: string;
  title: string;
  content: string;
  metrics?: Array<{
    label: string;
    value: string;
    trend?: 'up' | 'down' | 'stable';
  }>;
}

export interface NarrativeAlert {
  type: 'warning' | 'info' | 'opportunity';
  message: string;
}

export interface GeneratedNarrative {
  title: string;
  period: string;
  generatedAt: string;
  sections: NarrativeSection[];
  alerts: NarrativeAlert[];
  recommendations: string[];
  summary?: string;
}

export interface QueryTemplate {
  id: string;
  question: string;
  category: string;
  parameters?: Array<{
    name: string;
    type: 'date-range' | 'number' | 'currency' | 'string';
    default?: unknown;
  }>;
}

export interface QueryResult {
  answer: string;
  data: unknown;
  chartType?: 'bar' | 'line' | 'pie' | 'table';
}

// ============ API Functions ============

const narrativeApi = {
  getMonthlyNarrative: async (month: number, year: number): Promise<GeneratedNarrative> => {
    const response = await api.get('/ai/narrative/monthly', {
      params: { month, year },
    });
    return response.data?.data ?? response.data;
  },
  getWeeklySnapshot: async (startDate?: string): Promise<GeneratedNarrative> => {
    const response = await api.get('/ai/narrative/weekly', {
      params: { startDate },
    });
    return response.data?.data ?? response.data;
  },
  getCustomerNarrative: async (customerId: string): Promise<GeneratedNarrative> => {
    const response = await api.get(`/ai/narrative/customer/${customerId}`);
    return response.data?.data ?? response.data;
  },
  getItemNarrative: async (itemId: string): Promise<GeneratedNarrative> => {
    const response = await api.get(`/ai/narrative/item/${itemId}`);
    return response.data?.data ?? response.data;
  },
  getCashFlowNarrative: async (): Promise<GeneratedNarrative> => {
    const response = await api.get('/ai/narrative/cash-flow');
    return response.data?.data ?? response.data;
  },
  getAvailableQueries: async (): Promise<QueryTemplate[]> => {
    const response = await api.get('/ai/narrative/queries');
    return response.data?.data ?? response.data;
  },
  executeQuery: async (queryId: string, params?: Record<string, unknown>): Promise<QueryResult> => {
    const response = await api.get(`/ai/narrative/query/${queryId}`, {
      params,
    });
    return response.data?.data ?? response.data;
  },
};

// ============ Hooks ============

export function useMonthlyNarrative(month?: number, year?: number) {
  const now = new Date();
  const targetMonth = month ?? now.getMonth() + 1;
  const targetYear = year ?? now.getFullYear();

  return useQuery({
    queryKey: ['ai-narrative-monthly', targetMonth, targetYear],
    queryFn: () => narrativeApi.getMonthlyNarrative(targetMonth, targetYear),
  });
}

export function useWeeklySnapshot(startDate?: string) {
  return useQuery({
    queryKey: ['ai-narrative-weekly', startDate],
    queryFn: () => narrativeApi.getWeeklySnapshot(startDate),
    staleTime: 5 * 60 * 1000,
  });
}

export function useCustomerNarrative(customerId: string) {
  return useQuery({
    queryKey: ['ai-narrative-customer', customerId],
    queryFn: () => narrativeApi.getCustomerNarrative(customerId),
    enabled: !!customerId,
  });
}

export function useItemNarrative(itemId: string) {
  return useQuery({
    queryKey: ['ai-narrative-item', itemId],
    queryFn: () => narrativeApi.getItemNarrative(itemId),
    enabled: !!itemId,
  });
}

export function useCashFlowNarrative() {
  return useQuery({
    queryKey: ['ai-narrative-cash-flow'],
    queryFn: () => narrativeApi.getCashFlowNarrative(),
  });
}

export function useAvailableQueries() {
  return useQuery({
    queryKey: ['ai-available-queries'],
    queryFn: () => narrativeApi.getAvailableQueries(),
  });
}

export function useExecuteQuery() {
  return useMutation({
    mutationFn: ({ queryId, params }: { queryId: string; params?: Record<string, unknown> }) =>
      narrativeApi.executeQuery(queryId, params),
  });
}

// ============ Helper Functions ============

export function getTrendIcon(trend: 'up' | 'down' | 'stable'): string {
  const icons = {
    up: '↑',
    down: '↓',
    stable: '→',
  };
  return icons[trend];
}

export function getTrendColor(trend: 'up' | 'down' | 'stable', isPositive: boolean = true): string {
  if (trend === 'stable') return 'text-gray-600';
  if (trend === 'up') return isPositive ? 'text-green-600' : 'text-red-600';
  return isPositive ? 'text-red-600' : 'text-green-600';
}

export function getAlertTypeIcon(type: 'warning' | 'info' | 'opportunity'): string {
  const icons = {
    warning: '⚠️',
    info: 'ℹ️',
    opportunity: '💡',
  };
  return icons[type];
}

export function getAlertTypeColor(type: 'warning' | 'info' | 'opportunity'): string {
  const colors = {
    warning: 'bg-red-50 border-red-200 text-red-800',
    info: 'bg-blue-50 border-blue-200 text-blue-800',
    opportunity: 'bg-green-50 border-green-200 text-green-800',
  };
  return colors[type];
}
