import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';

// ============ Types ============

export type InsightType =
  | 'ANOMALY'
  | 'TREND'
  | 'RECOMMENDATION'
  | 'FORECAST'
  | 'ALERT'
  | 'OPPORTUNITY';

export type InsightPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type InsightStatus = 'NEW' | 'VIEWED' | 'DISMISSED' | 'ACTIONED';

export interface AIInsight {
  id: string;
  type: InsightType;
  priority: InsightPriority;
  status: InsightStatus;
  title: string;
  description: string;
  impact?: string;
  recommendation?: string;
  data?: any;
  module?: string;
  entityType?: string;
  entityId?: string;
  confidence: number;
  createdAt: string;
  expiresAt?: string;
}

export interface CashFlowForecast {
  date: string;
  predictedInflow: number;
  predictedOutflow: number;
  predictedBalance: number;
  lowerBound: number;
  upperBound: number;
}

export interface RevenueForcast {
  date: string;
  predictedRevenue: number;
  actualRevenue?: number;
  variance?: number;
}

export interface ReconciliationSuggestion {
  id: string;
  bankTransactionId: string;
  suggestedEntity: {
    type: 'invoice' | 'bill' | 'expense' | 'payment';
    id: string;
    description: string;
    amount: number;
    date: string;
  };
  confidence: number;
  matchReasons: string[];
}

export interface CategorySuggestion {
  id: string;
  expenseId?: string;
  transactionId?: string;
  suggestedCategory: {
    id: string;
    name: string;
  };
  confidence: number;
  reason: string;
}

// ============ API Functions ============

const aiApi = {
  // Insights
  getInsights: async (params?: { type?: string; status?: string; limit?: number }) => {
    const response = await api.get('/ai/insights', { params });
    return response.data;
  },
  getInsight: async (id: string) => {
    const response = await api.get(`/ai/insights/${id}`);
    return response.data;
  },
  dismissInsight: async (id: string) => {
    const response = await api.post(`/ai/insights/${id}/dismiss`);
    return response.data;
  },
  actionInsight: async (id: string, action: string) => {
    const response = await api.post(`/ai/insights/${id}/action`, { action });
    return response.data;
  },

  // Forecasting
  getCashFlowForecast: async (days: number = 30) => {
    const response = await api.get('/ai/forecast/cash-flow', { params: { days } });
    return response.data;
  },
  getRevenueForecast: async (months: number = 6) => {
    const response = await api.get('/ai/forecast/revenue', { params: { months } });
    return response.data;
  },

  // Reconciliation
  getReconciliationSuggestions: async (bankTransactionId: string) => {
    const response = await api.get(`/ai/reconciliation/${bankTransactionId}/suggestions`);
    return response.data;
  },
  applyReconciliationSuggestion: async (suggestionId: string) => {
    const response = await api.post(`/ai/reconciliation/apply/${suggestionId}`);
    return response.data;
  },

  // Categorization
  getCategorySuggestions: async (transactionId: string) => {
    const response = await api.get(`/ai/categorization/${transactionId}/suggestions`);
    return response.data;
  },
  applyCategorySuggestion: async (suggestionId: string) => {
    const response = await api.post(`/ai/categorization/apply/${suggestionId}`);
    return response.data;
  },

  // Analysis
  runAnomalyDetection: async () => {
    const response = await api.post('/ai/analysis/anomalies');
    return response.data;
  },
  getSpendingAnalysis: async (period: string = 'month') => {
    const response = await api.get('/ai/analysis/spending', { params: { period } });
    return response.data;
  },
  getCustomerAnalysis: async () => {
    const response = await api.get('/ai/analysis/customers');
    return response.data;
  },
};

// ============ Hooks - Insights ============

export function useAIInsights(params?: { type?: string; status?: string; limit?: number }) {
  return useQuery({
    queryKey: ['ai-insights', params],
    queryFn: () => aiApi.getInsights(params),
  });
}

export function useAIInsight(id: string) {
  return useQuery({
    queryKey: ['ai-insights', id],
    queryFn: () => aiApi.getInsight(id),
    enabled: !!id,
  });
}

export function useDismissInsight() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: aiApi.dismissInsight,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-insights'] });
    },
  });
}

export function useActionInsight() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: string }) =>
      aiApi.actionInsight(id, action),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-insights'] });
    },
  });
}

// ============ Hooks - Forecasting ============

export function useCashFlowForecast(days: number = 30) {
  return useQuery({
    queryKey: ['ai-forecast', 'cash-flow', days],
    queryFn: () => aiApi.getCashFlowForecast(days),
  });
}

export function useRevenueForecast(months: number = 6) {
  return useQuery({
    queryKey: ['ai-forecast', 'revenue', months],
    queryFn: () => aiApi.getRevenueForecast(months),
  });
}

// ============ Hooks - Reconciliation ============

export function useReconciliationSuggestions(bankTransactionId: string) {
  return useQuery({
    queryKey: ['ai-reconciliation', bankTransactionId],
    queryFn: () => aiApi.getReconciliationSuggestions(bankTransactionId),
    enabled: !!bankTransactionId,
  });
}

export function useApplyReconciliationSuggestion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: aiApi.applyReconciliationSuggestion,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-reconciliation'] });
      queryClient.invalidateQueries({ queryKey: ['bank-transactions'] });
    },
  });
}

// ============ Hooks - Categorization ============

export function useCategorySuggestions(transactionId: string) {
  return useQuery({
    queryKey: ['ai-categorization', transactionId],
    queryFn: () => aiApi.getCategorySuggestions(transactionId),
    enabled: !!transactionId,
  });
}

