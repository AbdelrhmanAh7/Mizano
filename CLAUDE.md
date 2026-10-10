# CLAUDE.md — Mizano ERP

Accountant-first accounting ERP for Egypt, Saudi Arabia and the UAE. Current goal: a tiny live deployment on a Raspberry Pi 5 (8GB, arm64) with the full accountant flow (ledger, invoice intake, Telegram ingestion). Read [AGENTS.md](AGENTS.md), [agent operations](docs/agents/README.md) and [review lessons](docs/agents/review-lessons.md) first; these supersede historical product/deployment assumptions below.

## Tech Stack

| Layer    | Technology                                            |
| -------- | ----------------------------------------------------- |
| Frontend | Next.js 14 (App Router), React 18, TypeScript         |
| Backend  | NestJS 10, TypeScript strict                          |
| Database | PostgreSQL 16 + Prisma ORM                            |
| Queue    | Redis + BullMQ                                        |
| UI       | shadcn/ui + Tailwind CSS + Radix UI + Lucide          |
| State    | TanStack Query (server) + Zustand (client)            |
| Forms    | React Hook Form + Zod                                 |
| Auth     | NextAuth.js (frontend) + JWT refresh tokens (backend) |
| Monorepo | Turborepo + pnpm workspaces                           |

## Quick Commands

```bash
pnpm dev              # Web :5001 + API :6001
pnpm dev:api / dev:web
pnpm build / lint / type-check
pnpm db:generate / db:push / db:migrate / db:seed / db:studio
pnpm test / test:api / test:web / test:cov / test:e2e
pnpm ci:full          # lint + type-check + test + e2e (MUST pass)
pnpm docker:up / docker:down / docker:prod
pnpm env:check        # verify env file for current APP_ENV
```

## Environment System (4-env)

| File         | APP_ENV | NODE_ENV    | Purpose             |
| ------------ | ------- | ----------- | ------------------- |
| `.env.local` | local   | development | Local dev (default) |
| `.env.dev`   | dev     | development | Shared dev server   |
| `.env.sit`   | sit     | production  | Integration testing |
| `.env.prod`  | prod    | production  | Production          |

API resolves: `.env.${APP_ENV}` → `.env`. See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md#environments).

## Project Structure

```
mizano/
├── apps/
│   ├── web/                    # Next.js frontend (port 5001)
│   │   ├── app/[locale]/(auth)/        # Login/register
│   │   ├── app/[locale]/(dashboard)/  # Protected pages
│   │   ├── components/{module}/        # Module components
│   │   └── lib/api/ + lib/hooks/       # API client + React Query hooks
│   └── api/                    # NestJS backend (port 6001)
│       ├── src/modules/        # Business domain modules
│       ├── src/common/         # Guards, decorators, interceptors
│       └── prisma/schema.prisma
├── packages/
│   ├── shared-types/           # Shared TypeScript types
│   └── validators/             # Shared Zod schemas
└── docs/                       # ARCHITECTURE, DEVELOPMENT, DESIGN-SYSTEM, roadmap, strategy
```

## Critical Architecture Rules

1. **Multi-tenancy** — ALL queries MUST include `organizationId`. Never leak across orgs.
2. **Double-entry** — Debits MUST equal credits. Throw if unbalanced.
3. **Money** — ALWAYS `Decimal` (Prisma). NEVER JS `number`/`float` for money.
4. **Soft delete** — Financial records use `deletedAt`, never hard delete.
5. **Audit trail** — Every write creates an audit log entry automatically.
6. **AI is advisory** — NEVER auto-post transactions. All AI suggestions are dismissible.

## Backend Conventions (NestJS)

- Module structure: `{domain}.module.ts`, `{domain}.controller.ts`, `{domain}.service.ts`, `dto/`
- All endpoints: `JwtAuthGuard` + `OrganizationGuard` (except auth routes)
- RBAC: `@Permissions('module.action')` decorator
- Transactions: `prisma.$transaction()` for multi-table writes
- Doc numbers: INV-XXX, EST-XXX, JRN-XXX, BILL-XXX

```typescript
// Controller pattern
@Controller('invoices')
@UseGuards(JwtAuthGuard, OrganizationGuard)
export class InvoicesController {
  @Get()  @Permissions('sales.view')
  findAll(@CurrentOrg() orgId: string, @Query() query: ListQueryDto) {}

  @Post() @Permissions('sales.create')
  create(@CurrentOrg() orgId: string, @Body() dto: CreateInvoiceDto) {}
}

// Response format
{ data: T, meta?: { page, limit, total, totalPages } }  // success
{ statusCode, message, error, details?: fieldErrors }    // error
```

## Frontend Conventions (Next.js)

- RSC by default — `'use client'` only for interactive components
- Hooks: `lib/hooks/use-{resource}.ts` (TanStack Query)
- API client: `lib/api/{module}.ts` (typed functions)
- Forms: `react-hook-form` + `zodResolver` + `@mizano/validators`
- Every page MUST handle: loading skeleton, error state, empty state

