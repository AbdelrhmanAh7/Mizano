# Architecture

How the Mizano monorepo is built today, the rules every change must respect, and where new code goes. Product direction lives in the [roadmap](roadmap.md) and the [demo acceptance contract](strategy/demo-acceptance.md); known defects against the rules below are listed in the [repository review](strategy/repository-review.md). This page describes the code, not proof that a feature is verified end to end.

## System overview

| Workspace               | Technology                      | Role                                                                        |
| ----------------------- | ------------------------------- | --------------------------------------------------------------------------- |
| `apps/web`              | Next.js 14 App Router, React 18 | Accountant UI on port **5001**, Arabic/English with RTL                     |
| `apps/api`              | NestJS 10, Prisma 5             | REST + WebSocket API on port **6001**, global prefix `/api`                 |
| `packages/shared-types` | TypeScript                      | Types shared by web and API (`@mizano/shared-types`)                        |
| `packages/validators`   | Zod                             | Schemas shared by forms and API (`@mizano/validators`)                      |
| `services/ollama-proxy` | Python                          | Legacy Colab tunnel proxy still referenced by the AI module; not in compose |

```
Browser ──► Next.js (5001)              pages, next-intl, NextAuth session
   │
   └──axios + Bearer JWT──► NestJS /api (6001) ──► PostgreSQL 16 (Prisma, Decimal(19,4))
                              │                 └─► Redis 7 (cache, throttling)
                              ├─ socket.io gateways (notifications, logger)
                              └─ AI module ──► Ollama (OLLAMA_BASE_URL) / PaddleOCR / tesseract.js
```

