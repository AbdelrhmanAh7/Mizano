import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import type { AiFeature } from './use-ai-infrastructure';

// ============ Types ============

export interface TrainingLabDashboard {
  summary: {
    totalModels: number;
    activeModels: number;
    totalTrainingData: number;
    avgAccuracy: number;
    totalFeedback: number;
  };
  models: TrainingLabModelItem[];
}

export interface TrainingLabModelItem {
  feature: AiFeature;
  trainingDataCount: number;
  feedbackCount: number;
  hasActiveModel: boolean;
  activeVersion: number | null;
  accuracy: number | null;
  sampleCount: number | null;
  lastTrainedAt: string | null;
}

export interface TrainingStats {
  total: number;
  bySource: {
    USER: number;
    SEED: number;
    CORRECTION: number;
  };
  uniqueLabels: number;
  oldestRecord: string | null;
  newestRecord: string | null;
  labelDistribution: Record<string, number>;
}

export interface TrainingReadiness {
  isReady: boolean;
  currentSamples: number;
  minimumRequired: number;
  labelDistribution: Record<string, number>;
  warnings: string[];
}

export interface ModelStatus {
  isTraining: boolean;
  activeVersion: number | null;
  lastTrainedAt: string | null;
  accuracy: number | null;
  sampleCount: number | null;
}

export interface ModelHistoryEntry {
  version: number;
  accuracy: number;
  sampleCount: number;
  status: 'ACTIVE' | 'TRAINING' | 'RETIRED';
  trainedAt: string;
}

export interface FeedbackStats {
  total: number;
  accepted: number;
  rejected: number;
  corrected: number;
  acceptanceRate: number;
  correctionRate: number;
}

export interface FeedbackEntry {
  id: string;
  feature: AiFeature;
  predictionId?: string;
  aiSuggestion: Record<string, any>;
  userAction: 'ACCEPTED' | 'REJECTED' | 'CORRECTED';
  userAnswer?: string;
  inputData: Record<string, any>;
  createdAt: string;
}

export interface FeedbackTrendEntry {
  date: string;
  accepted: number;
  rejected: number;
  corrected: number;
}

// ============ API Functions ============

const trainingLabApi = {
  // Training Lab
  generateTrainingData: async (feature: AiFeature, count?: number) => {
    const response = await api.post(`/ai/training-lab/generate/${feature}`, { count });
    return response.data;
  },
  getDashboard: async () => {
    const response = await api.get('/ai/training-lab/dashboard');
    return response.data;
  },
  getTrainingStats: async (feature: AiFeature) => {
    const response = await api.get(`/ai/training-lab/training-stats/${feature}`);
    return response.data;
  },
  getTrainingReadiness: async (feature: AiFeature) => {
    const response = await api.get(`/ai/training-lab/readiness/${feature}`);
    return response.data;
  },
  trainAll: async () => {
    const response = await api.post('/ai/training-lab/train-all');
    return response.data;
  },

  // Model Status (existing endpoints)
  getModelStatus: async (feature: AiFeature) => {
    const response = await api.get(`/ai/feedback/models/${feature}/status`);
    return response.data;
  },
  getModelHistory: async (feature: AiFeature, limit?: number) => {
    const response = await api.get(`/ai/feedback/models/${feature}/history`, {
      params: { limit },
    });
    return response.data;
  },
  triggerRetraining: async (feature: AiFeature) => {
    const response = await api.post(`/ai/feedback/models/${feature}/retrain`);
    return response.data;
  },

  // Feedback details (existing endpoints)
  getRecentFeedback: async (feature: AiFeature, limit?: number) => {
    const response = await api.get(`/ai/feedback/recent/${feature}`, {
      params: { limit },
    });
    return response.data;
  },
  getFeedbackTrends: async (feature: AiFeature, days?: number) => {
    const response = await api.get(`/ai/feedback/trends/${feature}`, {
      params: { days },
    });
    return response.data;
  },

  // Direct model training
  trainModel: async (trainEndpoint: string) => {
    const response = await api.post(trainEndpoint);
    return response.data;
  },
};

// ============ Hooks - Training Lab ============

export function useTrainingLabDashboard() {
  return useQuery({
    queryKey: ['ai-training-lab', 'dashboard'],
    queryFn: async () => {
      const res = await trainingLabApi.getDashboard();
      return res.data as TrainingLabDashboard;
    },
    staleTime: 30000,
  });
}

export function useTrainingStats(feature?: AiFeature) {
  return useQuery({
    queryKey: ['ai-training-stats', feature],
    queryFn: async () => {
      const res = await trainingLabApi.getTrainingStats(feature!);
      return res.data as TrainingStats;
    },
    enabled: !!feature,
  });
}

export function useTrainingReadiness(feature?: AiFeature) {
  return useQuery({
    queryKey: ['ai-training-readiness', feature],
    queryFn: async () => {
      const res = await trainingLabApi.getTrainingReadiness(feature!);
      return res.data as TrainingReadiness;
    },
    enabled: !!feature,
  });
}

export function useGenerateTrainingData() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ feature, count }: { feature: AiFeature; count?: number }) =>
      trainingLabApi.generateTrainingData(feature, count),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-training-lab'] });
      queryClient.invalidateQueries({ queryKey: ['ai-training-stats'] });
      queryClient.invalidateQueries({ queryKey: ['ai-training-readiness'] });
    },
  });
}

export function useTrainAllModels() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => trainingLabApi.trainAll(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-training-lab'] });
      queryClient.invalidateQueries({ queryKey: ['ai-model-status'] });
    },
  });
}

export function useTrainModel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (trainEndpoint: string) =>
      trainingLabApi.trainModel(trainEndpoint),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-training-lab'] });
      queryClient.invalidateQueries({ queryKey: ['ai-model-status'] });
      queryClient.invalidateQueries({ queryKey: ['ai-model-history'] });
    },
  });
}

// ============ Hooks - Model Status ============

export function useModelStatus(feature?: AiFeature) {
  return useQuery({
    queryKey: ['ai-model-status', feature],
    queryFn: () => trainingLabApi.getModelStatus(feature!),
    enabled: !!feature,
  });
}

export function useModelHistory(feature?: AiFeature, limit?: number) {
  return useQuery({
    queryKey: ['ai-model-history', feature, limit],
    queryFn: () => trainingLabApi.getModelHistory(feature!, limit),
    enabled: !!feature,
  });
}

export function useTriggerRetraining() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (feature: AiFeature) =>
      trainingLabApi.triggerRetraining(feature),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-model-status'] });
      queryClient.invalidateQueries({ queryKey: ['ai-model-history'] });
      queryClient.invalidateQueries({ queryKey: ['ai-training-lab'] });
    },
  });
}

// ============ Hooks - Feedback Details ============

export function useRecentFeedback(feature?: AiFeature, limit?: number) {
  return useQuery({
    queryKey: ['ai-recent-feedback', feature, limit],
    queryFn: () => trainingLabApi.getRecentFeedback(feature!, limit),
    enabled: !!feature,
  });
}

export function useFeedbackTrends(feature?: AiFeature, days?: number) {
  return useQuery({
    queryKey: ['ai-feedback-trends', feature, days],
    queryFn: () => trainingLabApi.getFeedbackTrends(feature!, days),
    enabled: !!feature,
  });
}
