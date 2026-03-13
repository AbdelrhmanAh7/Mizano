# Mizano — AI-Powered ERP System

![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)
![pnpm](https://img.shields.io/badge/pnpm-%3E%3D8.0.0-orange)
![TypeScript](https://img.shields.io/badge/TypeScript-5.4%2B-blue)
![License](https://img.shields.io/badge/license-proprietary-lightgrey)

Autonomous accounting platform for zero-touch accounting. AI handles 95% of work — no accounting knowledge required.

**Core principles:** Zero-Day Close · Perpetual General Ledger · Human-in-the-Loop · 100% Local AI

---

## What Is Mizano?

Full-featured ERP with 27 business modules and 33 locally-running AI models (no external API calls). Bilingual (English/Arabic, full RTL). Built for SMBs.

## Modules

| Module        | Key Features                                                  |
| ------------- | ------------------------------------------------------------- |
| Accounting    | Chart of accounts, double-entry journals, recurring profiles  |
| Sales         | Quotes → Invoices → Payments, credit notes, PDF generation    |
| Purchases     | Bills (OCR scan), expenses, vendor credits, payments          |
| Inventory     | Multi-warehouse, FIFO costing, AI reorder points              |
| Banking       | Import transactions, AI reconciliation, bank rules            |
| HR            | Employees, attendance, payroll runs, payslips                 |
| Manufacturing | Bills of materials, work orders                               |
| Projects      | Projects, tasks, timesheets, project invoicing                |
| CRM           | Lead scoring, Kanban deal pipeline, activities                |
| Tax           | Tax rates, VAT returns, VAT payments                          |
| Fixed Assets  | Asset register, auto-depreciation, disposal                   |
| Reports       | P&L, Balance Sheet, Cash Flow, Trial Balance, GL, AR/AP Aging |
| AI            | 33 models: categorization, forecasting, fraud, NLP, HR        |
| Documents     | OCR (Tesseract + PaddleOCR), VLM (Qwen2.5-VL-7B)              |
| Currency      | Multi-currency, exchange rates                                |
| Notifications | In-app & email                                                |
| Search        | Global search across all entities                             |

## Tech Stack

| Layer    | Technology                                                |
| -------- | --------------------------------------------------------- |
| Frontend | Next.js 14 (App Router), React 18, TypeScript 5.7+        |
| Backend  | NestJS 10, TypeScript strict mode                         |
| Database | PostgreSQL 16 + Prisma ORM (87+ models)                   |
| Queue    | Redis 7+ + BullMQ                                         |
| UI       | shadcn/ui + Tailwind CSS + Radix UI + Lucide Icons        |
| State    | TanStack Query + Zustand                                  |
| Forms    | React Hook Form + Zod                                     |
| AI/ML    | brain.js, natural, tesseract.js, ml-\*, simple-statistics |
| VLM      | Qwen2.5-VL-7B via Python FastAPI (local GPU)              |
| Auth     | NextAuth.js + JWT refresh tokens                          |
| Monorepo | Turborepo + pnpm workspaces                               |
| i18n     | next-intl (Arabic + English, RTL)                         |
| Realtime | Socket.io                                                 |

## Quick Start

```bash
# Prerequisites: Node 18+, pnpm 8+, Docker

# 1. Install
git clone <repo-url> && cd mizano && pnpm install

# 2. Configure
cp .env.local .env   # edit JWT_SECRET, etc.

# 3. Start infrastructure
pnpm docker:up       # PostgreSQL :5435 + Redis :6380

# 4. Setup database
pnpm db:generate && pnpm db:push && pnpm db:seed

# 5. Run
pnpm dev             # Web :5001, API :6001
```

## Key Commands

```bash
# Dev
pnpm dev / dev:api / dev:web / dev:ocr / dev:vlm

# Quality (MUST all pass before push)
pnpm lint / type-check / test / ci:full

# Database
pnpm db:generate / db:push / db:migrate / db:seed / db:studio

# Docker
pnpm docker:up / docker:down / docker:prod

# Environment (local | dev | sit | prod)
pnpm env:check / build:dev / build:sit / build:prod
```

## Port Map

| Service    | Port | Notes                     |
| ---------- | ---- | ------------------------- |
| Web        | 5001 | Next.js frontend          |
| API        | 6001 | NestJS backend            |
| PostgreSQL | 5435 | Database                  |
| Redis      | 6380 | Cache & job queue         |
| OCR        | 7001 | PaddleOCR + Tesseract     |
| VLM        | 8100 | GPU-based invoice parsing |

## Environment Variables

```env
DATABASE_URL="postgresql://mizano:mizano_secret@localhost:5435/mizano_db"
REDIS_URL="redis://localhost:6380"
JWT_SECRET="your-secret"
JWT_REFRESH_SECRET="your-refresh-secret"
NEXTAUTH_SECRET="your-nextauth-secret"
NEXTAUTH_URL="http://localhost:5001"
API_URL="http://localhost:6001"
NEXT_PUBLIC_API_URL="http://localhost:6001"
OCR_SERVICE_URL=http://localhost:7001
VLM_SERVICE_URL=http://localhost:8100
```

## Architecture Invariants

- **Multi-tenancy** — All queries scoped by `organizationId`
- **Double-entry** — Debits must equal credits; blocked otherwise
- **Money** — `Decimal(19,4)` everywhere, never JS floats
- **Soft delete** — Financial records use `deletedAt`, never hard-deleted
- **Audit trail** — Every write creates an audit log entry
- **Human-in-the-Loop** — All AI suggestions are dismissible with confidence scores

## Documentation

| Doc                                                | Description                             |
| -------------------------------------------------- | --------------------------------------- |
| [Architecture](docs/architecture.md)               | System design, layers, data flow        |
| [API Guide](docs/api-guide.md)                     | Backend patterns, auth, guards          |
| [Frontend Guide](docs/frontend-guide.md)           | Next.js conventions, hooks, components  |
| [Database Guide](docs/database-guide.md)           | Schema, migrations, indexing            |
| [Modules](docs/modules.md)                         | All 27 modules in detail                |
| [AI Features](docs/ai-features.md)                 | 33 AI models — algorithms and I/O specs |
| [Testing Strategy](docs/testing-strategy.md)       | Test plan, pyramid, coverage goals      |
| [Deployment Guide](docs/deployment-guide.md)       | Production deployment checklist         |
| [Environment Guide](docs/environment-guide.md)     | 4-env system (local/dev/sit/prod)       |
| [Acceptance Criteria](docs/acceptance-criteria.md) | 330+ criteria with verify steps         |
| [Roadmap](docs/roadmap.md)                         | 5-phase product plan through 2027       |
| [Contributing](CONTRIBUTING.md)                    | Dev setup, commit rules, PR guidelines  |
| [Changelog](CHANGELOG.md)                          | Release history                         |
| [Storybook Guide](docs/storybook-guide.md)         | Component docs and visual testing       |

## Project Structure

```
mizano/
├── apps/
│   ├── api/                      # NestJS :6001
│   │   ├── src/modules/          # 27 domain modules
│   │   ├── src/common/           # Guards, decorators, pipes
│   │   └── prisma/schema.prisma  # 87+ models
│   └── web/                      # Next.js :5001
│       ├── app/[locale]/(auth)/
│       ├── app/[locale]/(dashboard)/
│       ├── components/           # 200+ components
│       └── lib/api/ + hooks/     # API client + React Query
├── services/vlm-service/         # Python FastAPI :8100 (GPU)
├── ocr-service/                  # Python FastAPI :7001
├── packages/
│   ├── shared-types/
│   └── validators/
└── docs/
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, commit conventions, and PR guidelines.

## License

Proprietary — All rights reserved.
