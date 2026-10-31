import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

// ============ Types ============

export type AiFeature =
  | 'CATEGORIZATION'
  | 'RECONCILIATION'
  | 'DEMAND_FORECAST'
  | 'LEAD_SCORING'
  | 'ANOMALY'
  | 'REORDER'
  | 'PAYMENT_PREDICTION'
  | 'CASH_FLOW'
  | 'PATTERN_DETECTION'
  | 'CHURN_PREDICTION'
  | 'CLV_ANALYSIS'
  | 'CROSS_SELL'
  | 'DYNAMIC_PRICING'
  | 'PIPELINE_FORECAST'
  | 'FRAUD_DETECTION'
  | 'COMPLIANCE_MONITORING'
  | 'AUDIT_RISK'
  | 'DOCUMENT_CLASSIFICATION'
  | 'SENTIMENT_ANALYSIS'
  | 'ENTITY_EXTRACTION'
  | 'CONTRACT_ANALYSIS'
  | 'EMPLOYEE_ATTRITION'
  | 'COMPENSATION_BENCHMARK'
  | 'SKILLS_GAP'
  | 'QUALITY_PREDICTION'
  | 'PREDICTIVE_MAINTENANCE'
  | 'WORKFORCE_SCHEDULING'
  | 'ROUTE_OPTIMIZATION'
  | 'RESOURCE_OPTIMIZATION'
  | 'CHATBOT'
  | 'KNOWLEDGE_ASSISTANT'
  | 'VOICE_COMMAND';

export type AiFeedbackAction = 'ACCEPTED' | 'REJECTED' | 'CORRECTED';

export type AnomalyType =
  | 'TRANSACTION'
  | 'OVERTIME'
  | 'SPENDING'
  | 'PAYROLL'
  | 'INVENTORY'
  | 'REVENUE';

export type AnomalySeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface SubmitFeedbackDto {
  feature: AiFeature;
  predictionId?: string;
  aiSuggestion: Record<string, unknown>;
  userAction: AiFeedbackAction;
  userAnswer?: string;
  inputData: Record<string, unknown>;
}

// ============ API Functions ============

const newAiApi = {
  // Feedback
  submitFeedback: async (dto: SubmitFeedbackDto) => {
    const response = await api.post('/ai/feedback', dto);
    return response.data;
  },
  getFeedbackStats: async (feature?: AiFeature) => {
    const response = await api.get('/ai/feedback/stats', { params: { feature } });
    return response.data;
  },

  // Anomalies
  getAnomalies: async (params?: {
    type?: AnomalyType;
    severity?: AnomalySeverity;
    isResolved?: boolean;
    page?: number;
    limit?: number;
  }) => {
    const response = await api.get('/ai/anomalies', { params });
    return response.data;
  },
  getAnomaly: async (id: string) => {
    const response = await api.get(`/ai/anomalies/${id}`);
    return response.data;
  },
  runAnomalyScan: async () => {
    const response = await api.post('/ai/anomalies/scan');
    return response.data;
  },
  resolveAnomaly: async (id: string) => {
    const response = await api.post(`/ai/anomalies/${id}/resolve`);
    return response.data;
  },

  // Reorder Points
  getReorderAlerts: async () => {
    const response = await api.get('/ai/reorder/alerts');
    return response.data;
  },
  getReorderSummary: async () => {
    const response = await api.get('/ai/reorder/summary');
    return response.data;
  },
  getDeadStock: async (thresholdDays?: number) => {
    const response = await api.get('/ai/reorder/dead-stock', {
      params: { thresholdDays },
    });
    return response.data;
  },
  getItemReorderAnalysis: async (itemId: string, leadTimeDays?: number, serviceLevel?: number) => {
    const response = await api.get(`/ai/reorder/item/${itemId}`, {
      params: { leadTimeDays, serviceLevel },
    });
    return response.data;
  },
  recalculateReorderPoints: async () => {
    const response = await api.post('/ai/reorder/recalculate');
    return response.data;
  },

  // Reconciliation Matcher
  getReconciliationMatches: async (transactionId: string, minConfidence?: number) => {
    const response = await api.get(`/ai/reconciliation/match/${transactionId}`, {
      params: { minConfidence },
    });
    return response.data;
  },
  confirmReconciliationMatch: async (
    transactionId: string,
    entityType: string,
    entityId: string,
  ) => {
    const response = await api.post(`/ai/reconciliation/confirm/${transactionId}`, {
      entityType,
      entityId,
    });
    return response.data;
  },
  getReconciliationPatterns: async (minMatchCount?: number) => {
    const response = await api.get('/ai/reconciliation/patterns', {
      params: { minMatchCount },
    });
    return response.data;
  },
  createBankRule: async (data: {
    name: string;
    bankAccountId?: string;
    conditions: Array<{ field: string; operator: string; value: string }>;
    action: { type: string; accountId?: string; vendorId?: string; customerId?: string };
  }) => {
    const response = await api.post('/ai/reconciliation/rules', data);
    return response.data;
  },
  getBankRules: async () => {
    const response = await api.get('/ai/reconciliation/rules');
    return response.data;
  },
  bulkAutoMatch: async (transactionIds: string[], minConfidence?: number) => {
    const response = await api.post(
      '/ai/reconciliation/bulk-match',
      {
        transactionIds,
      },
      { params: { minConfidence } },
    );
    return response.data;
  },
};

export function useReorderSummary() {
  return useQuery({
    queryKey: ['ai-reorder', 'summary'],
    queryFn: () => newAiApi.getReorderSummary(),
  });
}
