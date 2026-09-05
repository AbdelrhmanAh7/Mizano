> Historical architecture/testing context. The September 2026 [roadmap](roadmap.md), [constitution](../AGENTS.md) and [demo acceptance](strategy/demo-acceptance.md) define the current CPU-first goal and release gates. Descriptions here are not proof that a feature is implemented or verified.

# Mizano ERP System Architecture

## System Architecture

### High-Level Overview

Mizano is an AI-powered Autonomous Accounting Platform built as a monorepo using Turborepo and pnpm workspaces. The system is designed for zero-touch accounting, where AI handles 95% of routine work with no accounting knowledge required from users.

The monorepo contains the following workspaces:

| Workspace               | Technology                 | Purpose                                                                |
| ----------------------- | -------------------------- | ---------------------------------------------------------------------- |
| `apps/api`              | NestJS 10 (port 6001)      | REST API backend with business logic, AI services, and database access |
| `apps/web`              | Next.js 14 (port 5001)     | Frontend with App Router, server components, and BFF API routes        |
| `ocr-service`           | Python FastAPI (port 7001) | PaddleOCR + Tesseract for document text extraction (no GPU needed)     |
| `services/vlm-service`  | Python FastAPI (port 8100) | Vision-Language Model microservice for invoice data extraction         |
| `packages/shared-types` | TypeScript                 | Shared type definitions consumed by both apps                          |
| `packages/validators`   | Zod                        | Shared validation schemas for forms and API DTOs                       |

The data layer consists of PostgreSQL 16 (via Prisma ORM) for persistent storage with 87+ models, and Redis 7 for caching and BullMQ job queues.

```
+------------------------------------------------------------------+
|                        Architecture Layers                        |
+------------------------------------------------------------------+
|                                                                    |
|  +--------------------------+   +-----------------------------+   |
|  |      apps/web            |   |       apps/api              |   |
|  |      (Next.js 14)        |   |       (NestJS 10)           |   |
|  |      Port 5001           |   |       Port 6001             |   |
|  |                          |   |                             |   |
|  |  +--------------------+  |   |  +------ Controllers ----+  |   |
|  |  | React Server       |  |   |  | JwtAuthGuard          |  |   |
|  |  | Components         |  |   |  | OrganizationGuard     |  |   |
|  |  +--------------------+  |   |  | PermissionsGuard      |  |   |
|  |  | 'use client'       |  |   |  +-----------------------+  |   |
|  |  | Components         |  |   |           |                 |   |
|  |  | (TanStack Query,   |  |   |  +------ Services -------+  |   |
|  |  |  Zustand, Forms)   |  |   |  | Business Logic        |  |   |
|  |  +--------------------+  |   |  | AI/ML Processing      |  |   |
|  |  | API Routes (BFF)   |-------->| Audit Logging         |  |   |
|  |  +--------------------+  |   |  +-----------------------+  |   |
|  +--------------------------+   |           |                 |   |
|                                 |  +------ Prisma ORM -----+  |   |
|  +--------------------------+   |  | 87+ Models            |  |   |
|  |    packages/             |   |  | Multi-tenant queries  |  |   |
|  |    shared-types          |   |  +-----------------------+  |   |
|  |    validators            |   |           |                 |   |
|  +--------------------------+   +-----------------------------+   |
|                                             |                     |
|  +------------------------------------------+------------------+  |
|  |                   Data Layer                                |  |
|  |                                                              |  |
|  |  +----------------------+    +----------------------------+  |  |
|  |  |   PostgreSQL 16      |    |   Redis 7                  |  |  |
|  |  |   Primary Database   |    |   Cache + BullMQ Queues    |  |  |
|  |  |   Decimal(19,4)      |    |   Session Management       |  |  |
|  |  |   for money fields   |    |   Background Job Queues    |  |  |
|  |  +----------------------+    +----------------------------+  |  |
|  +--------------------------------------------------------------+  |
|                                                                    |
+------------------------------------------------------------------+
```

---

### Request Flow

All client requests follow a layered architecture that ensures security, multi-tenancy isolation, and auditability at every step.

**Synchronous Request Flow:**

