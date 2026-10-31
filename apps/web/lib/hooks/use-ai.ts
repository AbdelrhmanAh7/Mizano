/**
 * Barrel re-export file for AI hooks.
 * Individual feature files can be imported directly for better tree-shaking:
 *   import { useAIInsights } from '@/lib/hooks/use-ai-insights';
 */

// AI Insights (use-ai-insights)
export {
  useAIInsights,
  useAIInsight,
  useDismissInsight,
  useActionInsight,
  useCashFlowForecast,
  useRevenueForecast,
  useRunAnomalyDetection,
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

// AI Infrastructure — feedback, anomalies, reorder, reconciliation (use-ai-infrastructure)
export { useReorderSummary } from './use-ai-infrastructure';
export type { AiFeature, AiFeedbackAction } from './use-ai-infrastructure';

// Document Intake (use-ai-document-intake)
export { useDocumentIntakeConfirm } from './use-ai-document-intake';
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
export { useCollectionPriority } from './use-ai-payment-prediction';

// Cash Flow (use-ai-cash-flow)
export { useQuickCashForecast } from './use-ai-cash-flow';
export type {
  CashFlowPredictionResult,
  QuickCashForecast,
  CashFlowScenarios,
  CashFlowAlert,
  WhatIfScenario,
  WhatIfResult,
} from './use-ai-cash-flow';

// Demand Forecast (use-ai-demand-forecast)
export { useForecastDashboard } from './use-ai-demand-forecast';
export type { HolidayConfig } from './use-ai-demand-forecast';

// Churn Prediction (use-ai-churn-prediction)
export { useHighRiskCustomers } from './use-ai-churn-prediction';

// Customer CLV (use-ai-clv)
export { useCLVSegments } from './use-ai-clv';

// Pipeline Forecast (use-ai-pipeline-forecast)
export { usePipelineForecast, useStageConversionRates } from './use-ai-pipeline-forecast';

// Attrition / Flight Risk (use-ai-attrition)
export { useFlightRisk } from './use-ai-attrition';
export type { TransactionPattern, PatternSuggestion } from './use-ai-patterns';

// Narrative (use-ai-narrative)
export { useWeeklySnapshot } from './use-ai-narrative';
export type {
  NarrativeSection,
  NarrativeAlert,
  GeneratedNarrative,
  QueryTemplate,
  QueryResult,
} from './use-ai-narrative';

// Chatbot (use-ai-chatbot)
export { useSendChatMessage, useChatHistory, useClearChatHistory } from './use-ai-chatbot';
export type { ChatMessage } from './use-ai-chatbot';

// Alerts (use-ai-alerts)
export { useAlertSummary } from './use-ai-alerts';
export type { AlertSummary } from './use-ai-alerts';
