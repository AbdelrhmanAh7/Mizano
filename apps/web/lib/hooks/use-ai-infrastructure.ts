import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';

// ============ Types ============

export type AiFeature =
  | 'CATEGORIZATION'
  | 'RECONCILIATION'
  | 'OCR_LAYOUT'
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

export type ReorderStatus = 'OK' | 'LOW_STOCK' | 'CRITICAL' | 'DEAD_STOCK';

export interface SubmitFeedbackDto {
  feature: AiFeature;
  predictionId?: string;
  aiSuggestion: Record<string, any>;
  userAction: AiFeedbackAction;
  userAnswer?: string;
  inputData: Record<string, any>;
}

export interface AiAnomaly {
  id: string;
  type: AnomalyType;
  severity: AnomalySeverity;
  entityType: string;
  entityId: string;
  value: number;
  expectedValue: number;
  zScore: number;
  description: string;
  isResolved: boolean;
  resolvedAt?: string;
  resolvedBy?: string;
  createdAt: string;
}

export interface ItemReorderAnalysis {
  id: string;
  itemId: string;
  item?: {
    id: string;
    name: string;
    sku?: string;
    currentStock: number;
  };
  avgDailyDemand: number;
  demandStdDev: number;
  leadTimeDays: number;
  safetyStock: number;
  reorderPoint: number;
  economicOrderQty: number;
  status: ReorderStatus;
  lastSaleDate?: string;
  daysSinceLastSale?: number;
  calculatedAt: string;
}

export interface ReconciliationMatch {
  entityType: 'invoice' | 'bill' | 'expense' | 'payment';
  entityId: string;
  entity: any;
  totalScore: number;
  breakdown: {
    amountScore: number;
    referenceScore: number;
    nameScore: number;
    dateScore: number;
  };
  confidence: 'high' | 'medium' | 'low';
  matchReasons: string[];
}

export interface OcrExtractResult {
  date: string | null;
  total: number | null;
  subtotal: number | null;
  tax: number | null;
  invoiceNumber: string | null;
  vendorName: string | null;
  lineItems: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }>;
  ocrConfidence: number;
  rawText: string;
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

  // OCR
  extractFromImage: async (formData: FormData) => {
    const response = await api.post('/ai/ocr/extract', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },
  extractFromBase64: async (imageData: string, vendorId?: string, language?: string) => {
    const response = await api.post('/ai/ocr/extract-base64', {
      imageData,
      vendorId,
      language,
    });
    return response.data;
  },
  learnOcrLayout: async (data: {
    vendorId: string;
    date?: string;
    total?: number;
    subtotal?: number;
    tax?: number;
    invoiceNumber?: string;
    vendorName?: string;
  }) => {
    const response = await api.post('/ai/ocr/learn', data);
    return response.data;
  },
  checkDuplicate: async (data: { vendorId?: string; invoiceNumber?: string; amount?: number }) => {
    const response = await api.post('/ai/ocr/check-duplicate', data);
    return response.data;
  },
};

// ============ Hooks - Feedback ============

export function useSubmitAiFeedback() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: newAiApi.submitFeedback,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-feedback-stats'] });
    },
  });
}

export function useAiFeedbackStats(feature?: AiFeature) {
  return useQuery({
    queryKey: ['ai-feedback-stats', feature],
    queryFn: () => newAiApi.getFeedbackStats(feature),
  });
}

// ============ Hooks - Anomalies ============

export function useAnomalies(params?: {
  type?: AnomalyType;
  severity?: AnomalySeverity;
  isResolved?: boolean;
  page?: number;
  limit?: number;
}) {
  return useQuery({
    queryKey: ['ai-anomalies', params],
    queryFn: () => newAiApi.getAnomalies(params),
  });
}

export function useAnomaly(id: string) {
  return useQuery({
    queryKey: ['ai-anomalies', id],
    queryFn: () => newAiApi.getAnomaly(id),
    enabled: !!id,
  });
}

export function useRunAnomalyScan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: newAiApi.runAnomalyScan,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-anomalies'] });
      queryClient.invalidateQueries({ queryKey: ['ai-insights'] });
    },
  });
}

export function useResolveAnomaly() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: newAiApi.resolveAnomaly,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-anomalies'] });
    },
  });
}

// ============ Hooks - Reorder Points ============

export function useReorderAlerts() {
  return useQuery({
    queryKey: ['ai-reorder', 'alerts'],
    queryFn: () => newAiApi.getReorderAlerts(),
  });
}