```
Browser/Client
    |
    v
Next.js App (port 5001)
    |
    +-- React Server Components (direct data fetching)
    |
    +-- API Routes (BFF Layer)
            |
            v
        NestJS API (port 6001)
            |
            +-- JwtAuthGuard (verify access token)
            +-- OrganizationGuard (enforce tenant isolation)
            +-- PermissionsGuard (check RBAC: module.action)
            |
            v
        Controller (parse & validate DTOs)
            |
            v
        Service (business logic + validation)
            |
            v
        Prisma ORM (query builder)
            |
            +-- organizationId filter (always applied)
            +-- $transaction() for multi-table writes
            +-- AuditLog entry on every write
            |
            v
        PostgreSQL 16 (persistent storage)
```

**Asynchronous Background Flow:**

```
Scheduler / Event Trigger
    |
    v
BullMQ Queue (Redis)
    |
    v
Worker Process
    |
    +-- AI Training Jobs (model retraining on feedback)
    +-- Scheduled Analysis (anomaly detection, forecasting)
    +-- Document Processing (OCR, classification, extraction)
    +-- Notification Delivery
    |
    v
Results stored in PostgreSQL (AiPrediction, AiAnomaly, AIInsight)
    |
    v
Dashboard alerts / user notifications
```

---

### Multi-Tenancy Architecture

Mizano implements strict row-level multi-tenancy. Every piece of data belongs to exactly one organization, and cross-organization access is architecturally impossible when the guards are in place.

**Design Principles:**

- Every Prisma model includes an `organizationId` field indexed for performance
- `OrganizationGuard` runs on every protected endpoint, extracting the user's `organizationId` from the JWT token
- All database queries MUST include `organizationId` in the WHERE clause -- this is enforced by convention and code review
- Cross-organization access attempts return `403 Forbidden`
- AI models are trained per-organization to prevent data leakage between tenants
- The `@CurrentOrg()` parameter decorator provides the authenticated user's `organizationId` to controllers

**Enforcement Stack:**

```
Request arrives
    |
    v
JwtAuthGuard
    +-- Validates JWT signature and expiry
    +-- Extracts userId and organizationId from token payload
    |
    v
OrganizationGuard
    +-- Confirms user belongs to the claimed organization
    +-- Injects organizationId into request context
    |
    v
Controller
    +-- @CurrentOrg() decorator reads organizationId from request
    +-- Passes organizationId to service layer
    |
    v
Service
    +-- ALL Prisma queries include: where: { organizationId }
    +-- Prisma transactions scope all operations to the same org
```

**Database Index Pattern:**

```prisma
@@index([organizationId, status])
@@index([organizationId, createdAt])
```

These composite indexes ensure tenant-scoped queries remain fast even at scale.

---

### Double-Entry Accounting Engine

The core financial engine enforces double-entry bookkeeping principles at the application level, making it impossible to create unbalanced transactions.

**Core Rules:**

1. Every financial transaction (invoice, bill, payment, expense) creates one or more journal entry lines
2. Total debits MUST equal total credits -- enforced in the service layer before any database write
3. All monetary values use `Prisma Decimal @db.Decimal(19,4)` -- this supports values up to 999 trillion with 4 decimal places of precision. JavaScript `number` and `float` types are never used for money
4. Financial records use soft deletes via a `deletedAt DateTime?` field -- hard deletes are prohibited
5. A lock date mechanism prevents modification of journal entries in closed accounting periods
6. Document numbers are auto-generated with prefixes: `INV-XXX` (invoices), `BILL-XXX` (bills), `JRN-XXX` (journals), `EST-XXX` (estimates), `PMT-XXX` (payments)

**Balance Enforcement Pattern:**

```typescript
const totalDebits = lines.reduce((sum, l) => sum.add(l.debit), new Decimal(0));
const totalCredits = lines.reduce((sum, l) => sum.add(l.credit), new Decimal(0));

if (!totalDebits.equals(totalCredits)) {
  throw new BadRequestException('Journal entry must balance');
}
```

**Journal Entry Flow:**

```
Financial Transaction (Invoice, Bill, Payment, etc.)
    |
    v
Service Layer
    +-- Validate business rules
    +-- Generate document number
    +-- Calculate line totals using Decimal arithmetic
    +-- Verify debits === credits
    |
    v
Prisma $transaction()
    +-- Create parent record (Invoice, Bill, etc.)
    +-- Create JournalEntry with JournalLine records
    +-- Create AuditLog entry
    +-- All succeed or all roll back
    |
    v
PostgreSQL (ACID-compliant storage)
```

