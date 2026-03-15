# CLAUDE.md — Mizano ERP

AI-powered ERP (Autonomous Accounting Platform). Zero-touch accounting — AI handles 95% of work. Key concepts: Zero-Day Close, Perpetual General Ledger, Human-in-the-Loop.

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
pnpm test / test:api / test:cov / test:e2e / test:playwright
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

API resolves: `.env.${APP_ENV}` → `.env`. See `docs/environment-guide.md`.

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
└── docs/                       # Architecture, API, DB, testing guides
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

`pnpm ci:full` MUST pass with **ZERO warnings and ZERO errors**. Runs: lint → type-check → test → e2e.

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

- **pre-commit**: lint-staged (ESLint --fix + Prettier on staged files)
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

| Command          | Description                                         |
| ---------------- | --------------------------------------------------- |
| `/dev`           | Start dev servers (Docker + Web :5001 + API :6001)  |
| `/build`         | Build for any environment (local/dev/sit/prod)      |
| `/test`          | Run tests (unit/e2e/playwright/coverage/watch)      |
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

## Docs Reference

| File                        | Contents                            |
| --------------------------- | ----------------------------------- |
| `docs/architecture.md`      | System design, data flow, layers    |
| `docs/modules.md`           | All 28 modules documented in detail |
| `docs/environment-guide.md` | 4-env system setup                  |
| `docs/testing-strategy.md`  | Test plan, pyramid, coverage goals  |
| `docs/roadmap.md`           | 5-phase product roadmap             |
