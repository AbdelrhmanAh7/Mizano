# CLAUDE.md — Mizano ERP

Accountant-first accounting ERP for Egypt, Saudi Arabia and the UAE. Current goal: a tiny live deployment on a Raspberry Pi 5 (8GB, arm64) with the full accountant flow (ledger, invoice intake, Telegram ingestion). Read [AGENTS.md](AGENTS.md), [agent operations](docs/agents/README.md) and [review lessons](docs/agents/review-lessons.md) first; these supersede historical product/deployment assumptions below.

## Documentation is part of the change

Every agent and human must update **every affected `.md` file in the same PR**: READMEs,
`docs/*`, `deploy/pi/README.md`, `AGENTS.md`/`CLAUDE.md` for rule or command changes,
`docs/agents/review-lessons.md` for new root causes, and roadmap/status for milestone progress.
Verify claims against current code; separate requirements, implementation and live evidence.
If behavior changes without a documentation update, the PR body must contain a standalone
line starting with `Docs: not needed because` followed by the reason. CI `docs-check` gates
changes under `apps/`, `packages/`, `deploy/` and `.github/`; reviewers assess relevance,
freshness and exemptions. An unrelated Markdown edit does not meet this rule.

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
pnpm ci:full          # lint + type-check + unit tests (MUST pass; E2E separate)
pnpm docker:up / docker:down / docker:prod
pnpm env:check        # verify env file for current APP_ENV
pnpm wt:new <lane> [base] / wt:clean  # Bash helpers; see development guide
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
5. **Audit trail** — Preserve write audit metadata and source evidence. The API AuditInterceptor records HTTP writes, not every worker/database mutation automatically.
6. **AI is advisory** — NEVER auto-post transactions. All AI suggestions are dismissible.

## Backend Conventions (NestJS)

- Module structure: `{domain}.module.ts`, `{domain}.controller.ts`, `{domain}.service.ts`, `dto/`
- Protected endpoints: `JwtAuthGuard` + `PermissionsGuard`, explicit `@Permissions`, and tenant-scoped service queries; intake also uses `OrganizationGuard`. Auth/public health routes are explicit exceptions.
- RBAC: `@Permissions('module.action')` decorator
- Transactions: `prisma.$transaction()` for multi-table writes
- Doc numbers: `DocumentNumberService` allocates per-org prefixes such as INV, QT, JRN and BILL (`PREFIX-001` by default; padding is configurable).