---

### Authentication & Authorization

Mizano uses a layered security architecture combining JWT-based authentication with role-based access control (RBAC).

**Token Strategy:**

| Token         | Lifetime   | Purpose                                          |
| ------------- | ---------- | ------------------------------------------------ |
| Access Token  | 15 minutes | Short-lived JWT for API authentication           |
| Refresh Token | 7 days     | Long-lived token for obtaining new access tokens |

Tokens are rotated on refresh -- each refresh token can only be used once. Used refresh tokens are invalidated to prevent replay attacks.

**Guard Stack (applied in order):**

```
@UseGuards(JwtAuthGuard, OrganizationGuard)
@Permissions('sales.create')

1. JwtAuthGuard
   +-- Validates JWT signature against JWT_SECRET
   +-- Checks token expiration
   +-- Extracts user payload (userId, organizationId, permissions)
   +-- Returns 401 Unauthorized on failure

2. OrganizationGuard
   +-- Verifies user's organizationId matches the requested resource
   +-- Ensures tenant isolation
   +-- Returns 403 Forbidden on mismatch

3. PermissionsGuard (via @Permissions decorator)
   +-- Checks user's role has the required permission
   +-- Permission format: 'module.action' (e.g., 'sales.create', 'accounting.view')
   +-- Returns 403 Forbidden if permission denied
```

**Special Decorators:**

| Decorator                       | Purpose                                                      |
| ------------------------------- | ------------------------------------------------------------ |
| `@Public()`                     | Marks endpoint as open (skips JwtAuthGuard)                  |
| `@CurrentOrg()`                 | Extracts `organizationId` from the authenticated request     |
| `@CurrentUser()`                | Extracts the full user object from the authenticated request |
| `@Permissions('module.action')` | Declares required RBAC permission for the endpoint           |

---

### AI Architecture

Mizano's AI subsystem runs entirely locally with zero external API calls. All machine learning inference and training happens on the server using JavaScript/TypeScript ML libraries.

**Library Stack:**

| Library                  | Purpose                                                           |
| ------------------------ | ----------------------------------------------------------------- |
| `brain.js`               | Neural networks (transaction categorization, pattern recognition) |
| `natural`                | NLP (tokenization, classification, stemming, TF-IDF)              |
| `tesseract.js`           | OCR (scanned document text extraction)                            |
| `ml-logistic-regression` | Binary/multi-class classification                                 |
| `ml-matrix`              | Matrix operations (peer dependency for ml-\*)                     |
| `simple-statistics`      | Statistical analysis (regression, distributions)                  |
| `compromise`             | NLP entity extraction and text parsing                            |
| `sentiment`              | Sentiment analysis for customer communications                    |

**33 AI Features across 6 Categories:**

```
Accounting & Finance
    +-- Transaction Categorization
    +-- Anomaly Detection
    +-- Cash Flow Forecasting
    +-- Bank Reconciliation
    +-- Expense Classification
    +-- Recurring Pattern Detection
    +-- Budget Variance Analysis

Sales & CRM
    +-- Lead Scoring (70% rule-based + 30% ML)
    +-- Revenue Forecasting
    +-- Customer Churn Prediction
    +-- Deal Win Probability
    +-- Customer Sentiment Analysis

Inventory & Purchasing
    +-- Demand Forecasting (Holt-Winters)
    +-- Reorder Point Optimization
    +-- Vendor Matching (OCR + NLP)
    +-- Price Optimization
    +-- Duplicate Detection

Document Intelligence
    +-- OCR Processing (tesseract.js)
    +-- Document Classification
    +-- Entity Extraction (NLP)
    +-- PDF Text Extraction (pdf-parse)
    +-- Vendor OCR Layout Learning

HR & Operations
    +-- Employee Performance Analysis
    +-- Payroll Anomaly Detection
    +-- Attendance Pattern Analysis
    +-- Workforce Planning

Security & Compliance
    +-- Fraud Detection (Isolation Forest)
    +-- Audit Trail Analysis
    +-- Compliance Monitoring

NLP & Interaction
    +-- Natural Language Queries
    +-- Smart Search
    +-- Chat Commands
    +-- Voice Commands (partial)
```

**8 Utility Modules:**

