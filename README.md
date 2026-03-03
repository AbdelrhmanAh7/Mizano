# 🧮 Mizano — AI-Powered ERP System

> An autonomous accounting platform designed for **zero-touch accounting**. AI handles 95% of accounting work — no accounting knowledge required from users.

**Core Principles:** Zero-Day Close · Perpetual General Ledger · Human-in-the-Loop

---

## ✨ What Is Mizano?

Mizano is a full-featured **Enterprise Resource Planning (ERP)** system that covers everything a business needs — from accounting and sales to HR, inventory, manufacturing, and CRM — all enhanced with **33 locally-running AI models** that automate categorization, forecasting, anomaly detection, and more.

### Who Is It For?

- **Small–Medium Businesses** that need comprehensive ERP without enterprise pricing
- **Businesses in Arabic & English regions** — full RTL/bilingual support
- **Privacy-conscious organizations** — all AI runs 100% locally, zero external API calls

---

## 🚀 Features Overview

### 📊 Dashboard

A central dashboard with key business metrics, charts (via Recharts), and quick access to all modules. Includes real-time WebSocket notifications for team collaboration.

---

### 💰 Accounting (General Ledger)

The core of the ERP — a full double-entry accounting system.

- **Chart of Accounts** — Create and manage accounts (assets, liabilities, equity, revenue, expenses)
- **Journal Entries** — Manual journal entries with enforced debit = credit balance. Auto-generated document numbers (JRN-XXX)
- **Recurring Profiles** — Set up recurring journal entries (monthly rent, subscriptions, etc.) that auto-post on schedule
- **Lock Dates** — Lock past accounting periods to prevent edits
- **Monetary Precision** — All money stored as `Decimal(19,4)` — never JavaScript floats

---

### 🛒 Sales

Complete quote-to-cash workflow.

- **Customers** — Contact management with detailed profiles, credit limits, and transaction history
- **Quotes / Estimates** — Create quotes (EST-XXX), convert approved quotes to invoices with one click
- **Invoices** — Professional invoices (INV-XXX) with line items, tax, discounts. Supports recurring invoices
- **Credit Notes** — Issue credit notes against invoices for returns/adjustments
- **Delivery Challans** — Track shipments and delivery status
- **Payments Received** — Record and match customer payments against open invoices
- **PDF Generation** — Generate professional PDF documents for quotes and invoices

---

### 🛍️ Purchases

Full procure-to-pay workflow.

- **Vendors** — Vendor profiles with payment terms, contact info, and purchase history
- **Bills** — Enter vendor bills (BILL-XXX), with AI-powered OCR smart scan for auto-extraction
- **Expenses** — Track and categorize business expenses
- **Vendor Credits** — Record credits from vendors for returns or adjustments
- **Payments Made** — Record outgoing payments matched to bills
- **OCR Smart Scan** — Upload a photo/PDF of a bill and AI extracts vendor, amounts, line items, and dates automatically

---

### 🏦 Banking

Manage bank accounts and automate reconciliation.

- **Bank Accounts** — Add and manage multiple bank accounts
- **Transactions** — Import bank transactions via CSV or OFX file formats
- **Bank Reconciliation** — AI-powered matching of bank transactions to invoices, bills, and payments. The AI suggests matches with confidence scores, and you confirm (Human-in-the-Loop)
- **Bank Rules** — Create rules to auto-categorize recurring transactions (e.g., "Subscription from Netflix → Software Expense")

---

### 📦 Inventory

Full stock management across multiple warehouses.

- **Items / Products** — Product catalog with SKUs, descriptions, pricing, and cost tracking
- **Warehouses** — Multi-warehouse support with per-warehouse stock tracking
- **Stock Movements** — Track every stock in/out event automatically
- **Stock Transfers** — Transfer stock between warehouses
- **Inventory Adjustments** — Record physical count differences, write-offs, and corrections
- **Price Lists** — Multiple price lists for different customer groups or regions
- **FIFO Costing** — Automatic cost calculation using First-In-First-Out method
- **AI Reorder Points** — AI predicts when stock will run low and suggests reorder quantities

---

### 👥 Human Resources (HR)

Manage employees and payroll.