```typescript
// Controller pattern
@Controller('invoices')
@UseGuards(JwtAuthGuard, PermissionsGuard)
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

- Tenant-owned models carry `organizationId`; child rows may scope through a tenant-owned parent. Check each model in `prisma/schema.prisma` instead of assuming identical fields.
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

| Module        | Path                     | Key Entities                                                           |
| ------------- | ------------------------ | ---------------------------------------------------------------------- |
| Accounting    | `modules/accounting/`    | Accounts, Journals, RecurringProfiles                                  |
| Sales         | `modules/sales/`         | Customers, Quotes, Invoices, CreditNotes, Payments                     |
| Purchases     | `modules/purchases/`     | Vendors, Bills, Expenses, VendorCredits                                |
| Inventory     | `modules/inventory/`     | Items, Warehouses, Movements, Adjustments, PriceLists                  |
| Banking       | `modules/banking/`       | BankAccounts, Transactions, Rules                                      |
| HR            | `modules/hr/`            | Employees, Attendance, PayrollRuns, Payslips                           |
| Manufacturing | `modules/manufacturing/` | BOMs, WorkOrders                                                       |
| Projects      | `modules/projects/`      | Projects, Tasks, TimesheetEntries                                      |
| Tax           | `modules/tax/`           | TaxRates, VATReturns, VATPayments                                      |
| CRM           | `modules/crm/`           | Leads, Deals                                                           |
| Reports       | `modules/reports/`       | P&L, Balance Sheet, AR/AP Aging                                        |
| AI            | `modules/ai/`            | Durable intake, CPU rules/Tesseract, optional legacy Ollama strategies |
| Assets        | `modules/assets/`        | FixedAssets, Depreciation                                              |
| Documents     | `modules/documents/`     | Document management                                                    |
| Currency      | `modules/currency/`      | Exchange rates, multi-currency                                         |
| Notifications | `modules/notifications/` | In-app & email notifications                                           |
| Search        | `modules/search/`        | Global search                                                          |

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
- API tests (native Windows pnpm supported): `cd apps/api && npx jest [--testPathPattern="<pattern>"]`
- Web tests: `cd apps/web && npx jest [--testPathPattern="<pattern>"]`
- For application code changes, run affected tests plus full API/web suites and builds, and seeded E2E/browser acceptance separately. Documentation-only changes need content/link/format checks and repository CI; CI scripts need offline behavior tests.
- `_run_tests.js` is a legacy WSL symlink workaround. Its custom `esModuleInterop: true` configuration has the known `csv-parser` namespace-import failure; do not use it as the standard runner.

## Git Hooks

- **pre-commit**: `_lint_staged.js` (ESLint --fix + Prettier on staged files; Windows-safe runner)
- **pre-push**: `pnpm ci:full` — all checks must pass

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

| Command          | Description                                                     |
| ---------------- | --------------------------------------------------------------- |
| `/dev`           | Start dev servers (Docker + Web :5001 + API :6001)              |
| `/build`         | Build for any environment (local/dev/sit/prod)                  |
| `/test`          | Run tests (unit/e2e/coverage/watch)                             |
| `/lint`          | Lint + type-check + format (with auto-fix option)               |
| `/ci`            | Package gate: lint/type-check/unit; legacy recipe needs refresh |
| `/db`            | Database ops (generate/push/migrate/seed/reset)                 |
| `/docker`        | Docker infra (up/down/logs/status/prod)                         |
| `/deploy`        | Deploy (pre-checks → build → docker prod)                       |
| `/git`           | Git ops (conventional commits, branch management)               |
| `/env`           | Environment management (check/switch/validate)                  |
| `/new-module`    | Scaffold NestJS backend module                                  |
| `/new-page`      | Scaffold Next.js frontend page + hooks + API client             |
| `/add-component` | Add shadcn/ui components                                        |
| `/debug-api`     | Debug API (Docker/ports/DB/logs/endpoints)                      |

## CPU-only invoice intake and historical AI infrastructure

The Pi live goal (epic #45, P1-P4) requires CPU-only intake with Tesseract and Poppler,
no Ollama/LLM in the live path, no GPU/Colab/paid API, and pinned language assets built into
the image. These are requirements; packaging and all formats are not complete.

Current code (`modules/ai/extraction/rules-strategy.service.ts`):

- `INTAKE_EXTRACTION_STRATEGY=rules` selects deterministic header-field extraction when
  no request strategy overrides it. Set `OLLAMA_ENABLED=false` for optional advisory inference.
  Existing UI presets and the request DTO still select legacy LLM strategies; rules mode
  is not yet a server-enforced restriction on overrides.
- Native PDF text comes from `pdf-parse`; images use `tesseract.js` (default `eng+ara`).
  `INTAKE_TESSDATA_DIR` selects local `.traineddata` assets and fails offline if missing.
  Without it Tesseract may download assets. Poppler rendering, scanned-PDF OCR in rules
  mode, Word parsing and pinned language packaging are not implemented here.
- Rules return header fields, confidence, evidence and warnings; missing fields stay null.
  Line items are empty, and the legacy extraction result still converts rule Decimal totals
  to numbers. Financial commands must retain the Decimal/fixed 4-dp string contract.
- PostgreSQL intake jobs preserve originals and hashes; BullMQ processes them inside the API
  with leases, retry/dead-letter states, authenticated SSE/polling and explicit confirmation
  to create a draft. Full automatic draft preparation and batch posting remain acceptance work.
- Telegram invoice ingestion is pending; `deploy/pi/scripts/healthcheck.sh` sends operator alerts.

`services/ollama-proxy` and the `vlm`/`ocr-llm`/`hybrid` strategies remain legacy optional
code. The old Colab diagram is historical, not a Pi deployment dependency. The legacy VM
workflow still enables Ollama; Pi Compose disables it but does not yet pass rules-mode or
tessdata settings. See [Architecture](docs/ARCHITECTURE.md#pi-invoice-pipeline) and
[Pi operations](deploy/pi/README.md#cpu-intake-readiness).

## Docs Reference

| File                                                                   | Contents                                                            |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------- |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)                         | System design, modules, domain rules, folder structure, adding code |
| [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md)                           | Setup, 4-env system, database, testing, CI, hooks, deployment       |
| [`docs/DESIGN-SYSTEM.md`](docs/DESIGN-SYSTEM.md)                       | Tokens, components, UI patterns, RTL, money display                 |
| [`docs/roadmap.md`](docs/roadmap.md)                                   | Raspberry Pi live plan (milestones P1–P4)                           |
| [`docs/strategy/demo-acceptance.md`](docs/strategy/demo-acceptance.md) | Demo go/no-go contract                                              |
| [`docs/strategy/`](docs/strategy/)                                     | Vision, repository review, extraction and regional research         |