export function useApplyCategorySuggestion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: aiApi.applyCategorySuggestion,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-categorization'] });
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
    },
  });
}

// ============ Hooks - Analysis ============

export function useRunAnomalyDetection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: aiApi.runAnomalyDetection,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-insights'] });
    },
  });
}

export function useSpendingAnalysis(period: string = 'month') {
  return useQuery({
    queryKey: ['ai-analysis', 'spending', period],
    queryFn: () => aiApi.getSpendingAnalysis(period),
  });
}

export function useCustomerAnalysis() {
  return useQuery({
    queryKey: ['ai-analysis', 'customers'],
    queryFn: () => aiApi.getCustomerAnalysis(),
  });
}

// ============ Helper Functions ============

export function getInsightTypeLabel(type: InsightType): string {
  const labels: Record<InsightType, string> = {
    ANOMALY: 'Anomaly',
    TREND: 'Trend',
    RECOMMENDATION: 'Recommendation',
    FORECAST: 'Forecast',
    ALERT: 'Alert',
    OPPORTUNITY: 'Opportunity',
  };
  return labels[type] || type;
}

export function getInsightTypeIcon(type: InsightType): string {
  const icons: Record<InsightType, string> = {
    ANOMALY: '⚠️',
    TREND: '📈',
    RECOMMENDATION: '💡',
    FORECAST: '🔮',
    ALERT: '🔔',
    OPPORTUNITY: '🎯',
  };
  return icons[type] || '📊';
}

export function getInsightTypeColor(type: InsightType): string {
  const colors: Record<InsightType, string> = {
    ANOMALY: 'bg-red-100 text-red-800 border-red-200',
    TREND: 'bg-blue-100 text-blue-800 border-blue-200',
    RECOMMENDATION: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    FORECAST: 'bg-purple-100 text-purple-800 border-purple-200',
    ALERT: 'bg-orange-100 text-orange-800 border-orange-200',
    OPPORTUNITY: 'bg-green-100 text-green-800 border-green-200',
  };
  return colors[type] || '';
}

export function getInsightPriorityLabel(priority: InsightPriority): string {
  const labels: Record<InsightPriority, string> = {
    LOW: 'Low',
    MEDIUM: 'Medium',
    HIGH: 'High',
    CRITICAL: 'Critical',
  };
  return labels[priority] || priority;
}

export function getInsightPriorityColor(priority: InsightPriority): string {
  const colors: Record<InsightPriority, string> = {
    LOW: 'bg-gray-100 text-gray-800',
    MEDIUM: 'bg-blue-100 text-blue-800',
    HIGH: 'bg-orange-100 text-orange-800',
    CRITICAL: 'bg-red-100 text-red-800',
  };
  return colors[priority] || '';
}

export function formatConfidence(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}

export function formatCurrency(amount: number | string | undefined): string {
  if (amount === undefined || amount === null) return '$0.00';
  const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(numAmount);
}

// ============ NEW AI INFRASTRUCTURE TYPES ============

export type AiFeature =
  | 'CATEGORIZATION'
  | 'RECONCILIATION'
  | 'OCR_LAYOUT'
  | 'DEMAND_FORECAST'
  | 'LEAD_SCORING'
  | 'ANOMALY'
  | 'REORDER'
  | 'PAYMENT_PREDICTION';

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

// ============ NEW AI API FUNCTIONS ============

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
    entityId: string
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
    const response = await api.post('/ai/reconciliation/bulk-match', {
      transactionIds,
    }, { params: { minConfidence } });
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
  checkDuplicate: async (data: {
    vendorId?: string;
    invoiceNumber?: string;
    amount?: number;
  }) => {
    const response = await api.post('/ai/ocr/check-duplicate', data);
    return response.data;
  },
};

// ============ NEW HOOKS - Feedback ============

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

// ============ NEW HOOKS - Anomalies ============

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

// ============ NEW HOOKS - Reorder Points ============

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
  serviceLevel?: number
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

// ============ NEW HOOKS - Reconciliation Matcher ============

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

// ============ NEW HOOKS - OCR ============

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

// ============ NEW HELPER FUNCTIONS ============

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

// ============ MODEL 1: TRANSACTION CATEGORIZATION TYPES ============

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
}

export interface CategorizationStats {
  sampleCount: number;
  accuracy: number;
  modelVersion: number;
  lastTrainedAt: string | null;
  status: 'ACTIVE' | 'TRAINING' | 'NOT_TRAINED';
}

// ============ MODEL 6: PAYMENT PREDICTION TYPES ============

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

// ============ MODEL 10: FINANCIAL NARRATIVE TYPES ============

export interface NarrativeSection {
  id: string;
  title: string;
  content: string;
  metrics?: Array<{
    label: string;
    value: string;
    trend?: 'up' | 'down' | 'stable';
  }>;
}

export interface NarrativeAlert {
  type: 'warning' | 'info' | 'opportunity';
  message: string;
}

export interface GeneratedNarrative {
  title: string;
  period: string;
  generatedAt: string;
  sections: NarrativeSection[];
  alerts: NarrativeAlert[];
  recommendations: string[];
  summary?: string;
}

export interface QueryTemplate {
  id: string;
  question: string;
  category: string;
  parameters?: Array<{
    name: string;
    type: 'date-range' | 'number' | 'currency' | 'string';
    default?: any;
  }>;
}

export interface QueryResult {
  answer: string;
  data: any;
  chartType?: 'bar' | 'line' | 'pie' | 'table';
}

// ============ MODEL 1, 6, 10 API FUNCTIONS ============

