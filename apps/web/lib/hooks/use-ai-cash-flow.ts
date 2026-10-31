import { useQuery } from '@tanstack/react-query';
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
  getCashFlowPrediction: async (horizon?: number): Promise<CashFlowPredictionResult> => {
    const response = await api.get('/ai/cash-flow/forecast', {
      params: { horizon },
    });
    return response.data?.data ?? response.data;
  },
  getQuickCashForecast: async (): Promise<QuickCashForecast> => {
    const response = await api.get('/ai/cash-flow/quick');
    return response.data?.data ?? response.data;
  },
  getCashFlowScenarios: async (): Promise<CashFlowScenarios> => {
    const response = await api.get('/ai/cash-flow/scenarios');
    return response.data?.data ?? response.data;
  },
  getCashFlowAlerts: async (): Promise<CashFlowAlert[]> => {
    const response = await api.get('/ai/cash-flow/alerts');
    return response.data?.data ?? response.data;
  },
  whatIfAnalysis: async (scenario: WhatIfScenario): Promise<WhatIfResult> => {
    const response = await api.post('/ai/cash-flow/what-if', scenario);
    return response.data?.data ?? response.data;
  },
  recalculateCashFlow: async () => {
    const response = await api.post('/ai/cash-flow/recalculate');
    return response.data?.data ?? response.data;
  },
};

export function useQuickCashForecast() {
  return useQuery({
    queryKey: ['ai-cash-flow-quick'],
    queryFn: () => cashFlowApi.getQuickCashForecast(),
    staleTime: 5 * 60 * 1000,
  });
}