- **Employee Directory** — Full employee profiles (personal info, department, position, salary)
- **Attendance Tracking** — Record daily attendance (present, absent, half-day, leave)
- **Payroll Runs** — Calculate gross/net salaries with deductions (tax, insurance, LOP)
- **Payslips** — Generate detailed payslips for each employee per pay period
- **Automated Journals** — Payroll runs automatically create the corresponding accounting journal entries

---

### 🏭 Manufacturing

Production planning and tracking.

- **Bills of Materials (BOM)** — Define the raw materials needed to produce finished goods
- **Work Orders** — Create production orders, track progress, and record material consumption
- **Material Requirements** — Automatically calculate material needs based on BOM and order quantity

---

### 📁 Projects & Timesheets

Project-based work tracking.

- **Projects** — Create projects with budgets, deadlines, and profitability tracking
- **Tasks** — Break down projects into tasks with assignments
- **Timesheets** — Log time spent on tasks. Use tracked time for project invoicing
- **Project Invoicing** — Generate invoices from tracked time and expenses

---

### 🤝 CRM (Customer Relationship Management)

Sales pipeline management.

- **Leads** — Capture and manage incoming leads with AI-powered lead scoring
- **Deals** — Kanban-style deal pipeline with drag-and-drop stages
- **Activities** — Schedule calls, meetings, and follow-ups

---

### 🧾 Tax

Tax compliance and reporting.

- **Tax Rates** — Define tax rates and rules (VAT, sales tax, etc.)
- **VAT Returns** — Generate VAT return reports for filing
- **VAT Payments** — Record and track tax payments with clearing journal entries

---

### 🏢 Fixed Assets

Track and depreciate company assets.

- **Asset Register** — Record fixed assets (equipment, vehicles, property) with purchase details
- **Depreciation** — Automatic depreciation calculation and journal entry generation
- **Disposal** — Record asset sales/disposals with gain/loss tracking

---

### 📈 Reports (10 Types)

Comprehensive financial and business reporting for any date range, with CSV/Excel export.

| Report                  | What It Shows                                        |
| ----------------------- | ---------------------------------------------------- |
| **Profit & Loss**       | Revenue vs expenses for a period                     |
| **Balance Sheet**       | Assets, liabilities, and equity at a point in time   |
| **Cash Flow Statement** | Cash inflows and outflows                            |
| **Trial Balance**       | All account balances to verify books are balanced    |
| **General Ledger**      | Complete transaction history per account             |
| **AR Aging**            | Outstanding customer invoices by age (30/60/90 days) |
| **AP Aging**            | Outstanding vendor bills by age                      |
| **Sales by Customer**   | Revenue breakdown per customer                       |
| **Sales by Item**       | Revenue breakdown per product/service                |
| **Purchases by Vendor** | Spending breakdown per vendor                        |

---

### 🤖 AI Features (33 Models — 100% Local)

All AI runs **locally** on your machine. Zero data leaves your server. Every AI suggestion is dismissible with confidence scores (**Human-in-the-Loop**).

#### Core Financial AI

- **Transaction Categorization** — Auto-categorize transactions to the correct accounts
- **Reconciliation Matcher** — AI matches bank transactions to invoices/bills
- **OCR (Tesseract.js)** — Extract text from receipt/invoice images
- **Cash Flow Prediction** — Forecast future cash position
- **Demand Forecasting** — Predict product demand based on historical data
- **Payment Prediction** — Predict when customers will pay invoices
- **Anomaly Detection** — Flag unusual transactions automatically
- **Pattern Detection** — Discover spending/revenue patterns
- **AI Reorder Points** — Smart inventory reorder suggestions
- **Financial Narrative** — AI-generated summaries of financial performance

#### Sales & CRM AI

- **Churn Prediction** — Identify customers likely to leave
- **Customer Lifetime Value (CLV)** — Calculate long-term customer value
- **Cross-sell Recommendations** — Suggest products to existing customers
- **Dynamic Pricing** — AI-powered pricing suggestions
- **Pipeline Forecast** — Predict deal close probabilities
- **Lead Scoring** — Score leads by conversion likelihood

#### Security & Compliance AI

- **Fraud Detection** — Flag potentially fraudulent transactions
- **Compliance Monitoring** — Track compliance with financial regulations
- **Audit Risk Assessment** — Identify high-risk areas for audit focus

#### NLP & Chat AI