export function useReorderSummary() {
  return useQuery({
    queryKey: ['ai-reorder', 'summary'],
    queryFn: () => newAiApi.getReorderSummary(),
  });
}

export function useDeadStock(thresholdDays?: number) {
  return useQuery({
    queryKey: ['ai-reorder', 'dead-stock', thresholdDays],
    queryFn: () => newAiApi.getDeadStock(thresholdDays),
  });
}

export function useItemReorderAnalysis(
  itemId: string,
  leadTimeDays?: number,
  serviceLevel?: number,
) {
  return useQuery({
    queryKey: ['ai-reorder', 'item', itemId, leadTimeDays, serviceLevel],
    queryFn: () => newAiApi.getItemReorderAnalysis(itemId, leadTimeDays, serviceLevel),
    enabled: !!itemId,
  });
}

export function useRecalculateReorderPoints() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: newAiApi.recalculateReorderPoints,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-reorder'] });
    },
  });
}

// ============ Hooks - Reconciliation Matcher ============

export function useReconciliationMatches(transactionId: string, minConfidence?: number) {
  return useQuery({
    queryKey: ['ai-reconciliation-matches', transactionId, minConfidence],
    queryFn: () => newAiApi.getReconciliationMatches(transactionId, minConfidence),
    enabled: !!transactionId,
  });
}

export function useConfirmReconciliationMatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      transactionId,
      entityType,
      entityId,
    }: {
      transactionId: string;
      entityType: string;
      entityId: string;
    }) => newAiApi.confirmReconciliationMatch(transactionId, entityType, entityId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-reconciliation-matches'] });
      queryClient.invalidateQueries({ queryKey: ['bank-transactions'] });
    },
  });
}

export function useReconciliationPatterns(minMatchCount?: number) {
  return useQuery({
    queryKey: ['ai-reconciliation-patterns', minMatchCount],
    queryFn: () => newAiApi.getReconciliationPatterns(minMatchCount),
  });
}

export function useCreateBankRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: newAiApi.createBankRule,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bank-rules'] });
    },
  });
}

export function useBankRules() {
  return useQuery({
    queryKey: ['bank-rules'],
    queryFn: () => newAiApi.getBankRules(),
  });
}

export function useBulkAutoMatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      transactionIds,
      minConfidence,
    }: {
      transactionIds: string[];
      minConfidence?: number;
    }) => newAiApi.bulkAutoMatch(transactionIds, minConfidence),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-reconciliation-matches'] });
      queryClient.invalidateQueries({ queryKey: ['bank-transactions'] });
    },
  });
}

// ============ Hooks - OCR ============

export function useOcrExtract() {
  return useMutation({
    mutationFn: newAiApi.extractFromImage,
  });
}

export function useOcrExtractBase64() {
  return useMutation({
    mutationFn: ({
      imageData,
      vendorId,
      language,
    }: {
      imageData: string;
      vendorId?: string;
      language?: string;
    }) => newAiApi.extractFromBase64(imageData, vendorId, language),
  });
}

export function useOcrLearn() {
  return useMutation({
    mutationFn: newAiApi.learnOcrLayout,
  });
}

export function useOcrCheckDuplicate() {
  return useMutation({
    mutationFn: newAiApi.checkDuplicate,
  });
}

// ============ Helper Functions ============

export function getAnomalySeverityColor(severity: AnomalySeverity): string {
  const colors: Record<AnomalySeverity, string> = {
    LOW: 'bg-blue-100 text-blue-800 border-blue-200',
    MEDIUM: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    HIGH: 'bg-orange-100 text-orange-800 border-orange-200',
    CRITICAL: 'bg-red-100 text-red-800 border-red-200',
  };
  return colors[severity] || '';
}

export function getReorderStatusColor(status: ReorderStatus): string {
  const colors: Record<ReorderStatus, string> = {
    OK: 'bg-green-100 text-green-800 border-green-200',
    LOW_STOCK: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    CRITICAL: 'bg-red-100 text-red-800 border-red-200',
    DEAD_STOCK: 'bg-gray-100 text-gray-800 border-gray-200',
  };
  return colors[status] || '';
}

export function getConfidenceLevel(confidence: number): 'high' | 'medium' | 'low' {
  if (confidence >= 0.85) return 'high';
  if (confidence >= 0.6) return 'medium';
  return 'low';
}

export function getConfidenceColor(confidence: number): string {
  if (confidence >= 0.85) return 'bg-green-100 text-green-800';
  if (confidence >= 0.6) return 'bg-yellow-100 text-yellow-800';
  return 'bg-red-100 text-red-800';
}
