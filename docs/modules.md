# Mizano ERP - Backend Modules Reference

This document describes all 23 backend modules in the Mizano ERP system, located under `apps/api/src/modules/`.

---

## Table of Contents

1. [Accounting](#1-accounting)
2. [AI](#2-ai)
3. [Assets](#3-assets)
4. [Audit](#4-audit)
5. [Auth](#5-auth)
6. [Banking](#6-banking)
7. [CRM](#7-crm)
8. [Currency](#8-currency)
9. [Documents](#9-documents)
10. [HR](#10-hr)
11. [Import-Export](#11-import-export)
12. [Inventory](#12-inventory)
13. [Manufacturing](#13-manufacturing)
14. [Notifications](#14-notifications)
15. [Organizations](#15-organizations)
16. [Projects](#16-projects)
17. [Purchases](#17-purchases)
18. [Reports](#18-reports)
19. [Roles](#19-roles)
20. [Sales](#20-sales)
21. [Tax](#21-tax)
22. [User Preferences](#22-user-preferences)
23. [Users](#23-users)

---

## 1. Accounting

**Path:** `modules/accounting/`

**Purpose:** Core financial backbone of the ERP. Manages the General Ledger, Chart of Accounts, Journal Entries, and Recurring Profiles. All other financial modules ultimately post journal entries through this module.

**Key Entities:**

- **Account** -- Chart of Accounts with tree hierarchy (parent/child). Types: Asset, Liability, Equity, Revenue, Expense.
- **Journal** -- Double-entry journal entries with line items. Each line has a debit or credit amount.
- **JournalLine** -- Individual debit/credit line within a journal entry, linked to an Account.
- **RecurringProfile** -- Templates for auto-generating journal entries on a schedule (monthly, quarterly, etc.).

**Business Rules:**

- Total debits MUST equal total credits on every journal entry. Save is blocked if unbalanced.
- Lock date enforcement: transactions cannot be created or edited before the organization's lock date.
- Auto-numbering format: `JRN-YYYY-XXXXX` (e.g., JRN-2026-00042).
- All monetary values use `Decimal @db.Decimal(19, 4)` -- never JavaScript floats.
- Journal entries are soft-deleted (`deletedAt`) -- never hard-deleted.
- Recurring profiles auto-generate journals on their schedule via cron.

**Key Endpoints:**

- `GET /accounts` -- List chart of accounts (tree structure)
- `POST /accounts` -- Create account
- `GET /accounts/:id` -- Get account details with balance
- `PUT /accounts/:id` -- Update account
- `GET /journals` -- List journal entries (paginated, filterable)
- `POST /journals` -- Create journal entry (validates balance)
- `GET /journals/:id` -- Get journal with lines
- `PUT /journals/:id` -- Update draft journal
- `POST /journals/:id/post` -- Post journal (finalize)
- `GET /recurring-profiles` -- List recurring profiles
- `POST /recurring-profiles` -- Create recurring profile

**Dependencies:** Prisma, Audit

---

## 2. AI

**Path:** `modules/ai/`

**Purpose:** Comprehensive AI and machine learning module providing 33 AI features across financial, CRM, security, NLP, HR, and operations domains. All ML models run locally with zero external API dependencies. Uses `natural`, `brain.js`, `ml-*`, `simple-statistics`, `compromise`, `sentiment`, and `tesseract.js`.

**Key Entities:**

- **AiModel** -- Trained model metadata and serialized weights
- **AiTrainingData** -- Training datasets per feature per organization
- **AiFeedback** -- User feedback on AI predictions (feature + userAction enum)
- **AiPrediction** -- Stored predictions with confidence scores
- **AiAnomaly** -- Detected anomalies in financial data
- **AIInsight** -- AI-generated business insights
- **LeadScore** -- ML-scored lead quality
- **ReconciliationPattern** -- Learned bank reconciliation patterns
- **VendorOcrLayout** -- Vendor-specific OCR templates
- **ItemDemandForecast**, **CashFlowForecast**, **TransactionPattern**, **PatternSuggestion**, **FraudAlert**, **CustomerAiProfile**, **EmployeeAiProfile**, **ItemReorderAnalysis**

**Controllers (38):**
`ai`, `ai-alerts`, `ai-feedback`, `anomaly-detection`, `audit-risk`, `cash-flow-prediction`, `categorization`, `chatbot`, `churn-prediction`, `clv-analysis`, `compensation-benchmark`, `compliance-monitoring`, `contract-analysis`, `cross-sell`, `demand-forecasting`, `document-classification`, `document-intake`, `dynamic-pricing`, `employee-attrition`, `entity-extraction`, `fraud-detection`, `knowledge-assistant`, `lead-scoring`, `narrative`, `ocr`, `pattern-detection`, `payment-prediction`, `pipeline-forecast`, `predictive-maintenance`, `quality-prediction`, `reconciliation-ai`, `reorder-points`, `resource-optimization`, `route-optimization`, `sentiment-analysis`, `skills-gap`, `voice-command`, `workforce-scheduling`

**Services (48):**
All controller services plus: `ai-categorization`, `ai-forecasting`, `ai-insights`, `ai-training`, `model-registry`, `document-intake`, `entity-extraction`, `ocr`

**Schedulers (5):**

- `ai-retraining` -- Periodic model retraining based on feedback thresholds
- `ai-sales-crm` -- Lead scoring, churn prediction, CLV updates
- `ai-security` -- Fraud detection, compliance monitoring, audit risk scans
- `ai-hr-ops` -- Employee attrition, workforce scheduling, skills gap analysis
- `ai-nlp-chat` -- Chatbot knowledge base refresh, sentiment model updates

**Utils (8):**
`holt-winters`, `monte-carlo`, `statistics`, `text-similarity`, `date-pattern`, `isolation-forest`, `logistic-regression`, `pdf-extractor`

**Business Rules:**

- All AI suggestions MUST be dismissible (Human-in-the-Loop).
- Confidence scores are displayed on all AI-generated data.
- AI learns from user corrections via the feedback loop.
- Pattern analysis runs in background jobs (BullMQ).
- NEVER auto-post financial transactions without explicit user confirmation.
- Lead scoring blends 70% rule-based + 30% ML when a trained model is available.
- Document intake pipeline: OCR -> Classification -> Entity Extraction -> Vendor Matching -> Duplicate Check.

**Key Endpoints:**

- `POST /ai/categorize` -- Categorize a transaction
- `POST /ai/ocr/extract` -- Extract text from document image
- `POST /ai/document-intake/process` -- Full document intake pipeline
- `GET /ai/anomalies` -- List detected anomalies
- `GET /ai/cash-flow/predict` -- Cash flow forecast
- `GET /ai/demand-forecast/:itemId` -- Demand forecast for item
- `POST /ai/reconciliation/match` -- AI-powered bank reconciliation
- `GET /ai/lead-scoring/:leadId` -- Get lead score
- `GET /ai/insights` -- List AI-generated insights
- `POST /ai/feedback` -- Submit feedback on AI prediction
- `GET /ai/fraud-alerts` -- List fraud alerts
- `POST /ai/chatbot/message` -- NLP chatbot interaction

**Dependencies:** Prisma, Accounting, Sales, Purchases, Banking, Inventory, CRM, HR, Manufacturing, Audit

---

## 3. Assets

**Path:** `modules/assets/`

**Purpose:** Fixed asset lifecycle management including acquisition, depreciation calculation, and disposal with automatic journal entry generation.

**Key Entities:**

- **Asset** -- Fixed asset register entry (name, acquisition date, cost, useful life, salvage value, accumulated depreciation, status)

**Business Rules:**

- Depreciation method: straight-line (Cost - Salvage Value) / Useful Life per year.
- Monthly depreciation cron job runs automatically.
- Asset status lifecycle: `Active` -> `Fully Depreciated` -> `Disposed`.
- Disposal generates gain/loss journal entries (Dr Cash + Dr Accumulated Depreciation / Cr Asset + Cr/Dr Gain or Loss).
- Acquisition creates journal: Dr Asset / Cr Cash or AP.
- Monthly depreciation creates journal: Dr Depreciation Expense / Cr Accumulated Depreciation.

**Key Endpoints:**

- `GET /assets` -- List all assets (filterable by status)
- `POST /assets` -- Register new asset
- `GET /assets/:id` -- Get asset details with depreciation schedule
- `PUT /assets/:id` -- Update asset
- `POST /assets/:id/dispose` -- Dispose asset (generates journals)

**Dependencies:** Prisma, Accounting, Audit

---

## 4. Audit

**Path:** `modules/audit/`

**Purpose:** Immutable audit trail for all write operations across the system. Every CREATE, UPDATE, and DELETE action is logged with full before/after snapshots.

**Key Entities:**

- **AuditLog** -- Immutable log entry with fields: `userId`, `timestamp`, `action` (CREATE/UPDATE/DELETE), `entityType`, `entityId`, `oldValues` (JSON), `newValues` (JSON), `organizationId`

**Business Rules:**

- Audit logs are append-only and immutable -- they cannot be updated or deleted.
- Every write operation across all modules creates an audit log entry automatically.
- `entityType` and `entityId` are separate fields (not a single combined field).
- Searchable by user, date range, entity type, entity ID, and action type.

**Key Endpoints:**

- `GET /audit-logs` -- List audit logs (paginated, filterable by user, date, entity type, action)
- `GET /audit-logs/:id` -- Get specific audit log entry with full diff

**Dependencies:** Prisma

---

## 5. Auth

**Path:** `modules/auth/`

**Purpose:** Authentication and session management using JWT with Passport. Handles user registration, login, token refresh, and logout with secure token rotation.

**Key Entities:**

- **User** (via Users module) -- Authentication credentials
- **RefreshToken** -- Stored refresh tokens for rotation

**Business Rules:**

- Password hashing with bcrypt (cost factor 12+).
- Token pair: access token (15-minute TTL) + refresh token (7-day TTL).
- Refresh token rotation: each refresh invalidates the old token and issues a new pair.
- All endpoints except auth routes are protected by `JwtAuthGuard` + `OrganizationGuard`.
- Failed login attempts should be rate-limited.

**Key Endpoints:**

- `POST /auth/register` -- Register new user and organization
- `POST /auth/login` -- Login (returns access + refresh token pair)
- `POST /auth/refresh` -- Refresh token pair (rotation)
- `POST /auth/logout` -- Invalidate refresh token

**Dependencies:** Prisma, Users

---

## 6. Banking

**Path:** `modules/banking/`

**Purpose:** Bank account management, transaction tracking, statement import, reconciliation, and automatic categorization rules. Serves as the bridge between external banking data and the internal ledger.

**Key Entities:**

- **BankAccount** -- Bank account details with system balance and bank statement balance tracking
- **BankTransaction** -- Individual bank transactions (imported or manual)
- **BankRule** -- Auto-categorization rules applied during import

**Business Rules:**

- Statement import supports CSV, XLSX, and OFX formats.
- Bank rules auto-categorize transactions on import based on pattern matching (description, amount range, etc.).
- System balance vs. bank statement balance tracking for reconciliation.
- AI-powered reconciliation matching suggests transaction-to-entry pairings.
- Reconciliation marks transactions as matched and creates corresponding journal entries.

**Key Endpoints:**

- `GET /bank-accounts` -- List bank accounts
- `POST /bank-accounts` -- Create bank account
- `GET /bank-accounts/:id` -- Get bank account with balance summary
- `GET /bank-transactions` -- List bank transactions (filterable)
- `POST /bank-transactions/import` -- Import bank statement (CSV/XLSX/OFX)
- `POST /bank-transactions/:id/categorize` -- Categorize a transaction
- `GET /bank-rules` -- List bank rules
- `POST /bank-rules` -- Create bank rule
- `POST /reconciliation/start` -- Start reconciliation session
- `POST /reconciliation/match` -- Match transactions to journal entries
- `POST /reconciliation/complete` -- Finalize reconciliation

**Dependencies:** Prisma, Accounting, AI, Audit

---

## 7. CRM

**Path:** `modules/crm/`

**Purpose:** Customer Relationship Management with lead tracking, deal pipeline management, and activity logging. Supports the full sales funnel from lead capture to customer conversion.

**Key Entities:**

- **Lead** -- Potential customers with source tracking (web, referral, campaign, etc.), status, and contact info
- **Deal** -- Sales opportunities with Kanban pipeline stages, value, probability, and expected close date
- **Activity** -- Interaction logs: calls, emails, meetings, notes linked to leads or deals

**Business Rules:**

- Lead -> Deal conversion: creates a Deal linked to the Lead with inherited contact data.
- Deal -> Customer conversion on win: creates a Customer record in the Sales module.
- Deal pipeline stages are customizable per organization (Kanban board).
- AI lead scoring assigns quality scores based on 70% rule-based + 30% ML model.
- Activities are timestamped and linked to the responsible user.

**Key Endpoints:**

- `GET /crm/leads` -- List leads (filterable by status, source)
- `POST /crm/leads` -- Create lead
- `POST /crm/leads/:id/convert` -- Convert lead to deal
- `GET /crm/deals` -- List deals (filterable by stage, pipeline)
- `POST /crm/deals` -- Create deal
- `PUT /crm/deals/:id/stage` -- Move deal to new stage
- `POST /crm/deals/:id/win` -- Mark deal as won (converts to customer)
- `POST /crm/deals/:id/lose` -- Mark deal as lost
- `GET /crm/activities` -- List activities
- `POST /crm/activities` -- Log activity

**Dependencies:** Prisma, Sales, AI, Audit

---

## 8. Currency

**Path:** `modules/currency/`

**Purpose:** Multi-currency support with exchange rate management and currency conversion for international transactions.

**Key Entities:**

- **Currency** -- Currency definitions (code, name, symbol, decimal places)
- **ExchangeRate** -- Exchange rates between currency pairs with effective dates

**Business Rules:**

- Organization has a base currency; all reporting converts to base currency.
- Exchange rates can be manually entered or fetched.
- Transactions in foreign currencies store both the original amount and the base currency equivalent.
- Realized and unrealized gain/loss tracking for currency fluctuations.

**Key Endpoints:**

- `GET /currencies` -- List available currencies
- `POST /currencies` -- Add currency
- `GET /currencies/exchange-rates` -- Get exchange rates
- `POST /currencies/exchange-rates` -- Set exchange rate
- `GET /currencies/convert` -- Convert amount between currencies

**Dependencies:** Prisma

---

## 9. Documents

**Path:** `modules/documents/`

**Purpose:** Document template management and PDF generation for invoices, quotes, payslips, and other business documents. Also handles email delivery of documents.

**Key Entities:**

- **DocumentTemplate** -- HTML/Handlebars templates for PDF rendering with organization branding

**Services:**

- **PdfService** -- PDF generation using Puppeteer (headless Chrome)
- **EmailService** -- Email delivery via nodemailer

**Business Rules:**

- PDFs render with organization branding (logo, colors, address, tax ID).
- Templates are customizable per document type (invoice, quote, credit note, payslip, delivery challan).
- Generated PDFs are stored or streamed directly to the client.

**Key Endpoints:**

- `GET /documents/templates` -- List document templates
- `POST /documents/templates` -- Create/update template
- `POST /documents/generate-pdf` -- Generate PDF for a given entity
- `POST /documents/send-email` -- Send document via email

**Dependencies:** Prisma, Sales, Purchases, HR

---

## 10. HR

**Path:** `modules/hr/`

**Purpose:** Human Resources management covering employee records, attendance tracking, payroll processing, and payslip generation with automatic journal entry creation.

**Key Entities:**

- **Employee** -- Employee records (no `deletedAt` field -- use `isActive: true` or `status: 'ACTIVE'` instead)
- **Attendance** -- Daily attendance records: present, absent, leave, half-day
- **PayrollRun** -- Monthly payroll batch processing
- **Payslip** -- Individual payslip per employee per payroll run

**Business Rules:**

- Payroll calculation: `Gross = Basic + Allowances`, `LOP = (Gross / 30) * absent days`, `Net = Gross - LOP - Tax - Deductions`.
- Cannot run payroll twice for the same month/period -- system enforces uniqueness.
- Payroll journal entry: Dr Salaries Expense / Cr Payroll Payable + Cr Tax Payable.
- Employee has NO `deletedAt` field -- deactivation uses `isActive: false` or `status` field.
- Attendance is tracked daily with support for present, absent, leave, and half-day statuses.

**Key Endpoints:**

- `GET /employees` -- List employees (filterable by department, status)
- `POST /employees` -- Create employee
- `GET /employees/:id` -- Get employee details
- `PUT /employees/:id` -- Update employee
- `GET /attendance` -- List attendance records
- `POST /attendance` -- Record attendance
- `POST /payroll/run` -- Execute payroll for a period
- `GET /payroll/runs` -- List payroll runs
- `GET /payroll/runs/:id/payslips` -- Get payslips for a run
- `GET /payslips/:id` -- Get individual payslip

**Dependencies:** Prisma, Accounting, Documents, Audit

---

## 11. Import-Export

**Path:** `modules/import-export/`

**Purpose:** Bulk data import and export in CSV and XLSX formats. Supports column mapping for flexible imports and formatted exports for all major entities.

**Key Entities:**

- No dedicated database entities -- operates on entities from other modules.

**Business Rules:**

- Import supports column mapping UI -- users map CSV/XLSX columns to system fields.
- Validation runs on each row during import; invalid rows are reported with error details.
- Export supports CSV and Excel formats with formatted headers.
- Bulk operations run asynchronously for large datasets.

**Key Endpoints:**

- `POST /import/:entityType` -- Import data (CSV/XLSX upload with column mapping)
- `GET /import/:entityType/template` -- Download import template
- `GET /export/:entityType` -- Export data (CSV/XLSX download with filters)

**Dependencies:** Prisma, Sales, Purchases, Inventory, Banking, HR

---

## 12. Inventory

**Path:** `modules/inventory/`

**Purpose:** Complete inventory management with item tracking, warehouse management, stock movements, adjustments, composite items, transfers, price lists, and FIFO costing.

**Key Entities:**

- **Item** -- Products and services. Goods track stock; services do not. SKU is unique per organization.
- **Warehouse** -- Physical storage locations with per-item stock levels.
- **StockMovement** -- Every stock change is logged (purchase, sale, adjustment, transfer, manufacturing).
- **InventoryAdjustment** -- Manual stock corrections with journal entries.
- **CompositeItem** -- Bundle items composed of multiple component items.
- **Transfer** -- Inter-warehouse stock transfers.
- **PriceList** -- Custom pricing (%, fixed amount adjustments) linkable to specific customers.

**Business Rules:**

- Goods-type items track stock; service-type items do not.
- SKU must be unique within the organization.
- Stock per item per warehouse is maintained.
- Every stock change creates a StockMovement record.
- Adjustment journals: increase = Dr Inventory / Cr Other Income; decrease = Dr Shrinkage / Cr Inventory.
- Price lists support percentage or fixed-amount adjustments and can be linked to specific customers.
- FIFO (First-In, First-Out) costing method for cost of goods calculations.
- Composite items have a BOM-like structure listing component items and quantities.

**Key Endpoints:**

- `GET /items` -- List items (filterable by type, category, warehouse)
- `POST /items` -- Create item
- `GET /items/:id` -- Get item details with stock levels
- `PUT /items/:id` -- Update item
- `GET /warehouses` -- List warehouses
- `POST /warehouses` -- Create warehouse
- `GET /warehouses/:id/stock` -- Get stock levels for a warehouse
- `POST /adjustments` -- Create inventory adjustment
- `GET /adjustments` -- List adjustments
- `POST /transfers` -- Create inter-warehouse transfer
- `GET /transfers` -- List transfers
- `GET /composite-items` -- List composite items
- `POST /composite-items` -- Create composite item
- `GET /price-lists` -- List price lists
- `POST /price-lists` -- Create price list

**Dependencies:** Prisma, Accounting, Audit

---

## 13. Manufacturing

**Path:** `modules/manufacturing/`

**Purpose:** Manufacturing operations management with Bill of Materials (BOM) definitions and Work Order processing. Handles material requirements planning and COGM (Cost of Goods Manufactured) accounting.

**Key Entities:**

- **BOM (Bill of Materials)** -- Defines finished goods with their raw material components and quantities. Supports nested BOMs (sub-assemblies).
- **WorkOrder** -- Production orders with material requirements calculated from BOM x quantity.

**Business Rules:**

- BOM defines finished good + raw materials with quantities.
- Nested BOM support: a BOM component can itself reference another BOM (sub-assemblies).
- Work order material requirements = BOM quantities x work order quantity.
- Work order status lifecycle: `Draft` -> `In Process` -> `Completed`.
- Auto-numbering: WO# prefix.
- Completing a work order: raw materials stock decreases, finished goods stock increases.
- COGM journal entry on completion: Dr Finished Goods Inventory / Cr Raw Materials Inventory + Cr Manufacturing Overhead.

**Key Endpoints:**

- `GET /boms` -- List BOMs
- `POST /boms` -- Create BOM
- `GET /boms/:id` -- Get BOM details with components (resolves nested BOMs)
- `PUT /boms/:id` -- Update BOM
- `GET /work-orders` -- List work orders
- `POST /work-orders` -- Create work order from BOM
- `GET /work-orders/:id` -- Get work order details with material requirements
- `PUT /work-orders/:id/status` -- Update work order status
- `POST /work-orders/:id/complete` -- Complete work order (adjusts stock, creates journals)

**Dependencies:** Prisma, Inventory, Accounting, Audit

---

## 14. Notifications

**Path:** `modules/notifications/`

**Purpose:** Notification delivery system supporting both email notifications (via nodemailer) and in-app notifications. Used by other modules to alert users about events, deadlines, and AI insights.

**Key Entities:**

- **Notification** -- In-app notification record with type, message, read/unread status, and target user.

**Business Rules:**

- Email notifications sent via nodemailer with configurable SMTP settings.
- In-app notifications support read/unread status and bulk mark-as-read.
- AI alert delivery routes through this module.
- Notification preferences can be configured per user.

**Key Endpoints:**

- `GET /notifications` -- List notifications for current user
- `PUT /notifications/:id/read` -- Mark notification as read
- `PUT /notifications/read-all` -- Mark all as read
- `DELETE /notifications/:id` -- Delete notification

**Dependencies:** Prisma, Documents (EmailService)

---

## 15. Organizations

**Path:** `modules/organizations/`

**Purpose:** Multi-tenant organization management. Handles organization creation, settings, and the onboarding wizard. Every entity in the system is scoped to an organization via `organizationId`.

**Key Entities:**

- **Organization** -- Tenant entity with name, settings, base currency, fiscal year, lock date, branding, and address details.

**Business Rules:**

- All database queries across all modules MUST include `organizationId` -- data never leaks across tenants.
- Organization settings include: base currency, fiscal year start, lock date, tax configuration, branding (logo, colors).
- Onboarding wizard guides new organizations through initial setup (chart of accounts, bank accounts, opening balances).

**Key Endpoints:**

- `GET /organizations/current` -- Get current organization details
- `PUT /organizations/current` -- Update organization settings
- `POST /organizations` -- Create new organization
- `PUT /organizations/current/lock-date` -- Set accounting lock date
- `POST /organizations/current/onboarding` -- Complete onboarding step

**Dependencies:** Prisma, Audit

---

## 16. Projects

**Path:** `modules/projects/`

**Purpose:** Project management with task tracking, timesheet logging, and project-based invoicing. Supports both billable and non-billable time tracking with budget monitoring.

**Key Entities:**

- **Project** -- Project record with name, linked customer, billing method (fixed/hourly), budget, and status.
- **Task** -- Individual tasks within a project with hourly rate and billable flag.
- **TimesheetEntry** -- Time logged against tasks via timer or manual entry. Status: `Unbilled` -> `Invoiced`.

**Business Rules:**

- Time can be logged via running timer or manual entry.
- Tasks have an hourly rate and a billable flag (non-billable hours are tracked but not invoiced).
- Timesheet entry status lifecycle: `Unbilled` -> `Invoiced`.
- Project invoicing: bills all unbilled hours (rate x hours) plus unbilled expenses in a single invoice.
- Budget alert triggers at 80% consumption.
- Projects link to Customers in the Sales module for invoicing.

**Key Endpoints:**

- `GET /projects` -- List projects (filterable by status, customer)
- `POST /projects` -- Create project
- `GET /projects/:id` -- Get project details with budget usage
- `PUT /projects/:id` -- Update project
- `GET /projects/:id/tasks` -- List tasks for project
- `POST /projects/:id/tasks` -- Create task
- `GET /timesheets` -- List timesheet entries (filterable)
- `POST /timesheets` -- Log time entry
- `POST /timesheets/timer/start` -- Start timer
- `POST /timesheets/timer/stop` -- Stop timer
- `POST /projects/:id/invoice` -- Generate invoice for unbilled time and expenses

**Dependencies:** Prisma, Sales, Accounting, Audit

---

## 17. Purchases

**Path:** `modules/purchases/`

**Purpose:** Full purchase cycle management covering vendor records, bills, expenses, vendor credits, and payment processing. Handles accounts payable and purchase-related journal entries.

**Key Entities:**

- **Vendor** -- Supplier records with contact info, payment terms, tax ID, and currency.
- **Bill** -- Purchase invoices from vendors with vendor reference number.
- **Expense** -- Immediate cash outflow (no accounts payable -- expensed directly).
- **VendorCredit** -- Credit from vendor for returns or adjustments.
- **PaymentMade** -- Payment records with allocation across multiple bills.

**Business Rules:**

- Bill journal entry: Dr Inventory/Expense + Dr VAT Receivable / Cr Accounts Payable.
- Expenses are immediate cash outflow -- no AP involved (Dr Expense / Cr Cash/Bank).
- AI categorization suggests expense categories based on description and vendor history.
- Vendor credits journal: Dr Accounts Payable / Cr Purchase Returns.
- Payments can be allocated across multiple outstanding bills.
- Overdue bill detection cron job updates status to Overdue automatically.
- Bill status lifecycle: `Draft` -> `Open` -> `Partially Paid` -> `Paid` -> `Overdue`.

**Key Endpoints:**

- `GET /vendors` -- List vendors
- `POST /vendors` -- Create vendor
- `GET /vendors/:id` -- Get vendor with outstanding balance
- `GET /bills` -- List bills (filterable by status, vendor, date)
- `POST /bills` -- Create bill (generates journal)
- `GET /bills/:id` -- Get bill details
- `PUT /bills/:id` -- Update bill
- `GET /expenses` -- List expenses
- `POST /expenses` -- Create expense (generates journal)
- `GET /vendor-credits` -- List vendor credits
- `POST /vendor-credits` -- Create vendor credit
- `POST /vendor-credits/:id/apply` -- Apply credit to bill
- `GET /payments-made` -- List payments made
- `POST /payments-made` -- Record payment (allocate to bills)

**Dependencies:** Prisma, Accounting, Inventory, Tax, AI, Audit

---

## 18. Reports

**Path:** `modules/reports/`

**Purpose:** Financial and management reporting covering all standard accounting reports. All reports support date range filtering, period comparison, and CSV/Excel export.

**Key Entities:**

- No dedicated database entities -- reports aggregate data from Accounting, Sales, Purchases, and Banking modules.

**Services:**

- **FinancialReportsService** -- P&L, Balance Sheet, Cash Flow, Trial Balance, General Ledger
- **AgingReportsService** -- AR and AP aging analysis
- **DashboardService** -- Dashboard KPIs and summary widgets

**Report Types:**

- **Profit & Loss (P&L)** -- Revenue - Expenses = Net Income. Supports period-over-period comparison.
- **Balance Sheet** -- Assets = Liabilities + Equity. MUST balance.
- **Cash Flow Statement** -- Operating + Investing + Financing activities.
- **Trial Balance** -- All accounts with balances. Total Debits MUST equal Total Credits.
- **General Ledger** -- Transaction detail per account with running balance.
- **AR Aging** -- Accounts Receivable aged by: 1-15, 16-30, 31-60, 61-90, 90+ day buckets.
- **AP Aging** -- Accounts Payable aged by: 1-15, 16-30, 31-60, 61-90, 90+ day buckets.

**Business Rules:**

- All reports filter by `organizationId` and support date range parameters.
- Balance Sheet must always balance (Assets = Liabilities + Equity).
- Trial Balance must always balance (total Debits = total Credits).
- Reports support CSV and Excel export.
- Dashboard provides real-time KPIs: revenue, expenses, profit, cash position, AR/AP totals.

**Key Endpoints:**

- `GET /reports/profit-and-loss` -- P&L report
- `GET /reports/balance-sheet` -- Balance Sheet report
- `GET /reports/cash-flow` -- Cash Flow Statement
- `GET /reports/trial-balance` -- Trial Balance
- `GET /reports/general-ledger` -- General Ledger (per account)
- `GET /reports/ar-aging` -- Accounts Receivable aging
- `GET /reports/ap-aging` -- Accounts Payable aging
- `GET /reports/dashboard` -- Dashboard KPIs
- `GET /reports/export/:type` -- Export report as CSV/Excel

**Dependencies:** Prisma, Accounting, Sales, Purchases, Banking

---

## 19. Roles

**Path:** `modules/roles/`

**Purpose:** Role-Based Access Control (RBAC) system managing roles, permissions, and authorization across all modules.

**Key Entities:**

- **Role** -- Named role with a set of permissions (e.g., Admin, Accountant, Sales Rep)
- **Permission** -- Granular permission entries: View, Create, Edit, Delete, Export per module

**Business Rules:**

- Default roles: Admin, Accountant, Sales Rep, Store Keeper, Manager.
- Permissions are granular: View, Create, Edit, Delete, Export per module.
- Admin role bypasses all permission checks.
- Custom roles are supported -- organizations can create their own roles with any permission combination.
- Roles are enforced via `@Permissions('module.action')` decorator on controller endpoints.

**Key Endpoints:**

- `GET /roles` -- List roles
- `POST /roles` -- Create custom role
- `GET /roles/:id` -- Get role with permissions
- `PUT /roles/:id` -- Update role permissions
- `DELETE /roles/:id` -- Delete custom role (cannot delete default roles)

**Dependencies:** Prisma, Audit

---

## 20. Sales

**Path:** `modules/sales/`

**Purpose:** Complete sales cycle management from customer records through quoting, invoicing, credit notes, payment collection, delivery challans, and recurring invoices. Handles accounts receivable and revenue recognition.

**Key Entities:**

- **Customer** -- Customer records with name, email, phone, addresses, tax ID, payment terms, and currency.
- **Quote** -- Sales estimates/proposals. Auto-numbered: `EST-YYYY-XXXXX`.
- **Invoice** -- Sales invoices. Auto-numbered: `INV-YYYY-XXXXX`.
- **CreditNote** -- Credit against an original invoice for returns/adjustments.
- **PaymentReceived** -- Payment records with allocation across multiple invoices.
- **DeliveryChallan** -- Delivery/shipping documents for dispatched goods.

**Business Rules:**

- Quote -> Invoice conversion: creates invoice from quote data.
- Invoice journal entry: Dr Accounts Receivable / Cr Revenue / Cr VAT Payable.
- Invoice status lifecycle: `Draft` -> `Sent` -> `Partially Paid` -> `Paid` -> `Overdue`.
- Credit notes must reference an original invoice.
- Payments can be allocated across multiple outstanding invoices.
- Overdue invoice detection cron job updates status automatically.
- Auto-numbering: INV-YYYY-XXXXX, EST-YYYY-XXXXX.
- Recurring invoices generate automatically on schedule.

**Key Endpoints:**

- `GET /customers` -- List customers
- `POST /customers` -- Create customer
- `GET /customers/:id` -- Get customer with outstanding balance
- `GET /quotes` -- List quotes
- `POST /quotes` -- Create quote
- `POST /quotes/:id/convert` -- Convert quote to invoice
- `GET /invoices` -- List invoices (filterable by status, customer, date)
- `POST /invoices` -- Create invoice (generates journal)
- `GET /invoices/:id` -- Get invoice details
- `PUT /invoices/:id` -- Update invoice
- `POST /invoices/:id/send` -- Send invoice via email
- `GET /credit-notes` -- List credit notes
- `POST /credit-notes` -- Create credit note
- `POST /credit-notes/:id/apply` -- Apply credit to invoice
- `GET /payments-received` -- List payments received
- `POST /payments-received` -- Record payment (allocate to invoices)
- `GET /delivery-challans` -- List delivery challans
- `POST /delivery-challans` -- Create delivery challan

**Dependencies:** Prisma, Accounting, Inventory, Tax, Documents, Notifications, Audit

---

## 21. Tax

**Path:** `modules/tax/`

**Purpose:** Tax rate management, VAT return preparation, and VAT payment tracking. Handles the full tax compliance cycle from rate definition through filing and payment.

**Key Entities:**

- **TaxRate** -- Tax rate definition with name, percentage, type (inclusive/exclusive), and linked ledger account.
- **VATReturn** -- VAT filing record: Output VAT - Input VAT = Net VAT.
- **VATPayment** -- Payment of VAT liability to tax authority.

**Business Rules:**

- Tax rates link to a specific ledger account for automatic journal posting.
- VAT Return calculation: Output VAT (from sales) - Input VAT (from purchases) = Net VAT payable/receivable.
- Filing a VAT return locks the period -- transactions within the period cannot be modified.
- VAT payment journal: Dr VAT Payable / Cr Bank.
- Deadline alerts fire at 7, 3, and 1 days before filing due dates via notifications.

**Key Endpoints:**

- `GET /tax-rates` -- List tax rates
- `POST /tax-rates` -- Create tax rate
- `PUT /tax-rates/:id` -- Update tax rate
- `GET /vat-returns` -- List VAT returns
- `POST /vat-returns` -- Prepare VAT return for period
- `POST /vat-returns/:id/file` -- File VAT return (locks period)
- `POST /vat-returns/:id/pay` -- Record VAT payment

**Dependencies:** Prisma, Accounting, Sales, Purchases, Banking, Notifications, Audit

---

## 22. User Preferences

**Path:** `modules/user-preferences/`

**Purpose:** Per-user configuration for UI and localization settings. Stores preferences that affect how data is displayed to individual users without changing organizational data.

**Key Entities:**

- **UserPreference** -- User-specific settings record.

**Configurable Settings:**

- Language / locale
- Timezone
- Date format (DD/MM/YYYY, MM/DD/YYYY, YYYY-MM-DD)
- Currency display format
- Number format (decimal/thousands separators)

**Key Endpoints:**

- `GET /user-preferences` -- Get current user's preferences
- `PUT /user-preferences` -- Update preferences

**Dependencies:** Prisma

---

## 23. Users

**Path:** `modules/users/`

**Purpose:** User account management including profile updates, password changes, and user listing for the organization.

**Key Entities:**

- **User** -- User account with name, email, password hash, role, organization membership, and active status.

**Business Rules:**

- Users belong to an organization (multi-tenant scoping).
- Password changes require current password verification.
- User listing is scoped to the current organization.

**Key Endpoints:**

- `GET /users` -- List users in organization
- `GET /users/:id` -- Get user profile
- `PUT /users/:id` -- Update user profile
- `PUT /users/:id/password` -- Change password

**Dependencies:** Prisma, Roles, Audit

---

## Module Dependency Graph

```
Auth
  -> Users, Prisma

Organizations
  -> Prisma, Audit

Users
  -> Prisma, Roles, Audit

Roles
  -> Prisma, Audit

Accounting
  -> Prisma, Audit

Sales
  -> Prisma, Accounting, Inventory, Tax, Documents, Notifications, Audit

Purchases
  -> Prisma, Accounting, Inventory, Tax, AI, Audit

Inventory
  -> Prisma, Accounting, Audit

Banking
  -> Prisma, Accounting, AI, Audit

Manufacturing
  -> Prisma, Inventory, Accounting, Audit

HR
  -> Prisma, Accounting, Documents, Audit

Projects
  -> Prisma, Sales, Accounting, Audit

Assets
  -> Prisma, Accounting, Audit

Tax
  -> Prisma, Accounting, Sales, Purchases, Banking, Notifications, Audit

CRM
  -> Prisma, Sales, AI, Audit

Reports
  -> Prisma, Accounting, Sales, Purchases, Banking

Documents
  -> Prisma, Sales, Purchases, HR

Notifications
  -> Prisma, Documents

Import-Export
  -> Prisma, Sales, Purchases, Inventory, Banking, HR

AI
  -> Prisma, Accounting, Sales, Purchases, Banking, Inventory, CRM, HR, Manufacturing, Audit

Audit
  -> Prisma

User Preferences
  -> Prisma

Currency
  -> Prisma
```

---

## Cross-Cutting Concerns

All modules (except Auth) share these common patterns:

- **Multi-tenancy:** Every query includes `organizationId` via `OrganizationGuard`.
- **Authentication:** All endpoints (except `/auth/*`) protected by `JwtAuthGuard`.
- **Authorization:** RBAC via `@Permissions()` decorator, enforced by `RolesGuard`.
- **Audit Trail:** All write operations automatically logged by the Audit module.
- **Soft Delete:** Financial records use `deletedAt` -- never hard-deleted.
- **Monetary Precision:** All money fields use `Decimal @db.Decimal(19, 4)`.
- **Auto-numbering:** Documents use format `PREFIX-YYYY-XXXXX` with per-org sequence.
- **Pagination:** List endpoints support `page`, `limit`, `sort`, `order` query parameters.
- **Response Format:** `{ data: T, meta?: { page, limit, total, totalPages } }` for lists; `{ data: T }` for single entities.
