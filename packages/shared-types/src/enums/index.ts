// ============================================
// MIZANO ERP - Enums (Single Source of Truth)
// Synced with Prisma schema.prisma
// ============================================

// --- User & Auth ---

export enum UserStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  SUSPENDED = 'SUSPENDED',
}

export enum DefaultRole {
  ADMIN = 'ADMIN',
  ACCOUNTANT = 'ACCOUNTANT',
  SALES_REP = 'SALES_REP',
  STORE_KEEPER = 'STORE_KEEPER',
  MANAGER = 'MANAGER',
}

export enum Permission {
  VIEW = 'view',
  CREATE = 'create',
  EDIT = 'edit',
  DELETE = 'delete',
  EXPORT = 'export',
}

// --- Accounting ---

export enum AccountType {
  ASSET = 'ASSET',
  LIABILITY = 'LIABILITY',
  EQUITY = 'EQUITY',
  REVENUE = 'REVENUE',
  INCOME = 'INCOME',
  EXPENSE = 'EXPENSE',
}

export enum RecurringFrequency {
  DAILY = 'DAILY',
  WEEKLY = 'WEEKLY',
  MONTHLY = 'MONTHLY',
  QUARTERLY = 'QUARTERLY',
  YEARLY = 'YEARLY',
}

export enum RecurringType {
  JOURNAL = 'JOURNAL',
  INVOICE = 'INVOICE',
  BILL = 'BILL',
  EXPENSE = 'EXPENSE',
}

// --- Sales ---

export enum QuoteStatus {
  DRAFT = 'DRAFT',
  SENT = 'SENT',
  ACCEPTED = 'ACCEPTED',
  INVOICED = 'INVOICED',
  DECLINED = 'DECLINED',
  EXPIRED = 'EXPIRED',
}

export enum InvoiceStatus {
  DRAFT = 'DRAFT',
  SENT = 'SENT',
  PARTIALLY_PAID = 'PARTIALLY_PAID',
  PAID = 'PAID',
  OVERDUE = 'OVERDUE',
  VOID = 'VOID',
}

export enum CreditNoteType {
  REFUND = 'REFUND',
  APPLY_TO_INVOICE = 'APPLY_TO_INVOICE',
}

export enum PaymentMode {
  CASH = 'CASH',
  BANK_TRANSFER = 'BANK_TRANSFER',
  CREDIT_CARD = 'CREDIT_CARD',
  DEBIT_CARD = 'DEBIT_CARD',
  CHEQUE = 'CHEQUE',
  ONLINE = 'ONLINE',
  OTHER = 'OTHER',
}

export enum ChallanType {
  SUPPLY = 'SUPPLY',
  JOB_WORK = 'JOB_WORK',
  SAMPLE = 'SAMPLE',
}

export enum ChallanStatus {
  DRAFT = 'DRAFT',
  ISSUED = 'ISSUED',
  RETURNED = 'RETURNED',
}

// --- Purchases ---

export enum BillStatus {
  DRAFT = 'DRAFT',
  PENDING = 'PENDING',
  OPEN = 'OPEN',
  PARTIALLY_PAID = 'PARTIALLY_PAID',
  PAID = 'PAID',
  OVERDUE = 'OVERDUE',
  VOID = 'VOID',
}

export enum ExpenseStatus {
  DRAFT = 'DRAFT',
  PENDING = 'PENDING',
  POSTED = 'POSTED',
  RECORDED = 'RECORDED',
  PAID = 'PAID',
  CANCELLED = 'CANCELLED',
}

// --- Inventory ---

export enum ItemType {
  GOODS = 'GOODS',
  SERVICE = 'SERVICE',
  DIGITAL = 'DIGITAL',
}

export enum AdjustmentType {
  INCREASE = 'INCREASE',
  DECREASE = 'DECREASE',
}

export enum AdjustmentReason {
  DAMAGED = 'DAMAGED',
  STOLEN = 'STOLEN',
  STOCKTAKE = 'STOCKTAKE',
  RETURNED = 'RETURNED',
  EXPIRED = 'EXPIRED',
  OTHER = 'OTHER',
}