| Utility             | File                          | Purpose                                                  |
| ------------------- | ----------------------------- | -------------------------------------------------------- |
| Statistics          | `statistics.util.ts`          | Mean, median, std dev, regression                        |
| Holt-Winters        | `holt-winters.util.ts`        | Triple exponential smoothing for time-series forecasting |
| Monte Carlo         | `monte-carlo.util.ts`         | Probabilistic simulation for risk analysis               |
| Text Similarity     | `text-similarity.util.ts`     | Cosine similarity, Levenshtein distance for matching     |
| Date Pattern        | `date-pattern.util.ts`        | Detect recurring date patterns in transactions           |
| Isolation Forest    | `isolation-forest.util.ts`    | Anomaly detection algorithm (implemented from scratch)   |
| Logistic Regression | `logistic-regression.util.ts` | Binary classification wrapper                            |
| PDF Extractor       | `pdf-extractor.util.ts`       | Native PDF text extraction with OCR fallback             |

**5 Background Schedulers:**

| Scheduler       | Cadence    | Responsibilities                                         |
| --------------- | ---------- | -------------------------------------------------------- |
| `ai-retraining` | Periodic   | Retrain models when feedback threshold reached           |
| `ai-sales-crm`  | Daily      | Update lead scores, churn predictions, revenue forecasts |
| `ai-security`   | Continuous | Fraud detection, anomaly scanning, compliance checks     |
| `ai-hr-ops`     | Daily      | Attendance analysis, payroll anomaly detection           |
| `ai-nlp-chat`   | On-demand  | Process NL queries, update search indexes                |

**Model Lifecycle:**

```
User Action / Scheduled Trigger
    |
    v
AI Service
    +-- Load model from ModelRegistryService (versioned storage)
    +-- Run inference using ML library
    +-- Store result (AiPrediction / AiAnomaly / AIInsight)
    +-- Present to user with confidence score
    |
    v
User Feedback (accept / reject / correct)
    |
    v
AiFeedbackService
    +-- Store feedback as AiTrainingData
    +-- Check retraining threshold per AiFeature
    +-- If threshold met: queue retraining job
    |
    v
AiTrainingService (BullMQ worker)
    +-- Fetch training data for feature + organizationId
    +-- Retrain model with updated dataset
    +-- Version and store new model in ModelRegistry
    +-- New model used for subsequent predictions
```

**Key Design Principles:**

- All AI suggestions are dismissible (Human-in-the-Loop)
- Every prediction includes a confidence score
- AI never auto-posts financial transactions without explicit user confirmation
- Models are trained per-organization (tenant isolation extends to ML)
- The system learns from user corrections through the feedback loop

---

### Module Architecture (NestJS)

The backend is organized into domain-driven modules, each encapsulating a specific area of business functionality.

**Module Structure:**

```
src/modules/{domain}/
    +-- {domain}.module.ts        # NestJS module declaration
    +-- {domain}.controller.ts    # HTTP endpoints + guards + decorators
    +-- {domain}.service.ts       # Business logic + Prisma queries
    +-- dto/                      # Request/response DTOs (class-validator)
    +-- entities/                 # Response shape definitions (Swagger)
```

**24 Business Domain Modules:**

| Category      | Module          | Key Entities                                               |
| ------------- | --------------- | ---------------------------------------------------------- |
| Core          | `accounting`    | Accounts, Journals, JournalLines, RecurringProfiles        |
| Core          | `organizations` | Organizations, Settings, Preferences                       |
| Core          | `users`         | Users, Roles, Permissions                                  |
| Core          | `auth`          | Login, Register, Token refresh                             |
| Sales         | `sales`         | Customers, Quotes, Invoices, CreditNotes, PaymentsReceived |
| Purchases     | `purchases`     | Vendors, Bills, Expenses, VendorCredits, PaymentsMade      |
| Inventory     | `inventory`     | Items, Warehouses, Movements, Adjustments, PriceLists      |
| Banking       | `banking`       | BankAccounts, BankTransactions, BankRules                  |
| HR            | `hr`            | Employees, Attendance, PayrollRuns, Payslips               |
| Manufacturing | `manufacturing` | BOMs, WorkOrders                                           |
| Projects      | `projects`      | Projects, Tasks, TimesheetEntries                          |
| Tax           | `tax`           | TaxRates, VATReturns, VATPayments                          |
| CRM           | `crm`           | Leads, Deals, Activities                                   |
| Reports       | `reports`       | P&L, Balance Sheet, AR/AP Aging, Cash Flow                 |
| AI            | `ai`            | 38 controllers, 36 services, all ML features               |