- **AI Chatbot** — Natural language interface to query data ("What were my top 5 expenses last month?")
- **Document Classification** — Auto-classify uploaded documents
- **Sentiment Analysis** — Analyze customer communication sentiment
- **Entity Extraction** — Extract names, dates, amounts from text
- **Contract Analysis** — Review contracts for key terms and risks
- **Knowledge Assistant** — AI-powered help system
- **Voice Commands** — Voice-based interaction

#### HR & Operations AI

- **Employee Attrition Prediction** — Predict turnover risk
- **Compensation Benchmarking** — Compare salaries against market data
- **Skills Gap Analysis** — Identify workforce skill gaps
- **Workforce Scheduling** — Optimize employee schedules

#### Vision Language Model (VLM)

- **Invoice/Bill Extraction** — GPU-accelerated extraction using Qwen2.5-VL-7B model
- **Arabic & English support** — Full bilingual document processing
- **Runs via Python FastAPI** microservice on local NVIDIA GPU (12GB+ VRAM)

---

### 🔬 AI Lab

An experimental workspace for AI-powered business intelligence.

- **Deep Search** — Natural language search across all business data
- **Forecast** — Interactive financial forecasting tools
- **Customer & Revenue Analytics** — AI-driven customer segmentation and revenue insights

---

### ⚙️ Settings (11 Categories)

| Setting           | Purpose                                           |
| ----------------- | ------------------------------------------------- |
| **Organization**  | Company info, logo, fiscal year                   |
| **Team**          | Invite users, manage roles and permissions        |
| **Accounts**      | User account and password settings                |
| **Financial**     | Default accounts, currency, fiscal settings       |
| **Invoicing**     | Invoice numbering, payment terms, defaults        |
| **Branding**      | Custom colors, logo on documents                  |
| **Localization**  | Language (English/Arabic), date/number formats    |
| **Notifications** | Email and in-app notification preferences         |
| **AI**            | Enable/disable AI features, confidence thresholds |
| **Cache**         | Redis cache management and admin                  |
| **Performance**   | Performance monitoring and optimization settings  |

---

### 🔐 Authentication & Security

- **Login / Register** — Email + password authentication
- **JWT + Refresh Tokens** — Secure stateless authentication with automatic token refresh
- **Multi-tenancy** — Complete data isolation per organization (all queries scoped by `organizationId`)
- **Role-Based Access Control (RBAC)** — Granular permissions (e.g., `sales.create`, `accounting.view`)
- **Soft Deletes** — Financial records are never hard-deleted, only soft-deleted for audit trail
- **Audit Trail** — Every write operation is logged automatically

---

### 🌍 Internationalization (i18n)

- **Full bilingual support** — English and Arabic
- **RTL Layout** — Complete right-to-left support for Arabic
- **Locale-based routing** — URLs prefixed with locale (`/en/dashboard`, `/ar/dashboard`)
- **Translated UI** — All labels, messages, and navigation fully translated

---

### 🔔 Real-Time Features

- **WebSocket** — Real-time notifications via Socket.io
- **Background Jobs** — BullMQ + Redis for scheduling, payroll processing, recurring entries
- **Command Palette** — Quick search and navigation (`Cmd+K` / `Ctrl+K`)
- **Keyboard Shortcuts** — Power-user keyboard navigation
- **Guided Tours** — Interactive onboarding tours for new users

---

## 🏗️ Tech Stack

| Layer                | Technology                                                                       |
| -------------------- | -------------------------------------------------------------------------------- |
| **Frontend**         | Next.js 14 (App Router), React 18, TypeScript 5.7+                               |
| **Backend**          | NestJS 10, TypeScript (strict mode)                                              |
| **Database**         | PostgreSQL 16 + Prisma ORM (87+ models)                                          |
| **Cache / Queue**    | Redis 7+ + BullMQ                                                                |
| **UI Components**    | shadcn/ui + Tailwind CSS + Radix UI + Lucide Icons                               |
| **State Management** | TanStack Query (server), Zustand (client)                                        |
| **Forms**            | React Hook Form + Zod validation                                                 |
| **Charts**           | Recharts                                                                         |
| **Auth**             | NextAuth.js (frontend) + JWT with refresh tokens (backend)                       |
| **AI / ML**          | brain.js, natural, tesseract.js, ml-\*, simple-statistics, compromise, sentiment |
| **AI / VLM**         | Qwen2.5-VL-7B via Python FastAPI microservice (local GPU)                        |
| **Monorepo**         | Turborepo + pnpm workspaces                                                      |
| **i18n**             | next-intl (Arabic + English)                                                     |
| **Real-time**        | Socket.io (WebSocket)                                                            |

