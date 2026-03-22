-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'INCOME', 'EXPENSE');

-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'INVOICED', 'DECLINED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'SENT', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'VOID');

-- CreateEnum
CREATE TYPE "BillStatus" AS ENUM ('DRAFT', 'PENDING', 'OPEN', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'VOID');

-- CreateEnum
CREATE TYPE "ExpenseStatus" AS ENUM ('DRAFT', 'PENDING', 'POSTED', 'RECORDED', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentMode" AS ENUM ('CASH', 'BANK_TRANSFER', 'CREDIT_CARD', 'DEBIT_CARD', 'CHEQUE', 'ONLINE', 'OTHER');

-- CreateEnum
CREATE TYPE "ItemType" AS ENUM ('GOODS', 'SERVICE', 'DIGITAL');

-- CreateEnum
CREATE TYPE "AdjustmentType" AS ENUM ('INCREASE', 'DECREASE');

-- CreateEnum
CREATE TYPE "AdjustmentReason" AS ENUM ('DAMAGED', 'STOLEN', 'STOCKTAKE', 'RETURNED', 'EXPIRED', 'OTHER');

-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('PENDING', 'IN_TRANSIT', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BankAccountType" AS ENUM ('BANK', 'CREDIT_CARD', 'PETTY_CASH');

-- CreateEnum
CREATE TYPE "BankTransactionType" AS ENUM ('DEPOSIT', 'WITHDRAWAL');

-- CreateEnum
CREATE TYPE "ReconciliationStatus" AS ENUM ('PENDING', 'MATCHED', 'CREATED', 'RECONCILED');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'LEAVE', 'HALF_DAY');

-- CreateEnum
CREATE TYPE "PayrollStatus" AS ENUM ('DRAFT', 'PROCESSED', 'PAID');

-- CreateEnum
CREATE TYPE "WorkOrderStatus" AS ENUM ('DRAFT', 'IN_PROCESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BillingMethod" AS ENUM ('FIXED', 'HOURLY', 'PROJECT_HOURLY', 'TASK_HOURLY', 'STAFF_HOURLY');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('PLANNING', 'ACTIVE', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TimesheetStatus" AS ENUM ('UNBILLED', 'INVOICED');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'REVIEW', 'DONE');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "VATReturnStatus" AS ENUM ('DRAFT', 'CALCULATED', 'GENERATED', 'SUBMITTED', 'FILED');

-- CreateEnum
CREATE TYPE "TaxType" AS ENUM ('SALES', 'PURCHASES', 'BOTH');

-- CreateEnum
CREATE TYPE "RecurringFrequency" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'CONTACTED', 'QUALIFIED', 'JUNK', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "LeadSource" AS ENUM ('WEBSITE', 'FACEBOOK_ADS', 'GOOGLE_ADS', 'REFERRAL', 'COLD_CALL', 'OTHER');

-- CreateEnum
CREATE TYPE "DealStage" AS ENUM ('NEW', 'MEETING_SCHEDULED', 'PROPOSAL_SENT', 'NEGOTIATION', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE');

-- CreateEnum
CREATE TYPE "DepreciationMethod" AS ENUM ('STRAIGHT_LINE', 'DECLINING_BALANCE');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('ACTIVE', 'DISPOSED', 'SOLD', 'FULLY_DEPRECIATED');

-- CreateEnum
CREATE TYPE "CreditNoteType" AS ENUM ('REFUND', 'APPLY_TO_INVOICE');

-- CreateEnum
CREATE TYPE "PriceListType" AS ENUM ('PERCENTAGE', 'FIXED');

-- CreateEnum
CREATE TYPE "AiFeature" AS ENUM ('CATEGORIZATION', 'RECONCILIATION', 'OCR_LAYOUT', 'DEMAND_FORECAST', 'LEAD_SCORING', 'ANOMALY', 'REORDER', 'PAYMENT_PREDICTION', 'CASH_FLOW', 'PATTERN_DETECTION', 'CHURN_PREDICTION', 'CLV_ANALYSIS', 'CROSS_SELL', 'DYNAMIC_PRICING', 'PIPELINE_FORECAST', 'FRAUD_DETECTION', 'COMPLIANCE_MONITORING', 'AUDIT_RISK', 'DOCUMENT_CLASSIFICATION', 'SENTIMENT_ANALYSIS', 'ENTITY_EXTRACTION', 'CONTRACT_ANALYSIS', 'EMPLOYEE_ATTRITION', 'COMPENSATION_BENCHMARK', 'SKILLS_GAP', 'QUALITY_PREDICTION', 'PREDICTIVE_MAINTENANCE', 'WORKFORCE_SCHEDULING', 'ROUTE_OPTIMIZATION', 'RESOURCE_OPTIMIZATION', 'CHATBOT', 'KNOWLEDGE_ASSISTANT', 'VOICE_COMMAND');

-- CreateEnum
CREATE TYPE "LeadTier" AS ENUM ('HOT', 'WARM', 'COOL', 'COLD');

-- CreateEnum
CREATE TYPE "AiTrainingSource" AS ENUM ('USER', 'SEED', 'CORRECTION');

-- CreateEnum
CREATE TYPE "AiModelStatus" AS ENUM ('ACTIVE', 'TRAINING', 'RETIRED');

-- CreateEnum
CREATE TYPE "AiFeedbackAction" AS ENUM ('ACCEPTED', 'REJECTED', 'CORRECTED');

-- CreateEnum
CREATE TYPE "AnomalyType" AS ENUM ('TRANSACTION', 'OVERTIME', 'SPENDING', 'PAYROLL', 'INVENTORY', 'REVENUE');

-- CreateEnum
CREATE TYPE "AnomalySeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ReorderStatus" AS ENUM ('OK', 'LOW_STOCK', 'CRITICAL', 'DEAD_STOCK');

-- CreateEnum
CREATE TYPE "PatternStatus" AS ENUM ('DETECTED', 'CONFIRMED', 'CONVERTED', 'DISMISSED', 'STALE');

-- CreateEnum
CREATE TYPE "SuggestionType" AS ENUM ('CREATE_RECURRING', 'DUPLICATE_WARNING', 'FREQUENCY_CHANGE');

-- CreateEnum
CREATE TYPE "SuggestionStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "AlertCategory" AS ENUM ('FINANCIAL', 'COLLECTION', 'INVENTORY', 'COMPLIANCE', 'HR', 'CRM');

-- CreateEnum
CREATE TYPE "AlertPriority" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "AlertSource" AS ENUM ('CASH_FLOW', 'ANOMALY', 'PAYMENT_PREDICTION', 'REORDER', 'DEMAND_FORECAST', 'LEAD_SCORING', 'PATTERN_DETECTION', 'TAX_COMPLIANCE', 'PAYROLL');

-- CreateEnum
CREATE TYPE "AssetType" AS ENUM ('ELECTRONICS', 'FURNITURE', 'VEHICLES', 'MACHINERY', 'BUILDINGS', 'OTHER');

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('CALL', 'EMAIL', 'MEETING', 'NOTE', 'TASK');

-- CreateEnum
CREATE TYPE "ChallanType" AS ENUM ('SUPPLY', 'JOB_WORK', 'SAMPLE');

-- CreateEnum
CREATE TYPE "ChallanStatus" AS ENUM ('DRAFT', 'ISSUED', 'RETURNED');

-- CreateEnum
CREATE TYPE "RecurringType" AS ENUM ('JOURNAL', 'INVOICE', 'BILL', 'EXPENSE');

-- CreateEnum
CREATE TYPE "DeepSearchStatus" AS ENUM ('PENDING', 'SCRAPING', 'ANALYZING', 'GENERATING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "SuggestionCategory" AS ENUM ('FEATURE_GAP', 'PERFORMANCE_UX', 'AI_CAPABILITY');

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "city" TEXT,
    "country" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "taxId" TEXT,
    "lockDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "defaultArAccountId" TEXT,
    "defaultRevenueAccountId" TEXT,
    "defaultVatPayableAccountId" TEXT,
    "defaultApAccountId" TEXT,
    "defaultVatReceivableAccountId" TEXT,
    "defaultBankAccountId" TEXT,
    "defaultCashAccountId" TEXT,
    "defaultSalesReturnsAccountId" TEXT,
    "logoUrl" TEXT,
    "primaryColor" TEXT DEFAULT '#3B82F6',
    "companyAddress" TEXT,
    "bankDetails" TEXT,
    "footerText" TEXT,
    "smtpHost" TEXT,
    "smtpPort" INTEGER,
    "smtpUser" TEXT,
    "smtpPassword" TEXT,
    "smtpFromEmail" TEXT,
    "smtpFromName" TEXT,
    "baseCurrency" TEXT NOT NULL DEFAULT 'SAR',
    "website" TEXT,
    "taxRegistrationNumber" TEXT,
    "industry" TEXT DEFAULT 'other',
    "fiscalYearStartMonth" INTEGER NOT NULL DEFAULT 1,
    "defaultPaymentTermsDays" INTEGER NOT NULL DEFAULT 30,
    "defaultTaxRateId" TEXT,
    "invoicePrefix" TEXT NOT NULL DEFAULT 'INV-',
    "invoiceNextNumber" INTEGER NOT NULL DEFAULT 1,
    "invoiceDefaultNotes" TEXT,
    "invoiceDefaultTerms" TEXT,
    "invoiceAutoSend" BOOLEAN NOT NULL DEFAULT false,
    "quotePrefix" TEXT NOT NULL DEFAULT 'QT-',
    "quoteNextNumber" INTEGER NOT NULL DEFAULT 1,
    "billPrefix" TEXT NOT NULL DEFAULT 'BILL-',
    "billNextNumber" INTEGER NOT NULL DEFAULT 1,
    "defaultValuationMethod" TEXT NOT NULL DEFAULT 'FIFO',
    "enableMultiWarehouse" BOOLEAN NOT NULL DEFAULT false,
    "enableBundles" BOOLEAN NOT NULL DEFAULT false,
    "aiCategorizationEnabled" BOOLEAN NOT NULL DEFAULT true,
    "aiReconciliationEnabled" BOOLEAN NOT NULL DEFAULT true,
    "aiOcrEnabled" BOOLEAN NOT NULL DEFAULT true,
    "aiForecastingEnabled" BOOLEAN NOT NULL DEFAULT true,
    "aiAnomalyEnabled" BOOLEAN NOT NULL DEFAULT true,
    "aiLeadScoringEnabled" BOOLEAN NOT NULL DEFAULT true,
    "aiRetrainingFrequency" TEXT NOT NULL DEFAULT 'weekly',
    "anomalySensitivity" INTEGER NOT NULL DEFAULT 3,
    "dateFormat" TEXT NOT NULL DEFAULT 'DD/MM/YYYY',
    "numberFormat" TEXT NOT NULL DEFAULT '1,000.00',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Riyadh',
    "onboardingCompleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "refreshToken" TEXT,
    "roleId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_preferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tourProgress" JSONB,
    "tourDismissed" TEXT[],
    "lastTourSeenAt" TIMESTAMP(3),
    "theme" TEXT DEFAULT 'light',
    "sidebarCollapsed" BOOLEAN NOT NULL DEFAULT false,
    "dashboardLayout" JSONB,
    "notificationPrefs" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "actions" TEXT[],

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AccountType" NOT NULL,
    "subType" TEXT,
    "parentId" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "description" TEXT,
    "openingBalance" DECIMAL(19,4) DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journals" (
    "id" TEXT NOT NULL,
    "journalNumber" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "isPosted" BOOLEAN NOT NULL DEFAULT true,
    "reversalOfId" TEXT,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "journals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_lines" (
    "id" TEXT NOT NULL,
    "journalId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "debit" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "credit" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "description" TEXT,

    CONSTRAINT "journal_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recurring_profiles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "RecurringType",
    "frequency" "RecurringFrequency" NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "nextRunDate" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "autoPost" BOOLEAN NOT NULL DEFAULT false,
    "autoSend" BOOLEAN NOT NULL DEFAULT false,
    "templateData" JSONB NOT NULL,
    "entityType" TEXT NOT NULL,
    "executionCount" INTEGER NOT NULL DEFAULT 0,
    "lastExecutedAt" TIMESTAMP(3),
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "recurring_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "taxId" TEXT,
    "address" TEXT,
    "city" TEXT,
    "country" TEXT,
    "creditLimit" DECIMAL(19,4),
    "billingStreet" TEXT,
    "billingCity" TEXT,
    "billingState" TEXT,
    "billingPostalCode" TEXT,
    "billingCountry" TEXT,
    "shippingStreet" TEXT,
    "shippingCity" TEXT,
    "shippingState" TEXT,
    "shippingPostalCode" TEXT,
    "shippingCountry" TEXT,
    "paymentTerms" INTEGER NOT NULL DEFAULT 0,
    "priceListId" TEXT,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotes" (
    "id" TEXT NOT NULL,
    "quoteNumber" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "expiryDate" TIMESTAMP(3) NOT NULL,
    "status" "QuoteStatus" NOT NULL DEFAULT 'DRAFT',
    "subtotal" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "discountAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "discount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "grandTotal" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "currencyCode" TEXT,
    "notes" TEXT,
    "terms" TEXT,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_lines" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "itemId" TEXT,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(19,4) NOT NULL,
    "rate" DECIMAL(19,4) NOT NULL,
    "discount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "taxRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "amount" DECIMAL(19,4) NOT NULL DEFAULT 0,

    CONSTRAINT "quote_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "quoteId" TEXT,
    "projectId" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "issueDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "subtotal" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "discountAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "shippingAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "grandTotal" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "total" DECIMAL(19,4),
    "balanceDue" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "currencyCode" TEXT,
    "exchangeRate" DECIMAL(19,6),
    "notes" TEXT,
    "terms" TEXT,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_lines" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "itemId" TEXT,
    "taxRateId" TEXT,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(19,4) NOT NULL,
    "rate" DECIMAL(19,4) NOT NULL,
    "unitPrice" DECIMAL(19,4),
    "discount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "taxRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "amount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_notes" (
    "id" TEXT NOT NULL,
    "creditNoteNumber" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "issueDate" TIMESTAMP(3),
    "reason" TEXT NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "total" DECIMAL(19,4),
    "type" "CreditNoteType" NOT NULL,
    "appliedToInvoiceId" TEXT,
    "refundedAt" TIMESTAMP(3),
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "credit_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments_received" (
    "id" TEXT NOT NULL,
    "paymentNumber" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "paymentMode" "PaymentMode" NOT NULL,
    "depositToAccountId" TEXT NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "payments_received_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_allocations" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,

    CONSTRAINT "payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendors" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "taxId" TEXT,
    "address" TEXT,
    "city" TEXT,
    "country" TEXT,
    "bankName" TEXT,
    "bankAccount" TEXT,
    "billingStreet" TEXT,
    "billingCity" TEXT,
    "billingState" TEXT,
    "billingPostalCode" TEXT,
    "billingCountry" TEXT,
    "paymentTerms" INTEGER NOT NULL DEFAULT 0,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "vendors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "accountId" TEXT NOT NULL,
    "vendorId" TEXT,
    "amount" DECIMAL(19,4) NOT NULL,
    "taxAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "taxInclusive" BOOLEAN NOT NULL DEFAULT false,
    "paidThroughAccountId" TEXT NOT NULL,
    "description" TEXT,
    "reference" TEXT,
    "receiptUrl" TEXT,
    "status" "ExpenseStatus" NOT NULL DEFAULT 'RECORDED',
    "projectId" TEXT,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bills" (
    "id" TEXT NOT NULL,
    "billNumber" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "billDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" "BillStatus" NOT NULL DEFAULT 'DRAFT',
    "subtotal" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "grandTotal" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "total" DECIMAL(19,4),
    "balanceDue" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "currencyCode" TEXT,
    "exchangeRate" DECIMAL(19,6),
    "reference" TEXT,
    "notes" TEXT,
    "projectId" TEXT,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "bills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bill_lines" (
    "id" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "itemId" TEXT,
    "accountId" TEXT,
    "taxRateId" TEXT,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(19,4) NOT NULL,
    "rate" DECIMAL(19,4) NOT NULL,
    "taxRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "amount" DECIMAL(19,4) NOT NULL DEFAULT 0,

    CONSTRAINT "bill_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_credits" (
    "id" TEXT NOT NULL,
    "creditNumber" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "appliedToBillId" TEXT,
    "refundedAt" TIMESTAMP(3),
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "vendor_credits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments_made" (
    "id" TEXT NOT NULL,
    "paymentNumber" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "paymentMode" "PaymentMode" NOT NULL,
    "paidFromAccountId" TEXT NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "payments_made_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bill_allocations" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,

    CONSTRAINT "bill_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "items" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "type" "ItemType" NOT NULL,
    "unit" TEXT,
    "sellingPrice" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "salesPrice" DECIMAL(19,4),
    "salesAccountId" TEXT,
    "costPrice" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "purchasePrice" DECIMAL(19,4),
    "purchaseAccountId" TEXT,
    "inventoryAccountId" TEXT,
    "description" TEXT,
    "taxRate" DECIMAL(5,2),
    "trackInventory" BOOLEAN NOT NULL DEFAULT true,
    "reorderPoint" INTEGER,
    "reorderLevel" INTEGER,
    "currentStock" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "composite_items" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "sellingPrice" DECIMAL(19,4) NOT NULL,
    "description" TEXT,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "composite_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "composite_item_components" (
    "id" TEXT NOT NULL,
    "compositeItemId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "composite_item_components_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouses" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "street" TEXT,
    "city" TEXT,
    "state" TEXT,
    "postalCode" TEXT,
    "country" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_movements" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "quantity" DECIMAL(19,4) NOT NULL,
    "type" TEXT NOT NULL,
    "movementType" TEXT,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "reference" TEXT,
    "costPerUnit" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_levels" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "quantity" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_levels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_cost_layers" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "quantity" DECIMAL(19,4) NOT NULL,
    "originalQty" DECIMAL(19,4) NOT NULL,
    "costPerUnit" DECIMAL(19,4) NOT NULL,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_cost_layers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_adjustments" (
    "id" TEXT NOT NULL,
    "adjustmentNumber" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "type" "AdjustmentType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "reason" "AdjustmentReason" NOT NULL,
    "accountId" TEXT NOT NULL,
    "notes" TEXT,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_transfers" (
    "id" TEXT NOT NULL,
    "transferNumber" TEXT NOT NULL,
    "fromWarehouseId" TEXT NOT NULL,
    "toWarehouseId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "status" "TransferStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_transfer_lines" (
    "id" TEXT NOT NULL,
    "transferId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" DECIMAL(19,4) NOT NULL,

    CONSTRAINT "inventory_transfer_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_lists" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "PriceListType" NOT NULL,
    "adjustment" DECIMAL(10,4) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "price_lists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_list_items" (
    "id" TEXT NOT NULL,
    "priceListId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "customPrice" DECIMAL(19,4) NOT NULL,

    CONSTRAINT "price_list_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_accounts" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "accountNumber" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "type" "BankAccountType" NOT NULL,
    "systemBalance" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "bankBalance" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "linkedAccountId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reconciliations" (
    "id" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "reconciliationDate" TIMESTAMP(3) NOT NULL,
    "statementDate" TIMESTAMP(3) NOT NULL,
    "statementBalance" DECIMAL(19,4) NOT NULL,
    "systemBalance" DECIMAL(19,4) NOT NULL,
    "reconciledBalance" DECIMAL(19,4) NOT NULL,
    "difference" DECIMAL(19,4) NOT NULL,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "notes" TEXT,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reconciliations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_transactions" (
    "id" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "type" "BankTransactionType" NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "description" TEXT,
    "reference" TEXT,
    "payee" TEXT,
    "status" "ReconciliationStatus" NOT NULL DEFAULT 'PENDING',
    "isReconciled" BOOLEAN NOT NULL DEFAULT false,
    "matchedEntityType" TEXT,
    "matchedEntityId" TEXT,
    "confidence" DECIMAL(5,2),
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_rules" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bankAccountId" TEXT,
    "conditions" JSONB NOT NULL,
    "action" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "bank_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "employeeNumber" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "department" TEXT,
    "jobTitle" TEXT,
    "position" TEXT,
    "dateOfJoining" TIMESTAMP(3) NOT NULL,
    "hireDate" TIMESTAMP(3),
    "basicSalary" DECIMAL(19,4) NOT NULL,
    "baseSalary" DECIMAL(19,4),
    "allowances" JSONB NOT NULL DEFAULT '{}',
    "deductions" JSONB NOT NULL DEFAULT '{}',
    "bankAccount" TEXT,
    "nationalId" TEXT,
    "status" TEXT DEFAULT 'ACTIVE',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendances" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "status" "AttendanceStatus" NOT NULL,
    "checkIn" TIMESTAMP(3),
    "checkOut" TIMESTAMP(3),
    "notes" TEXT,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_runs" (
    "id" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "payDate" TIMESTAMP(3),
    "status" "PayrollStatus" NOT NULL DEFAULT 'DRAFT',
    "processedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "totalGross" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "totalDeductions" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "totalNet" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "journalId" TEXT,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "payroll_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payslips" (
    "id" TEXT NOT NULL,
    "payrollRunId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "basicSalary" DECIMAL(19,4) NOT NULL,
    "baseSalary" DECIMAL(19,4),
    "allowances" JSONB NOT NULL DEFAULT '{}',
    "housingAllowance" DECIMAL(19,4) DEFAULT 0,
    "transportAllowance" DECIMAL(19,4) DEFAULT 0,
    "otherAllowances" DECIMAL(19,4) DEFAULT 0,
    "overtime" DECIMAL(19,4) DEFAULT 0,
    "bonus" DECIMAL(19,4) DEFAULT 0,
    "grossSalary" DECIMAL(19,4) NOT NULL,
    "grossPay" DECIMAL(19,4),
    "lop" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "deductions" JSONB NOT NULL DEFAULT '{}',
    "gosiEmployee" DECIMAL(19,4) DEFAULT 0,
    "incomeTax" DECIMAL(19,4) DEFAULT 0,
    "loanDeduction" DECIMAL(19,4) DEFAULT 0,
    "otherDeductions" DECIMAL(19,4) DEFAULT 0,
    "totalDeductions" DECIMAL(19,4) DEFAULT 0,
    "taxes" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "netSalary" DECIMAL(19,4) NOT NULL,
    "netPay" DECIMAL(19,4),

    CONSTRAINT "payslips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "boms" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "outputItemId" TEXT NOT NULL,
    "outputQuantity" INTEGER NOT NULL DEFAULT 1,
    "operationsCost" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "boms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bom_items" (
    "id" TEXT NOT NULL,
    "bomId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" DECIMAL(19,4) NOT NULL,

    CONSTRAINT "bom_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_orders" (
    "id" TEXT NOT NULL,
    "workOrderNumber" TEXT NOT NULL,
    "bomId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "status" "WorkOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "plannedStartDate" TIMESTAMP(3),
    "actualStartDate" TIMESTAMP(3),
    "completedDate" TIMESTAMP(3),
    "notes" TEXT,
    "journalId" TEXT,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "work_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_entries" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "quantityProduced" INTEGER NOT NULL,
    "quantityRejected" INTEGER NOT NULL DEFAULT 0,
    "wastageQuantity" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdById" TEXT,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "production_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "projectNumber" TEXT,
    "customerId" TEXT,
    "billingMethod" "BillingMethod" NOT NULL,
    "budgetAmount" DECIMAL(19,4),
    "budget" DECIMAL(19,4),
    "budgetHours" DECIMAL(10,2),
    "hourlyRate" DECIMAL(19,4),
    "fixedPrice" DECIMAL(19,4),
    "status" "ProjectStatus" NOT NULL DEFAULT 'ACTIVE',
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "description" TEXT,
    "color" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "description" TEXT,
    "ratePerHour" DECIMAL(19,4) NOT NULL,
    "isBillable" BOOLEAN NOT NULL DEFAULT true,
    "status" "TaskStatus" NOT NULL DEFAULT 'TODO',
    "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "assigneeId" TEXT,
    "dueDate" TIMESTAMP(3),
    "estimatedHours" DECIMAL(10,2),
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timesheet_entries" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "taskId" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "startTime" TIMESTAMP(3),
    "endTime" TIMESTAMP(3),
    "duration" DECIMAL(10,2) NOT NULL,
    "hours" DECIMAL(10,2),
    "description" TEXT,
    "isBillable" BOOLEAN NOT NULL DEFAULT true,
    "isBilled" BOOLEAN NOT NULL DEFAULT false,
    "status" "TimesheetStatus" NOT NULL DEFAULT 'UNBILLED',
    "invoiceId" TEXT,
    "timerStartedAt" TIMESTAMP(3),
    "timerEndedAt" TIMESTAMP(3),
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "timesheet_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_rates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "description" TEXT,
    "rate" DECIMAL(5,2) NOT NULL,
    "type" "TaxType" NOT NULL,
    "linkedAccountId" TEXT,
    "collectAccountId" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "tax_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vat_returns" (
    "id" TEXT NOT NULL,
    "returnNumber" TEXT,
    "period" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3),
    "status" "VATReturnStatus" NOT NULL DEFAULT 'DRAFT',
    "totalSales" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "outputVAT" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "totalPurchases" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "inputVAT" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "netPayable" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "filedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "vat_returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vat_payments" (
    "id" TEXT NOT NULL,
    "vatReturnId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "paidFromAccountId" TEXT NOT NULL,
    "reference" TEXT,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vat_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "oldValues" JSONB,
    "newValues" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_insights" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "data" JSONB,
    "severity" TEXT NOT NULL,
    "category" "AlertCategory",
    "priority" "AlertPriority",
    "aiSource" "AlertSource",
    "sourceEntityType" TEXT,
    "sourceEntityId" TEXT,
    "actionUrl" TEXT,
    "actionLabel" TEXT,
    "expiresAt" TIMESTAMP(3),
    "impact" TEXT,
    "suggestedAction" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "isDismissed" BOOLEAN NOT NULL DEFAULT false,
    "dismissedAt" TIMESTAMP(3),
    "dismissedBy" TEXT,
    "actionTakenAt" TIMESTAMP(3),
    "actionTaken" TEXT,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_insights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_training_data" (
    "id" TEXT NOT NULL,
    "feature" "AiFeature" NOT NULL,
    "inputData" JSONB NOT NULL,
    "label" TEXT NOT NULL,
    "source" "AiTrainingSource" NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_training_data_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_models" (
    "id" TEXT NOT NULL,
    "feature" "AiFeature" NOT NULL,
    "version" INTEGER NOT NULL,
    "accuracy" DECIMAL(5,4) NOT NULL DEFAULT 0,
    "sampleCount" INTEGER NOT NULL DEFAULT 0,
    "modelData" JSONB NOT NULL,
    "status" "AiModelStatus" NOT NULL DEFAULT 'TRAINING',
    "trainedAt" TIMESTAMP(3),
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_feedback" (
    "id" TEXT NOT NULL,
    "feature" "AiFeature" NOT NULL,
    "predictionId" TEXT,
    "aiSuggestion" JSONB NOT NULL,
    "userAction" "AiFeedbackAction" NOT NULL,
    "userAnswer" TEXT,
    "inputData" JSONB NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_predictions" (
    "id" TEXT NOT NULL,
    "feature" "AiFeature" NOT NULL,
    "inputHash" TEXT NOT NULL,
    "prediction" JSONB NOT NULL,
    "confidence" DECIMAL(5,4) NOT NULL,
    "modelVersion" INTEGER NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_predictions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_anomalies" (
    "id" TEXT NOT NULL,
    "type" "AnomalyType" NOT NULL,
    "severity" "AnomalySeverity" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "value" DECIMAL(19,4) NOT NULL,
    "expectedValue" DECIMAL(19,4) NOT NULL,
    "zScore" DECIMAL(10,4) NOT NULL,
    "description" TEXT NOT NULL,
    "isResolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_anomalies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_reorder_analysis" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "avgDailyDemand" DECIMAL(19,4) NOT NULL,
    "demandStdDev" DECIMAL(19,4) NOT NULL,
    "leadTimeDays" INTEGER NOT NULL DEFAULT 7,
    "safetyStock" INTEGER NOT NULL,
    "reorderPoint" INTEGER NOT NULL,
    "economicOrderQty" INTEGER NOT NULL,
    "status" "ReorderStatus" NOT NULL,
    "lastSaleDate" TIMESTAMP(3),
    "daysSinceLastSale" INTEGER,
    "organizationId" TEXT NOT NULL,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "item_reorder_analysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reconciliation_patterns" (
    "id" TEXT NOT NULL,
    "descriptionHash" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "matchedEntity" TEXT NOT NULL,
    "matchedEntityId" TEXT,
    "accountId" TEXT,
    "vendorId" TEXT,
    "confidence" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "matchCount" INTEGER NOT NULL DEFAULT 1,
    "lastMatchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reconciliation_patterns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_ocr_layouts" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "fieldPositions" JSONB NOT NULL,
    "sampleCount" INTEGER NOT NULL DEFAULT 1,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_ocr_layouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_demand_forecasts" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "forecastDate" TIMESTAMP(3) NOT NULL,
    "predictedQuantity" DECIMAL(19,4) NOT NULL,
    "lowerBound" DECIMAL(19,4) NOT NULL,
    "upperBound" DECIMAL(19,4) NOT NULL,
    "seasonalIndex" DECIMAL(5,4) NOT NULL,
    "trendComponent" DECIMAL(19,4) NOT NULL,
    "confidence" DECIMAL(5,4) NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "item_demand_forecasts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_flow_forecasts" (
    "id" TEXT NOT NULL,
    "forecastDate" TIMESTAMP(3) NOT NULL,
    "openingBalance" DECIMAL(19,4) NOT NULL,
    "expectedInflows" DECIMAL(19,4) NOT NULL,
    "expectedOutflows" DECIMAL(19,4) NOT NULL,
    "closingBalanceP10" DECIMAL(19,4) NOT NULL,
    "closingBalanceP50" DECIMAL(19,4) NOT NULL,
    "closingBalanceP90" DECIMAL(19,4) NOT NULL,
    "lowCashAlert" BOOLEAN NOT NULL DEFAULT false,
    "negativeCashAlert" BOOLEAN NOT NULL DEFAULT false,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_flow_forecasts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_scores" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "totalScore" INTEGER NOT NULL DEFAULT 0,
    "demographicScore" INTEGER NOT NULL DEFAULT 0,
    "behavioralScore" INTEGER NOT NULL DEFAULT 0,
    "engagementScore" INTEGER NOT NULL DEFAULT 0,
    "tier" "LeadTier" NOT NULL DEFAULT 'COLD',
    "conversionProbability" DECIMAL(5,4) NOT NULL DEFAULT 0,
    "lastActivityAt" TIMESTAMP(3),
    "lastScoredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scoreHistory" JSONB NOT NULL DEFAULT '[]',
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lead_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transaction_patterns" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "entityName" TEXT NOT NULL,
    "amountCluster" DECIMAL(19,4) NOT NULL,
    "amountVariance" DECIMAL(5,4) NOT NULL DEFAULT 0.01,
    "frequency" "RecurringFrequency",
    "frequencyDays" INTEGER,
    "frequencyStdDev" DECIMAL(10,2),
    "occurrenceCount" INTEGER NOT NULL DEFAULT 0,
    "firstOccurrence" TIMESTAMP(3) NOT NULL,
    "lastOccurrence" TIMESTAMP(3) NOT NULL,
    "descriptionPattern" TEXT,
    "descriptionHash" TEXT,
    "confidence" DECIMAL(5,4) NOT NULL DEFAULT 0,
    "status" "PatternStatus" NOT NULL DEFAULT 'DETECTED',
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transaction_patterns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pattern_occurrences" (
    "id" TEXT NOT NULL,
    "patternId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "description" TEXT,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pattern_occurrences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pattern_suggestions" (
    "id" TEXT NOT NULL,
    "patternId" TEXT NOT NULL,
    "suggestionType" "SuggestionType" NOT NULL,
    "suggestedFrequency" "RecurringFrequency",
    "suggestedAmount" DECIMAL(19,4) NOT NULL,
    "suggestedEntityId" TEXT,
    "confidence" DECIMAL(5,4) NOT NULL,
    "status" "SuggestionStatus" NOT NULL DEFAULT 'PENDING',
    "recurringProfileId" TEXT,
    "dismissedAt" TIMESTAMP(3),
    "dismissedReason" TEXT,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pattern_suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assets" (
    "id" TEXT NOT NULL,
    "assetNumber" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "assetType" "AssetType" NOT NULL,
    "purchaseDate" TIMESTAMP(3) NOT NULL,
    "purchasePrice" DECIMAL(19,4) NOT NULL,
    "salvageValue" DECIMAL(19,4) NOT NULL,
    "usefulLifeYears" INTEGER NOT NULL,
    "depreciationMethod" "DepreciationMethod" NOT NULL DEFAULT 'STRAIGHT_LINE',
    "monthlyDepreciation" DECIMAL(19,4) NOT NULL,
    "accumulatedDepreciation" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "currentBookValue" DECIMAL(19,4) NOT NULL,
    "status" "AssetStatus" NOT NULL DEFAULT 'ACTIVE',
    "disposalDate" TIMESTAMP(3),
    "disposalAmount" DECIMAL(19,4),
    "disposalGainLoss" DECIMAL(19,4),
    "assetAccountId" TEXT NOT NULL,
    "depreciationAccountId" TEXT NOT NULL,
    "accumulatedDeprAccountId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "depreciation_schedules" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "accumulatedTotal" DECIMAL(19,4) NOT NULL,
    "bookValue" DECIMAL(19,4) NOT NULL,
    "journalId" TEXT,
    "executedAt" TIMESTAMP(3),
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "depreciation_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "leadName" TEXT NOT NULL,
    "companyName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "source" "LeadSource" NOT NULL,
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "assignedToId" TEXT,
    "notes" TEXT,
    "customFields" JSONB,
    "convertedToCustomerId" TEXT,
    "convertedAt" TIMESTAMP(3),
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deals" (
    "id" TEXT NOT NULL,
    "dealName" TEXT NOT NULL,
    "leadId" TEXT,
    "customerId" TEXT,
    "stage" "DealStage" NOT NULL DEFAULT 'NEW',
    "expectedAmount" DECIMAL(19,4) NOT NULL,
    "probability" INTEGER NOT NULL DEFAULT 0,
    "expectedCloseDate" TIMESTAMP(3),
    "actualCloseDate" TIMESTAMP(3),
    "assignedToId" TEXT,
    "lostReason" TEXT,
    "wonQuoteId" TEXT,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "deals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_logs" (
    "id" TEXT NOT NULL,
    "leadId" TEXT,
    "dealId" TEXT,
    "type" "ActivityType" NOT NULL,
    "description" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_challans" (
    "id" TEXT NOT NULL,
    "challanNumber" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "challanType" "ChallanType" NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "status" "ChallanStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "delivery_challans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_challan_lines" (
    "id" TEXT NOT NULL,
    "challanId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" DECIMAL(19,4) NOT NULL,
    "description" TEXT,
    "warehouseId" TEXT,

    CONSTRAINT "delivery_challan_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exchange_rates" (
    "id" TEXT NOT NULL,
    "fromCurrency" TEXT NOT NULL,
    "toCurrency" TEXT NOT NULL,
    "rate" DECIMAL(19,6) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exchange_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_logs" (
    "id" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recurring_executions" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "executedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdEntityType" TEXT NOT NULL,
    "createdEntityId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "recurring_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_onboarding" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "companyInfoCompleted" BOOLEAN NOT NULL DEFAULT false,
    "chartOfAccountsCompleted" BOOLEAN NOT NULL DEFAULT false,
    "taxConfigCompleted" BOOLEAN NOT NULL DEFAULT false,
    "openingBalancesCompleted" BOOLEAN NOT NULL DEFAULT false,
    "importDataCompleted" BOOLEAN NOT NULL DEFAULT false,
    "aiFeaturesCompleted" BOOLEAN NOT NULL DEFAULT false,
    "tourCompleted" BOOLEAN NOT NULL DEFAULT false,
    "selectedIndustry" TEXT,
    "selectedCoaTemplate" TEXT,
    "skippedSteps" TEXT[],
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_onboarding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_ai_profiles" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "churnRisk" DECIMAL(5,4) NOT NULL DEFAULT 0,
    "churnFactors" JSONB NOT NULL DEFAULT '[]',
    "lifetimeValue" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "clvSegment" TEXT,
    "rfmRecency" INTEGER,
    "rfmFrequency" INTEGER,
    "rfmMonetary" DECIMAL(19,4),
    "lastPurchaseDate" TIMESTAMP(3),
    "crossSellItems" JSONB NOT NULL DEFAULT '[]',
    "upsellItems" JSONB NOT NULL DEFAULT '[]',
    "organizationId" TEXT NOT NULL,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_ai_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_ai_profiles" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "attritionRisk" DECIMAL(5,4) NOT NULL DEFAULT 0,
    "attritionFactors" JSONB NOT NULL DEFAULT '[]',
    "compensationIndex" DECIMAL(5,4),
    "skillsProfile" JSONB NOT NULL DEFAULT '{}',
    "skillsGaps" JSONB NOT NULL DEFAULT '[]',
    "organizationId" TEXT NOT NULL,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_ai_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fraud_alerts" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "fraudScore" DECIMAL(5,4) NOT NULL,
    "signals" JSONB NOT NULL DEFAULT '[]',
    "velocityCheck" BOOLEAN NOT NULL DEFAULT false,
    "amountAnomaly" BOOLEAN NOT NULL DEFAULT false,
    "timeAnomaly" BOOLEAN NOT NULL DEFAULT false,
    "duplicateCheck" BOOLEAN NOT NULL DEFAULT false,
    "isConfirmedFraud" BOOLEAN NOT NULL DEFAULT false,
    "isResolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fraud_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_maintenance_predictions" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "predictedFailureDate" TIMESTAMP(3),
    "riskScore" DECIMAL(5,4) NOT NULL,
    "healthScore" DECIMAL(5,4) NOT NULL,
    "factors" JSONB NOT NULL DEFAULT '[]',
    "recommendedAction" TEXT,
    "organizationId" TEXT NOT NULL,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_maintenance_predictions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deep_search_jobs" (
    "id" TEXT NOT NULL,
    "status" "DeepSearchStatus" NOT NULL DEFAULT 'PENDING',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "progressMessage" TEXT,
    "webSourcesScraped" INTEGER NOT NULL DEFAULT 0,
    "codeFilesAnalyzed" INTEGER NOT NULL DEFAULT 0,
    "suggestionsCount" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "deep_search_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deep_search_suggestions" (
    "id" TEXT NOT NULL,
    "category" "SuggestionCategory" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "impact" TEXT NOT NULL,
    "effort" TEXT NOT NULL,
    "priority" INTEGER NOT NULL,
    "tags" TEXT[],
    "sources" JSONB,
    "prompt" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "jobId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "deep_search_suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "search_histories" (
    "id" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "resultType" TEXT,
    "resultId" TEXT,
    "resultTitle" TEXT,
    "clickedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "search_histories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_sequences" (
    "id" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "nextNumber" INTEGER NOT NULL DEFAULT 1,
    "padLength" INTEGER NOT NULL DEFAULT 3,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "users_organizationId_idx" ON "users"("organizationId");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_organizationId_key" ON "users"("email", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "user_preferences_userId_key" ON "user_preferences"("userId");

-- CreateIndex
CREATE INDEX "roles_organizationId_idx" ON "roles"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_organizationId_key" ON "roles"("name", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_roleId_module_key" ON "permissions"("roleId", "module");

-- CreateIndex
CREATE INDEX "accounts_organizationId_idx" ON "accounts"("organizationId");

-- CreateIndex
CREATE INDEX "accounts_type_idx" ON "accounts"("type");

-- CreateIndex
CREATE INDEX "accounts_organizationId_type_isActive_idx" ON "accounts"("organizationId", "type", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_code_organizationId_key" ON "accounts"("code", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "journals_reversalOfId_key" ON "journals"("reversalOfId");

-- CreateIndex
CREATE INDEX "journals_organizationId_idx" ON "journals"("organizationId");

-- CreateIndex
CREATE INDEX "journals_date_idx" ON "journals"("date");

-- CreateIndex
CREATE INDEX "journals_organizationId_deletedAt_date_idx" ON "journals"("organizationId", "deletedAt", "date");

-- CreateIndex
CREATE INDEX "journals_organizationId_isPosted_date_idx" ON "journals"("organizationId", "isPosted", "date");

-- CreateIndex
CREATE UNIQUE INDEX "journals_journalNumber_organizationId_key" ON "journals"("journalNumber", "organizationId");

-- CreateIndex
CREATE INDEX "journal_lines_journalId_idx" ON "journal_lines"("journalId");

-- CreateIndex
CREATE INDEX "journal_lines_accountId_idx" ON "journal_lines"("accountId");

-- CreateIndex
CREATE INDEX "journal_lines_accountId_journalId_idx" ON "journal_lines"("accountId", "journalId");

-- CreateIndex
CREATE INDEX "recurring_profiles_organizationId_idx" ON "recurring_profiles"("organizationId");

-- CreateIndex
CREATE INDEX "recurring_profiles_nextRunDate_idx" ON "recurring_profiles"("nextRunDate");

-- CreateIndex
CREATE INDEX "customers_organizationId_idx" ON "customers"("organizationId");

-- CreateIndex
CREATE INDEX "customers_name_idx" ON "customers"("name");

-- CreateIndex
CREATE INDEX "quotes_organizationId_idx" ON "quotes"("organizationId");

-- CreateIndex
CREATE INDEX "quotes_customerId_idx" ON "quotes"("customerId");

-- CreateIndex
CREATE INDEX "quotes_status_idx" ON "quotes"("status");

-- CreateIndex
CREATE INDEX "quotes_organizationId_deletedAt_status_idx" ON "quotes"("organizationId", "deletedAt", "status");

-- CreateIndex
CREATE UNIQUE INDEX "quotes_quoteNumber_organizationId_key" ON "quotes"("quoteNumber", "organizationId");

-- CreateIndex
CREATE INDEX "quote_lines_quoteId_idx" ON "quote_lines"("quoteId");

-- CreateIndex
CREATE INDEX "invoices_organizationId_idx" ON "invoices"("organizationId");

-- CreateIndex
CREATE INDEX "invoices_customerId_idx" ON "invoices"("customerId");

-- CreateIndex
CREATE INDEX "invoices_status_idx" ON "invoices"("status");

-- CreateIndex
CREATE INDEX "invoices_dueDate_idx" ON "invoices"("dueDate");

-- CreateIndex
CREATE INDEX "invoices_organizationId_status_idx" ON "invoices"("organizationId", "status");

-- CreateIndex
CREATE INDEX "invoices_organizationId_customerId_idx" ON "invoices"("organizationId", "customerId");

-- CreateIndex
CREATE INDEX "invoices_organizationId_dueDate_idx" ON "invoices"("organizationId", "dueDate");

-- CreateIndex
CREATE INDEX "invoices_organizationId_deletedAt_status_date_idx" ON "invoices"("organizationId", "deletedAt", "status", "date");

-- CreateIndex
CREATE INDEX "invoices_organizationId_deletedAt_balanceDue_idx" ON "invoices"("organizationId", "deletedAt", "balanceDue");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_invoiceNumber_organizationId_key" ON "invoices"("invoiceNumber", "organizationId");

-- CreateIndex
CREATE INDEX "invoice_lines_invoiceId_idx" ON "invoice_lines"("invoiceId");

-- CreateIndex
CREATE INDEX "credit_notes_organizationId_idx" ON "credit_notes"("organizationId");

-- CreateIndex
CREATE INDEX "credit_notes_customerId_idx" ON "credit_notes"("customerId");

-- CreateIndex
CREATE INDEX "credit_notes_organizationId_deletedAt_idx" ON "credit_notes"("organizationId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "credit_notes_creditNoteNumber_organizationId_key" ON "credit_notes"("creditNoteNumber", "organizationId");

-- CreateIndex
CREATE INDEX "payments_received_organizationId_idx" ON "payments_received"("organizationId");

-- CreateIndex
CREATE INDEX "payments_received_customerId_idx" ON "payments_received"("customerId");

-- CreateIndex
CREATE INDEX "payments_received_organizationId_deletedAt_idx" ON "payments_received"("organizationId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "payments_received_paymentNumber_organizationId_key" ON "payments_received"("paymentNumber", "organizationId");

-- CreateIndex
CREATE INDEX "payment_allocations_paymentId_idx" ON "payment_allocations"("paymentId");

-- CreateIndex
CREATE INDEX "payment_allocations_invoiceId_idx" ON "payment_allocations"("invoiceId");

-- CreateIndex
CREATE INDEX "vendors_organizationId_idx" ON "vendors"("organizationId");

-- CreateIndex
CREATE INDEX "vendors_name_idx" ON "vendors"("name");

-- CreateIndex
CREATE INDEX "expenses_organizationId_idx" ON "expenses"("organizationId");

-- CreateIndex
CREATE INDEX "expenses_date_idx" ON "expenses"("date");

-- CreateIndex
CREATE INDEX "expenses_organizationId_status_idx" ON "expenses"("organizationId", "status");

-- CreateIndex
CREATE INDEX "expenses_organizationId_vendorId_idx" ON "expenses"("organizationId", "vendorId");

-- CreateIndex
CREATE INDEX "expenses_organizationId_deletedAt_date_idx" ON "expenses"("organizationId", "deletedAt", "date");

-- CreateIndex
CREATE INDEX "expenses_organizationId_deletedAt_status_idx" ON "expenses"("organizationId", "deletedAt", "status");

-- CreateIndex
CREATE INDEX "bills_organizationId_idx" ON "bills"("organizationId");

-- CreateIndex
CREATE INDEX "bills_vendorId_idx" ON "bills"("vendorId");

-- CreateIndex
CREATE INDEX "bills_status_idx" ON "bills"("status");

-- CreateIndex
CREATE INDEX "bills_dueDate_idx" ON "bills"("dueDate");

-- CreateIndex
CREATE INDEX "bills_organizationId_status_idx" ON "bills"("organizationId", "status");

-- CreateIndex
CREATE INDEX "bills_organizationId_vendorId_idx" ON "bills"("organizationId", "vendorId");

-- CreateIndex
CREATE INDEX "bills_organizationId_dueDate_idx" ON "bills"("organizationId", "dueDate");

-- CreateIndex
CREATE INDEX "bills_organizationId_deletedAt_status_date_idx" ON "bills"("organizationId", "deletedAt", "status", "date");

-- CreateIndex
CREATE INDEX "bills_organizationId_deletedAt_balanceDue_idx" ON "bills"("organizationId", "deletedAt", "balanceDue");

-- CreateIndex
CREATE UNIQUE INDEX "bills_billNumber_vendorId_organizationId_key" ON "bills"("billNumber", "vendorId", "organizationId");

-- CreateIndex
CREATE INDEX "bill_lines_billId_idx" ON "bill_lines"("billId");

-- CreateIndex
CREATE INDEX "vendor_credits_organizationId_idx" ON "vendor_credits"("organizationId");

-- CreateIndex
CREATE INDEX "vendor_credits_vendorId_idx" ON "vendor_credits"("vendorId");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_credits_creditNumber_organizationId_key" ON "vendor_credits"("creditNumber", "organizationId");

-- CreateIndex
CREATE INDEX "payments_made_organizationId_idx" ON "payments_made"("organizationId");

-- CreateIndex
CREATE INDEX "payments_made_vendorId_idx" ON "payments_made"("vendorId");

-- CreateIndex
CREATE INDEX "payments_made_organizationId_deletedAt_idx" ON "payments_made"("organizationId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "payments_made_paymentNumber_organizationId_key" ON "payments_made"("paymentNumber", "organizationId");

-- CreateIndex
CREATE INDEX "bill_allocations_paymentId_idx" ON "bill_allocations"("paymentId");

-- CreateIndex
CREATE INDEX "bill_allocations_billId_idx" ON "bill_allocations"("billId");

-- CreateIndex
CREATE INDEX "items_organizationId_idx" ON "items"("organizationId");

-- CreateIndex
CREATE INDEX "items_type_idx" ON "items"("type");

-- CreateIndex
CREATE INDEX "items_organizationId_deletedAt_idx" ON "items"("organizationId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "items_sku_organizationId_key" ON "items"("sku", "organizationId");

-- CreateIndex
CREATE INDEX "composite_items_organizationId_idx" ON "composite_items"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "composite_items_sku_organizationId_key" ON "composite_items"("sku", "organizationId");

-- CreateIndex
CREATE INDEX "composite_item_components_compositeItemId_idx" ON "composite_item_components"("compositeItemId");

-- CreateIndex
CREATE INDEX "warehouses_organizationId_idx" ON "warehouses"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "warehouses_code_organizationId_key" ON "warehouses"("code", "organizationId");

-- CreateIndex
CREATE INDEX "inventory_movements_organizationId_idx" ON "inventory_movements"("organizationId");

-- CreateIndex
CREATE INDEX "inventory_movements_itemId_idx" ON "inventory_movements"("itemId");

-- CreateIndex
CREATE INDEX "inventory_movements_warehouseId_idx" ON "inventory_movements"("warehouseId");

-- CreateIndex
CREATE INDEX "inventory_movements_createdAt_idx" ON "inventory_movements"("createdAt");

-- CreateIndex
CREATE INDEX "inventory_movements_organizationId_itemId_idx" ON "inventory_movements"("organizationId", "itemId");

-- CreateIndex
CREATE INDEX "inventory_movements_organizationId_itemId_type_idx" ON "inventory_movements"("organizationId", "itemId", "type");

-- CreateIndex
CREATE INDEX "inventory_levels_organizationId_idx" ON "inventory_levels"("organizationId");

-- CreateIndex
CREATE INDEX "inventory_levels_itemId_idx" ON "inventory_levels"("itemId");

-- CreateIndex
CREATE INDEX "inventory_levels_warehouseId_idx" ON "inventory_levels"("warehouseId");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_levels_itemId_warehouseId_key" ON "inventory_levels"("itemId", "warehouseId");

-- CreateIndex
CREATE INDEX "inventory_cost_layers_organizationId_idx" ON "inventory_cost_layers"("organizationId");

-- CreateIndex
CREATE INDEX "inventory_cost_layers_itemId_warehouseId_idx" ON "inventory_cost_layers"("itemId", "warehouseId");

-- CreateIndex
CREATE INDEX "inventory_cost_layers_createdAt_idx" ON "inventory_cost_layers"("createdAt");

-- CreateIndex
CREATE INDEX "inventory_adjustments_organizationId_idx" ON "inventory_adjustments"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_adjustments_adjustmentNumber_organizationId_key" ON "inventory_adjustments"("adjustmentNumber", "organizationId");

-- CreateIndex
CREATE INDEX "inventory_transfers_organizationId_idx" ON "inventory_transfers"("organizationId");

-- CreateIndex
CREATE INDEX "inventory_transfers_status_idx" ON "inventory_transfers"("status");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_transfers_transferNumber_organizationId_key" ON "inventory_transfers"("transferNumber", "organizationId");

-- CreateIndex
CREATE INDEX "inventory_transfer_lines_transferId_idx" ON "inventory_transfer_lines"("transferId");

-- CreateIndex
CREATE INDEX "price_lists_organizationId_idx" ON "price_lists"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "price_list_items_priceListId_itemId_key" ON "price_list_items"("priceListId", "itemId");

-- CreateIndex
CREATE INDEX "bank_accounts_organizationId_idx" ON "bank_accounts"("organizationId");

-- CreateIndex
CREATE INDEX "reconciliations_organizationId_idx" ON "reconciliations"("organizationId");

-- CreateIndex
CREATE INDEX "reconciliations_bankAccountId_idx" ON "reconciliations"("bankAccountId");

-- CreateIndex
CREATE INDEX "bank_transactions_organizationId_idx" ON "bank_transactions"("organizationId");

-- CreateIndex
CREATE INDEX "bank_transactions_bankAccountId_idx" ON "bank_transactions"("bankAccountId");

-- CreateIndex
CREATE INDEX "bank_transactions_status_idx" ON "bank_transactions"("status");

-- CreateIndex
CREATE INDEX "bank_transactions_date_idx" ON "bank_transactions"("date");

-- CreateIndex
CREATE INDEX "bank_transactions_organizationId_status_idx" ON "bank_transactions"("organizationId", "status");

-- CreateIndex
CREATE INDEX "bank_transactions_organizationId_bankAccountId_status_idx" ON "bank_transactions"("organizationId", "bankAccountId", "status");

-- CreateIndex
CREATE INDEX "bank_transactions_organizationId_bankAccountId_status_date_idx" ON "bank_transactions"("organizationId", "bankAccountId", "status", "date");

-- CreateIndex
CREATE INDEX "bank_rules_organizationId_idx" ON "bank_rules"("organizationId");

-- CreateIndex
CREATE INDEX "employees_organizationId_idx" ON "employees"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "employees_employeeId_organizationId_key" ON "employees"("employeeId", "organizationId");

-- CreateIndex
CREATE INDEX "attendances_organizationId_idx" ON "attendances"("organizationId");

-- CreateIndex
CREATE INDEX "attendances_date_idx" ON "attendances"("date");

-- CreateIndex
CREATE INDEX "attendances_organizationId_employeeId_date_idx" ON "attendances"("organizationId", "employeeId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "attendances_employeeId_date_key" ON "attendances"("employeeId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_runs_journalId_key" ON "payroll_runs"("journalId");

-- CreateIndex
CREATE INDEX "payroll_runs_organizationId_idx" ON "payroll_runs"("organizationId");

-- CreateIndex
CREATE INDEX "payroll_runs_organizationId_status_idx" ON "payroll_runs"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_runs_month_year_organizationId_key" ON "payroll_runs"("month", "year", "organizationId");

-- CreateIndex
CREATE INDEX "payslips_payrollRunId_idx" ON "payslips"("payrollRunId");

-- CreateIndex
CREATE UNIQUE INDEX "payslips_payrollRunId_employeeId_key" ON "payslips"("payrollRunId", "employeeId");

-- CreateIndex
CREATE INDEX "boms_organizationId_idx" ON "boms"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "bom_items_bomId_itemId_key" ON "bom_items"("bomId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "work_orders_journalId_key" ON "work_orders"("journalId");

-- CreateIndex
CREATE INDEX "work_orders_organizationId_idx" ON "work_orders"("organizationId");

-- CreateIndex
CREATE INDEX "work_orders_status_idx" ON "work_orders"("status");

-- CreateIndex
CREATE UNIQUE INDEX "work_orders_workOrderNumber_organizationId_key" ON "work_orders"("workOrderNumber", "organizationId");

-- CreateIndex
CREATE INDEX "production_entries_organizationId_idx" ON "production_entries"("organizationId");

-- CreateIndex
CREATE INDEX "production_entries_workOrderId_idx" ON "production_entries"("workOrderId");

-- CreateIndex
CREATE INDEX "production_entries_date_idx" ON "production_entries"("date");

-- CreateIndex
CREATE INDEX "projects_organizationId_idx" ON "projects"("organizationId");

-- CreateIndex
CREATE INDEX "projects_status_idx" ON "projects"("status");

-- CreateIndex
CREATE INDEX "projects_organizationId_status_idx" ON "projects"("organizationId", "status");

-- CreateIndex
CREATE INDEX "tasks_organizationId_idx" ON "tasks"("organizationId");

-- CreateIndex
CREATE INDEX "tasks_projectId_idx" ON "tasks"("projectId");

-- CreateIndex
CREATE INDEX "tasks_assigneeId_idx" ON "tasks"("assigneeId");

-- CreateIndex
CREATE INDEX "tasks_organizationId_projectId_status_idx" ON "tasks"("organizationId", "projectId", "status");

-- CreateIndex
CREATE INDEX "timesheet_entries_organizationId_idx" ON "timesheet_entries"("organizationId");

-- CreateIndex
CREATE INDEX "timesheet_entries_userId_idx" ON "timesheet_entries"("userId");

-- CreateIndex
CREATE INDEX "timesheet_entries_projectId_idx" ON "timesheet_entries"("projectId");

-- CreateIndex
CREATE INDEX "timesheet_entries_date_idx" ON "timesheet_entries"("date");

-- CreateIndex
CREATE INDEX "timesheet_entries_status_idx" ON "timesheet_entries"("status");

-- CreateIndex
CREATE INDEX "timesheet_entries_organizationId_projectId_date_idx" ON "timesheet_entries"("organizationId", "projectId", "date");

-- CreateIndex
CREATE INDEX "timesheet_entries_organizationId_status_date_idx" ON "timesheet_entries"("organizationId", "status", "date");

-- CreateIndex
CREATE INDEX "tax_rates_organizationId_idx" ON "tax_rates"("organizationId");

-- CreateIndex
CREATE INDEX "vat_returns_organizationId_idx" ON "vat_returns"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "vat_returns_period_organizationId_key" ON "vat_returns"("period", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "vat_payments_vatReturnId_key" ON "vat_payments"("vatReturnId");

-- CreateIndex
CREATE INDEX "vat_payments_organizationId_idx" ON "vat_payments"("organizationId");

-- CreateIndex
CREATE INDEX "audit_logs_organizationId_idx" ON "audit_logs"("organizationId");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_organizationId_entityType_entityId_idx" ON "audit_logs"("organizationId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_organizationId_createdAt_idx" ON "audit_logs"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_organizationId_userId_createdAt_idx" ON "audit_logs"("organizationId", "userId", "createdAt");

-- CreateIndex
CREATE INDEX "ai_insights_organizationId_idx" ON "ai_insights"("organizationId");

-- CreateIndex
CREATE INDEX "ai_insights_organizationId_category_idx" ON "ai_insights"("organizationId", "category");

-- CreateIndex
CREATE INDEX "ai_insights_organizationId_priority_idx" ON "ai_insights"("organizationId", "priority");

-- CreateIndex
CREATE INDEX "ai_insights_organizationId_aiSource_idx" ON "ai_insights"("organizationId", "aiSource");

-- CreateIndex
CREATE INDEX "ai_insights_organizationId_isRead_isDismissed_idx" ON "ai_insights"("organizationId", "isRead", "isDismissed");

-- CreateIndex
CREATE INDEX "ai_insights_isRead_idx" ON "ai_insights"("isRead");

-- CreateIndex
CREATE INDEX "notifications_organizationId_idx" ON "notifications"("organizationId");

-- CreateIndex
CREATE INDEX "notifications_userId_idx" ON "notifications"("userId");

-- CreateIndex
CREATE INDEX "notifications_isRead_idx" ON "notifications"("isRead");

-- CreateIndex
CREATE INDEX "ai_training_data_organizationId_idx" ON "ai_training_data"("organizationId");

-- CreateIndex
CREATE INDEX "ai_training_data_feature_idx" ON "ai_training_data"("feature");

-- CreateIndex
CREATE INDEX "ai_training_data_organizationId_feature_idx" ON "ai_training_data"("organizationId", "feature");

-- CreateIndex
CREATE INDEX "ai_models_organizationId_idx" ON "ai_models"("organizationId");

-- CreateIndex
CREATE INDEX "ai_models_organizationId_feature_status_idx" ON "ai_models"("organizationId", "feature", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ai_models_organizationId_feature_version_key" ON "ai_models"("organizationId", "feature", "version");

-- CreateIndex
CREATE INDEX "ai_feedback_organizationId_idx" ON "ai_feedback"("organizationId");

-- CreateIndex
CREATE INDEX "ai_feedback_organizationId_feature_idx" ON "ai_feedback"("organizationId", "feature");

-- CreateIndex
CREATE INDEX "ai_feedback_feature_userAction_idx" ON "ai_feedback"("feature", "userAction");

-- CreateIndex
CREATE INDEX "ai_predictions_organizationId_idx" ON "ai_predictions"("organizationId");

-- CreateIndex
CREATE INDEX "ai_predictions_organizationId_feature_inputHash_idx" ON "ai_predictions"("organizationId", "feature", "inputHash");

-- CreateIndex
CREATE INDEX "ai_anomalies_organizationId_idx" ON "ai_anomalies"("organizationId");

-- CreateIndex
CREATE INDEX "ai_anomalies_organizationId_type_idx" ON "ai_anomalies"("organizationId", "type");

-- CreateIndex
CREATE INDEX "ai_anomalies_organizationId_isResolved_idx" ON "ai_anomalies"("organizationId", "isResolved");

-- CreateIndex
CREATE INDEX "ai_anomalies_entityType_entityId_idx" ON "ai_anomalies"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "item_reorder_analysis_itemId_key" ON "item_reorder_analysis"("itemId");

-- CreateIndex
CREATE INDEX "item_reorder_analysis_organizationId_idx" ON "item_reorder_analysis"("organizationId");

-- CreateIndex
CREATE INDEX "item_reorder_analysis_organizationId_status_idx" ON "item_reorder_analysis"("organizationId", "status");

-- CreateIndex
CREATE INDEX "reconciliation_patterns_organizationId_idx" ON "reconciliation_patterns"("organizationId");

-- CreateIndex
CREATE INDEX "reconciliation_patterns_organizationId_pattern_idx" ON "reconciliation_patterns"("organizationId", "pattern");

-- CreateIndex
CREATE UNIQUE INDEX "reconciliation_patterns_organizationId_descriptionHash_key" ON "reconciliation_patterns"("organizationId", "descriptionHash");

-- CreateIndex
CREATE INDEX "vendor_ocr_layouts_organizationId_idx" ON "vendor_ocr_layouts"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_ocr_layouts_organizationId_vendorId_key" ON "vendor_ocr_layouts"("organizationId", "vendorId");

-- CreateIndex
CREATE INDEX "item_demand_forecasts_organizationId_idx" ON "item_demand_forecasts"("organizationId");

-- CreateIndex
CREATE INDEX "item_demand_forecasts_itemId_forecastDate_idx" ON "item_demand_forecasts"("itemId", "forecastDate");

-- CreateIndex
CREATE INDEX "cash_flow_forecasts_organizationId_idx" ON "cash_flow_forecasts"("organizationId");

-- CreateIndex
CREATE INDEX "cash_flow_forecasts_organizationId_forecastDate_idx" ON "cash_flow_forecasts"("organizationId", "forecastDate");

-- CreateIndex
CREATE UNIQUE INDEX "lead_scores_leadId_key" ON "lead_scores"("leadId");

-- CreateIndex
CREATE INDEX "lead_scores_organizationId_idx" ON "lead_scores"("organizationId");

-- CreateIndex
CREATE INDEX "lead_scores_organizationId_tier_idx" ON "lead_scores"("organizationId", "tier");

-- CreateIndex
CREATE INDEX "lead_scores_organizationId_totalScore_idx" ON "lead_scores"("organizationId", "totalScore");

-- CreateIndex
CREATE INDEX "transaction_patterns_organizationId_idx" ON "transaction_patterns"("organizationId");

-- CreateIndex
CREATE INDEX "transaction_patterns_organizationId_status_idx" ON "transaction_patterns"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "transaction_patterns_organizationId_entityName_amountCluste_key" ON "transaction_patterns"("organizationId", "entityName", "amountCluster");

-- CreateIndex
CREATE INDEX "pattern_occurrences_patternId_idx" ON "pattern_occurrences"("patternId");

-- CreateIndex
CREATE INDEX "pattern_occurrences_organizationId_date_idx" ON "pattern_occurrences"("organizationId", "date");

-- CreateIndex
CREATE INDEX "pattern_suggestions_organizationId_idx" ON "pattern_suggestions"("organizationId");

-- CreateIndex
CREATE INDEX "pattern_suggestions_organizationId_status_idx" ON "pattern_suggestions"("organizationId", "status");

-- CreateIndex
CREATE INDEX "assets_organizationId_idx" ON "assets"("organizationId");

-- CreateIndex
CREATE INDEX "assets_organizationId_status_idx" ON "assets"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "assets_organizationId_assetNumber_key" ON "assets"("organizationId", "assetNumber");

-- CreateIndex
CREATE INDEX "depreciation_schedules_organizationId_year_month_idx" ON "depreciation_schedules"("organizationId", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "depreciation_schedules_assetId_month_year_key" ON "depreciation_schedules"("assetId", "month", "year");

-- CreateIndex
CREATE INDEX "leads_organizationId_idx" ON "leads"("organizationId");

-- CreateIndex
CREATE INDEX "leads_organizationId_status_idx" ON "leads"("organizationId", "status");

-- CreateIndex
CREATE INDEX "leads_organizationId_source_idx" ON "leads"("organizationId", "source");

-- CreateIndex
CREATE INDEX "deals_organizationId_idx" ON "deals"("organizationId");

-- CreateIndex
CREATE INDEX "deals_organizationId_stage_idx" ON "deals"("organizationId", "stage");

-- CreateIndex
CREATE INDEX "activity_logs_leadId_idx" ON "activity_logs"("leadId");

-- CreateIndex
CREATE INDEX "activity_logs_dealId_idx" ON "activity_logs"("dealId");

-- CreateIndex
CREATE INDEX "activity_logs_organizationId_idx" ON "activity_logs"("organizationId");

-- CreateIndex
CREATE INDEX "delivery_challans_organizationId_idx" ON "delivery_challans"("organizationId");

-- CreateIndex
CREATE INDEX "delivery_challans_organizationId_status_idx" ON "delivery_challans"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_challans_organizationId_challanNumber_key" ON "delivery_challans"("organizationId", "challanNumber");

-- CreateIndex
CREATE INDEX "exchange_rates_organizationId_date_idx" ON "exchange_rates"("organizationId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "exchange_rates_organizationId_fromCurrency_toCurrency_date_key" ON "exchange_rates"("organizationId", "fromCurrency", "toCurrency", "date");

-- CreateIndex
CREATE INDEX "email_logs_organizationId_idx" ON "email_logs"("organizationId");

-- CreateIndex
CREATE INDEX "email_logs_organizationId_entityType_entityId_idx" ON "email_logs"("organizationId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "recurring_executions_profileId_idx" ON "recurring_executions"("profileId");

-- CreateIndex
CREATE INDEX "recurring_executions_organizationId_idx" ON "recurring_executions"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "organization_onboarding_organizationId_key" ON "organization_onboarding"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "customer_ai_profiles_customerId_key" ON "customer_ai_profiles"("customerId");

-- CreateIndex
CREATE INDEX "customer_ai_profiles_organizationId_idx" ON "customer_ai_profiles"("organizationId");

-- CreateIndex
CREATE INDEX "customer_ai_profiles_organizationId_churnRisk_idx" ON "customer_ai_profiles"("organizationId", "churnRisk");

-- CreateIndex
CREATE UNIQUE INDEX "employee_ai_profiles_employeeId_key" ON "employee_ai_profiles"("employeeId");

-- CreateIndex
CREATE INDEX "employee_ai_profiles_organizationId_idx" ON "employee_ai_profiles"("organizationId");

-- CreateIndex
CREATE INDEX "employee_ai_profiles_organizationId_attritionRisk_idx" ON "employee_ai_profiles"("organizationId", "attritionRisk");

-- CreateIndex
CREATE INDEX "fraud_alerts_organizationId_idx" ON "fraud_alerts"("organizationId");

-- CreateIndex
CREATE INDEX "fraud_alerts_organizationId_isResolved_idx" ON "fraud_alerts"("organizationId", "isResolved");

-- CreateIndex
CREATE INDEX "fraud_alerts_entityType_entityId_idx" ON "fraud_alerts"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "asset_maintenance_predictions_organizationId_idx" ON "asset_maintenance_predictions"("organizationId");

-- CreateIndex
CREATE INDEX "asset_maintenance_predictions_assetId_idx" ON "asset_maintenance_predictions"("assetId");

-- CreateIndex
CREATE INDEX "deep_search_jobs_organizationId_createdAt_idx" ON "deep_search_jobs"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "deep_search_suggestions_jobId_idx" ON "deep_search_suggestions"("jobId");

-- CreateIndex
CREATE INDEX "deep_search_suggestions_organizationId_category_idx" ON "deep_search_suggestions"("organizationId", "category");

-- CreateIndex
CREATE INDEX "search_histories_organizationId_userId_clickedAt_idx" ON "search_histories"("organizationId", "userId", "clickedAt");

-- CreateIndex
CREATE UNIQUE INDEX "search_histories_organizationId_userId_query_key" ON "search_histories"("organizationId", "userId", "query");

-- CreateIndex
CREATE UNIQUE INDEX "document_sequences_organizationId_prefix_key" ON "document_sequences"("organizationId", "prefix");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permissions" ADD CONSTRAINT "permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journals" ADD CONSTRAINT "journals_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journals" ADD CONSTRAINT "journals_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "journals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "journals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_profiles" ADD CONSTRAINT "recurring_profiles_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_priceListId_fkey" FOREIGN KEY ("priceListId") REFERENCES "price_lists"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "quotes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_appliedToInvoiceId_fkey" FOREIGN KEY ("appliedToInvoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments_received" ADD CONSTRAINT "payments_received_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments_received" ADD CONSTRAINT "payments_received_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments_received"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_paidThroughAccountId_fkey" FOREIGN KEY ("paidThroughAccountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bills" ADD CONSTRAINT "bills_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bills" ADD CONSTRAINT "bills_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bills" ADD CONSTRAINT "bills_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_lines" ADD CONSTRAINT "bill_lines_billId_fkey" FOREIGN KEY ("billId") REFERENCES "bills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_lines" ADD CONSTRAINT "bill_lines_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_lines" ADD CONSTRAINT "bill_lines_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_credits" ADD CONSTRAINT "vendor_credits_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_credits" ADD CONSTRAINT "vendor_credits_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_credits" ADD CONSTRAINT "vendor_credits_billId_fkey" FOREIGN KEY ("billId") REFERENCES "bills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_credits" ADD CONSTRAINT "vendor_credits_appliedToBillId_fkey" FOREIGN KEY ("appliedToBillId") REFERENCES "bills"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments_made" ADD CONSTRAINT "payments_made_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments_made" ADD CONSTRAINT "payments_made_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_allocations" ADD CONSTRAINT "bill_allocations_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments_made"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_allocations" ADD CONSTRAINT "bill_allocations_billId_fkey" FOREIGN KEY ("billId") REFERENCES "bills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_salesAccountId_fkey" FOREIGN KEY ("salesAccountId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_purchaseAccountId_fkey" FOREIGN KEY ("purchaseAccountId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_inventoryAccountId_fkey" FOREIGN KEY ("inventoryAccountId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "composite_items" ADD CONSTRAINT "composite_items_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "composite_item_components" ADD CONSTRAINT "composite_item_components_compositeItemId_fkey" FOREIGN KEY ("compositeItemId") REFERENCES "composite_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "composite_item_components" ADD CONSTRAINT "composite_item_components_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_levels" ADD CONSTRAINT "inventory_levels_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_levels" ADD CONSTRAINT "inventory_levels_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_levels" ADD CONSTRAINT "inventory_levels_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_cost_layers" ADD CONSTRAINT "inventory_cost_layers_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_cost_layers" ADD CONSTRAINT "inventory_cost_layers_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_cost_layers" ADD CONSTRAINT "inventory_cost_layers_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_adjustments" ADD CONSTRAINT "inventory_adjustments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_adjustments" ADD CONSTRAINT "inventory_adjustments_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_adjustments" ADD CONSTRAINT "inventory_adjustments_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_adjustments" ADD CONSTRAINT "inventory_adjustments_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transfers" ADD CONSTRAINT "inventory_transfers_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transfers" ADD CONSTRAINT "inventory_transfers_fromWarehouseId_fkey" FOREIGN KEY ("fromWarehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transfers" ADD CONSTRAINT "inventory_transfers_toWarehouseId_fkey" FOREIGN KEY ("toWarehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transfer_lines" ADD CONSTRAINT "inventory_transfer_lines_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "inventory_transfers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transfer_lines" ADD CONSTRAINT "inventory_transfer_lines_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_lists" ADD CONSTRAINT "price_lists_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_list_items" ADD CONSTRAINT "price_list_items_priceListId_fkey" FOREIGN KEY ("priceListId") REFERENCES "price_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_list_items" ADD CONSTRAINT "price_list_items_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_linkedAccountId_fkey" FOREIGN KEY ("linkedAccountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliations" ADD CONSTRAINT "reconciliations_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliations" ADD CONSTRAINT "reconciliations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_rules" ADD CONSTRAINT "bank_rules_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_rules" ADD CONSTRAINT "bank_rules_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "bank_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "journals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "payroll_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boms" ADD CONSTRAINT "boms_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boms" ADD CONSTRAINT "boms_outputItemId_fkey" FOREIGN KEY ("outputItemId") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bom_items" ADD CONSTRAINT "bom_items_bomId_fkey" FOREIGN KEY ("bomId") REFERENCES "boms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bom_items" ADD CONSTRAINT "bom_items_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_bomId_fkey" FOREIGN KEY ("bomId") REFERENCES "boms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "journals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_entries" ADD CONSTRAINT "production_entries_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_entries" ADD CONSTRAINT "production_entries_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timesheet_entries" ADD CONSTRAINT "timesheet_entries_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timesheet_entries" ADD CONSTRAINT "timesheet_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timesheet_entries" ADD CONSTRAINT "timesheet_entries_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timesheet_entries" ADD CONSTRAINT "timesheet_entries_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timesheet_entries" ADD CONSTRAINT "timesheet_entries_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_rates" ADD CONSTRAINT "tax_rates_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_rates" ADD CONSTRAINT "tax_rates_linkedAccountId_fkey" FOREIGN KEY ("linkedAccountId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_rates" ADD CONSTRAINT "tax_rates_collectAccountId_fkey" FOREIGN KEY ("collectAccountId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vat_returns" ADD CONSTRAINT "vat_returns_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vat_payments" ADD CONSTRAINT "vat_payments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vat_payments" ADD CONSTRAINT "vat_payments_vatReturnId_fkey" FOREIGN KEY ("vatReturnId") REFERENCES "vat_returns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_insights" ADD CONSTRAINT "ai_insights_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_training_data" ADD CONSTRAINT "ai_training_data_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_models" ADD CONSTRAINT "ai_models_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_feedback" ADD CONSTRAINT "ai_feedback_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_feedback" ADD CONSTRAINT "ai_feedback_predictionId_fkey" FOREIGN KEY ("predictionId") REFERENCES "ai_predictions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_predictions" ADD CONSTRAINT "ai_predictions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_anomalies" ADD CONSTRAINT "ai_anomalies_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_reorder_analysis" ADD CONSTRAINT "item_reorder_analysis_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_reorder_analysis" ADD CONSTRAINT "item_reorder_analysis_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliation_patterns" ADD CONSTRAINT "reconciliation_patterns_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_ocr_layouts" ADD CONSTRAINT "vendor_ocr_layouts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_ocr_layouts" ADD CONSTRAINT "vendor_ocr_layouts_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_demand_forecasts" ADD CONSTRAINT "item_demand_forecasts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_demand_forecasts" ADD CONSTRAINT "item_demand_forecasts_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_flow_forecasts" ADD CONSTRAINT "cash_flow_forecasts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_scores" ADD CONSTRAINT "lead_scores_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_scores" ADD CONSTRAINT "lead_scores_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_patterns" ADD CONSTRAINT "transaction_patterns_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pattern_occurrences" ADD CONSTRAINT "pattern_occurrences_patternId_fkey" FOREIGN KEY ("patternId") REFERENCES "transaction_patterns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pattern_suggestions" ADD CONSTRAINT "pattern_suggestions_patternId_fkey" FOREIGN KEY ("patternId") REFERENCES "transaction_patterns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_assetAccountId_fkey" FOREIGN KEY ("assetAccountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_depreciationAccountId_fkey" FOREIGN KEY ("depreciationAccountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_accumulatedDeprAccountId_fkey" FOREIGN KEY ("accumulatedDeprAccountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "depreciation_schedules" ADD CONSTRAINT "depreciation_schedules_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "depreciation_schedules" ADD CONSTRAINT "depreciation_schedules_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "journals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "depreciation_schedules" ADD CONSTRAINT "depreciation_schedules_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_wonQuoteId_fkey" FOREIGN KEY ("wonQuoteId") REFERENCES "quotes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_challans" ADD CONSTRAINT "delivery_challans_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_challans" ADD CONSTRAINT "delivery_challans_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_challans" ADD CONSTRAINT "delivery_challans_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_challan_lines" ADD CONSTRAINT "delivery_challan_lines_challanId_fkey" FOREIGN KEY ("challanId") REFERENCES "delivery_challans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_challan_lines" ADD CONSTRAINT "delivery_challan_lines_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_challan_lines" ADD CONSTRAINT "delivery_challan_lines_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_logs" ADD CONSTRAINT "email_logs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_executions" ADD CONSTRAINT "recurring_executions_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "recurring_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_onboarding" ADD CONSTRAINT "organization_onboarding_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_ai_profiles" ADD CONSTRAINT "customer_ai_profiles_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_ai_profiles" ADD CONSTRAINT "customer_ai_profiles_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_ai_profiles" ADD CONSTRAINT "employee_ai_profiles_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_ai_profiles" ADD CONSTRAINT "employee_ai_profiles_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fraud_alerts" ADD CONSTRAINT "fraud_alerts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_maintenance_predictions" ADD CONSTRAINT "asset_maintenance_predictions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_maintenance_predictions" ADD CONSTRAINT "asset_maintenance_predictions_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deep_search_jobs" ADD CONSTRAINT "deep_search_jobs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deep_search_suggestions" ADD CONSTRAINT "deep_search_suggestions_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "deep_search_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deep_search_suggestions" ADD CONSTRAINT "deep_search_suggestions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "search_histories" ADD CONSTRAINT "search_histories_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "search_histories" ADD CONSTRAINT "search_histories_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_sequences" ADD CONSTRAINT "document_sequences_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ============================================
-- Custom indexes (from global_search_fuzzy migration)
-- ============================================

-- Enable pg_trgm extension for fuzzy/trigram matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Customers
CREATE INDEX IF NOT EXISTS "idx_customer_name_trgm" ON "customers" USING gin ("name" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "idx_customer_email_trgm" ON "customers" USING gin ("email" gin_trgm_ops);

-- Vendors
CREATE INDEX IF NOT EXISTS "idx_vendor_name_trgm" ON "vendors" USING gin ("name" gin_trgm_ops);

-- Invoices
CREATE INDEX IF NOT EXISTS "idx_invoice_number_trgm" ON "invoices" USING gin ("invoiceNumber" gin_trgm_ops);

-- Bills
CREATE INDEX IF NOT EXISTS "idx_bill_number_trgm" ON "bills" USING gin ("billNumber" gin_trgm_ops);

-- Items
CREATE INDEX IF NOT EXISTS "idx_item_name_trgm" ON "items" USING gin ("name" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "idx_item_sku_trgm" ON "items" USING gin ("sku" gin_trgm_ops);

-- Employees
CREATE INDEX IF NOT EXISTS "idx_employee_name_trgm" ON "employees" USING gin ("name" gin_trgm_ops);

-- Projects
CREATE INDEX IF NOT EXISTS "idx_project_name_trgm" ON "projects" USING gin ("name" gin_trgm_ops);

-- Leads
CREATE INDEX IF NOT EXISTS "idx_lead_name_trgm" ON "leads" USING gin ("leadName" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "idx_lead_company_trgm" ON "leads" USING gin ("companyName" gin_trgm_ops);

-- Deals
CREATE INDEX IF NOT EXISTS "idx_deal_name_trgm" ON "deals" USING gin ("dealName" gin_trgm_ops);

-- Quotes
CREATE INDEX IF NOT EXISTS "idx_quote_number_trgm" ON "quotes" USING gin ("quoteNumber" gin_trgm_ops);

-- Expenses
CREATE INDEX IF NOT EXISTS "idx_expense_description_trgm" ON "expenses" USING gin ("description" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "idx_expense_reference_trgm" ON "expenses" USING gin ("reference" gin_trgm_ops);

-- ============================================
-- Partial indexes for soft delete (from soft_delete_partial_indexes migration)
-- ============================================

-- Partial indexes for soft-deleted tables (only index non-deleted rows)
-- These dramatically improve query performance since most queries filter on deletedAt IS NULL

-- Accounts (chart of accounts - queried on every journal entry)
CREATE INDEX IF NOT EXISTS "idx_accounts_active"
  ON "accounts" ("organizationId", "type", "isActive")
  WHERE "deletedAt" IS NULL;

-- Invoices (already has deletedAt)
CREATE INDEX IF NOT EXISTS "idx_invoices_active"
  ON "invoices" ("organizationId", "status", "date")
  WHERE "deletedAt" IS NULL;

-- Bills (already has deletedAt)
CREATE INDEX IF NOT EXISTS "idx_bills_active"
  ON "bills" ("organizationId", "status", "date")
  WHERE "deletedAt" IS NULL;

-- Journals (already has deletedAt) - journals uses isPosted, not status
CREATE INDEX IF NOT EXISTS "idx_journals_active"
  ON "journals" ("organizationId", "isPosted", "date")
  WHERE "deletedAt" IS NULL;

-- Quotes (already has deletedAt)
CREATE INDEX IF NOT EXISTS "idx_quotes_active"
  ON "quotes" ("organizationId", "status")
  WHERE "deletedAt" IS NULL;

-- Credit Notes (already has deletedAt) - credit_notes has no status column
CREATE INDEX IF NOT EXISTS "idx_credit_notes_active"
  ON "credit_notes" ("organizationId")
  WHERE "deletedAt" IS NULL;

-- Expenses (already has deletedAt)
CREATE INDEX IF NOT EXISTS "idx_expenses_active"
  ON "expenses" ("organizationId", "date")
  WHERE "deletedAt" IS NULL;

-- Customers (already has deletedAt)
CREATE INDEX IF NOT EXISTS "idx_customers_active"
  ON "customers" ("organizationId")
  WHERE "deletedAt" IS NULL;

-- Vendors (already has deletedAt)
CREATE INDEX IF NOT EXISTS "idx_vendors_active"
  ON "vendors" ("organizationId")
  WHERE "deletedAt" IS NULL;

-- Items (already has deletedAt)
CREATE INDEX IF NOT EXISTS "idx_items_active"
  ON "items" ("organizationId", "type")
  WHERE "deletedAt" IS NULL;

-- Payments Received (already has deletedAt)
CREATE INDEX IF NOT EXISTS "idx_payments_received_active"
  ON "payments_received" ("organizationId", "date")
  WHERE "deletedAt" IS NULL;

-- Payments Made (already has deletedAt)
CREATE INDEX IF NOT EXISTS "idx_payments_made_active"
  ON "payments_made" ("organizationId", "date")
  WHERE "deletedAt" IS NULL;

-- Bank Accounts (new soft delete)
CREATE INDEX IF NOT EXISTS "idx_bank_accounts_active"
  ON "bank_accounts" ("organizationId", "isActive")
  WHERE "deletedAt" IS NULL;

-- Bank Rules (new soft delete)
CREATE INDEX IF NOT EXISTS "idx_bank_rules_active"
  ON "bank_rules" ("organizationId", "isActive")
  WHERE "deletedAt" IS NULL;

-- Employees (new soft delete)
CREATE INDEX IF NOT EXISTS "idx_employees_active"
  ON "employees" ("organizationId", "isActive")
  WHERE "deletedAt" IS NULL;

-- Payroll Runs (new soft delete)
CREATE INDEX IF NOT EXISTS "idx_payroll_runs_active"
  ON "payroll_runs" ("organizationId", "status")
  WHERE "deletedAt" IS NULL;

-- Warehouses (new soft delete)
CREATE INDEX IF NOT EXISTS "idx_warehouses_active"
  ON "warehouses" ("organizationId", "isActive")
  WHERE "deletedAt" IS NULL;

-- BOMs (new soft delete)
CREATE INDEX IF NOT EXISTS "idx_boms_active"
  ON "boms" ("organizationId", "isActive")
  WHERE "deletedAt" IS NULL;

-- Work Orders (new soft delete)
CREATE INDEX IF NOT EXISTS "idx_work_orders_active"
  ON "work_orders" ("organizationId", "status")
  WHERE "deletedAt" IS NULL;

-- Projects (new soft delete)
CREATE INDEX IF NOT EXISTS "idx_projects_active"
  ON "projects" ("organizationId", "status")
  WHERE "deletedAt" IS NULL;

-- Tasks (new soft delete)
CREATE INDEX IF NOT EXISTS "idx_tasks_active"
  ON "tasks" ("organizationId", "projectId", "status")
  WHERE "deletedAt" IS NULL;

-- Tax Rates (new soft delete)
CREATE INDEX IF NOT EXISTS "idx_tax_rates_active"
  ON "tax_rates" ("organizationId", "isActive")
  WHERE "deletedAt" IS NULL;

-- VAT Returns (new soft delete)
CREATE INDEX IF NOT EXISTS "idx_vat_returns_active"
  ON "vat_returns" ("organizationId", "status")
  WHERE "deletedAt" IS NULL;

-- Assets (already has deletedAt)
CREATE INDEX IF NOT EXISTS "idx_assets_active"
  ON "assets" ("organizationId", "status")
  WHERE "deletedAt" IS NULL;

-- Leads (already has deletedAt)
CREATE INDEX IF NOT EXISTS "idx_leads_active"
  ON "leads" ("organizationId", "status")
  WHERE "deletedAt" IS NULL;

-- Deals (already has deletedAt)
CREATE INDEX IF NOT EXISTS "idx_deals_active"
  ON "deals" ("organizationId", "stage")
  WHERE "deletedAt" IS NULL;
