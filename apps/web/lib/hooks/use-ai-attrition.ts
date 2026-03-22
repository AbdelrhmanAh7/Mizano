import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';

// ============ Types ============

export interface AttritionPrediction {
  employeeId: string;
  employeeName: string;
  department: string;
  attritionRisk: number; // 0-1
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  factors: string[];
  tenure: number; // months
  lastReviewScore?: number;
  salaryBand: string;
  recommendations: string[];
  confidence: number;
  predictionMethod?: 'ML' | 'RULE_BASED' | 'HYBRID';
}

export interface FlightRiskEmployee {
  id: string;
  name: string;
  department: string;
  attritionRisk: number;
  riskLevel: string;
  tenure: number;
  recommendations: string[];
}

export interface AttritionBatchResult {
  total: number;
  highRisk: number;
  mediumRisk: number;
  lowRisk: number;
  processed: number;
}

export interface AttritionTrainingResult {
  success: boolean;
  samplesUsed: number;
  accuracy?: number;
  message: string;
}

// ============ API Functions ============

const attritionApi = {
  predictAttrition: async (employeeId: string) => {
    const response = await api.get(`/ai/attrition/employee/${employeeId}`);
    return response.data;
  },
  getFlightRisk: async (limit?: number) => {
    const response = await api.get('/ai/attrition/flight-risk', {
      params: { limit },
    });
    return response.data;
  },
  predictAll: async () => {
    const response = await api.post('/ai/attrition/predict-all');
    return response.data;
  },
  trainModel: async () => {
    const response = await api.post('/ai/attrition/train');
    return response.data;
  },
};

// ============ Hooks ============

export function useAttritionPrediction(employeeId: string) {
  return useQuery({
    queryKey: ['ai-attrition', employeeId],
    queryFn: () => attritionApi.predictAttrition(employeeId),
    enabled: !!employeeId,
  });
}

export function useFlightRisk(limit?: number) {
  return useQuery({
    queryKey: ['ai-attrition-flight-risk', limit],
    queryFn: () => attritionApi.getFlightRisk(limit),
  });
}

export function usePredictAllAttrition() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: attritionApi.predictAll,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-attrition'] });
    },
  });
}

export function useTrainAttritionModel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: attritionApi.trainModel,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-attrition'] });
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

export function formatAttritionRisk(risk: number): string {
  return `${Math.round(risk * 100)}%`;
}

export function formatTenure(months: number): string {
  const years = Math.floor(months / 12);
  const remainingMonths = months % 12;
  if (years === 0) return `${remainingMonths} month${remainingMonths !== 1 ? 's' : ''}`;
  if (remainingMonths === 0) return `${years} year${years !== 1 ? 's' : ''}`;
  return `${years}y ${remainingMonths}m`;
}
