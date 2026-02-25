/**
 * Barrel re-export file for AI hooks.
 * Individual feature files can be imported directly for better tree-shaking:
 *   import { useAIInsights } from '@/lib/hooks/use-ai-insights';
 *   import { useLeadScore } from '@/lib/hooks/use-ai-lead-scoring';
 *
 * Note: Shared utility functions (getRiskLevelColor, getConfidenceColor, etc.) are
 * available from '@/lib/utils/ai-helpers' to avoid export conflicts.
 */

// AI Insights (use-ai-insights)
export {
  useAIInsights,
  useAIInsight,
  useDismissInsight,
  useActionInsight,
  useCashFlowForecast,
  useRevenueForecast,
  useReconciliationSuggestions,
  useApplyReconciliationSuggestion,
  useCategorySuggestions,
  useApplyCategorySuggestion,
  useRunAnomalyDetection,
  useSpendingAnalysis,
  useCustomerAnalysis,
  getInsightTypeLabel,
  getInsightTypeColor,
  getInsightPriorityLabel,
  getInsightPriorityColor,
  formatConfidence,
  formatCurrency,
} from './use-ai-insights';
export type {
  AIInsight,
  InsightType,
  InsightPriority,
  InsightStatus,
  CashFlowForecast,
} from './use-ai-insights';

// AI Infrastructure — feedback, anomalies, reorder, reconciliation, OCR (use-ai-infrastructure)
export {
  useSubmitAiFeedback,
  useAiFeedbackStats,
  useAnomalies,
  useAnomaly,
  useRunAnomalyScan,
  useResolveAnomaly,
  useReorderAlerts,
  useReorderSummary,
  useDeadStock,
  useItemReorderAnalysis,
  useRecalculateReorderPoints,
  useReconciliationMatches,
  useConfirmReconciliationMatch,
  useReconciliationPatterns as useInfraReconciliationPatterns,
  useCreateBankRule,
  useBankRules,
  useBulkAutoMatch,
  useOcrExtract,
  useOcrExtractBase64,
  useOcrLearn,
  useOcrCheckDuplicate,
} from './use-ai-infrastructure';
export type {
  AiFeature,
  AiFeedbackAction,
  AiAnomaly,
  ItemReorderAnalysis,
  ReconciliationMatch,
  OcrExtractResult,
} from './use-ai-infrastructure';

// Categorization (use-ai-categorization)
export {
  useCategorySuggestion,
  useLearnCategorization,
  useTrainCategorization,
  useCategorizationStats,
  useSeedCategorization,
  useCrossValidateCategorization,
} from './use-ai-categorization';
export type {
  CategorizationInput,
  CategorizationPrediction,
  CategorizationStats,
} from './use-ai-categorization';

// Document Intake (use-ai-document-intake)
export { useDocumentIntakeProcess, useDocumentIntakeConfirm } from './use-ai-document-intake';
export type {
  DocumentIntakeResult,
  VendorCandidate,
  CustomerCandidate,
  IntakeLineItem,
  ConfirmIntakeLineData,
  ConfirmIntakeData,
  ConfirmIntakeResponse,
  IntakeDocumentType,
} from './use-ai-document-intake';

// Payment Prediction (use-ai-payment-prediction)
export {
  usePaymentPrediction,
  useOutstandingPredictions,
  useCustomerPaymentProfile,
  useCustomerPaymentHistory,
  useCollectionPriority,
  useRebuildPaymentProfiles,
} from './use-ai-payment-prediction';
export type {
  PaymentPrediction,
  CustomerPaymentProfile,
  CollectionPriorityItem,
} from './use-ai-payment-prediction';

// Cash Flow (use-ai-cash-flow)
export {
  useCashFlowPrediction,
  useQuickCashForecast,
  useCashFlowScenarios,
  useCashFlowAlerts,
  useWhatIfAnalysis,
  useRecalculateCashFlow,
} from './use-ai-cash-flow';
export type {
  CashFlowPredictionResult,
  QuickCashForecast,
  CashFlowScenarios,
  CashFlowAlert,
  WhatIfScenario,
  WhatIfResult,
} from './use-ai-cash-flow';

// Demand Forecast (use-ai-demand-forecast)
export {
  useItemDemandForecast,
  useItemSeasonality,
  useItemTrend,
  useForecastDashboard,
  useRecalculateForecasts,
  useApplyHolidayConfig,
} from './use-ai-demand-forecast';
export type {
  ForecastPoint,
  DemandForecast,
  SeasonalityPattern,
  ItemTrend,
  ForecastDashboard,
  HolidayConfig,
} from './use-ai-demand-forecast';

// Lead Scoring (use-ai-lead-scoring)
export {
  useLeadScore,
  useRescoreLead,
  useHotLeads,
  useColdLeads,
  useLeadConversionPrediction,
  useLeadScoreHistory,
  useScoreAllLeads,
  useLeadScoreDistribution,
} from './use-ai-lead-scoring';
export type {
  LeadTier,
  LeadScore,
  HotLead,
  ColdLead,
  ConversionPrediction,
  ScoreHistoryEntry,
  ScoreDistribution,
} from './use-ai-lead-scoring';

