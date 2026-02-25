# Mizano - AI-Powered ERP System

An autonomous accounting platform designed for zero-touch accounting, enabling AI to handle 95% of accounting work without requiring accounting knowledge from users.

**Core Principles:** Zero-Day Close | Perpetual General Ledger | Human-in-the-Loop

## Tech Stack

| Layer       | Technology                                                                       |
| ----------- | -------------------------------------------------------------------------------- |
| Frontend    | Next.js 14 (App Router), React 18, TypeScript 5.7+                               |
| Backend     | NestJS 10, TypeScript (strict mode)                                              |
| Database    | PostgreSQL 16 + Prisma ORM                                                       |
| Cache/Queue | Redis 7+ + BullMQ                                                                |
| UI          | shadcn/ui + Tailwind CSS + Radix UI + Lucide Icons                               |
| State       | TanStack Query (server), Zustand (client)                                        |
| Forms       | React Hook Form + Zod                                                            |
| Charts      | Recharts                                                                         |
| Auth        | NextAuth.js (frontend) + JWT with refresh tokens (backend)                       |
| AI/ML       | brain.js, natural, tesseract.js, ml-\*, simple-statistics, compromise, sentiment |
| AI/VLM      | Qwen2.5-VL-7B via Python FastAPI microservice (local GPU)                        |
| Monorepo    | Turborepo + pnpm workspaces                                                      |

## Quick Start

### Prerequisites

- Node.js 18+ (or 20+)
- pnpm 8+
- Docker & Docker Compose (for PostgreSQL + Redis)
- NVIDIA GPU with 12GB+ VRAM (optional, for VLM invoice processing)

### Setup

```bash
# 1. Clone and install
git clone <repository-url>
cd mizano
pnpm install

# 2. Configure environment
cp .env.example .env

# 3. Start infrastructure
docker-compose up -d          # PostgreSQL + Redis + VLM (GPU required)
# Or without VLM:
# docker-compose up -d postgres redis

# 4. Setup database
pnpm db:generate
pnpm db:push
pnpm db:seed          # Optional: seed sample data

# 5. Start development
pnpm dev              # Web on :5001, API on :6001
```

### Environment Variables

```env
DATABASE_URL="postgresql://mizano:mizano_secret@localhost:5435/mizano_db"
REDIS_URL="redis://localhost:6380"
JWT_SECRET="your-super-secret-jwt-key"
JWT_REFRESH_SECRET="your-super-secret-refresh-key"
NEXTAUTH_SECRET="your-nextauth-secret"
NEXTAUTH_URL="http://localhost:5001"
API_URL="http://localhost:6001"
NEXT_PUBLIC_API_URL="http://localhost:6001"

# VLM Service (optional - requires NVIDIA GPU)
VLM_SERVICE_URL=http://localhost:8100
VLM_ENABLED=true
VLM_MODEL_NAME=Qwen/Qwen2.5-VL-7B-Instruct-AWQ
```

## Project Structure

```
mizano/
├── apps/
│   ├── api/                    # NestJS Backend (port 6001)
│   │   ├── src/
│   │   │   ├── modules/        # 24 business domain modules
│   │   │   │   ├── accounting/     # GL, journals, recurring profiles
│   │   │   │   ├── ai/            # 33 AI models (100% local)
│   │   │   │   ├── sales/         # Invoices, quotes, customers
│   │   │   │   ├── purchases/     # Bills, expenses, vendors
│   │   │   │   ├── inventory/     # Stock, movements, warehouses
│   │   │   │   ├── banking/       # Reconciliation, rules
│   │   │   │   ├── hr/            # Employees, payroll, attendance
│   │   │   │   ├── manufacturing/ # BOMs, work orders
│   │   │   │   ├── projects/      # Projects, tasks, timesheets
│   │   │   │   ├── crm/           # Leads, deals, activities
│   │   │   │   ├── tax/           # VAT returns, tax rates
│   │   │   │   ├── reports/       # P&L, balance sheet, aging
│   │   │   │   ├── auth/          # Authentication & JWT
│   │   │   │   └── ...            # 11 more modules
│   │   │   ├── common/            # Guards, decorators, pipes
│   │   │   └── prisma/            # Prisma service
│   │   ├── prisma/
│   │   │   └── schema.prisma      # 87+ models
│   │   └── test/                  # E2E tests
│   │
│   └── web/                    # Next.js Frontend (port 5001)
│       ├── app/[locale]/
│       │   ├── (auth)/            # Login, register
│       │   └── (dashboard)/       # 140+ protected routes
│       ├── components/            # 200+ components (21 categories)
│       │   ├── ui/                # 34 shadcn/ui primitives
│       │   └── {module}/          # Module-specific components
│       └── lib/
│           ├── api/               # Typed API client functions
│           └── hooks/             # 20+ React Query hooks
│
├── services/
│   └── vlm-service/            # Python FastAPI VLM microservice (port 8100)
│       ├── app/                   # FastAPI application
│       │   ├── routers/           # API endpoints
│       │   ├── services/          # VLM engine, image preprocessor
│       │   ├── schemas/           # Pydantic models
│       │   └── prompts/           # Extraction prompts
│       ├── Dockerfile             # CUDA 12.4 based image
│       └── requirements.txt       # Python dependencies
│
├── packages/
│   ├── shared-types/           # Shared TypeScript types
│   └── validators/             # Shared Zod schemas
│
├── prompts/                    # AI feature design specifications
├── docs/                       # Project documentation
├── docker-compose.yml          # Dev infrastructure
├── docker-compose.production.yml  # Production deployment
└── turbo.json                  # Turborepo config
```

## Available Scripts