export enum TransferStatus {
  PENDING = 'PENDING',
  IN_TRANSIT = 'IN_TRANSIT',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export enum PriceListType {
  PERCENTAGE = 'PERCENTAGE',
  FIXED = 'FIXED',
}

// --- Banking ---

export enum BankAccountType {
  BANK = 'BANK',
  CREDIT_CARD = 'CREDIT_CARD',
  PETTY_CASH = 'PETTY_CASH',
}

export enum BankTransactionType {
  DEPOSIT = 'DEPOSIT',
  WITHDRAWAL = 'WITHDRAWAL',
}

export enum ReconciliationStatus {
  PENDING = 'PENDING',
  MATCHED = 'MATCHED',
  CREATED = 'CREATED',
  RECONCILED = 'RECONCILED',
}

// --- HR & Payroll ---

export enum AttendanceStatus {
  PRESENT = 'PRESENT',
  ABSENT = 'ABSENT',
  LEAVE = 'LEAVE',
  HALF_DAY = 'HALF_DAY',
}

export enum PayrollStatus {
  DRAFT = 'DRAFT',
  PROCESSED = 'PROCESSED',
  PAID = 'PAID',
}

// --- Manufacturing ---

export enum WorkOrderStatus {
  DRAFT = 'DRAFT',
  IN_PROCESS = 'IN_PROCESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

// --- Projects ---

export enum BillingMethod {
  FIXED = 'FIXED',
  HOURLY = 'HOURLY',
  PROJECT_HOURLY = 'PROJECT_HOURLY',
  TASK_HOURLY = 'TASK_HOURLY',
  STAFF_HOURLY = 'STAFF_HOURLY',
}

export enum ProjectStatus {
  PLANNING = 'PLANNING',
  ACTIVE = 'ACTIVE',
  IN_PROGRESS = 'IN_PROGRESS',
  ON_HOLD = 'ON_HOLD',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export enum TaskStatus {
  TODO = 'TODO',
  IN_PROGRESS = 'IN_PROGRESS',
  REVIEW = 'REVIEW',
  DONE = 'DONE',
}

export enum TaskPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  URGENT = 'URGENT',
}

export enum TimesheetStatus {
  UNBILLED = 'UNBILLED',
  INVOICED = 'INVOICED',
}

// --- Tax ---

export enum TaxType {
  SALES = 'SALES',
  PURCHASES = 'PURCHASES',
  BOTH = 'BOTH',
}

export enum VATReturnStatus {
  DRAFT = 'DRAFT',
  CALCULATED = 'CALCULATED',
  GENERATED = 'GENERATED',
  SUBMITTED = 'SUBMITTED',
  FILED = 'FILED',
}

// --- CRM ---

export enum LeadStatus {
  NEW = 'NEW',
  CONTACTED = 'CONTACTED',
  QUALIFIED = 'QUALIFIED',
  JUNK = 'JUNK',
  WON = 'WON',
  LOST = 'LOST',
}

export enum LeadSource {
  WEBSITE = 'WEBSITE',
  FACEBOOK_ADS = 'FACEBOOK_ADS',
  GOOGLE_ADS = 'GOOGLE_ADS',
  REFERRAL = 'REFERRAL',
  COLD_CALL = 'COLD_CALL',
  OTHER = 'OTHER',
}

export enum DealStage {
  NEW = 'NEW',
  MEETING_SCHEDULED = 'MEETING_SCHEDULED',
  PROPOSAL_SENT = 'PROPOSAL_SENT',
  NEGOTIATION = 'NEGOTIATION',
  WON = 'WON',
  LOST = 'LOST',
}

export enum LeadTier {
  HOT = 'HOT',
  WARM = 'WARM',
  COOL = 'COOL',
  COLD = 'COLD',
}

export enum ActivityType {
  CALL = 'CALL',
  EMAIL = 'EMAIL',
  MEETING = 'MEETING',
  NOTE = 'NOTE',
  TASK = 'TASK',
}

// --- Assets ---

export enum AssetType {
  ELECTRONICS = 'ELECTRONICS',
  FURNITURE = 'FURNITURE',
  VEHICLES = 'VEHICLES',
  MACHINERY = 'MACHINERY',
  BUILDINGS = 'BUILDINGS',
  OTHER = 'OTHER',
}

export enum DepreciationMethod {
  STRAIGHT_LINE = 'STRAIGHT_LINE',
  DECLINING_BALANCE = 'DECLINING_BALANCE',
}

export enum AssetStatus {
  ACTIVE = 'ACTIVE',
  DISPOSED = 'DISPOSED',
  SOLD = 'SOLD',
  FULLY_DEPRECIATED = 'FULLY_DEPRECIATED',
}

// --- Audit ---

export enum AuditAction {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
}

// --- AI ---

export enum AiFeature {
  CATEGORIZATION = 'CATEGORIZATION',
  RECONCILIATION = 'RECONCILIATION',
  OCR_LAYOUT = 'OCR_LAYOUT',
  DEMAND_FORECAST = 'DEMAND_FORECAST',
  LEAD_SCORING = 'LEAD_SCORING',
  ANOMALY = 'ANOMALY',
  REORDER = 'REORDER',
  PAYMENT_PREDICTION = 'PAYMENT_PREDICTION',
  CASH_FLOW = 'CASH_FLOW',
  PATTERN_DETECTION = 'PATTERN_DETECTION',
  CHURN_PREDICTION = 'CHURN_PREDICTION',
  CLV_ANALYSIS = 'CLV_ANALYSIS',
  CROSS_SELL = 'CROSS_SELL',
  DYNAMIC_PRICING = 'DYNAMIC_PRICING',
  PIPELINE_FORECAST = 'PIPELINE_FORECAST',
  FRAUD_DETECTION = 'FRAUD_DETECTION',
  COMPLIANCE_MONITORING = 'COMPLIANCE_MONITORING',
  AUDIT_RISK = 'AUDIT_RISK',
  DOCUMENT_CLASSIFICATION = 'DOCUMENT_CLASSIFICATION',
  SENTIMENT_ANALYSIS = 'SENTIMENT_ANALYSIS',
  ENTITY_EXTRACTION = 'ENTITY_EXTRACTION',
  CONTRACT_ANALYSIS = 'CONTRACT_ANALYSIS',
  EMPLOYEE_ATTRITION = 'EMPLOYEE_ATTRITION',
  COMPENSATION_BENCHMARK = 'COMPENSATION_BENCHMARK',
  SKILLS_GAP = 'SKILLS_GAP',
  QUALITY_PREDICTION = 'QUALITY_PREDICTION',
  PREDICTIVE_MAINTENANCE = 'PREDICTIVE_MAINTENANCE',
  WORKFORCE_SCHEDULING = 'WORKFORCE_SCHEDULING',
  ROUTE_OPTIMIZATION = 'ROUTE_OPTIMIZATION',
  RESOURCE_OPTIMIZATION = 'RESOURCE_OPTIMIZATION',
  CHATBOT = 'CHATBOT',
  KNOWLEDGE_ASSISTANT = 'KNOWLEDGE_ASSISTANT',
  VOICE_COMMAND = 'VOICE_COMMAND',
}

export enum AiTrainingSource {
  USER = 'USER',
  SEED = 'SEED',
  CORRECTION = 'CORRECTION',
  OLLAMA = 'OLLAMA',
}

export enum AiModelStatus {
  ACTIVE = 'ACTIVE',
  TRAINING = 'TRAINING',
  RETIRED = 'RETIRED',
}

export enum AiFeedbackAction {
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
  CORRECTED = 'CORRECTED',
}

export enum AnomalyType {
  TRANSACTION = 'TRANSACTION',
  OVERTIME = 'OVERTIME',
  SPENDING = 'SPENDING',
  PAYROLL = 'PAYROLL',
  INVENTORY = 'INVENTORY',
  REVENUE = 'REVENUE',
}

export enum AnomalySeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export enum ReorderStatus {
  OK = 'OK',
  LOW_STOCK = 'LOW_STOCK',
  CRITICAL = 'CRITICAL',
  DEAD_STOCK = 'DEAD_STOCK',
}

export enum PatternStatus {
  DETECTED = 'DETECTED',
  CONFIRMED = 'CONFIRMED',
  CONVERTED = 'CONVERTED',
  DISMISSED = 'DISMISSED',
  STALE = 'STALE',
}

export enum SuggestionType {
  CREATE_RECURRING = 'CREATE_RECURRING',
  DUPLICATE_WARNING = 'DUPLICATE_WARNING',
  FREQUENCY_CHANGE = 'FREQUENCY_CHANGE',
}

export enum SuggestionStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  DISMISSED = 'DISMISSED',
}

export enum AlertCategory {
  FINANCIAL = 'FINANCIAL',
  COLLECTION = 'COLLECTION',
  INVENTORY = 'INVENTORY',
  COMPLIANCE = 'COMPLIANCE',
  HR = 'HR',
  CRM = 'CRM',
}

export enum AlertPriority {
  CRITICAL = 'CRITICAL',
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM',
  LOW = 'LOW',
}

export enum AlertSource {
  CASH_FLOW = 'CASH_FLOW',
  ANOMALY = 'ANOMALY',
  PAYMENT_PREDICTION = 'PAYMENT_PREDICTION',
  REORDER = 'REORDER',
  DEMAND_FORECAST = 'DEMAND_FORECAST',
  LEAD_SCORING = 'LEAD_SCORING',
  PATTERN_DETECTION = 'PATTERN_DETECTION',
  TAX_COMPLIANCE = 'TAX_COMPLIANCE',
  PAYROLL = 'PAYROLL',
}

// --- Deep Search ---

export enum DeepSearchStatus {
  PENDING = 'PENDING',
  SCRAPING = 'SCRAPING',
  ANALYZING = 'ANALYZING',
  GENERATING = 'GENERATING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export enum SuggestionCategory {
  FEATURE_GAP = 'FEATURE_GAP',
  PERFORMANCE_UX = 'PERFORMANCE_UX',
  AI_CAPABILITY = 'AI_CAPABILITY',
}

// --- Search ---

export enum SearchEntityType {
  CUSTOMER = 'customer',
  VENDOR = 'vendor',
  INVOICE = 'invoice',
  BILL = 'bill',
  ITEM = 'item',
  EMPLOYEE = 'employee',
  PROJECT = 'project',
  LEAD = 'lead',
  DEAL = 'deal',
  QUOTE = 'quote',
  EXPENSE = 'expense',
}
