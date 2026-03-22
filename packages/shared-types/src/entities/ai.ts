// ============================================
// AI Types - Insights, Alerts, Anomalies, Patterns,
// Training, Predictions, OCR, Fraud
// ============================================

import {
  AiFeature,
  AiTrainingSource,
  AiModelStatus,
  AiFeedbackAction,
  AnomalyType,
  AnomalySeverity,
  AlertCategory,
  AlertPriority,
  AlertSource,
  ReorderStatus,
  PatternStatus,
  SuggestionType,
  SuggestionStatus,
  RecurringFrequency,
  DeepSearchStatus,
  SuggestionCategory,
} from '../enums';
import { OrganizationEntity, PaginationQuery } from './base';

// --- AI Insight ---

export interface AIInsight extends OrganizationEntity {
  type: string;
  title: string;
  description: string;
  data?: Record<string, unknown> | null;
  severity: string;
  category?: AlertCategory | null;
  priority?: AlertPriority | null;
  aiSource?: AlertSource | null;
  sourceEntityType?: string | null;
  sourceEntityId?: string | null;
  actionUrl?: string | null;
  actionLabel?: string | null;
  expiresAt?: string | null;
  impact?: string | null;
  suggestedAction?: string | null;
  isRead: boolean;
  isDismissed: boolean;
  dismissedAt?: string | null;
  dismissedBy?: string | null;
  actionTakenAt?: string | null;
  actionTaken?: string | null;
  confidence?: number;
}

// --- Unified Alert ---

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
  byCategory: Record<string, number>;
  byPriority: Record<string, number>;
  criticalCount: number;
}

export interface AlertAggregationResult {
  created: number;
  updated: number;
  expired: number;
}

// --- Anomaly ---

export interface AiAnomaly extends OrganizationEntity {
  type: AnomalyType;
  severity: AnomalySeverity;
  entityType: string;
  entityId: string;
  value: string;
  expectedValue: string;
  zScore: string;
  description: string;
  isResolved: boolean;
  resolvedAt?: string | null;
  resolvedBy?: string | null;
}

export interface AnomalyQuery extends PaginationQuery {
  type?: AnomalyType;
  severity?: AnomalySeverity;
  isResolved?: boolean;
}

// --- AI Training Data ---

export interface AiTrainingData {
  id: string;
  feature: AiFeature;
  inputData: Record<string, unknown>;
  label: string;
  source: AiTrainingSource;
  organizationId: string;
  createdAt: string;
}

// --- AI Model ---

export interface AiModel extends OrganizationEntity {
  feature: AiFeature;
  version: number;
  accuracy: string;
  sampleCount: number;
  modelData: Record<string, unknown>;
  status: AiModelStatus;
  trainedAt?: string | null;
}

// --- AI Feedback ---

export interface AiFeedback {
  id: string;
  feature: AiFeature;
  predictionId?: string | null;
  aiSuggestion: Record<string, unknown>;
  userAction: AiFeedbackAction;
  userAnswer?: string | null;
  inputData: Record<string, unknown>;
  organizationId: string;
  createdAt: string;
}

export interface SubmitFeedbackRequest {
  feature: AiFeature;
  predictionId?: string;
  aiSuggestion: Record<string, unknown>;
  userAction: AiFeedbackAction;
  userAnswer?: string;
  inputData: Record<string, unknown>;
}

// --- AI Prediction ---

export interface AiPrediction {
  id: string;
  feature: AiFeature;
  inputHash: string;
  prediction: Record<string, unknown>;
  confidence: string;
  modelVersion: number;
  organizationId: string;
  createdAt: string;
}

// --- Reorder Analysis ---

export interface ItemReorderAnalysis extends OrganizationEntity {
  itemId: string;
  avgDailyDemand: string;
  demandStdDev: string;
  leadTimeDays: number;
  safetyStock: number;
  reorderPoint: number;
  economicOrderQty: number;
  status: ReorderStatus;
  lastSaleDate?: string | null;
  daysSinceLastSale?: number | null;
  calculatedAt: string;
}

// --- Cash Flow Forecast ---

export interface CashFlowForecast {
  id: string;
  forecastDate: string;
  openingBalance: string;
  expectedInflows: string;
  expectedOutflows: string;
  closingBalanceP10: string;
  closingBalanceP50: string;
  closingBalanceP90: string;
  lowCashAlert: boolean;
  negativeCashAlert: boolean;
  organizationId: string;
  createdAt: string;
}

// --- Item Demand Forecast ---

export interface ItemDemandForecast {
  id: string;
  itemId: string;
  forecastDate: string;
  predictedQuantity: string;
  lowerBound: string;
  upperBound: string;
  seasonalIndex: string;
  trendComponent: string;
  confidence: string;
  organizationId: string;
  createdAt: string;
}

// --- Transaction Pattern ---

export interface TransactionPattern extends OrganizationEntity {
  entityType: string;
  entityId?: string | null;
  entityName: string;
  amountCluster: string;
  amountVariance: string;
  frequency?: RecurringFrequency | null;
  frequencyDays?: number | null;
  frequencyStdDev?: string | null;
  occurrenceCount: number;
  firstOccurrence: string;
  lastOccurrence: string;
  descriptionPattern?: string | null;
  descriptionHash?: string | null;
  confidence: string;
  status: PatternStatus;
}

