import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';

// ============ Types ============

export interface CategorizationInput {
  description: string;
  vendorName?: string;
  amount: number;
  direction: 'expense' | 'income';
}

export interface CategorizationPrediction {
  accountId: string | null;
  accountCode: string;
  accountName: string;
  confidence: number;
  predictionId: string;
  alternatives: Array<{
    accountId: string;
    accountCode: string;
    accountName: string;
    confidence: number;
  }>;
  predictionMethod: 'ML' | 'RULE_BASED' | 'HYBRID';
}

export interface CategorizationStats {
  sampleCount: number;
  accuracy: number;
  modelVersion: number;
  lastTrainedAt: string | null;
  status: 'ACTIVE' | 'TRAINING' | 'NOT_TRAINED';
}

// ============ API Functions ============

const categorizationApi = {
  predictCategorization: async (input: CategorizationInput) => {
    const response = await api.post('/ai/categorization/predict', input);
    return response.data;
  },
  learnCategorization: async (data: {
    description: string;
    vendorName?: string;
    amount: number;
    direction: 'expense' | 'income';
    selectedAccountId: string;
    wasAiSuggested: boolean;
    aiSuggestedAccountId?: string;
  }) => {
    const response = await api.post('/ai/categorization/learn', data);
    return response.data;
  },
  trainCategorization: async () => {
    const response = await api.post('/ai/categorization/train');
    return response.data;
  },
  getCategorizationStats: async () => {
    const response = await api.get('/ai/categorization/stats');
    return response.data;
  },
  seedCategorization: async () => {
    const response = await api.post('/ai/categorization/seed');
    return response.data;
  },
  crossValidateCategorization: async () => {
    const response = await api.post('/ai/categorization/cross-validate');
    return response.data;
  },
};

// ============ Hooks ============

export function useCategorySuggestion(
  input: CategorizationInput | null,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: ['ai-categorization-predict', input],
    queryFn: () => (input ? categorizationApi.predictCategorization(input) : null),
    enabled: options?.enabled !== false && !!input && !!input.description,
    staleTime: 30000,
  });
}

export function useLearnCategorization() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: categorizationApi.learnCategorization,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-categorization-stats'] });
    },
  });
}

export function useTrainCategorization() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: categorizationApi.trainCategorization,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-categorization-stats'] });
      queryClient.invalidateQueries({ queryKey: ['ai-categorization-predict'] });
    },
  });
}

export function useCategorizationStats() {
  return useQuery({
    queryKey: ['ai-categorization-stats'],
    queryFn: () => categorizationApi.getCategorizationStats(),
  });
}

export function useSeedCategorization() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: categorizationApi.seedCategorization,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-categorization-stats'] });
    },
  });
}

export function useCrossValidateCategorization() {
  return useMutation({
    mutationFn: categorizationApi.crossValidateCategorization,
  });
}