const aiModelsApi = {
  // Transaction Categorization (Model 1)
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

  // Payment Prediction (Model 6)
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

  // Financial Narratives (Model 10)
  getMonthlyNarrative: async (month: number, year: number) => {
    const response = await api.get('/ai/narrative/monthly', {
      params: { month, year },
    });
    return response.data;
  },
  getWeeklySnapshot: async (startDate?: string) => {
    const response = await api.get('/ai/narrative/weekly', {
      params: { startDate },
    });
    return response.data;
  },
  getCustomerNarrative: async (customerId: string) => {
    const response = await api.get(`/ai/narrative/customer/${customerId}`);
    return response.data;
  },
  getItemNarrative: async (itemId: string) => {
    const response = await api.get(`/ai/narrative/item/${itemId}`);
    return response.data;
  },
  getCashFlowNarrative: async () => {
    const response = await api.get('/ai/narrative/cash-flow');
    return response.data;
  },
  getAvailableQueries: async () => {
    const response = await api.get('/ai/narrative/queries');
    return response.data;
  },
  executeQuery: async (queryId: string, params?: Record<string, any>) => {
    const response = await api.get(`/ai/narrative/query/${queryId}`, {
      params,
    });
    return response.data;
  },
};

// ============ HOOKS - Transaction Categorization (Model 1) ============

export function useCategorySuggestion(
  input: CategorizationInput | null,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: ['ai-categorization-predict', input],
    queryFn: () => (input ? aiModelsApi.predictCategorization(input) : null),
    enabled: options?.enabled !== false && !!input && !!input.description,
    staleTime: 30000, // Cache for 30 seconds
  });
}

export function useLearnCategorization() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: aiModelsApi.learnCategorization,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-categorization-stats'] });
    },
  });
}

export function useTrainCategorization() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: aiModelsApi.trainCategorization,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-categorization-stats'] });
      queryClient.invalidateQueries({ queryKey: ['ai-categorization-predict'] });
    },
  });
}

export function useCategorizationStats() {
  return useQuery({
    queryKey: ['ai-categorization-stats'],
    queryFn: () => aiModelsApi.getCategorizationStats(),
  });
}

export function useSeedCategorization() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: aiModelsApi.seedCategorization,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-categorization-stats'] });
    },
  });
}

export function useCrossValidateCategorization() {
  return useMutation({
    mutationFn: aiModelsApi.crossValidateCategorization,
  });
}

// ============ HOOKS - Payment Prediction (Model 6) ============

export function usePaymentPrediction(invoiceId: string) {
  return useQuery({
    queryKey: ['ai-payment-prediction', invoiceId],
    queryFn: () => aiModelsApi.getPaymentPrediction(invoiceId),
    enabled: !!invoiceId,
  });
}

export function useOutstandingPredictions() {
  return useQuery({
    queryKey: ['ai-payment-predictions-outstanding'],
    queryFn: () => aiModelsApi.getOutstandingPredictions(),
  });
}

export function useCustomerPaymentProfile(customerId: string) {
  return useQuery({
    queryKey: ['ai-customer-payment-profile', customerId],
    queryFn: () => aiModelsApi.getCustomerPaymentProfile(customerId),
    enabled: !!customerId,
  });
}

export function useCustomerPaymentHistory(customerId: string) {
  return useQuery({
    queryKey: ['ai-customer-payment-history', customerId],
    queryFn: () => aiModelsApi.getCustomerPaymentHistory(customerId),
    enabled: !!customerId,
  });
}

export function useCollectionPriority() {
  return useQuery({
    queryKey: ['ai-collection-priority'],
    queryFn: () => aiModelsApi.getCollectionPriority(),
  });
}

export function useRebuildPaymentProfiles() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: aiModelsApi.rebuildPaymentProfiles,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-payment-prediction'] });
      queryClient.invalidateQueries({ queryKey: ['ai-payment-predictions-outstanding'] });
      queryClient.invalidateQueries({ queryKey: ['ai-customer-payment-profile'] });
      queryClient.invalidateQueries({ queryKey: ['ai-collection-priority'] });
    },
  });
}

// ============ HOOKS - Financial Narratives (Model 10) ============

export function useMonthlyNarrative(month?: number, year?: number) {
  const now = new Date();
  const targetMonth = month ?? now.getMonth() + 1;
  const targetYear = year ?? now.getFullYear();

  return useQuery({
    queryKey: ['ai-narrative-monthly', targetMonth, targetYear],
    queryFn: () => aiModelsApi.getMonthlyNarrative(targetMonth, targetYear),
  });
}

export function useWeeklySnapshot(startDate?: string) {
  return useQuery({
    queryKey: ['ai-narrative-weekly', startDate],
    queryFn: () => aiModelsApi.getWeeklySnapshot(startDate),
  });
}

export function useCustomerNarrative(customerId: string) {
  return useQuery({
    queryKey: ['ai-narrative-customer', customerId],
    queryFn: () => aiModelsApi.getCustomerNarrative(customerId),
    enabled: !!customerId,
  });
}

export function useItemNarrative(itemId: string) {
  return useQuery({
    queryKey: ['ai-narrative-item', itemId],
    queryFn: () => aiModelsApi.getItemNarrative(itemId),
    enabled: !!itemId,
  });
}

export function useCashFlowNarrative() {
  return useQuery({
    queryKey: ['ai-narrative-cash-flow'],
    queryFn: () => aiModelsApi.getCashFlowNarrative(),
  });
}

export function useAvailableQueries() {
  return useQuery({
    queryKey: ['ai-available-queries'],
    queryFn: () => aiModelsApi.getAvailableQueries(),
  });
}

