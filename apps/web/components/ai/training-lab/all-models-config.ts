import type { AiFeature } from '@/lib/hooks/use-ai-infrastructure';

export type ModelCategory =
  | 'Core Financial'
  | 'Sales & CRM'
  | 'Security & Compliance'
  | 'NLP & Documents'
  | 'HR & Workforce'
  | 'Operations'
  | 'Chat & Voice';

export interface AiModelConfig {
  feature: AiFeature;
  name: string;
  description: string;
  category: ModelCategory;
  icon: string;
  color: string;
  trainEndpoint: string | null;
  hasDirectTrain: boolean;
}

export const AI_MODELS: AiModelConfig[] = [
  // ─── Core Financial (10) ─────────────────────────────────
  { feature: 'CATEGORIZATION', name: 'Transaction Categorizer', description: 'Naive Bayes classifier for auto-categorizing expenses by account', category: 'Core Financial', icon: 'FileText', color: 'blue', trainEndpoint: '/ai/categorization/train', hasDirectTrain: true },
  { feature: 'RECONCILIATION', name: 'Bank Reconciliation', description: 'Pattern-based matching of bank transactions to invoices and bills', category: 'Core Financial', icon: 'ArrowLeftRight', color: 'blue', trainEndpoint: null, hasDirectTrain: false },
  { feature: 'OCR_LAYOUT', name: 'OCR Layout Learning', description: 'Learns vendor-specific invoice layouts for better OCR extraction', category: 'Core Financial', icon: 'ScanLine', color: 'blue', trainEndpoint: null, hasDirectTrain: false },
  { feature: 'DEMAND_FORECAST', name: 'Demand Forecasting', description: 'Holt-Winters time-series forecasting for inventory demand', category: 'Core Financial', icon: 'TrendingUp', color: 'blue', trainEndpoint: null, hasDirectTrain: false },
  { feature: 'LEAD_SCORING', name: 'Lead Scoring ML', description: 'Logistic regression model scoring leads 0-100', category: 'Core Financial', icon: 'Target', color: 'orange', trainEndpoint: '/ai/lead-scoring/train', hasDirectTrain: true },
  { feature: 'ANOMALY', name: 'Anomaly Detection', description: 'Ensemble Z-Score + IQR + Isolation Forest for transaction anomalies', category: 'Core Financial', icon: 'AlertTriangle', color: 'red', trainEndpoint: null, hasDirectTrain: false },
  { feature: 'REORDER', name: 'Reorder Points', description: 'Statistical reorder point and safety stock calculations', category: 'Core Financial', icon: 'Package', color: 'teal', trainEndpoint: null, hasDirectTrain: false },
  { feature: 'PAYMENT_PREDICTION', name: 'Payment Prediction', description: 'Predicts invoice payment timing from customer history', category: 'Core Financial', icon: 'Clock', color: 'green', trainEndpoint: null, hasDirectTrain: false },
  { feature: 'CASH_FLOW', name: 'Cash Flow Forecasting', description: 'Monte Carlo simulation for probabilistic cash flow prediction', category: 'Core Financial', icon: 'DollarSign', color: 'green', trainEndpoint: null, hasDirectTrain: false },
  { feature: 'PATTERN_DETECTION', name: 'Pattern Detection', description: 'Identifies recurring transaction patterns and subscription detection', category: 'Core Financial', icon: 'Search', color: 'purple', trainEndpoint: null, hasDirectTrain: false },

  // ─── Sales & CRM (5) ────────────────────────────────────
  { feature: 'CHURN_PREDICTION', name: 'Churn Prediction', description: 'Predicts customer churn risk from payment and engagement data', category: 'Sales & CRM', icon: 'UserMinus', color: 'red', trainEndpoint: '/ai/churn/train', hasDirectTrain: true },
  { feature: 'CLV_ANALYSIS', name: 'Customer Lifetime Value', description: 'RFM analysis and CLV segmentation (HIGH/MEDIUM/LOW)', category: 'Sales & CRM', icon: 'Crown', color: 'amber', trainEndpoint: null, hasDirectTrain: false },
  { feature: 'CROSS_SELL', name: 'Cross-Sell Recommendations', description: 'Product recommendations based on customer purchase patterns', category: 'Sales & CRM', icon: 'ShoppingCart', color: 'amber', trainEndpoint: null, hasDirectTrain: false },
  { feature: 'DYNAMIC_PRICING', name: 'Dynamic Pricing', description: 'Demand-based pricing recommendations', category: 'Sales & CRM', icon: 'Tag', color: 'amber', trainEndpoint: null, hasDirectTrain: false },
  { feature: 'PIPELINE_FORECAST', name: 'Pipeline Forecast', description: 'Deal win probability based on stage, activity, and history', category: 'Sales & CRM', icon: 'Kanban', color: 'amber', trainEndpoint: null, hasDirectTrain: false },

  // ─── Security & Compliance (3) ──────────────────────────
  { feature: 'FRAUD_DETECTION', name: 'Fraud Detection', description: 'Multi-signal fraud scoring: velocity, amount, timing, duplicates', category: 'Security & Compliance', icon: 'ShieldAlert', color: 'red', trainEndpoint: null, hasDirectTrain: false },
  { feature: 'COMPLIANCE_MONITORING', name: 'Compliance Monitoring', description: 'Checks approval chains, attachments, and tax compliance', category: 'Security & Compliance', icon: 'ShieldCheck', color: 'emerald', trainEndpoint: null, hasDirectTrain: false },
  { feature: 'AUDIT_RISK', name: 'Audit Risk Scoring', description: 'ML model scoring audit risk for financial entities', category: 'Security & Compliance', icon: 'FileWarning', color: 'yellow', trainEndpoint: '/ai/audit-risk/train', hasDirectTrain: true },

  // ─── NLP & Documents (4) ────────────────────────────────
  { feature: 'DOCUMENT_CLASSIFICATION', name: 'Document Classification', description: 'Classifies documents as Bill, Invoice, Receipt, or Other', category: 'NLP & Documents', icon: 'FileType', color: 'purple', trainEndpoint: '/ai/documents/train', hasDirectTrain: true },
  { feature: 'SENTIMENT_ANALYSIS', name: 'Sentiment Analysis', description: 'Analyzes text sentiment (Positive/Negative/Neutral)', category: 'NLP & Documents', icon: 'MessageSquare', color: 'pink', trainEndpoint: null, hasDirectTrain: false },
  { feature: 'ENTITY_EXTRACTION', name: 'Entity Extraction', description: 'Extracts persons, organizations, amounts, dates from text', category: 'NLP & Documents', icon: 'Braces', color: 'purple', trainEndpoint: null, hasDirectTrain: false },
  { feature: 'CONTRACT_ANALYSIS', name: 'Contract Analysis', description: 'Classifies contract clauses as Favorable/Risky/Neutral', category: 'NLP & Documents', icon: 'FileSearch', color: 'purple', trainEndpoint: null, hasDirectTrain: false },

  // ─── HR & Workforce (3) ─────────────────────────────────
  { feature: 'EMPLOYEE_ATTRITION', name: 'Employee Attrition', description: 'Predicts employee flight risk from attendance and performance', category: 'HR & Workforce', icon: 'UserX', color: 'pink', trainEndpoint: '/ai/attrition/train', hasDirectTrain: true },
  { feature: 'COMPENSATION_BENCHMARK', name: 'Compensation Benchmark', description: 'Benchmarks salaries against market rates by role and location', category: 'HR & Workforce', icon: 'BadgeDollarSign', color: 'pink', trainEndpoint: null, hasDirectTrain: false },
  { feature: 'SKILLS_GAP', name: 'Skills Gap Analysis', description: 'Identifies skill gaps between current and required competencies', category: 'HR & Workforce', icon: 'GraduationCap', color: 'pink', trainEndpoint: null, hasDirectTrain: false },

  // ─── Operations (5) ─────────────────────────────────────
  { feature: 'QUALITY_PREDICTION', name: 'Quality Prediction', description: 'Predicts manufacturing quality outcomes for work orders', category: 'Operations', icon: 'CheckCircle', color: 'green', trainEndpoint: '/ai/quality/train', hasDirectTrain: true },
  { feature: 'PREDICTIVE_MAINTENANCE', name: 'Predictive Maintenance', description: 'Predicts equipment maintenance needs from sensor data', category: 'Operations', icon: 'Wrench', color: 'slate', trainEndpoint: null, hasDirectTrain: false },
  { feature: 'WORKFORCE_SCHEDULING', name: 'Workforce Scheduling', description: 'Optimizes staffing levels based on demand patterns', category: 'Operations', icon: 'CalendarClock', color: 'slate', trainEndpoint: null, hasDirectTrain: false },
  { feature: 'ROUTE_OPTIMIZATION', name: 'Route Optimization', description: 'Optimizes delivery routes by urgency, weight, and location', category: 'Operations', icon: 'Route', color: 'slate', trainEndpoint: null, hasDirectTrain: false },
  { feature: 'RESOURCE_OPTIMIZATION', name: 'Resource Optimization', description: 'Optimizes resource allocation (space, vehicles, staff, budget)', category: 'Operations', icon: 'Settings', color: 'slate', trainEndpoint: null, hasDirectTrain: false },

  // ─── Chat & Voice (3) ───────────────────────────────────
  { feature: 'CHATBOT', name: 'AI Chatbot', description: 'Intent classification for financial Q&A chatbot', category: 'Chat & Voice', icon: 'Bot', color: 'violet', trainEndpoint: '/ai/chatbot/train', hasDirectTrain: true },
  { feature: 'KNOWLEDGE_ASSISTANT', name: 'Knowledge Assistant', description: 'Categorizes questions into accounting, tax, HR, etc.', category: 'Chat & Voice', icon: 'BookOpen', color: 'violet', trainEndpoint: null, hasDirectTrain: false },
  { feature: 'VOICE_COMMAND', name: 'Voice Command', description: 'Maps voice transcriptions to system intents', category: 'Chat & Voice', icon: 'Mic', color: 'violet', trainEndpoint: null, hasDirectTrain: false },
];

export const MODEL_CATEGORIES: ModelCategory[] = [
  'Core Financial',
  'Sales & CRM',
  'Security & Compliance',
  'NLP & Documents',
  'HR & Workforce',
  'Operations',
  'Chat & Voice',
];

export const CATEGORY_ICONS: Record<ModelCategory, string> = {
  'Core Financial': 'Landmark',
  'Sales & CRM': 'TrendingUp',
  'Security & Compliance': 'Shield',
  'NLP & Documents': 'FileText',
  'HR & Workforce': 'Users',
  'Operations': 'Settings',
  'Chat & Voice': 'MessageSquare',
};

export const CATEGORY_COLORS: Record<ModelCategory, string> = {
  'Core Financial': 'blue',
  'Sales & CRM': 'amber',
  'Security & Compliance': 'red',
  'NLP & Documents': 'purple',
  'HR & Workforce': 'pink',
  'Operations': 'slate',
  'Chat & Voice': 'violet',
};

export function getModelsByCategory(category: ModelCategory): AiModelConfig[] {
  return AI_MODELS.filter((m) => m.category === category);
}

export function getModelByFeature(feature: AiFeature): AiModelConfig | undefined {
  return AI_MODELS.find((m) => m.feature === feature);
}