```typescript
// React Query hook pattern
export function useInvoices(params?: ListParams) {
  return useQuery({ queryKey: ['invoices', params], queryFn: () => invoicesApi.list(params) });
}
export function useCreateInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: invoicesApi.create,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invoices'] }),
  });
}
```

## Database Conventions (Prisma)

- All models: `id String @id @default(cuid())`, `createdAt`, `updatedAt`, `organizationId`
- Money: `Decimal @db.Decimal(19, 4)` — never JS floats
- Financial models: `deletedAt DateTime?` for soft delete
- Indexes: `[organizationId, status]`, `[organizationId, createdAt]`

```typescript
// Journal balance check
const totalDebits = lines.reduce((s, l) => s.add(l.debit), new Decimal(0));
const totalCredits = lines.reduce((s, l) => s.add(l.credit), new Decimal(0));
if (!totalDebits.equals(totalCredits)) throw new BadRequestException('Journal entry must balance');
```

## Business Domain Modules

| Module        | Path                     | Key Entities                                          |
| ------------- | ------------------------ | ----------------------------------------------------- |
| Accounting    | `modules/accounting/`    | Accounts, Journals, RecurringProfiles                 |
| Sales         | `modules/sales/`         | Customers, Quotes, Invoices, CreditNotes, Payments    |
| Purchases     | `modules/purchases/`     | Vendors, Bills, Expenses, VendorCredits               |
| Inventory     | `modules/inventory/`     | Items, Warehouses, Movements, Adjustments, PriceLists |
| Banking       | `modules/banking/`       | BankAccounts, Transactions, Rules                     |
| HR            | `modules/hr/`            | Employees, Attendance, PayrollRuns, Payslips          |
| Manufacturing | `modules/manufacturing/` | BOMs, WorkOrders                                      |
| Projects      | `modules/projects/`      | Projects, Tasks, TimesheetEntries                     |
| Tax           | `modules/tax/`           | TaxRates, VATReturns, VATPayments                     |
| CRM           | `modules/crm/`           | Leads, Deals                                          |
| Reports       | `modules/reports/`       | P&L, Balance Sheet, AR/AP Aging                       |
| AI            | `modules/ai/`            | 33 inference models, Ollama-backed (100% local)       |
| Assets        | `modules/assets/`        | FixedAssets, Depreciation                             |
| Documents     | `modules/documents/`     | Document management                                   |
| Currency      | `modules/currency/`      | Exchange rates, multi-currency                        |
| Notifications | `modules/notifications/` | In-app & email notifications                          |
| Search        | `modules/search/`        | Global search                                         |

## CI Zero-Tolerance Policy

`pnpm ci:full` MUST pass with **ZERO warnings and ZERO errors**. The current script runs lint → type-check → unit tests; it does not run E2E. Run seeded E2E/browser acceptance separately and complete the SMOKE issue.

### Lint rules

- No `eslint-disable` without justification
- No unused imports/variables (prefix unused params with `_`)
- No `any` — use proper types, `unknown`, or generics
- No `console.log` — use NestJS Logger in backend
- All promises must be awaited, `.catch()`ed, or `void`ed
- Always `const`; only `let` when reassignment needed
- ES module imports only (`import`, not `require`)

### Type-check rules

- Explicit return types on all exported functions
- `strict: true` — no implicit `any`
- `Decimal` for all monetary values, never `number`
- After Prisma schema changes: `pnpm db:generate`
- No `@ts-ignore` without explanation comment

### Test rules

- **After ANY code change, run affected tests and verify they pass before considering the task complete**
- All existing tests must pass after changes
- Mock Redis, external APIs — no infra dependency in unit tests
- When modifying business logic, update/add corresponding tests
- When modifying a service/controller/component, run its spec file and fix any broken assertions
- When adding new features, add corresponding unit tests
- API tests: `node apps/api/_run_tests.js [--testPathPattern="<pattern>"]` (required for Windows/WSL compatibility)
- Web tests: `cd apps/web && npx jest [--testPathPattern="<pattern>"]`
- Always run the full suite (`node apps/api/_run_tests.js` + `cd apps/web && npx jest`) before finalizing changes

## Git Hooks

- **pre-commit**: `_lint_staged.js` (ESLint --fix + Prettier on staged files only)
- **commit-msg**: commitlint (conventional commits)
- **pre-push**: `turbo run type-check test --filter=...[<base>]` (type-check + unit tests for the changed packages and their dependents; all packages when root config changes or pushed ref differs from HEAD; no lint, build or E2E). Hard limits: pre-commit 60 s, pre-push 290 s (5-minute rule)
- Full CI (`pnpm ci:full`, build, E2E) runs on the Mac mini via the hub's `localci` job, which posts the GitHub commit statuses; `pnpm ci:full` must still pass before acceptance
- Hooks skip with a one-line note in a worktree without `node_modules`; bypass deliberately with `HUSKY=0` (or `SKIP_LOCAL_CI=1` for pre-push)

## Code Quality Checklist

- [ ] No `any` types
- [ ] Loading, error, and empty states handled in UI
- [ ] `organizationId` in all DB queries
- [ ] Journal entries balance before saving
- [ ] Prisma transactions for multi-table writes
- [ ] Mobile responsive (test at 375px)
- [ ] All affected tests pass after changes (run targeted spec + full suite)
- [ ] `pnpm ci:full` passes with zero warnings/errors

