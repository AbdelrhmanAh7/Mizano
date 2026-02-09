import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';

// ============ Types ============

export interface PaymentPrediction {
  invoiceId: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  amount: number;
  dueDate: string;
  predictedDate: string;
  daysFromNow: number;
  confidence: 'high' | 'medium' | 'low';
  method: 'statistical' | 'payment_terms';
  factors: {
    historical: number;
    amount: number;
    dayOfWeek: number;
    monthEnd: number;
  };
}

export interface CustomerPaymentProfile {
  customerId: string;
  customerName: string;
  avgDaysToPayment: number;
  stdDeviation: number;
  onTimeRate: number;
  trend: 'improving' | 'stable' | 'worsening';
  invoiceCount: number;
  paymentHistory: Array<{
    invoiceId: string;
    invoiceNumber: string;
    dueDate: string;
    paidDate: string;
    daysAfterDue: number;
  }>;
}

export interface CollectionPriorityItem {
  invoiceId: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  amount: number;
  dueDate: string;
  predictedPaymentDate: string;
  daysOverdue: number;
  priorityScore: number;
  riskLevel: 'low' | 'medium' | 'high';
  recommendedAction: string;
}

// ============ API Functions ============

const paymentPredictionApi = {
  getPaymentPrediction: async (invoiceId: string) => {
    const response = await api.get(`/ai/payment-prediction/invoice/${invoiceId}`);
    return response.data;
  },
  getOutstandingPredictions: async () => {
    const response = await api.get('/ai/payment-prediction/outstanding');
    return response.data;
  },
  getCustomerPaymentProfile: async (customerId: string) => {
    const response = await api.get(`/ai/payment-prediction/customer/${customerId}/profile`);
    return response.data;
  },
  getCustomerPaymentHistory: async (customerId: string) => {
    const response = await api.get(`/ai/payment-prediction/customer/${customerId}/history`);
    return response.data;
  },
  getCollectionPriority: async () => {
    const response = await api.get('/ai/payment-prediction/collection-priority');
    return response.data;
  },
  rebuildPaymentProfiles: async () => {
    const response = await api.post('/ai/payment-prediction/rebuild-profiles');
    return response.data;
  },
};

// ============ Hooks ============

export function usePaymentPrediction(invoiceId: string) {
  return useQuery({
    queryKey: ['ai-payment-prediction', invoiceId],
    queryFn: () => paymentPredictionApi.getPaymentPrediction(invoiceId),
    enabled: !!invoiceId,
  });
}

export function useOutstandingPredictions() {
  return useQuery({
    queryKey: ['ai-payment-predictions-outstanding'],
    queryFn: () => paymentPredictionApi.getOutstandingPredictions(),
  });
}

export function useCustomerPaymentProfile(customerId: string) {
  return useQuery({
    queryKey: ['ai-customer-payment-profile', customerId],
    queryFn: () => paymentPredictionApi.getCustomerPaymentProfile(customerId),
    enabled: !!customerId,
  });
}

export function useCustomerPaymentHistory(customerId: string) {
  return useQuery({
    queryKey: ['ai-customer-payment-history', customerId],
    queryFn: () => paymentPredictionApi.getCustomerPaymentHistory(customerId),
    enabled: !!customerId,
  });
}

export function useCollectionPriority() {
  return useQuery({
    queryKey: ['ai-collection-priority'],
    queryFn: () => paymentPredictionApi.getCollectionPriority(),
  });
}

export function useRebuildPaymentProfiles() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: paymentPredictionApi.rebuildPaymentProfiles,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-payment-prediction'] });
      queryClient.invalidateQueries({ queryKey: ['ai-payment-predictions-outstanding'] });
      queryClient.invalidateQueries({ queryKey: ['ai-customer-payment-profile'] });
      queryClient.invalidateQueries({ queryKey: ['ai-collection-priority'] });
    },
  });
}

// ============ Helper Functions ============

export function getPaymentConfidenceLabel(confidence: 'high' | 'medium' | 'low'): string {
  const labels = {
    high: 'High Confidence',
    medium: 'Medium Confidence',
    low: 'Low Confidence',
  };
  return labels[confidence];
}

export function getPaymentConfidenceColor(confidence: 'high' | 'medium' | 'low'): string {
  const colors = {
    high: 'bg-green-100 text-green-800 border-green-200',
    medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    low: 'bg-red-100 text-red-800 border-red-200',
  };
  return colors[confidence];
}

export function getRiskLevelColor(riskLevel: 'low' | 'medium' | 'high'): string {
  const colors = {
    low: 'bg-green-100 text-green-800',
    medium: 'bg-yellow-100 text-yellow-800',
    high: 'bg-red-100 text-red-800',
  };
  return colors[riskLevel];
}
