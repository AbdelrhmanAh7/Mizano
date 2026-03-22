import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';

// ============ Types ============

export interface ChurnPrediction {
  customerId: string;
  customerName: string;
  churnRisk: number; // 0-1
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  factors: string[];
  lastPurchaseDate?: string;
  totalRevenue: number;
  averageOrderValue: number;
  purchaseFrequency: number;
  daysSinceLastPurchase?: number;
  recommendations: string[];
  predictionMethod?: 'ML' | 'RULE_BASED' | 'HYBRID';
}

export interface HighRiskCustomer {
  id: string;
  name: string;
  churnRisk: number;
  riskLevel: string;
  lastPurchaseDate?: string;
  totalRevenue: number;
  recommendations: string[];
}

export interface ChurnBatchResult {
  total: number;
  highRisk: number;
  mediumRisk: number;
  lowRisk: number;
  processed: number;
}

export interface ChurnTrainingResult {
  success: boolean;
  samplesUsed: number;
  accuracy?: number;
  message: string;
}

// ============ API Functions ============

const churnApi = {
  predictChurn: async (customerId: string) => {
    const response = await api.get(`/ai/churn/customer/${customerId}`);
    return response.data;
  },
  getHighRiskCustomers: async (limit?: number) => {
    const response = await api.get('/ai/churn/high-risk', {
      params: { limit },
    });
    return response.data;
  },
  predictAll: async () => {
    const response = await api.post('/ai/churn/predict-all');
    return response.data;
  },
  trainModel: async () => {
    const response = await api.post('/ai/churn/train');
    return response.data;
  },
};

// ============ Hooks ============

export function useChurnPrediction(customerId: string) {
  return useQuery({
    queryKey: ['ai-churn', customerId],
    queryFn: () => churnApi.predictChurn(customerId),
    enabled: !!customerId,
  });
}

export function useHighRiskCustomers(limit?: number) {
  return useQuery({
    queryKey: ['ai-churn-high-risk', limit],
    queryFn: () => churnApi.getHighRiskCustomers(limit),
  });
}

export function usePredictAllChurn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: churnApi.predictAll,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-churn'] });
      queryClient.invalidateQueries({ queryKey: ['ai-churn-high-risk'] });
    },
  });
}

export function useTrainChurnModel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: churnApi.trainModel,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-churn'] });
    },
  });
}

// ============ Helper Functions ============

export function getRiskLevelColor(riskLevel: string): string {
  const colors: Record<string, string> = {
    LOW: 'bg-green-100 text-green-800 border-green-200',
    MEDIUM: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    HIGH: 'bg-orange-100 text-orange-800 border-orange-200',
    CRITICAL: 'bg-red-100 text-red-800 border-red-200',
  };
  return colors[riskLevel] || colors.MEDIUM;
}

export function getRiskLevelLabel(riskLevel: string): string {
  const labels: Record<string, string> = {
    LOW: 'Low Risk',
    MEDIUM: 'Medium Risk',
    HIGH: 'High Risk',
    CRITICAL: 'Critical Risk',
  };
  return labels[riskLevel] || riskLevel;
}

export function formatChurnRisk(risk: number): string {
  return `${Math.round(risk * 100)}%`;
}