## Agent Workflows (Slash Commands)

All workflows are in `.agents/workflows/`. Use these commands for full project control:

| Command          | Description                                         |
| ---------------- | --------------------------------------------------- |
| `/dev`           | Start dev servers (Docker + Web :5001 + API :6001)  |
| `/build`         | Build for any environment (local/dev/sit/prod)      |
| `/test`          | Run tests (unit/e2e/coverage/watch)                 |
| `/lint`          | Lint + type-check + format (with auto-fix option)   |
| `/ci`            | Full CI pipeline (lint → type-check → test → e2e)   |
| `/db`            | Database ops (generate/push/migrate/seed/reset)     |
| `/docker`        | Docker infra (up/down/logs/status/prod)             |
| `/deploy`        | Deploy (pre-checks → build → docker prod)           |
| `/git`           | Git ops (conventional commits, branch management)   |
| `/env`           | Environment management (check/switch/validate)      |
| `/new-module`    | Scaffold NestJS backend module                      |
| `/new-page`      | Scaffold Next.js frontend page + hooks + API client |
| `/add-component` | Add shadcn/ui components                            |
| `/debug-api`     | Debug API (Docker/ports/DB/logs/endpoints)          |

## AI Infrastructure — CPU-Only Extraction (Raspberry Pi 5)

> The demo runs on CPU-only hardware (Raspberry Pi 5, 8GB ARM64). No GPU, no Colab, no paid cloud AI.
> Extraction uses local OCR (Tesseract.js + PaddleOCR Python) and rule-based parsers.
> LLM-based features (narratives, categorization) require `OLLAMA_ENABLED=true` and a reachable Ollama endpoint.

### Architecture (current)

```
Browser → API (6001) → Intake job (BullMQ/Redis) → extraction strategies in-process → Draft Bills/Invoices
                                  ↓ (optional, when OLLAMA_ENABLED)
                           Ollama Service (text model for structured extraction)
```

### How it works

- Document intake goes through `IntakeQueueService` (BullMQ on Redis); a BullMQ `Worker` currently runs **inside the API process**
- OCR: Tesseract.js (fallback) or PaddleOCR via Python subprocess (preferred)
- Structured extraction: RulesStrategy (deterministic) or OcrLlmStrategy (optional Ollama), selected by `EXTRACTION_STRATEGY` / request mode
- Results stored as validated drafts; `POST /confirm` approves and posts a draft Bill/Invoice to the ledger
- No GPU, Colab, paid cloud AI or runtime model download is required

> **Target (not implemented yet):** move the extraction worker out of the API process into its own container. The Pi compose file reserves a commented-out `worker` service (§`deploy/pi/docker-compose.pi.yml`). Land the CPU extraction runtime first (epic #45, issues #39/#42, branches `ai/39`/`ai/42`), then flip the worker profile on.

### Key env vars

- `OLLAMA_ENABLED` — set `true` to enable optional LLM extraction (default: `false`)
- `OLLAMA_BASE_URL` — Ollama endpoint when enabled (e.g., `http://ollama:11434`)
- `INTAKE_STORAGE_DIR` — path for original document storage (default: `/data/originals`)
- `INTAKE_TESSDATA_DIR` — path to Tesseract traineddata files (required offline)
- `AI_SCHEDULERS_ENABLED` — set `true` to register the AI cron schedulers (default: `false`, see issue #133 AC3)

### Endpoints

- `POST /api/ai/document-intake/process` — upload document, create intake job
- `GET /api/ai/document-intake/jobs` — list jobs with status
- `GET /api/ai/document-intake/:jobId/result` — extraction result (owner-guarded)
- `GET /api/ai/document-intake/:jobId/original` — original document
- `POST /api/ai/document-intake/:jobId/retry` — re-run extraction
- `POST /api/ai/document-intake/confirm` — approve extracted data and create a draft Bill/Invoice

### Never

- Add GPU config, Colab tunnels or paid cloud AI (Gemini, OpenAI, etc.) — the demo is fully offline-capable
- Call external AI APIs as a fallback
- Assume Ollama is available — always handle it gracefully when disabled
- Ship employed `ai/schedulers/*` crons on the Pi: `AI_SCHEDULERS_ENABLED=false` unless explicitly enabled

## Docs Reference

| File                                                                   | Contents                                                            |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------- |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)                         | System design, modules, domain rules, folder structure, adding code |
| [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md)                           | Setup, 4-env system, database, testing, CI, hooks, deployment       |
| [`docs/DESIGN-SYSTEM.md`](docs/DESIGN-SYSTEM.md)                       | Tokens, components, UI patterns, RTL, money display                 |
| [`docs/roadmap.md`](docs/roadmap.md)                                   | Raspberry Pi live plan (milestones P1–P4)                           |
| [`docs/strategy/demo-acceptance.md`](docs/strategy/demo-acceptance.md) | Demo go/no-go contract                                              |
| [`docs/strategy/`](docs/strategy/)                                     | Vision, repository review, extraction and regional research         |