---

## 📁 Project Structure

```
mizano/
├── apps/
│   ├── api/                      # NestJS Backend (port 6001)
│   │   ├── src/
│   │   │   ├── modules/          # 27 business domain modules
│   │   │   │   ├── accounting/   # GL, journals, recurring profiles
│   │   │   │   ├── ai/          # 33 AI models (100% local)
│   │   │   │   ├── sales/       # Invoices, quotes, customers
│   │   │   │   ├── purchases/   # Bills, expenses, vendors
│   │   │   │   ├── inventory/   # Stock, movements, warehouses
│   │   │   │   ├── banking/     # Reconciliation, rules
│   │   │   │   ├── hr/          # Employees, payroll, attendance
│   │   │   │   ├── manufacturing/ # BOMs, work orders
│   │   │   │   ├── projects/    # Projects, tasks, timesheets
│   │   │   │   ├── crm/         # Leads, deals, activities
│   │   │   │   ├── tax/         # VAT returns, tax rates
│   │   │   │   ├── assets/      # Fixed assets, depreciation
│   │   │   │   ├── reports/     # P&L, balance sheet, aging, etc.
│   │   │   │   ├── auth/        # Authentication & JWT
│   │   │   │   ├── audit/       # Audit trail logging
│   │   │   │   ├── roles/       # RBAC permissions
│   │   │   │   ├── notifications/ # Email & in-app notifications
│   │   │   │   ├── search/      # Global search
│   │   │   │   ├── bulk-operations/ # Bulk actions
│   │   │   │   ├── import-export/   # Data import/export
│   │   │   │   ├── currency/    # Multi-currency support
│   │   │   │   ├── documents/   # File/document management
│   │   │   │   ├── logger/      # Application logging
│   │   │   │   ├── organizations/ # Multi-tenant orgs
│   │   │   │   ├── performance/ # Performance monitoring
│   │   │   │   ├── users/       # User management
│   │   │   │   └── user-preferences/ # Per-user settings
│   │   │   ├── common/          # Guards, decorators, pipes
│   │   │   ├── cache/           # Redis cache service
│   │   │   └── prisma/          # Prisma ORM service
│   │   └── prisma/
│   │       └── schema.prisma    # 87+ database models
│   │
│   └── web/                      # Next.js Frontend (port 5001)
│       ├── app/[locale]/
│       │   ├── (auth)/           # Login, Register
│       │   └── (dashboard)/      # 16 module route groups
│       ├── components/           # 200+ components
│       │   ├── ui/               # 34 shadcn/ui primitives
│       │   └── {module}/         # Module-specific components
│       ├── lib/
│       │   ├── api/              # Typed API client functions
│       │   └── hooks/            # 20+ React Query hooks
│       └── messages/             # i18n translations (en, ar)
│
├── services/
│   └── vlm-service/              # Python FastAPI VLM (port 8100)
│       ├── app/                  # FastAPI application
│       │   ├── routers/          # API endpoints
│       │   ├── services/         # VLM engine, image preprocessor
│       │   └── prompts/          # Extraction prompts
│       └── Dockerfile            # CUDA 12.4 based image
│
├── packages/
│   ├── shared-types/             # Shared TypeScript types
│   └── validators/               # Shared Zod schemas
│
├── docs/                         # 10 documentation files
├── docker-compose.yml            # Dev infrastructure
└── turbo.json                    # Turborepo config
```

---

## 🏁 Quick Start

### Prerequisites

- **Node.js** 18+ (recommended 20+)
- **pnpm** 8+
- **Docker & Docker Compose** (for PostgreSQL + Redis)
- **NVIDIA GPU** with 12GB+ VRAM (optional, only for VLM invoice extraction)

### Setup

```bash
# 1. Clone and install
git clone <repository-url>
cd mizano
pnpm install

# 2. Configure environment
cp .env.example .env
# Edit .env with your secrets (JWT, database, etc.)

# 3. Start infrastructure (PostgreSQL + Redis)
docker-compose up -d

# 4. Setup database
pnpm db:generate     # Generate Prisma client
pnpm db:push         # Push schema to database
pnpm db:seed         # (Optional) Seed sample data

# 5. Start development
pnpm dev             # Web on :5001, API on :6001
```