**Dependency Rules:**

- Controllers depend only on their own service
- Services may depend on PrismaService and other services (via dependency injection)
- `PrismaService` is the single point of database access
- `ScheduleModule.forRoot()` and `EventEmitterModule.forRoot()` are registered only in `app.module.ts` (not in sub-modules)
- AuditLog middleware intercepts all write operations automatically

**Standard Controller Pattern:**

```typescript
@Controller('invoices')
@UseGuards(JwtAuthGuard, OrganizationGuard)
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Get()
  @Permissions('sales.view')
  findAll(@CurrentOrg() orgId: string, @Query() query: ListQueryDto) {
    return this.invoicesService.findAll(orgId, query);
  }

  @Post()
  @Permissions('sales.create')
  create(@CurrentOrg() orgId: string, @Body() dto: CreateInvoiceDto) {
    return this.invoicesService.create(orgId, dto);
  }
}
```

**Standard Response Format:**

```typescript
// Success (single resource)
{
  data: T
}

// Success (paginated list)
{
  data: T[],
  meta: {
    page: number,
    limit: number,
    total: number,
    totalPages: number
  }
}

// Error
{
  statusCode: number,
  message: string,
  error: string,
  details?: Record<string, string[]>  // field-level validation errors
}
```

---

### Frontend Architecture (Next.js 14)

The frontend uses Next.js 14 with the App Router, leveraging React Server Components for performance and progressive enhancement.

**Route Structure:**

```
app/
    +-- (auth)/                    # Public routes (no authentication required)
    |   +-- login/
    |   +-- register/
    |   +-- forgot-password/
    |
    +-- (dashboard)/               # Protected routes (require authentication)
    |   +-- [locale]/              # i18n dynamic segment (en, ar)
    |       +-- page.tsx           # Dashboard home
    |       +-- accounting/
    |       +-- sales/
    |       +-- purchases/
    |       +-- inventory/
    |       +-- banking/
    |       +-- hr/
    |       +-- manufacturing/
    |       +-- projects/
    |       +-- tax/
    |       +-- crm/
    |       +-- reports/
    |       +-- settings/
    |
    +-- api/                       # BFF API routes (proxy to NestJS)
```

**Component Strategy:**

| Type                    | Directive      | Use Case                             |
| ----------------------- | -------------- | ------------------------------------ |
| React Server Components | (default)      | Data fetching, static rendering, SEO |
| Client Components       | `'use client'` | Interactive UI, forms, charts, state |

**State Management:**

| Layer        | Library              | Purpose                                     |
| ------------ | -------------------- | ------------------------------------------- |
| Server State | TanStack Query       | API data fetching, caching, synchronization |
| Client State | Zustand              | UI state, sidebar toggle, theme, modals     |
| Form State   | React Hook Form      | Form values, validation, submission         |
| URL State    | Next.js searchParams | Filters, pagination, sorting                |

**UI Component Library:**

34 shadcn/ui primitives built on Radix UI, styled with Tailwind CSS, with Lucide icons. Components include buttons, inputs, dialogs, tables, sheets, command palette, charts (Recharts), and more.

**Data Fetching Pattern:**

```typescript
// lib/hooks/use-invoices.ts
export function useInvoices(params?: ListParams) {
  return useQuery({
    queryKey: ['invoices', params],
    queryFn: () => invoicesApi.list(params),
  });
}

export function useCreateInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: invoicesApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
    },
  });
}
```

**Page Requirements:**

Every page must handle three states:

1. **Loading** -- Skeleton UI or spinner while data is being fetched
2. **Error** -- Error message with retry option
3. **Empty** -- Helpful message when no data exists, with call-to-action to create

---

### Data Flow Patterns

**1. Read Flow (data fetching):**

```
React Component
    |
    v
useQuery hook (TanStack Query)
    +-- queryKey: ['invoices', { status: 'DRAFT' }]
    +-- Deduplication, caching, background refetch
    |
    v
API Client function (lib/api/invoices.ts)
    +-- GET /api/invoices?status=DRAFT
    +-- Attaches auth headers
    |
    v
Next.js API Route (BFF)
    +-- Proxies to NestJS backend
    |
    v
NestJS Controller
    +-- Guards: JWT, Organization, Permissions
    +-- Validates query params via ListQueryDto
    |
    v
Service
    +-- prisma.invoice.findMany({ where: { organizationId, status } })
    +-- Pagination, sorting, filtering
    |
    v
PostgreSQL
    +-- Returns rows matching query
    |
    v
Response: { data: Invoice[], meta: { page, limit, total, totalPages } }
```

