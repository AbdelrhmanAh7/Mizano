import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

// ============ API Functions ============

const pipelineApi = {
  getForecast: async (months?: number) => {
    const response = await api.get('/ai/pipeline/forecast', {
      params: { months },
    });
    return response.data;
  },
  getWeightedPipeline: async () => {
    const response = await api.get('/ai/pipeline/weighted');
    return response.data;
  },
  getConversionRates: async () => {
    const response = await api.get('/ai/pipeline/conversion-rates');
    return response.data;
  },
  getDealTimeline: async (dealId: string) => {
    const response = await api.get(`/ai/pipeline/deal/${dealId}/timeline`);
    return response.data;
  },
};

// ============ Hooks ============

export function usePipelineForecast(months?: number) {
  return useQuery({
    queryKey: ['ai-pipeline-forecast', months],
    queryFn: () => pipelineApi.getForecast(months),
  });
}

export function useStageConversionRates() {
  return useQuery({
    queryKey: ['ai-pipeline-conversion-rates'],
    queryFn: pipelineApi.getConversionRates,
  });
}

// ============ Helper Functions ============

export function formatRevenue(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}
