# Mizano — AI-Powered ERP System

![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)
![pnpm](https://img.shields.io/badge/pnpm-%3E%3D8.0.0-orange)
![TypeScript](https://img.shields.io/badge/TypeScript-5.4%2B-blue)
![License](https://img.shields.io/badge/license-proprietary-lightgrey)

Autonomous accounting platform for zero-touch accounting. AI handles 95% of work — no accounting knowledge required.

**Core principles:** Zero-Day Close · Perpetual General Ledger · Human-in-the-Loop · 100% Local AI

---

## What Is Mizano?

Full-featured ERP with 28 business modules backed by locally-running AI models via Ollama (no external API calls). Bilingual (English/Arabic, full RTL). Built for SMBs.

## Modules

| Module        | Key Features                                                  |
| ------------- | ------------------------------------------------------------- |
| Accounting    | Chart of accounts, double-entry journals, recurring profiles  |
| Sales         | Quotes → Invoices → Payments, credit notes, PDF generation    |
| Purchases     | Bills (AI scan), expenses, vendor credits, payments           |
| Inventory     | Multi-warehouse, FIFO costing, AI reorder points              |
| Banking       | Import transactions, AI reconciliation, bank rules            |
| HR            | Employees, attendance, payroll runs, payslips                 |
| Manufacturing | Bills of materials, work orders                               |
| Projects      | Projects, tasks, timesheets, project invoicing                |
| CRM           | Lead scoring, Kanban deal pipeline, activities                |
| Tax           | Tax rates, VAT returns, VAT payments                          |
| Fixed Assets  | Asset register, auto-depreciation, disposal                   |
| Reports       | P&L, Balance Sheet, Cash Flow, Trial Balance, GL, AR/AP Aging |
| AI            | Categorization, forecasting, fraud detection, NLP, HR models  |
| Documents     | Document management and AI-powered extraction via Ollama      |
| Currency      | Multi-currency, exchange rates                                |
| Notifications | In-app & email                                                |
| Search        | Global search across all entities                             |

## Tech Stack

| Layer    | Technology                                         |
| -------- | -------------------------------------------------- |
| Frontend | Next.js 14 (App Router), React 18, TypeScript 5.7+ |
| Backend  | NestJS 10, TypeScript strict mode                  |
| Database | PostgreSQL 16 + Prisma ORM                         |
| Queue    | Redis 7+ + BullMQ                                  |
| UI       | shadcn/ui + Tailwind CSS + Radix UI + Lucide Icons |
| State    | TanStack Query + Zustand                           |
| Forms    | React Hook Form + Zod                              |
| AI/ML    | Ollama (local LLM inference, 100% on-device)       |
| Auth     | NextAuth.js + JWT refresh tokens                   |
| Monorepo | Turborepo + pnpm workspaces                        |
| i18n     | next-intl (Arabic + English, RTL)                  |
| Realtime | Socket.io                                          |

## Quick Start

**Prerequisites:** Node 18+, pnpm 8+, Docker, [Ollama](https://ollama.com/download)

```bash
# 1. Install Ollama and pull the required model
ollama pull qwen3-vl:8b       # vision + text inference (all AI features)

# 2. Clone and install dependencies
git clone <repo-url> && cd mizano && pnpm install

# 3. Configure environment
cp .env.local .env   # edit JWT_SECRET, NEXTAUTH_SECRET, etc.

# 4. Start infrastructure
pnpm docker:up       # PostgreSQL :5435 + Redis :6380

# 5. Setup database
pnpm db:generate && pnpm db:push && pnpm db:seed

# 6. Run
pnpm dev             # Web :5001, API :6001
```

## Key Commands

```bash
# Dev
pnpm dev / dev:api / dev:web

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

| Service    | Port  | Notes             |
| ---------- | ----- | ----------------- |
| Web        | 5001  | Next.js frontend  |
| API        | 6001  | NestJS backend    |
| PostgreSQL | 5435  | Database          |
| Redis      | 6380  | Cache & job queue |
| Ollama     | 11434 | Local LLM server  |

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
OLLAMA_BASE_URL="http://localhost:11434"
```

## Architecture Invariants

- **Multi-tenancy** — All queries scoped by `organizationId`
- **Double-entry** — Debits must equal credits; blocked otherwise
- **Money** — `Decimal(19,4)` everywhere, never JS floats
- **Soft delete** — Financial records use `deletedAt`, never hard-deleted
- **Audit trail** — Every write creates an audit log entry
- **AI is advisory** — All AI suggestions are dismissible with confidence scores; never auto-posted

## Documentation

| Doc                                                        | Description                        |
| ---------------------------------------------------------- | ---------------------------------- |
| [Architecture](docs/architecture.md)                       | System design, layers, data flow   |
| [Modules](docs/modules.md)                                 | All 28 modules in detail           |
| [Environment Guide](docs/environment-guide.md)             | 4-env system (local/dev/sit/prod)  |
| [Testing Strategy](docs/testing-strategy.md)               | Test plan, pyramid, coverage goals |
| [Deployment Requirements](docs/deployment-requirements.md) | Production deployment checklist    |
| [Roadmap](docs/roadmap.md)                                 | 5-phase product plan               |

## Project Structure

```
mizano/
├── apps/
│   ├── api/                      # NestJS :6001
│   │   ├── src/modules/          # 28 domain modules
│   │   ├── src/common/           # Guards, decorators, pipes
│   │   └── prisma/schema.prisma  # Database schema
│   └── web/                      # Next.js :5001
│       ├── app/[locale]/(auth)/
│       ├── app/[locale]/(dashboard)/
│       ├── components/           # UI components
│       └── lib/api/ + hooks/     # API client + React Query
├── packages/
│   ├── shared-types/
│   └── validators/
└── docs/
```

## License

Proprietary — All rights reserved.