**2. Write Flow (create/update):**

```
React Hook Form (with Zod validation)
    |
    v
useMutation hook (TanStack Query)
    |
    v
API Client function
    +-- POST /api/invoices
    +-- Body: CreateInvoiceDto
    |
    v
NestJS Controller
    +-- Guards: JWT, Organization, Permissions('sales.create')
    +-- Body validation via class-validator
    |
    v
Service
    +-- Business rule validation
    +-- Generate document number (INV-XXX)
    +-- prisma.$transaction([
    |       createInvoice,
    |       createJournalEntry,
    |       createJournalLines,
    |       createAuditLog
    |   ])
    |
    v
PostgreSQL (atomic transaction)
    |
    v
Response: { data: Invoice }
    |
    v
TanStack Query invalidates ['invoices'] cache
    +-- List view automatically refetches
```

**3. AI Prediction Flow:**

```
Scheduler Trigger (cron) / User Action
    |
    v
AI Service
    +-- Load trained model from ModelRegistryService
    +-- Fetch input data from database (scoped to organizationId)
    |
    v
ML Algorithm (brain.js / natural / ml-* / custom util)
    +-- Run inference
    +-- Calculate confidence score
    |
    v
Store Results
    +-- AiPrediction (individual predictions)
    +-- AiAnomaly (detected anomalies)
    +-- AIInsight (aggregated insights)
    +-- LeadScore, CashFlowForecast, etc.
    |
    v
Dashboard / Notification
    +-- User sees prediction with confidence score
    +-- User can accept, reject, or correct
    |
    v
Feedback Loop
    +-- AiFeedback stored
    +-- When threshold reached, model retraining queued
    +-- New model version stored in registry
```

---

### Infrastructure

**Local Development (Docker Compose):**

```yaml
# docker-compose.yml
services:
  postgres:
    image: postgres:16-alpine
    ports: ['5435:5432']
    environment:
      POSTGRES_DB: mizano_db
      POSTGRES_USER: mizano
      POSTGRES_PASSWORD: mizano_secret

  redis:
    image: redis:7-alpine
    ports: ['6380:6379']
```

**Production (Docker Compose with Nginx):**

```
docker-compose.production.yml
    |
    +-- nginx (reverse proxy)
    |   +-- SSL termination
    |   +-- Static file serving
    |   +-- Proxy to Next.js (port 5001) and NestJS (port 6001)
    |
    +-- api (NestJS container)
    |   +-- Node.js runtime
    |   +-- Prisma client
    |   +-- BullMQ workers
    |
    +-- web (Next.js container)
    |   +-- Node.js runtime
    |   +-- Server-side rendering
    |
    +-- postgres (PostgreSQL 16)
    |   +-- Persistent volume
    |   +-- Automated backups
    |
    +-- redis (Redis 7)
        +-- Cache storage
        +-- BullMQ queue broker
```

**Health Check Endpoints:**

| Endpoint            | Purpose                                            |
| ------------------- | -------------------------------------------------- |
| `GET /health`       | Application health (returns 200 if API is running) |
| `GET /health/db`    | PostgreSQL connectivity check                      |
| `GET /health/redis` | Redis connectivity check                           |

**Background Job Processing (BullMQ):**

BullMQ runs on Redis and handles all asynchronous work:

- AI model training and retraining jobs
- Scheduled analysis tasks (5 schedulers)
- Document processing pipeline (OCR, classification, extraction)
- Email/notification delivery
- Recurring transaction generation

Jobs are processed by workers running in the same NestJS process, with configurable concurrency and retry policies.

**Environment Variables:**

```bash
# Database
DATABASE_URL="postgresql://mizano:mizano_secret@localhost:5435/mizano_db"

# Cache & Queues
REDIS_URL="redis://localhost:6380"

# Authentication
JWT_SECRET="your-secret"
JWT_REFRESH_SECRET="your-refresh-secret"
NEXTAUTH_SECRET="your-nextauth-secret"
NEXTAUTH_URL="http://localhost:5001"

# API
API_URL="http://localhost:6001"

# VLM Service
VLM_SERVICE_URL=http://localhost:8100
```

