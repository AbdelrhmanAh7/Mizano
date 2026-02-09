import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';

// ============ Types ============

export interface PipelineForecast {
  month: string;
  predictedRevenue: number;
  lowerBound: number;
  upperBound: number;
  confidence: number;
  expectedDeals: number;
}

export interface WeightedPipeline {
  stage: string;
  totalValue: number;
  weightedValue: number;
  dealCount: number;
  averageSize: number;
  winProbability: number;
}

export interface StageConversionRate {
  fromStage: string;
  toStage: string;
  conversionRate: number;
  averageDays: number;
  dealCount: number;
}

export interface DealTimeline {
  dealId: string;
  dealName: string;
  currentStage: string;
  predictedCloseDate: string;
  confidence: number;
  daysInStage: number;
  expectedValue: number;
  winProbability: number;
  recommendations: string[];
}

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

export function useWeightedPipeline() {
  return useQuery({
    queryKey: ['ai-pipeline-weighted'],
    queryFn: pipelineApi.getWeightedPipeline,
  });
}

export function useStageConversionRates() {
  return useQuery({
    queryKey: ['ai-pipeline-conversion-rates'],
    queryFn: pipelineApi.getConversionRates,
  });
}

export function useDealTimeline(dealId: string) {
  return useQuery({
    queryKey: ['ai-pipeline-deal-timeline', dealId],
    queryFn: () => pipelineApi.getDealTimeline(dealId),
    enabled: !!dealId,
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

export function formatProbability(probability: number): string {
  return `${Math.round(probability * 100)}%`;
}

export function getConfidenceColor(confidence: number): string {
  if (confidence >= 0.8) return 'text-green-600';
  if (confidence >= 0.6) return 'text-yellow-600';
  return 'text-red-600';
}