export function useExecuteQuery() {
  return useMutation({
    mutationFn: ({ queryId, params }: { queryId: string; params?: Record<string, any> }) =>
      aiModelsApi.executeQuery(queryId, params),
  });
}

// ============ ADDITIONAL HELPER FUNCTIONS ============

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

export function getTrendIcon(trend: 'up' | 'down' | 'stable'): string {
  const icons = {
    up: '↑',
    down: '↓',
    stable: '→',
  };
  return icons[trend];
}

export function getTrendColor(trend: 'up' | 'down' | 'stable', isPositive: boolean = true): string {
  if (trend === 'stable') return 'text-gray-600';
  if (trend === 'up') return isPositive ? 'text-green-600' : 'text-red-600';
  return isPositive ? 'text-red-600' : 'text-green-600';
}

export function getAlertTypeIcon(type: 'warning' | 'info' | 'opportunity'): string {
  const icons = {
    warning: '⚠️',
    info: 'ℹ️',
    opportunity: '💡',
  };
  return icons[type];
}

export function getAlertTypeColor(type: 'warning' | 'info' | 'opportunity'): string {
  const colors = {
    warning: 'bg-red-50 border-red-200 text-red-800',
    info: 'bg-blue-50 border-blue-200 text-blue-800',
    opportunity: 'bg-green-50 border-green-200 text-green-800',
  };
  return colors[type];
}

// ============ MODEL 4: DEMAND FORECASTING TYPES ============

export type LeadTier = 'HOT' | 'WARM' | 'COOL' | 'COLD';

export interface ForecastPoint {
  date: string;
  predicted: number;
  lowerBound: number;
  upperBound: number;
  seasonalIndex: number;
}

export interface DemandForecast {
  forecasts: ForecastPoint[];
  model: {
    level: number;
    trend: number;
    seasonalIndices: number[];
    mape: number;
  };
  dataPoints: number;
  confidence: 'high' | 'medium' | 'low';
  method: 'holt-winters' | 'double-exponential' | 'simple-exponential';
}

export interface SeasonalityPattern {
  pattern: 'seasonal' | 'trending' | 'stable' | 'volatile';
  seasonalStrength: number;
  trendStrength: number;
  monthlyIndices: number[];
  peakMonths: number[];
  lowMonths: number[];
}

export interface ItemTrend {
  direction: 'up' | 'down' | 'flat';
  magnitude: number;
  confidence: number;
}

export interface ForecastDashboard {
  totalItems: number;
  itemsWithForecasts: number;
  highConfidenceCount: number;
  avgMAPE: number;
  topGrowingItems: Array<{
    itemId: string;
    itemName: string;
    growthRate: number;
  }>;
  topDecliningItems: Array<{
    itemId: string;
    itemName: string;
    declineRate: number;
  }>;
}

export interface HolidayConfig {
  ramadan?: {
    enabled: boolean;
    multiplier: number;
    categories?: string[];
  };
  eid?: {
    enabled: boolean;
    multiplier: number;
  };
  customHolidays?: Array<{
    name: string;
    month: number;
    multiplier: number;
    categories?: string[];
  }>;
}

// ============ MODEL 5: CASH FLOW PREDICTION TYPES ============

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

// ============ MODEL 7: LEAD SCORING TYPES ============

export interface LeadScore {
  leadId: string;
  totalScore: number;
  demographicScore: number;
  behavioralScore: number;
  engagementScore: number;
  tier: LeadTier;
  conversionProbability: number;
  breakdown: Array<{
    category: string;
    rule: string;
    score: number;
  }>;
}

export interface HotLead {
  leadId: string;
  leadName: string;
  company: string;
  score: number;
  tier: LeadTier;
  conversionProbability: number;
  lastActivity: string;
  recommendedAction: string;
}

export interface ColdLead {
  leadId: string;
  leadName: string;
  score: number;
  daysInactive: number;
  reengagementSuggestion: string;
}

export interface ConversionPrediction {
  probability: number;
  confidence: 'high' | 'medium' | 'low';
  factors: Array<{
    factor: string;
    impact: 'positive' | 'negative';
    weight: number;
  }>;
  recommendation: string;
}

export interface ScoreHistoryEntry {
  date: string;
  score: number;
  change: number;
  reason: string;
}

export interface ScoreDistribution {
  hot: number;
  warm: number;
  cool: number;
  cold: number;
  total: number;
  avgScore: number;
}

// ============ MODEL 4, 5, 7 API FUNCTIONS ============

const aiModels457Api = {
  // Demand Forecasting (Model 4)
  getDemandForecast: async (itemId: string, horizon?: number, params?: {
    alpha?: number;
    beta?: number;
    gamma?: number;
    seasonLength?: number;
  }) => {
    const response = await api.get(`/ai/demand-forecast/item/${itemId}`, {
      params: { horizon, ...params },
    });
    return response.data;
  },
  getSeasonality: async (itemId: string) => {
    const response = await api.get(`/ai/demand-forecast/item/${itemId}/seasonality`);
    return response.data;
  },
  getItemTrend: async (itemId: string) => {
    const response = await api.get(`/ai/demand-forecast/item/${itemId}/trend`);
    return response.data;
  },
  getForecastDashboard: async () => {
    const response = await api.get('/ai/demand-forecast/dashboard');
    return response.data;
  },
  recalculateForecasts: async () => {
    const response = await api.post('/ai/demand-forecast/recalculate');
    return response.data;
  },
  applyHolidayConfig: async (itemId: string, config: HolidayConfig) => {
    const response = await api.post(`/ai/demand-forecast/item/${itemId}/apply-holidays`, config);
    return response.data;
  },

  // Cash Flow Prediction (Model 5)
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

  // Lead Scoring (Model 7)
  getLeadScore: async (leadId: string) => {
    const response = await api.get(`/ai/lead-scoring/lead/${leadId}`);
    return response.data;
  },
  rescoreLead: async (leadId: string) => {
    const response = await api.post(`/ai/lead-scoring/lead/${leadId}/rescore`);
    return response.data;
  },
  getHotLeads: async (limit?: number) => {
    const response = await api.get('/ai/lead-scoring/hot', {
      params: { limit },
    });
    return response.data;
  },
  getColdLeads: async (limit?: number) => {
    const response = await api.get('/ai/lead-scoring/cold', {
      params: { limit },
    });
    return response.data;
  },
  getConversionPrediction: async (leadId: string) => {
    const response = await api.get(`/ai/lead-scoring/lead/${leadId}/prediction`);
    return response.data;
  },
  getLeadScoreHistory: async (leadId: string) => {
    const response = await api.get(`/ai/lead-scoring/lead/${leadId}/history`);
    return response.data;
  },
  scoreAllLeads: async () => {
    const response = await api.post('/ai/lead-scoring/score-all');
    return response.data;
  },
  getScoreDistribution: async () => {
    const response = await api.get('/ai/lead-scoring/distribution');
    return response.data;
  },
};

