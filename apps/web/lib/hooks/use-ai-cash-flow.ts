import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';

// ============ Types ============

export interface CashFlowPredictionResult {
  forecasts: Array<{
    date: string;
    openingBalance: number;
    inflows: { ar: number; other: number };
    outflows: { ap: number; payroll: number; recurring: number };
    closingBalance: { p10: number; p50: number; p90: number };
    alerts: string[];
  }>;
  summary: {
    currentCash: number;
    lowestPoint: { date: string; amount: number };
    daysUntilNegative: number | null;
    totalExpectedInflows: number;
    totalExpectedOutflows: number;
  };
  confidence: 'high' | 'medium' | 'low';
  predictionMethod?: 'ML' | 'RULE_BASED' | 'HYBRID';
}

export interface QuickCashForecast {
  next7Days: { low: number; expected: number; high: number };
  next30Days: { low: number; expected: number; high: number };
  next90Days: { low: number; expected: number; high: number };
  criticalDates: Array<{
    date: string;
    reason: string;
    impact: number;
  }>;
}

export interface CashFlowScenarios {
  optimistic: CashFlowPredictionResult;
  expected: CashFlowPredictionResult;
  pessimistic: CashFlowPredictionResult;
}

export interface CashFlowAlert {
  type: 'warning' | 'critical';
  date: string;
  message: string;
  suggestedAction: string;
}

export interface WhatIfScenario {
  type: 'delay_customer' | 'early_payment' | 'new_expense' | 'revenue_change';
  params: {
    customerId?: string;
    delayDays?: number;
    billId?: string;
    expenseAmount?: number;
    expenseDate?: string;
    revenueChange?: number;
  };
}

export interface WhatIfResult {
  baseline: CashFlowPredictionResult;
  adjusted: CashFlowPredictionResult;
  impact: {
    totalChange: number;
    daysUntilNegativeChange: number;
  };
}

// ============ API Functions ============

const cashFlowApi = {
  getCashFlowPrediction: async (horizon?: number) => {
    const response = await api.get('/ai/cash-flow/forecast', {
      params: { horizon },
    });
    return response.data;
  },
  getQuickCashForecast: async () => {
    const response = await api.get('/ai/cash-flow/quick');
    return response.data;
  },
  getCashFlowScenarios: async () => {
    const response = await api.get('/ai/cash-flow/scenarios');
    return response.data;
  },
  getCashFlowAlerts: async () => {
    const response = await api.get('/ai/cash-flow/alerts');
    return response.data;
  },
  whatIfAnalysis: async (scenario: WhatIfScenario) => {
    const response = await api.post('/ai/cash-flow/what-if', scenario);
    return response.data;
  },
  recalculateCashFlow: async () => {
    const response = await api.post('/ai/cash-flow/recalculate');
    return response.data;
  },
};

// ============ Hooks ============

export function useCashFlowPrediction(horizon?: number) {
  return useQuery({
    queryKey: ['ai-cash-flow-forecast', horizon],
    queryFn: () => cashFlowApi.getCashFlowPrediction(horizon),
  });
}

export function useQuickCashForecast() {
  return useQuery({
    queryKey: ['ai-cash-flow-quick'],
    queryFn: () => cashFlowApi.getQuickCashForecast(),
    staleTime: 5 * 60 * 1000,
  });
}

export function useCashFlowScenarios() {
  return useQuery({
    queryKey: ['ai-cash-flow-scenarios'],
    queryFn: () => cashFlowApi.getCashFlowScenarios(),
  });
}

export function useCashFlowAlerts() {
  return useQuery({
    queryKey: ['ai-cash-flow-alerts'],
    queryFn: () => cashFlowApi.getCashFlowAlerts(),
  });
}

export function useWhatIfAnalysis() {
  return useMutation({
    mutationFn: (scenario: WhatIfScenario) => cashFlowApi.whatIfAnalysis(scenario),
  });
}

export function useRecalculateCashFlow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: cashFlowApi.recalculateCashFlow,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-cash-flow-forecast'] });
      queryClient.invalidateQueries({ queryKey: ['ai-cash-flow-quick'] });
      queryClient.invalidateQueries({ queryKey: ['ai-cash-flow-scenarios'] });
      queryClient.invalidateQueries({ queryKey: ['ai-cash-flow-alerts'] });
    },
  });
}

// ============ Helper Functions ============

export function getCashFlowAlertColor(type: 'warning' | 'critical'): string {
  const colors = {
    warning: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    critical: 'bg-red-50 border-red-200 text-red-800',
  };
  return colors[type];
}

export function getMonthName(monthNumber: number): string {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  return months[monthNumber - 1] || '';
}

export function formatPercentage(value: number, decimals: number = 1): string {
  return `${(value * 100).toFixed(decimals)}%`;
}