```bash
# Development
pnpm dev                        # Start all apps (Web :5001, API :6001)
pnpm dev:api                    # API only
pnpm dev:web                    # Web only

# Build & Quality
pnpm build                      # Build all packages
pnpm lint                       # Lint all packages
pnpm lint:fix                   # Lint with auto-fix
pnpm format                     # Format with Prettier
pnpm format:check               # Check formatting
pnpm type-check                 # TypeScript type checking

# Database
pnpm db:generate                # Generate Prisma client
pnpm db:push                    # Push schema to database
pnpm db:migrate                 # Run migrations
pnpm db:seed                    # Seed database
pnpm db:studio                  # Open Prisma Studio

# Testing
pnpm test                       # Run all tests
pnpm test:api                   # API unit tests
pnpm test:web                   # Web unit tests
pnpm test:cov                   # API coverage report
pnpm test:e2e                   # API end-to-end tests

# Docker / Infrastructure
pnpm docker:up                  # Start dev infrastructure (PostgreSQL + Redis + VLM)
pnpm docker:down                # Stop dev infrastructure
pnpm docker:logs                # Tail container logs
pnpm docker:prod                # Build & start production stack
pnpm docker:prod:down           # Stop production stack
```

## Port Map

| Service       | Dev Port | Purpose                                    |
| ------------- | -------- | ------------------------------------------ |
| Web (Next.js) | 5001     | Frontend                                   |
| API (NestJS)  | 6001     | Backend                                    |
| PostgreSQL    | 5435     | Database                                   |
| Redis         | 6380     | Cache/Queue                                |
| VLM Service   | 8100     | Vision-Language Model (invoice processing) |

## Business Modules

| Module            | Description                                            | Key Features                                           |
| ----------------- | ------------------------------------------------------ | ------------------------------------------------------ |
| **Accounting**    | General ledger, journals, recurring profiles           | Double-entry validation, lock dates, auto-posting      |
| **Sales**         | Customers, invoices, quotes, credit notes, payments    | Quote-to-cash flow, PDF generation, recurring invoices |
| **Purchases**     | Vendors, bills, expenses, vendor credits, payments     | OCR smart scan, procure-to-pay flow                    |
| **Inventory**     | Items, warehouses, movements, adjustments, price lists | FIFO costing, multi-warehouse, stock alerts            |
| **Banking**       | Bank accounts, transactions, reconciliation, rules     | AI-powered reconciliation, CSV/OFX import              |
| **HR**            | Employees, attendance, payroll, payslips               | Gross/net calculation, LOP, automated journals         |
| **Manufacturing** | BOMs, work orders                                      | Material requirements, production tracking             |
| **Projects**      | Projects, tasks, timesheets                            | Time tracking, project invoicing, profitability        |
| **CRM**           | Leads, deals, activities                               | Kanban pipeline, AI lead scoring                       |
| **Tax**           | Tax rates, VAT returns, VAT payments                   | Auto-calculation, period filing, clearing journals     |
| **Reports**       | P&L, balance sheet, cash flow, trial balance, aging    | Date range filtering, CSV/Excel export                 |
| **Assets**        | Fixed asset register, depreciation, disposal           | Auto-depreciation journals, gain/loss tracking         |

## AI Features (33 Models - 100% Local)

All AI runs locally with zero external API calls. See [docs/ai-features.md](docs/ai-features.md) for full details.

| Category            | Models                                                                                                                                                                                           |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Core Financial**  | Transaction categorization, reconciliation matcher, OCR, demand forecasting, cash flow prediction, payment prediction, anomaly detection, pattern detection, reorder points, financial narrative |
| **Sales & CRM**     | Churn prediction, CLV analysis, cross-sell, dynamic pricing, pipeline forecast, lead scoring                                                                                                     |
| **Security**        | Fraud detection, compliance monitoring, audit risk                                                                                                                                               |
| **NLP & Chat**      | Chatbot, document classification, sentiment analysis, entity extraction, contract analysis, knowledge assistant, voice command                                                                   |
| **HR & Operations** | Employee attrition, compensation benchmark, skills gap, workforce scheduling, quality prediction, predictive maintenance, resource optimization, route optimization                              |
| **VLM (Vision)**    | Invoice/bill data extraction via Qwen2.5-VL-7B (GPU-accelerated, Arabic/English)                                                                                                                 |

## Architecture Highlights

- **Multi-tenancy**: All queries include `organizationId` — complete data isolation
- **Double-entry accounting**: Every transaction balances (debits === credits)
- **Monetary precision**: `Decimal(19,4)` — never JavaScript floats for money
- **Soft deletes**: Financial records use `deletedAt` — never hard deleted
- **Audit trail**: Every write operation creates an audit log entry
- **Human-in-the-loop**: All AI suggestions are dismissible with confidence scores

## Documentation

| Document                                           | Description                                      |
| -------------------------------------------------- | ------------------------------------------------ |
| [Architecture](docs/architecture.md)               | System architecture, data flow, design decisions |
| [API Guide](docs/api-guide.md)                     | Backend conventions, patterns, auth flow         |
| [Frontend Guide](docs/frontend-guide.md)           | Next.js conventions, hooks, components           |
| [AI Features](docs/ai-features.md)                 | All 33 AI models with algorithms and I/O         |
| [Database Guide](docs/database-guide.md)           | Schema conventions, migrations, indexing         |
| [Modules](docs/modules.md)                         | All 24 modules documented                        |
| [Deployment](docs/deployment-guide.md)             | Production deployment checklist                  |
| [Testing Strategy](docs/testing-strategy.md)       | Test plan, infrastructure, coverage goals        |
| [Acceptance Criteria](docs/acceptance-criteria.md) | 330+ criteria with explanations                  |

## License

[Add license information]