// ============ HOOKS - Demand Forecasting (Model 4) ============

export function useItemDemandForecast(
  itemId: string,
  horizon?: number,
  params?: { alpha?: number; beta?: number; gamma?: number; seasonLength?: number }
) {
  return useQuery({
    queryKey: ['ai-demand-forecast', itemId, horizon, params],
    queryFn: () => aiModels457Api.getDemandForecast(itemId, horizon, params),
    enabled: !!itemId,
  });
}

export function useItemSeasonality(itemId: string) {
  return useQuery({
    queryKey: ['ai-demand-seasonality', itemId],
    queryFn: () => aiModels457Api.getSeasonality(itemId),
    enabled: !!itemId,
  });
}

export function useItemTrend(itemId: string) {
  return useQuery({
    queryKey: ['ai-demand-trend', itemId],
    queryFn: () => aiModels457Api.getItemTrend(itemId),
    enabled: !!itemId,
  });
}

export function useForecastDashboard() {
  return useQuery({
    queryKey: ['ai-demand-forecast-dashboard'],
    queryFn: () => aiModels457Api.getForecastDashboard(),
  });
}

export function useRecalculateForecasts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: aiModels457Api.recalculateForecasts,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-demand-forecast'] });
      queryClient.invalidateQueries({ queryKey: ['ai-demand-seasonality'] });
      queryClient.invalidateQueries({ queryKey: ['ai-demand-trend'] });
      queryClient.invalidateQueries({ queryKey: ['ai-demand-forecast-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['ai-reorder'] });
    },
  });
}

export function useApplyHolidayConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, config }: { itemId: string; config: HolidayConfig }) =>
      aiModels457Api.applyHolidayConfig(itemId, config),
    onSuccess: (_, { itemId }) => {
      queryClient.invalidateQueries({ queryKey: ['ai-demand-forecast', itemId] });
    },
  });
}

// ============ HOOKS - Cash Flow Prediction (Model 5) ============

export function useCashFlowPrediction(horizon?: number) {
  return useQuery({
    queryKey: ['ai-cash-flow-forecast', horizon],
    queryFn: () => aiModels457Api.getCashFlowPrediction(horizon),
  });
}

export function useQuickCashForecast() {
  return useQuery({
    queryKey: ['ai-cash-flow-quick'],
    queryFn: () => aiModels457Api.getQuickCashForecast(),
  });
}

export function useCashFlowScenarios() {
  return useQuery({
    queryKey: ['ai-cash-flow-scenarios'],
    queryFn: () => aiModels457Api.getCashFlowScenarios(),
  });
}

export function useCashFlowAlerts() {
  return useQuery({
    queryKey: ['ai-cash-flow-alerts'],
    queryFn: () => aiModels457Api.getCashFlowAlerts(),
  });
}

export function useWhatIfAnalysis() {
  return useMutation({
    mutationFn: (scenario: WhatIfScenario) => aiModels457Api.whatIfAnalysis(scenario),
  });
}

export function useRecalculateCashFlow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: aiModels457Api.recalculateCashFlow,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-cash-flow-forecast'] });
      queryClient.invalidateQueries({ queryKey: ['ai-cash-flow-quick'] });
      queryClient.invalidateQueries({ queryKey: ['ai-cash-flow-scenarios'] });
      queryClient.invalidateQueries({ queryKey: ['ai-cash-flow-alerts'] });
    },
  });
}

// ============ HOOKS - Lead Scoring (Model 7) ============

export function useLeadScore(leadId: string) {
  return useQuery({
    queryKey: ['ai-lead-score', leadId],
    queryFn: () => aiModels457Api.getLeadScore(leadId),
    enabled: !!leadId,
  });
}

export function useRescoreLead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (leadId: string) => aiModels457Api.rescoreLead(leadId),
    onSuccess: (_, leadId) => {
      queryClient.invalidateQueries({ queryKey: ['ai-lead-score', leadId] });
      queryClient.invalidateQueries({ queryKey: ['ai-hot-leads'] });
      queryClient.invalidateQueries({ queryKey: ['ai-cold-leads'] });
      queryClient.invalidateQueries({ queryKey: ['ai-lead-score-distribution'] });
    },
  });
}

export function useHotLeads(limit?: number) {
  return useQuery({
    queryKey: ['ai-hot-leads', limit],
    queryFn: () => aiModels457Api.getHotLeads(limit),
  });
}