### Environment Variables

```env
# Database
DATABASE_URL="postgresql://mizano:mizano_secret@localhost:5435/mizano_db"

# Redis
REDIS_URL="redis://localhost:6380"

# Auth Secrets
JWT_SECRET="your-super-secret-jwt-key"
JWT_REFRESH_SECRET="your-super-secret-refresh-key"
NEXTAUTH_SECRET="your-nextauth-secret"
NEXTAUTH_URL="http://localhost:5001"

# API
API_URL="http://localhost:6001"
NEXT_PUBLIC_API_URL="http://localhost:6001"

# VLM Service (optional — requires NVIDIA GPU)
VLM_SERVICE_URL=http://localhost:8100
VLM_ENABLED=true
VLM_MODEL_NAME=Qwen/Qwen2.5-VL-7B-Instruct-AWQ
```

---

## 📜 Available Scripts

```bash
# Development
pnpm dev                  # Start all apps (Web :5001, API :6001)
pnpm dev:api              # API only
pnpm dev:web              # Web only
pnpm dev:vlm              # Start VLM service (requires GPU)

# Build & Quality
pnpm build                # Build all packages
pnpm lint                 # Lint all packages
pnpm lint:fix             # Lint with auto-fix
pnpm format               # Format with Prettier
pnpm format:check         # Check formatting
pnpm type-check           # TypeScript type checking

# Database
pnpm db:generate          # Generate Prisma client
pnpm db:push              # Push schema to database
pnpm db:migrate           # Run migrations
pnpm db:seed              # Seed sample data
pnpm db:studio            # Open Prisma Studio (visual DB editor)

# Testing
pnpm test                 # Run all tests
pnpm test:api             # API unit tests
pnpm test:web             # Web unit tests
pnpm test:cov             # API coverage report
pnpm test:e2e             # API end-to-end tests

# Docker
pnpm docker:up            # Start PostgreSQL + Redis
pnpm docker:down          # Stop infrastructure
pnpm docker:logs          # Tail container logs
pnpm docker:prod          # Build & start production stack
pnpm docker:prod:down     # Stop production stack
```

---

## 🌐 Port Map

| Service       | Dev Port | Purpose                                    |
| ------------- | -------- | ------------------------------------------ |
| Web (Next.js) | 5001     | Frontend                                   |
| API (NestJS)  | 6001     | Backend                                    |
| PostgreSQL    | 5435     | Database                                   |
| Redis         | 6380     | Cache & Job Queue                          |
| VLM Service   | 8100     | Vision-Language Model (invoice extraction) |

---

## 📚 Documentation

| Document                                           | Description                                      |
| -------------------------------------------------- | ------------------------------------------------ |
| [Architecture](docs/architecture.md)               | System architecture, data flow, design decisions |
| [API Guide](docs/api-guide.md)                     | Backend conventions, patterns, auth flow         |
| [Frontend Guide](docs/frontend-guide.md)           | Next.js conventions, hooks, components           |
| [AI Features](docs/ai-features.md)                 | All 33 AI models with algorithms and I/O specs   |
| [Database Guide](docs/database-guide.md)           | Schema conventions, migrations, indexing         |
| [Modules](docs/modules.md)                         | All 27 modules documented in detail              |
| [Deployment](docs/deployment-guide.md)             | Production deployment checklist                  |
| [Testing Strategy](docs/testing-strategy.md)       | Test plan, infrastructure, coverage goals        |
| [Acceptance Criteria](docs/acceptance-criteria.md) | 330+ acceptance criteria with explanations       |

---

## 🏛️ Architecture Highlights

- **Multi-tenancy** — All queries include `organizationId` for complete data isolation
- **Double-entry Accounting** — Every transaction must balance (debits === credits)
- **Monetary Precision** — `Decimal(19,4)` everywhere — never JavaScript floats for money
- **Soft Deletes** — Financial records use `deletedAt` — never hard deleted
- **Audit Trail** — Every write operation creates an audit log entry
- **Human-in-the-Loop** — All AI suggestions are dismissible with confidence scores
- **100% Local AI** — Zero external API calls — all AI runs on your infrastructure

---

## License

[Add license information]