The browser calls NestJS directly (`NEXT_PUBLIC_API_URL`); there is no Next.js BFF proxy. The only Next.js API route is NextAuth (`app/api/auth/[...nextauth]`). In production, Nginx routes `/api/` and `/socket.io/` to the API and everything else to the web container (see [deployment](DEVELOPMENT.md#deployment)).

`bullmq` is a declared dependency but no queue is registered yet; schedulers use `@nestjs/schedule` and in-process events use `@nestjs/event-emitter`. The durable intake job queue is planned work in the roadmap.

## Folder structure

```
mizano/
├── apps/
│   ├── api/
│   │   ├── prisma/                 schema.prisma, migrations/, seed.ts
│   │   ├── src/
│   │   │   ├── main.ts             helmet, CORS, ValidationPipe, /api prefix, Swagger at /api/docs (non-prod)
│   │   │   ├── app.module.ts       global modules, throttler, filters, interceptors
│   │   │   ├── common/             guards, decorators, dto, filters, interceptors, services, utils
│   │   │   ├── health/             /api/health, /api/health/ready, /api/health/live
│   │   │   ├── prisma/ cache/ i18n/ types/
│   │   │   ├── modules/{domain}/   one NestJS module per business domain
│   │   │   └── test/               unit-test setup, Prisma/Redis mocks, factories
│   │   ├── test/                   API E2E suites (jest-e2e.json)
│   │   ├── scripts/                OCR model download helpers
│   │   └── _run_tests.js, _jest.config.js, _jest_resolver.js   WSL-safe Jest runner
│   └── web/
│       ├── app/[locale]/(auth)/        login, register, onboarding
│       ├── app/[locale]/(dashboard)/   protected pages per module
│       ├── components/ui/              shadcn/ui primitives (see DESIGN-SYSTEM.md)
│       ├── components/{shared,layout,data-table}/   cross-module building blocks
│       ├── components/{module}/        module-specific components
│       ├── lib/api.ts, lib/api/        axios client and per-resource API objects
│       ├── lib/hooks/                  TanStack Query hooks (use-{resource}.ts)
│       ├── lib/stores/                 Zustand stores
│       ├── messages/{en,ar}/           next-intl namespaces
│       └── public/                     brand assets (svg, png, ico, pwa, social)
├── packages/{shared-types,validators}/
├── services/ollama-proxy/
├── docs/                          this guide, DEVELOPMENT, DESIGN-SYSTEM, roadmap, strategy, planning, agents, archive
├── scripts/                       demo planning sync + offline tests (used by .github/workflows/demo-planning.yml)
├── nginx/nginx.conf               production reverse proxy (copied by deploy.yml)
└── docker-compose*.yml            local infra and production stack
```

## Request pipeline (API)

Telegram intake uses `TelegramModule` and the existing durable intake command. Authenticated administrators issue one-time hashed link codes; private-chat/channel verification resolves an immutable chat-to-tenant binding. The adapter records tenant-bound delivery identity before downloading, streams originals with a 15 MiB limit, then creates a deduplicated intake job. Bot-scoped cursors advance only after terminal outcomes. Pre-authentication code/chat lookups resolve tenant identity; subsequent delivery operations are organization-scoped. See [Telegram intake](telegram-intake.md) for permissions, retry limits and the single-poller deployment constraint.

1. `main.ts`: request ID, compression, helmet (CSP in production), CORS from `CORS_ORIGIN`, global `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`, `transform`).
2. Global providers in `app.module.ts`: `ThrottlerGuard`, `AllExceptionsFilter`, `CacheResponseInterceptor`, `HttpCacheInterceptor`, `AuditInterceptor` (records writes in the audit log).
3. Controller guards: the established pattern is `@UseGuards(JwtAuthGuard, PermissionsGuard)` plus `@Permissions('module.action')`. `@CurrentOrg()` reads `organizationId` from the verified JWT; `@CurrentUser()` returns the user. `OrganizationGuard` exists in `common/guards` and rejects a mismatched `organizationId` supplied in params/query/body.
4. Service layer: business rules, Prisma queries always scoped by `organizationId`, `prisma.$transaction()` for multi-table writes.

Known gaps recorded in the review: `JwtAuthGuard` lets `@Public()` routes through and `PermissionsGuard` permits routes without permission metadata, so every new route needs explicit authentication and a permission.

**Response shapes.** Services return the envelope themselves: lists return `{ data, meta: { page, limit, total, totalPages } }` (cursor lists: `meta.nextCursor`, `meta.hasMore` via `common/utils/cursor-paginate.ts`). Errors are normalized by `AllExceptionsFilter` to `{ statusCode, message, error, details? }`.

**Document numbers.** `common/services/document-number.service.ts` allocates `PREFIX-000123` per organization and prefix with an atomic upsert on `document_sequences`. Prefixes in use: `INV, BILL, JRN, QT, CN, PMT, VPMT, ADJ, WO, DC, VC, AST`.

## Non-negotiable domain rules

These restate [AGENTS.md](../AGENTS.md) and [CLAUDE.md](../CLAUDE.md) in architectural terms.

- **Multi-tenancy.** Every query, job, file, stream and referenced ID is scoped to the caller's authorized organization. Never trust a caller-supplied `organizationId` or knowledge of an ID; validate each referenced entity (bill, account, vendor) belongs to the organization before reading or writing. Schema foreign keys do not encode tenant ownership.
- **Money.** Prisma `Decimal @db.Decimal(19, 4)` in the database, `Decimal` arithmetic in services (`common/utils/decimal.ts` → `DecimalUtils`), decimal **strings** over the wire and in forms. Never `number`/`parseFloat` for amounts. Keep tax **percentage** and tax **amount** in separate fields; reconcile line/header discounts, net, tax and gross with an explicit currency.
- **Double entry.** Debits equal credits or the command throws (`BadRequestException('Journal entry must balance')`). One financial command serves manual, imported, bulk and automated paths.
- **Posting.** Posting, payment allocation and status changes happen in one transaction, idempotently, keyed by a unique source event. Respect fiscal/lock dates on single and bulk routes.
- **Immutability.** Posted history is never edited; corrections use linked reversals. Financial records soft-delete with `deletedAt`.
- **Audit and evidence.** Writes are audited; originals, extraction evidence/version, corrections and approvals are preserved. Never log invoice text, credentials, bot tokens or auth headers.
- **AI is advisory.** Extraction prepares drafts; explicit authorized batch approval posts them. Uncertain values go to exceptions. No autonomous payment or statutory submission.

## Demo invoice pipeline

Target journey (see [acceptance](strategy/demo-acceptance.md)): Telegram/web upload → durable original → CPU extraction → validated draft → one batch approval → ledger → payment → reports.

Current code path:

| Step                     | Where                                                                                                                     |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Upload / scan UI         | `apps/web/app/[locale]/(dashboard)/purchases/bills/scan`, `lib/hooks/use-ai-document-intake.ts`                           |
| Intake endpoint and jobs | `apps/api/src/modules/ai/controllers/document-intake.controller.ts`, `services/document-intake.service.ts`                |
| Extraction strategies    | `modules/ai/extraction/` (`vlm`, `ocr-llm`, `hybrid`, chosen by `EXTRACTION_STRATEGY`); PaddleOCR → tesseract.js fallback |
| Draft bills and approval | `modules/purchases` (bills, payments made), `modules/bulk-operations`                                                     |
| Ledger and reports       | `modules/accounting` (accounts, journals), `modules/reports` (GL, trial balance, AP aging, P&L, balance sheet)            |

The CPU-only extraction worker, Telegram intake and durable queue replace the Ollama/VLM dependency through the planned issues; see [invoice extraction research](strategy/invoice-extraction.md).

## API modules

All live in `apps/api/src/modules/`. Demo scope is accounting, purchases, AI intake, reports, tax and their dependencies; the other modules exist but are outside demo acceptance and frozen for new scope during the sprint.

| Module                  | Key entities / responsibility                                     | Demo |
| ----------------------- | ----------------------------------------------------------------- | ---- |
| `auth`                  | Login, register, JWT access/refresh tokens                        | yes  |
| `organizations`         | Organization profile and settings                                 | yes  |
| `users`, `roles`        | Users, roles, permission sets                                     | yes  |
| `accounting`            | Chart of accounts, journals/lines, recurring profiles, lock dates | yes  |
| `purchases`             | Vendors, bills, expenses, vendor credits, payments made           | yes  |
| `ai`                    | Document intake/extraction plus ~38 advisory feature controllers  | yes  |
| `bulk-operations`       | Batch actions across documents                                    | yes  |
| `reports`               | P&L, balance sheet, cash flow, GL, trial balance, AR/AP aging     | yes  |
| `tax`                   | Tax rates, VAT returns                                            | yes  |
| `currency`              | Currencies and exchange rates                                     | yes  |
| `documents`             | PDF templates (invoice, bill, quote, payslip) and email delivery  | yes  |
| `audit`                 | Audit log queries                                                 | yes  |
| `sales`                 | Customers, quotes, invoices, credit notes, payments received      | -    |
| `banking`               | Bank accounts, transactions, rules, reconciliation                | -    |
| `inventory`             | Items, warehouses, movements, adjustments, price lists            | -    |
| `assets`                | Fixed assets, depreciation                                        | -    |
| `projects`              | Projects, tasks, timesheets                                       | -    |
| `hr`                    | Employees, attendance, payroll runs, payslips                     | -    |
| `manufacturing`         | BOMs, work orders                                                 | -    |
| `crm`                   | Leads, deals, activities                                          | -    |
| `notifications`         | In-app notifications (socket.io gateway)                          | -    |
| `import-export`         | CSV/Excel import and export                                       | -    |
| `search`                | Global search                                                     | -    |
| `user-preferences`      | Tours, sidebar, theme preferences                                 | -    |
| `logger`, `performance` | Client log ingestion/streaming, performance metrics               | -    |

Endpoint details: run the API locally and open Swagger at `http://localhost:6001/api/docs`.

## Web application

- **Routing.** `app/[locale]/...` with `localePrefix: 'always'` (`/en/...`, `/ar/...`). `middleware.ts` combines next-intl routing with the NextAuth token check. `(auth)` holds public pages, `(dashboard)` protected pages with shared `layout.tsx`, `loading.tsx`, `error.tsx` and `not-found.tsx`.
- **i18n.** next-intl with namespaces in `messages/{en,ar}/*.json`, registered in `messages/{en,ar}/index.ts`. `i18n/config.ts` maps `ar → rtl`; the locale layout sets `lang`/`dir`.
- **Auth.** NextAuth credentials session holds the API access/refresh tokens (`lib/auth.ts`); the axios client in `lib/api.ts` attaches the bearer token and signs out on refresh failure.
- **Server state.** TanStack Query hooks in `lib/hooks/use-{resource}.ts`; prefer `createCrudHooks` (`lib/hooks/create-crud-hooks.ts`) on top of `crud('/resource')` API objects.
- **Client state.** Zustand stores in `lib/stores/` (dashboard layout, recent items, tours, shortcuts).
- **Forms.** React Hook Form + `zodResolver` with schemas from `@mizano/validators` or colocated Zod schemas.
- **UI.** shadcn/ui on Radix + Tailwind + Lucide; charts with Recharts. See [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md).

## Database conventions

Prisma schema: `apps/api/prisma/schema.prisma` (~87 models).

```prisma
model Example {
  id             String    @id @default(cuid())
  organizationId String
  amount         Decimal   @db.Decimal(19, 4)
  deletedAt      DateTime? // financial records
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  @@index([organizationId, status])
  @@index([organizationId, createdAt])
}
```

After a schema change run `pnpm db:generate`. Shared schema and migrations have one owner at a time (the coordinator); request changes rather than editing in parallel.

## Adding code

**Backend module** (scaffold steps: [`.agents/workflows/new-module.md`](../.agents/workflows/new-module.md)):

```
apps/api/src/modules/{domain}/
├── {domain}.module.ts
├── controllers/{entity}.controller.ts   # or {domain}.controller.ts for small modules
├── services/{entity}.service.ts
├── services/{entity}.service.spec.ts
└── dto/                                 # class-validator DTOs, money as decimal strings
```

Register the module in `app.module.ts`. Every controller: `@UseGuards(JwtAuthGuard, PermissionsGuard)`, `@Permissions('{module}.{action}')` on each route, `@CurrentOrg()` for the tenant, and service methods that take `organizationId` first. Multi-table writes go through `prisma.$transaction()`; use `DocumentNumberService` for numbering and `DecimalUtils` for money.

**Frontend page** (scaffold steps: [`.agents/workflows/new-page.md`](../.agents/workflows/new-page.md)):

```
apps/web/app/[locale]/(dashboard)/{module}/
├── page.tsx           list
├── loading.tsx        skeleton
├── error.tsx          error boundary
├── [id]/page.tsx      detail
└── new/page.tsx       create form
```

Add the API object to `lib/api.ts`, hooks to `lib/hooks/use-{resource}.ts`, components to `components/{module}/`, translations to both `messages/en` and `messages/ar`. Every page handles loading, error and empty states, RTL and a 375px viewport.
