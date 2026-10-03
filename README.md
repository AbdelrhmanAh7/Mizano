# Mizano — accounting automation for accountants

Mizano helps accountants and finance teams turn business documents into traceable accounting records with less manual entry. Egypt is the first pilot market, followed by distinct Saudi Arabia and UAE integrations. Arabic/English and RTL are core requirements.

**Current goal:** a tiny live deployment on a **Raspberry Pi 5 (8GB, arm64)**, tracked by epic **#45**, with the full accountant flow (AP/AR, reports, Arabic/English): Telegram/web → original document → extraction → validated draft → one batch approval → ledger → payments and reconciled reports.

**Status:** pre-demo hardening. The September review identified accounting, tenant-isolation, extraction and delivery blockers. The CPU pipeline, Telegram invoice intake and four-provider daily runner are planned work; their presence in the roadmap is not a claim that they already run. Existing modules and green unit tests do not establish end-to-end readiness.

## Start here

| Need                                                  | Read                                                       |
| ----------------------------------------------------- | ---------------------------------------------------------- |
| Product vision and mission                            | [Vision](docs/strategy/vision.md)                          |
| What is broken and why                                | [Repository review](docs/strategy/repository-review.md)    |
| Ten-day schedule and milestones                       | [Roadmap](docs/roadmap.md)                                 |
| Exact demo success criteria and useful charts         | [Acceptance contract](docs/strategy/demo-acceptance.md)    |
| Free CPU invoice scanning, formats and tradeoffs      | [Extraction research](docs/strategy/invoice-extraction.md) |
| Egypt ETA, Saudi ZATCA and UAE ASP distinctions       | [Regional research](docs/strategy/regional-compliance.md)  |
| Tasks, dependencies and GitHub synchronization        | [Planning guide](docs/planning/README.md)                  |
| Rules for every coding agent                          | [AGENTS.md](AGENTS.md)                                     |
| One prompt to coordinate Codex/Claude/GLM/Antigravity | [Start or resume](docs/agents/START-HERE.md)               |
| System design, modules, rules for new code            | [Architecture](docs/ARCHITECTURE.md)                       |
| Setup, environments, tests, CI, git, deployment       | [Development guide](docs/DEVELOPMENT.md)                   |
| Tokens, components, UI patterns, RTL                  | [Design system](docs/DESIGN-SYSTEM.md)                     |

## Demo scope

- Private Telegram channel and web upload feed the same durable document inbox.
- Native PDF/Word text is parsed directly; scanned pages and photos use local CPU Arabic/English OCR.
- Validation reconciles supplier identity, date/currency, lines, discounts and taxes; unclear values become exceptions.
- Supported invoices become drafts automatically; one accountant batch approval posts valid records.
- Partial payments, reversals, period locks, AP aging, general ledger and trial balance remain connected.
- Source previews, Arabic/English, RTL, mobile, recovery and duplicate protection are required.

The demo does not require GPU hardware, Colab or paid AI APIs. Free local software still has hosting/storage/review costs. No OCR engine is promised to recover every unreadable image. Official tax issuance is a separate later integration; importing a PDF does not certify an eInvoice.

## Existing stack and modules

| Layer               | Current repository technology                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------------- |
| Web                 | Next.js 14, React 18, TypeScript, next-intl                                                       |
| API                 | NestJS 10, TypeScript                                                                             |
| Data                | PostgreSQL 16, Prisma, Redis/BullMQ                                                               |
| UI/state/forms      | Tailwind/shadcn/Radix, TanStack Query, Zustand, React Hook Form/Zod                               |
| Identity            | NextAuth + backend JWT/refresh tokens                                                             |
| Workspace           | pnpm workspaces and Turborepo                                                                     |
| Existing extraction | Ollama plus OCR strategy code; production docs describe a Colab proxy                             |
| Target extraction   | Isolated CPU parsing/OCR worker with deterministic validation; implementation tracked in the plan |

Accounting, purchases, sales, banking, reports, inventory, tax, assets, projects, HR, manufacturing and CRM code exists. Demo acceptance covers the accounting journey above; peripheral modules need their own verification. Keep the existing stack during this sprint.

## Development

Full setup, environments, testing, CI and deployment: [development guide](docs/DEVELOPMENT.md). Do not use a shared/production database for initialization or test resets. Review tracked environment templates and provide fresh local secrets outside source control; the runtime-hardening issue owns a reproducible CPU setup.

```bash
git clone https://github.com/AbdelrhmanAh7/Mizano.git
cd Mizano
corepack enable
pnpm install --frozen-lockfile
pnpm db:generate
# Configure a dedicated local environment, then start infrastructure:
pnpm docker:up
# Only against that dedicated local database:
pnpm db:migrate
pnpm db:seed
pnpm dev
```

The repository pins pnpm 8.14.0 and its existing CI uses Node 20. Runtime-hardening work must reconcile the supported Node/package-manager versions and pinned CPU dependencies; do not interpret old Node 18 badges as a current support guarantee. Current AI routes may remain unavailable without their existing inference service until the CPU extraction tasks are merged.

| Service    | Development port     |
| ---------- | -------------------- |
| Web        | 5001                 |
| API        | 6001 (`/api` prefix) |
| PostgreSQL | 5435                 |
| Redis      | 6380                 |

Swagger is served at `http://localhost:6001/api/docs` outside production.

```bash
pnpm lint
pnpm type-check
pnpm test
pnpm build
pnpm test:e2e
```

`pnpm ci:full` currently combines lint/type-check/unit tests; it does **not** run E2E. Browser acceptance also requires a configured test harness and seeded environment; the [acceptance contract](docs/strategy/demo-acceptance.md) decides readiness.

## Repository layout

```
apps/web     Next.js 14 accountant UI (en/ar, RTL)
apps/api     NestJS 10 API, Prisma schema, migrations and seed
packages/    shared-types and validators (Zod)
services/    legacy ollama-proxy (Colab tunnel) still referenced by the AI module
docs/        ARCHITECTURE, DEVELOPMENT, DESIGN-SYSTEM, roadmap, strategy, planning, agents, archive
scripts/     GitHub planning sync and its offline tests
nginx/       production reverse proxy configuration
```

## Engineering contract

All financial paths must use Decimal calculations, tenant-scoped references, atomic/idempotent posting, immutable posted history and source-linked audit evidence. These are required invariants; the review records existing violations to repair. Never convert an uncertain scan into an unreviewed payment or tax submission. Every change needs a scoped PR, truthful test evidence and independent review of its exact head.

## License

Proprietary — all rights reserved. Third-party parser/model licenses must be verified separately before packaging and distribution.
