import { useQuery } from '@tanstack/react-query';
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

export function useWeeklySnapshot(startDate?: string) {
  return useQuery({
    queryKey: ['ai-narrative-weekly', startDate],
    queryFn: () => narrativeApi.getWeeklySnapshot(startDate),
    staleTime: 5 * 60 * 1000,
  });
}