export function useColdLeads(limit?: number) {
  return useQuery({
    queryKey: ['ai-cold-leads', limit],
    queryFn: () => aiModels457Api.getColdLeads(limit),
  });
}

export function useLeadConversionPrediction(leadId: string) {
  return useQuery({
    queryKey: ['ai-lead-conversion', leadId],
    queryFn: () => aiModels457Api.getConversionPrediction(leadId),
    enabled: !!leadId,
  });
}

export function useLeadScoreHistory(leadId: string) {
  return useQuery({
    queryKey: ['ai-lead-score-history', leadId],
    queryFn: () => aiModels457Api.getLeadScoreHistory(leadId),
    enabled: !!leadId,
  });
}

export function useScoreAllLeads() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: aiModels457Api.scoreAllLeads,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-lead-score'] });
      queryClient.invalidateQueries({ queryKey: ['ai-hot-leads'] });
      queryClient.invalidateQueries({ queryKey: ['ai-cold-leads'] });
      queryClient.invalidateQueries({ queryKey: ['ai-lead-score-distribution'] });
    },
  });
}

export function useLeadScoreDistribution() {
  return useQuery({
    queryKey: ['ai-lead-score-distribution'],
    queryFn: () => aiModels457Api.getScoreDistribution(),
  });
}

// ============ HELPER FUNCTIONS - Models 4, 5, 7 ============

export function getLeadTierColor(tier: LeadTier): string {
  const colors: Record<LeadTier, string> = {
    HOT: 'bg-red-500 text-white',
    WARM: 'bg-orange-500 text-white',
    COOL: 'bg-blue-500 text-white',
    COLD: 'bg-gray-400 text-white',
  };
  return colors[tier] || 'bg-gray-400 text-white';
}

export function getLeadTierBorderColor(tier: LeadTier): string {
  const colors: Record<LeadTier, string> = {
    HOT: 'border-red-500',
    WARM: 'border-orange-500',
    COOL: 'border-blue-500',
    COLD: 'border-gray-400',
  };
  return colors[tier] || 'border-gray-400';
}

export function getLeadTierLabel(tier: LeadTier): string {
  const labels: Record<LeadTier, string> = {
    HOT: 'Hot Lead',
    WARM: 'Warm Lead',
    COOL: 'Cool Lead',
    COLD: 'Cold Lead',
  };
  return labels[tier] || tier;
}

export function getLeadTierIcon(tier: LeadTier): string {
  const icons: Record<LeadTier, string> = {
    HOT: '🔥',
    WARM: '☀️',
    COOL: '❄️',
    COLD: '🧊',
  };
  return icons[tier] || '📊';
}

export function getForecastConfidenceLabel(confidence: 'high' | 'medium' | 'low'): string {
  const labels = {
    high: 'High Confidence',
    medium: 'Medium Confidence',
    low: 'Low Confidence',
  };
  return labels[confidence];
}

export function getForecastMethodLabel(method: 'holt-winters' | 'double-exponential' | 'simple-exponential'): string {
  const labels = {
    'holt-winters': 'Holt-Winters (Seasonal)',
    'double-exponential': 'Double Exponential (Trending)',
    'simple-exponential': 'Simple Exponential (Basic)',
  };
  return labels[method];
}

export function formatMAPE(mape: number): string {
  return `${mape.toFixed(1)}% error`;
}

export function getSeasonalPatternLabel(pattern: 'seasonal' | 'trending' | 'stable' | 'volatile'): string {
  const labels = {
    seasonal: 'Seasonal Pattern',
    trending: 'Trending Pattern',
    stable: 'Stable Pattern',
    volatile: 'Volatile Pattern',
  };
  return labels[pattern];
}

export function getSeasonalPatternIcon(pattern: 'seasonal' | 'trending' | 'stable' | 'volatile'): string {
  const icons = {
    seasonal: '🔄',
    trending: '📈',
    stable: '➡️',
    volatile: '📊',
  };
  return icons[pattern];
}

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

// ============ FEATURE 1: PATTERN DETECTION TYPES ============

export type PatternStatus = 'DETECTED' | 'CONFIRMED' | 'CONVERTED' | 'DISMISSED' | 'STALE';
export type SuggestionType = 'CREATE_RECURRING' | 'DUPLICATE_WARNING' | 'FREQUENCY_CHANGE';
export type SuggestionStatus = 'PENDING' | 'ACCEPTED' | 'DISMISSED';

export interface TransactionPattern {
  id: string;
  entityType: string;
  entityId?: string;
  entityName: string;
  amountCluster: number;
  amountVariance: number;
  frequency?: string;
  frequencyDays?: number;
  frequencyStdDev?: number;
  occurrenceCount: number;
  firstOccurrence: string;
  lastOccurrence: string;
  descriptionPattern?: string;
  confidence: number;
  status: PatternStatus;
  createdAt: string;
  occurrences?: PatternOccurrence[];
  suggestions?: PatternSuggestion[];
}

export interface PatternOccurrence {
  id: string;
  patternId: string;
  sourceType: string;
  sourceId: string;
  amount: number;
  date: string;
  description?: string;
}

export interface PatternSuggestion {
  id: string;
  patternId: string;
  suggestionType: SuggestionType;
  suggestedFrequency?: string;
  suggestedAmount: number;
  confidence: number;
  status: SuggestionStatus;
  recurringProfileId?: string;
  dismissedAt?: string;
  dismissedReason?: string;
  pattern?: TransactionPattern;
}

export interface PatternAnalysisResult {
  patternsDetected: number;
  suggestionsCreated: number;
  duplicatesFound: number;
}

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  matchingTransaction?: any;
  warning?: string;
}