---

### Database Schema Summary

The Prisma schema contains 87+ models organized by domain. Key conventions:

```prisma
// Every model includes:
model Example {
  id             String   @id @default(cuid())
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id])

  // Financial models also include:
  deletedAt      DateTime?

  // Money fields:
  amount         Decimal  @db.Decimal(19, 4)

  // Standard indexes:
  @@index([organizationId, status])
  @@index([organizationId, createdAt])
}
```

**AI-Specific Models:**

| Model                   | Purpose                                                  |
| ----------------------- | -------------------------------------------------------- |
| `AiTrainingData`        | Labeled training examples per feature and organization   |
| `AiModel`               | Versioned model storage (serialized weights + metadata)  |
| `AiFeedback`            | User feedback on predictions (feature + userAction enum) |
| `AiPrediction`          | Stored predictions with confidence scores                |
| `AiAnomaly`             | Detected anomalies with severity levels                  |
| `ItemReorderAnalysis`   | Inventory reorder point calculations                     |
| `ReconciliationPattern` | Learned bank reconciliation patterns                     |
| `VendorOcrLayout`       | Learned vendor document layouts for OCR                  |
| `ItemDemandForecast`    | Demand forecasting results per item                      |
| `CashFlowForecast`      | Cash flow projection data points                         |
| `LeadScore`             | CRM lead scoring results                                 |
| `TransactionPattern`    | Detected recurring transaction patterns                  |
| `PatternSuggestion`     | Suggested actions based on detected patterns             |
| `AIInsight`             | Aggregated AI insights for dashboard display             |
| `EmployeeAiProfile`     | HR-related AI analysis per employee                      |
| `FraudAlert`            | Security fraud detection alerts                          |
| `CustomerAiProfile`     | Customer behavior analysis for CRM                       |

The `AiFeature` enum has 33 values (from `CATEGORIZATION` through `VOICE_COMMAND`) used to categorize all AI functionality and associate feedback with the correct model.

---

## Future Architecture Evolution

### Planned Architectural Improvements

| Improvement                      | Purpose                                              | Timeline |
| -------------------------------- | ---------------------------------------------------- | -------- |
| Event-Driven Architecture (CQRS) | Separate read/write models for reporting performance | Q1 2027  |
| GraphQL API Layer                | Flexible data fetching alongside REST                | Q2 2027  |
| WebSocket Real-Time Updates      | Live dashboard updates, collaborative editing        | Q3 2027  |
| Kubernetes Deployment            | Container orchestration, auto-scaling                | Q1 2027  |
| Multi-Region Deployment          | Data residency, latency optimization                 | Q3 2027  |
| Database Sharding                | Scale large tenants beyond single-DB limits          | Q4 2027  |

### Testing Architecture

Mizano implements a comprehensive testing pyramid with automated CI/CD:

- **Unit Tests (Jest)**: 60+ suites covering services, guards, utilities, and pure functions
- **Integration Tests**: Service + database interaction with test database
- **API E2E (supertest)**: 8+ suites validating full request lifecycle
- **Frontend E2E (Playwright)**: 20+ critical user journeys across pages
- **Visual Regression (Chromatic/Percy)**: UI snapshot comparison for 50+ pages
- **Performance Tests (k6)**: Load testing targeting 100 concurrent users
- **Security Scans (OWASP ZAP + Snyk)**: Continuous vulnerability detection

All tests run in GitHub Actions CI pipeline on every PR. See `docs/testing-strategy.md` for details.

### AI Architecture Evolution

| Feature                   | Description                                       | Timeline |
| ------------------------- | ------------------------------------------------- | -------- |
| Self-Hosted LLM           | Llama/Mistral for advanced NLP (no external APIs) | Q3 2027  |
| AI Copilot                | Natural language interface for all operations     | Q4 2026  |
| Cross-Tenant Benchmarking | Anonymized industry comparisons                   | Q2 2027  |
| AI Financial Advisory     | Proactive insights and recommendations            | Q3 2027  |
| Predictive Compliance     | Auto-detect regulatory risks before filing        | Q4 2027  |

See `docs/roadmap.md` for the complete product roadmap and market strategy.