export interface PatternOccurrence {
  id: string;
  patternId: string;
  sourceType: string;
  sourceId: string;
  amount: string;
  date: string;
  description?: string | null;
  organizationId: string;
  createdAt: string;
}

export interface PatternSuggestion extends OrganizationEntity {
  patternId: string;
  suggestionType: SuggestionType;
  suggestedFrequency?: RecurringFrequency | null;
  suggestedAmount: string;
  suggestedEntityId?: string | null;
  confidence: string;
  status: SuggestionStatus;
  recurringProfileId?: string | null;
  dismissedAt?: string | null;
  dismissedReason?: string | null;
}

// --- Reconciliation Pattern ---

export interface ReconciliationPattern extends OrganizationEntity {
  descriptionHash: string;
  pattern: string;
  matchedEntity: string;
  matchedEntityId?: string | null;
  accountId?: string | null;
  vendorId?: string | null;
  confidence: string;
  matchCount: number;
  lastMatchedAt: string;
}

// --- OCR / VLM Types ---

export interface VlmLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
  taxRate?: number;
}

export interface VlmConfidence {
  overall: number;
  vendorName: number;
  invoiceDate: number;
  totalAmount: number;
  lineItems: number;
}

export interface VlmAccountingEntry {
  debitAccount: string;
  creditAccount: string;
  taxAccount?: string;
}

export interface VlmExtractionResult {
  vendorName?: string;
  vendorTaxId?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  dueDate?: string;
  currency?: string;
  subtotal?: number;
  taxAmount?: number;
  totalAmount?: number;
  items: VlmLineItem[];
  confidence: VlmConfidence;
  accountingEntry?: VlmAccountingEntry;
  processingTimeMs?: number;
}

// --- Vendor OCR Layout ---

export interface VendorOcrLayout extends OrganizationEntity {
  vendorId: string;
  fieldPositions: Record<string, unknown>;
  sampleCount: number;
  lastUsedAt: string;
}

// --- Fraud Alert ---

export interface FraudSignal {
  signal: string;
  score: number;
  triggered: boolean;
  details: string;
}

export interface FraudAlert extends OrganizationEntity {
  entityType: string;
  entityId: string;
  fraudScore: string;
  signals: FraudSignal[];
  velocityCheck: boolean;
  amountAnomaly: boolean;
  timeAnomaly: boolean;
  duplicateCheck: boolean;
  isConfirmedFraud: boolean;
  isResolved: boolean;
  resolvedAt?: string | null;
  resolvedBy?: string | null;
}

// --- Customer AI Profile ---

export interface CustomerAiProfile extends OrganizationEntity {
  customerId: string;
  churnRisk: string;
  churnFactors: unknown[];
  lifetimeValue: string;
  clvSegment?: string | null;
  rfmRecency?: number | null;
  rfmFrequency?: number | null;
  rfmMonetary?: string | null;
  lastPurchaseDate?: string | null;
  crossSellItems: unknown[];
  upsellItems: unknown[];
  calculatedAt: string;
}

// --- Employee AI Profile ---

export interface EmployeeAiProfile extends OrganizationEntity {
  employeeId: string;
  attritionRisk: string;
  attritionFactors: unknown[];
  compensationIndex?: string | null;
  skillsProfile: Record<string, unknown>;
  skillsGaps: unknown[];
  calculatedAt: string;
}

// --- Asset Maintenance Prediction ---

export interface AssetMaintenancePrediction {
  id: string;
  assetId: string;
  predictedFailureDate?: string | null;
  riskScore: string;
  healthScore: string;
  factors: unknown[];
  recommendedAction?: string | null;
  organizationId: string;
  calculatedAt: string;
}

// --- Categorization ---

export interface CategorizationPrediction {
  accountId: string | null;
  accountCode: string;
  accountName: string;
  confidence: number;
  predictionId: string;
  alternatives: {
    accountId: string;
    accountCode: string;
    accountName: string;
    confidence: number;
  }[];
  predictionMethod: 'ML' | 'RULE_BASED' | 'HYBRID';
}

// --- Reconciliation Suggestion ---

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

// --- Category Suggestion ---

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

// --- Document Classification ---

export interface ClassificationResult {
  category: string;
  confidence: number;
  scores: { category: string; score: number }[];
}

// --- Entity Extraction ---

export interface ExtractedEntity {
  text: string;
  type: string;
  start?: number;
  end?: number;
}

export interface ExtractionResult {
  people: ExtractedEntity[];
  organizations: ExtractedEntity[];
  dates: ExtractedEntity[];
  places: ExtractedEntity[];
  money: ExtractedEntity[];
  emails: ExtractedEntity[];
  phones: ExtractedEntity[];
}

// --- Chatbot ---

export interface ChatResponse {
  intent: string;
  confidence: number;
  response: string;
  data?: unknown;
  suggestions: string[];
}

// --- Deep Search ---

export interface DeepSearchJob extends OrganizationEntity {
  status: DeepSearchStatus;
  progress: number;
  progressMessage?: string | null;
  webSourcesScraped: number;
  codeFilesAnalyzed: number;
  suggestionsCount: number;
  error?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
}

export interface DeepSearchSuggestion {
  id: string;
  category: SuggestionCategory;
  title: string;
  description: string;
  impact: string;
  effort: string;
  priority: number;
  tags: string[];
  sources?: unknown;
  prompt: string;
  status: string;
  createdAt: string;
  jobId: string;
  organizationId: string;
}