// ============ FEATURE 2: AI ALERTS TYPES ============

export type AlertCategory = 'FINANCIAL' | 'COLLECTION' | 'INVENTORY' | 'COMPLIANCE' | 'HR' | 'CRM';
export type AlertPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type AlertSource =
  | 'CASH_FLOW'
  | 'ANOMALY'
  | 'PAYMENT_PREDICTION'
  | 'REORDER'
  | 'DEMAND_FORECAST'
  | 'LEAD_SCORING'
  | 'PATTERN_DETECTION'
  | 'TAX_COMPLIANCE'
  | 'PAYROLL';

export interface UnifiedAlert {
  id: string;
  category: AlertCategory;
  priority: AlertPriority;
  aiSource: AlertSource;
  title: string;
  description: string;
  sourceEntityType?: string;
  sourceEntityId?: string;
  actionUrl?: string;
  actionLabel?: string;
  expiresAt?: string;
  isRead: boolean;
  isDismissed: boolean;
  dismissedAt?: string;
  dismissedBy?: string;
  createdAt: string;
}

export interface AlertSummary {
  total: number;
  unread: number;
  byCategory: Record<AlertCategory, number>;
  byPriority: Record<AlertPriority, number>;
  criticalCount: number;
}

export interface AlertAggregationResult {
  created: number;
  updated: number;
  expired: number;
}

// ============ PATTERN DETECTION API FUNCTIONS ============

const patternApi = {
  getPatterns: async (params?: {
    status?: PatternStatus;
    entityType?: string;
    page?: number;
    limit?: number;
  }) => {
    const response = await api.get('/ai/patterns', { params });
    return response.data;
  },
  getPattern: async (id: string) => {
    const response = await api.get(`/ai/patterns/${id}`);
    return response.data;
  },
  getPendingSuggestions: async (limit?: number) => {
    const response = await api.get('/ai/patterns/suggestions', { params: { limit } });
    return response.data;
  },
  runPatternAnalysis: async () => {
    const response = await api.post('/ai/patterns/analyze');
    return response.data;
  },
  acceptSuggestion: async (suggestionId: string, options?: { autoPost?: boolean; name?: string }) => {
    const response = await api.post(`/ai/patterns/suggestions/${suggestionId}/accept`, options);
    return response.data;
  },
  dismissSuggestion: async (suggestionId: string, reason?: string) => {
    const response = await api.post(`/ai/patterns/suggestions/${suggestionId}/dismiss`, { reason });
    return response.data;
  },
  checkDuplicate: async (data: { entityName: string; amount: number; date: string }) => {
    const response = await api.post('/ai/patterns/check-duplicate', data);
    return response.data;
  },
};

// ============ AI ALERTS API FUNCTIONS ============

const alertsApi = {
  getAlerts: async (params?: {
    category?: AlertCategory;
    priority?: AlertPriority;
    isRead?: boolean;
    page?: number;
    limit?: number;
  }) => {
    const response = await api.get('/ai/alerts', { params });
    return response.data;
  },
  getAlertSummary: async () => {
    const response = await api.get('/ai/alerts/summary');
    return response.data;
  },
  getCriticalAlerts: async (limit?: number) => {
    const response = await api.get('/ai/alerts/critical', { params: { limit } });
    return response.data;
  },
  getAlertsByCategory: async (category: AlertCategory, limit?: number) => {
    const response = await api.get(`/ai/alerts/category/${category}`, { params: { limit } });
    return response.data;
  },
  aggregateAlerts: async () => {
    const response = await api.post('/ai/alerts/aggregate');
    return response.data;
  },
  markAsRead: async (alertId: string) => {
    const response = await api.post(`/ai/alerts/${alertId}/read`);
    return response.data;
  },
  markAllAsRead: async (category?: AlertCategory) => {
    const response = await api.post('/ai/alerts/read-all', null, { params: { category } });
    return response.data;
  },
  dismissAlert: async (alertId: string, reason?: string) => {
    const response = await api.post(`/ai/alerts/${alertId}/dismiss`, { reason });
    return response.data;
  },
};

// ============ PATTERN DETECTION HOOKS ============

export function usePatterns(params?: {
  status?: PatternStatus;
  entityType?: string;
  page?: number;
  limit?: number;
}) {
  return useQuery({
    queryKey: ['ai-patterns', params],
    queryFn: () => patternApi.getPatterns(params),
  });
}

export function usePattern(id: string) {
  return useQuery({
    queryKey: ['ai-patterns', id],
    queryFn: () => patternApi.getPattern(id),
    enabled: !!id,
  });
}

export function usePendingSuggestions(limit?: number) {
  return useQuery({
    queryKey: ['ai-pattern-suggestions', limit],
    queryFn: () => patternApi.getPendingSuggestions(limit),
  });
}

export function useRunPatternAnalysis() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: patternApi.runPatternAnalysis,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-patterns'] });
      queryClient.invalidateQueries({ queryKey: ['ai-pattern-suggestions'] });
    },
  });
}

export function useAcceptSuggestion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ suggestionId, options }: { suggestionId: string; options?: { autoPost?: boolean; name?: string } }) =>
      patternApi.acceptSuggestion(suggestionId, options),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-patterns'] });
      queryClient.invalidateQueries({ queryKey: ['ai-pattern-suggestions'] });
      queryClient.invalidateQueries({ queryKey: ['recurring-profiles'] });
    },
  });
}

export function useDismissSuggestion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ suggestionId, reason }: { suggestionId: string; reason?: string }) =>
      patternApi.dismissSuggestion(suggestionId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-pattern-suggestions'] });
    },
  });
}