// Churn Prediction (use-ai-churn-prediction)
export {
  useChurnPrediction,
  useHighRiskCustomers,
  usePredictAllChurn,
  useTrainChurnModel,
} from './use-ai-churn-prediction';
export type {
  ChurnPrediction,
  HighRiskCustomer,
  ChurnBatchResult,
  ChurnTrainingResult,
} from './use-ai-churn-prediction';

// Customer CLV (use-ai-clv)
export {
  useCustomerCLV,
  useCLVSegments,
  useCLVDistribution,
  useCalculateAllCLV,
} from './use-ai-clv';
export type { CustomerCLV, CLVSegment, CLVDistribution, CLVCalculationResult } from './use-ai-clv';

// Pipeline Forecast (use-ai-pipeline-forecast)
export {
  usePipelineForecast,
  useWeightedPipeline,
  useStageConversionRates,
  useDealTimeline,
} from './use-ai-pipeline-forecast';
export type {
  PipelineForecast,
  WeightedPipeline,
  StageConversionRate,
  DealTimeline,
} from './use-ai-pipeline-forecast';

// Attrition / Flight Risk (use-ai-attrition)
export {
  useAttritionPrediction,
  useFlightRisk,
  usePredictAllAttrition,
  useTrainAttritionModel,
} from './use-ai-attrition';
export type {
  AttritionPrediction,
  FlightRiskEmployee,
  AttritionBatchResult,
  AttritionTrainingResult,
} from './use-ai-attrition';

// Fraud Detection (use-ai-fraud-detection)
export {
  useFraudScore,
  useFraudAlerts,
  useRunFraudScan,
  useResolveFraudAlert,
} from './use-ai-fraud-detection';
export type {
  FraudScore,
  FraudAlert,
  FraudScanResult,
  ResolveAlertResult,
} from './use-ai-fraud-detection';

// Patterns (use-ai-patterns)
export {
  usePatterns,
  usePattern,
  usePendingSuggestions,
  useRunPatternAnalysis,
  useAcceptSuggestion,
  useDismissSuggestion,
  useCheckDuplicate,
} from './use-ai-patterns';
export type {
  TransactionPattern,
  PatternSuggestion,
  PatternAnalysisResult,
  DuplicateCheckResult,
} from './use-ai-patterns';

// Narrative (use-ai-narrative)
export {
  useMonthlyNarrative,
  useWeeklySnapshot,
  useCustomerNarrative,
  useItemNarrative,
  useCashFlowNarrative,
  useAvailableQueries,
  useExecuteQuery,
} from './use-ai-narrative';
export type {
  NarrativeSection,
  NarrativeAlert,
  GeneratedNarrative,
  QueryTemplate,
  QueryResult,
} from './use-ai-narrative';

// Chatbot (use-ai-chatbot)
export {
  useSendChatMessage,
  useChatHistory,
  useClearChatHistory,
  useTrainChatbot,
} from './use-ai-chatbot';
export type { ChatMessage, ChatResponse } from './use-ai-chatbot';

// Alerts (use-ai-alerts)
export {
  useAiAlerts,
  useAlertSummary,
  useCriticalAlerts,
  useAlertsByCategory,
  useAggregateAlerts,
  useMarkAlertAsRead,
  useMarkAllAlertsAsRead,
  useDismissAlert,
} from './use-ai-alerts';
export type { UnifiedAlert, AlertSummary, AlertAggregationResult } from './use-ai-alerts';

// Training Lab (use-ai-training-lab)
export {
  useTrainingLabDashboard,
  useTrainingStats,
  useTrainingReadiness,
  useGenerateTrainingData,
  useTrainAllModels,
  useTrainModel,
  useModelStatus,
  useModelHistory,
  useTriggerRetraining,
  useRecentFeedback,
  useFeedbackTrends,
} from './use-ai-training-lab';
export type {
  TrainingLabDashboard,
  TrainingLabModelItem,
  TrainingStats,
  TrainingReadiness,
  ModelStatus,
  ModelHistoryEntry,
  FeedbackStats,
  FeedbackEntry,
  FeedbackTrendEntry,
} from './use-ai-training-lab';

// OCR Training (use-ocr-training)
export {
  useOcrTrainingExtract,
  useOcrTrainingSubmit,
  useOcrBatchExtract,
  useVendorOcrHistory,
  useOcrTrainingStats,
} from './use-ocr-training';
export type {
  OcrTrainingExtractResult,
  OcrTrainingSubmitData,
  OcrTrainingSubmitResult,
  BatchExtractionResult,
  VendorOcrHistory,
  OcrTrainingStats,
} from './use-ocr-training';