export function useCheckDuplicate() {
  return useMutation({
    mutationFn: patternApi.checkDuplicate,
  });
}

// ============ AI ALERTS HOOKS ============

export function useAiAlerts(params?: {
  category?: AlertCategory;
  priority?: AlertPriority;
  isRead?: boolean;
  page?: number;
  limit?: number;
}) {
  return useQuery({
    queryKey: ['ai-alerts', params],
    queryFn: () => alertsApi.getAlerts(params),
  });
}

export function useAlertSummary() {
  return useQuery({
    queryKey: ['ai-alert-summary'],
    queryFn: () => alertsApi.getAlertSummary(),
  });
}

export function useCriticalAlerts(limit?: number) {
  return useQuery({
    queryKey: ['ai-critical-alerts', limit],
    queryFn: () => alertsApi.getCriticalAlerts(limit),
  });
}

export function useAlertsByCategory(category: AlertCategory, limit?: number) {
  return useQuery({
    queryKey: ['ai-alerts-category', category, limit],
    queryFn: () => alertsApi.getAlertsByCategory(category, limit),
    enabled: !!category,
  });
}

export function useAggregateAlerts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: alertsApi.aggregateAlerts,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-alerts'] });
      queryClient.invalidateQueries({ queryKey: ['ai-alert-summary'] });
      queryClient.invalidateQueries({ queryKey: ['ai-critical-alerts'] });
    },
  });
}

export function useMarkAlertAsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: alertsApi.markAsRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-alerts'] });
      queryClient.invalidateQueries({ queryKey: ['ai-alert-summary'] });
    },
  });
}

export function useMarkAllAlertsAsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: alertsApi.markAllAsRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-alerts'] });
      queryClient.invalidateQueries({ queryKey: ['ai-alert-summary'] });
    },
  });
}

export function useDismissAlert() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ alertId, reason }: { alertId: string; reason?: string }) =>
      alertsApi.dismissAlert(alertId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-alerts'] });
      queryClient.invalidateQueries({ queryKey: ['ai-alert-summary'] });
      queryClient.invalidateQueries({ queryKey: ['ai-critical-alerts'] });
    },
  });
}

// ============ PATTERN & ALERT HELPER FUNCTIONS ============

export function getPatternStatusColor(status: PatternStatus): string {
  const colors: Record<PatternStatus, string> = {
    DETECTED: 'bg-blue-100 text-blue-800 border-blue-200',
    CONFIRMED: 'bg-green-100 text-green-800 border-green-200',
    CONVERTED: 'bg-purple-100 text-purple-800 border-purple-200',
    DISMISSED: 'bg-gray-100 text-gray-800 border-gray-200',
    STALE: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  };
  return colors[status] || '';
}

export function getPatternStatusLabel(status: PatternStatus): string {
  const labels: Record<PatternStatus, string> = {
    DETECTED: 'Detected',
    CONFIRMED: 'Confirmed',
    CONVERTED: 'Converted to Recurring',
    DISMISSED: 'Dismissed',
    STALE: 'Stale (No Recent Activity)',
  };
  return labels[status] || status;
}

export function getSuggestionTypeIcon(type: SuggestionType): string {
  const icons: Record<SuggestionType, string> = {
    CREATE_RECURRING: '🔄',
    DUPLICATE_WARNING: '⚠️',
    FREQUENCY_CHANGE: '📅',
  };
  return icons[type] || '📊';
}

export function getSuggestionTypeLabel(type: SuggestionType): string {
  const labels: Record<SuggestionType, string> = {
    CREATE_RECURRING: 'Create Recurring Profile',
    DUPLICATE_WARNING: 'Potential Duplicate',
    FREQUENCY_CHANGE: 'Frequency Change Detected',
  };
  return labels[type] || type;
}

export function getAlertCategoryColor(category: AlertCategory): string {
  const colors: Record<AlertCategory, string> = {
    FINANCIAL: 'bg-green-100 text-green-800',
    COLLECTION: 'bg-yellow-100 text-yellow-800',
    INVENTORY: 'bg-blue-100 text-blue-800',
    COMPLIANCE: 'bg-red-100 text-red-800',
    HR: 'bg-purple-100 text-purple-800',
    CRM: 'bg-indigo-100 text-indigo-800',
  };
  return colors[category] || '';
}

export function getAlertCategoryIcon(category: AlertCategory): string {
  const icons: Record<AlertCategory, string> = {
    FINANCIAL: '💰',
    COLLECTION: '📥',
    INVENTORY: '📦',
    COMPLIANCE: '⚖️',
    HR: '👥',
    CRM: '🤝',
  };
  return icons[category] || '📊';
}

export function getAlertPriorityColor(priority: AlertPriority): string {
  const colors: Record<AlertPriority, string> = {
    CRITICAL: 'bg-red-500 text-white',
    HIGH: 'bg-orange-500 text-white',
    MEDIUM: 'bg-yellow-500 text-white',
    LOW: 'bg-blue-500 text-white',
  };
  return colors[priority] || '';
}

export function getAlertSourceLabel(source: AlertSource): string {
  const labels: Record<AlertSource, string> = {
    CASH_FLOW: 'Cash Flow',
    ANOMALY: 'Anomaly Detection',
    PAYMENT_PREDICTION: 'Payment Prediction',
    REORDER: 'Inventory Reorder',
    DEMAND_FORECAST: 'Demand Forecast',
    LEAD_SCORING: 'Lead Scoring',
    PATTERN_DETECTION: 'Pattern Detection',
    TAX_COMPLIANCE: 'Tax Compliance',
    PAYROLL: 'Payroll',
  };
  return labels[source] || source;
}
