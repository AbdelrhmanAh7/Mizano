# CLAUDE.md - Mizano ERP System

## Project Overview

Mizano is an AI-powered ERP system (Autonomous Accounting Platform) designed for zero-touch accounting. The goal is for AI to handle 95% of work with no accounting knowledge required from users.

**Key Concepts:** Zero-Day Close, Perpetual General Ledger, Human-in-the-Loop

## Tech Stack

| Layer       | Technology                                                 |
| ----------- | ---------------------------------------------------------- |
| Frontend    | Next.js 14 (App Router), React 18, TypeScript              |
| Backend     | NestJS 10, TypeScript (strict mode)                        |
| Database    | PostgreSQL 16 + Prisma ORM                                 |
| Cache/Queue | Redis + BullMQ                                             |
| UI          | shadcn/ui + Tailwind CSS + Radix UI + Lucide icons         |
| State       | TanStack Query (server), Zustand (client)                  |
| Forms       | React Hook Form + Zod                                      |
| Charts      | Recharts                                                   |
| Auth        | NextAuth.js (frontend) + JWT with refresh tokens (backend) |
| Monorepo    | Turborepo + pnpm workspaces                                |

## Quick Commands

```bash
# Development
pnpm dev              # Start infra (postgres+redis) + all apps (web: 5001, api: 6001)
pnpm dev:api          # API only
pnpm dev:web          # Web only
pnpm dev:ocr          # Start OCR service (PaddleOCR + Tesseract, no GPU needed)
pnpm dev:vlm          # Start VLM service (requires GPU)
pnpm build            # Build all packages
pnpm lint             # Lint all packages
pnpm type-check       # TypeScript type checking

# Database
pnpm db:generate      # Generate Prisma client
pnpm db:push          # Push schema to database
pnpm db:migrate       # Run migrations
pnpm db:seed          # Seed database
pnpm db:studio        # Open Prisma Studio

# Testing
pnpm test             # Run all tests
pnpm test:api         # API unit tests
pnpm test:cov         # API coverage report
pnpm test:e2e         # API end-to-end tests

# Infrastructure
pnpm docker:up        # Start PostgreSQL + Redis
pnpm docker:up:ocr    # Start PostgreSQL + Redis + OCR service
pnpm docker:up:vlm    # Start PostgreSQL + Redis + VLM
pnpm docker:down      # Stop infrastructure
pnpm docker:prod      # Build & start production stack
```

## Project Structure

```
mizano/
├── apps/
│   ├── web/                    # Next.js frontend (port 5001)
│   │   ├── app/
│   │   │   ├── (auth)/         # Login, register pages
│   │   │   ├── (dashboard)/    # Protected pages
│   │   │   └── api/            # API routes (BFF)
│   │   ├── components/
│   │   │   ├── ui/             # shadcn/ui primitives
│   │   │   └── {module}/       # Module-specific components
│   │   └── lib/
│   │       ├── api/            # API client functions
│   │       └── hooks/          # React Query hooks
│   └── api/                    # NestJS backend (port 6001)
│       ├── src/
│       │   ├── modules/        # Business domain modules
│       │   ├── common/         # Shared utilities
│       │   └── prisma/         # Prisma service
│       └── prisma/
│           └── schema.prisma   # Database schema
├── packages/
│   ├── shared-types/           # Shared TypeScript types
│   └── validators/             # Shared Zod schemas
├── ocr-service/                  # Python FastAPI OCR microservice (port 7001)
├── services/
│   └── vlm-service/            # Python FastAPI VLM microservice (port 8100)
├── prompts/                    # AI feature design specifications
├── docker-compose.yml          # PostgreSQL + Redis + OCR + VLM
└── turbo.json                  # Turborepo config
```

## Architecture Rules

### Critical Constraints

1. **Multi-tenancy**: ALL database queries MUST include `organizationId`. Never leak data across organizations.

2. **Double-entry Accounting**: Every financial transaction MUST have balanced journal entries (`total debits === total credits`). Block save if unbalanced.

3. **Monetary Values**: ALWAYS use `Decimal` from Prisma. NEVER use JavaScript `number` or `float` for money.

4. **Soft Delete**: Financial records (invoices, bills, journals, payments) use `deletedAt` - never hard delete.

5. **Audit Trail**: Every write operation creates an audit log entry automatically.

### Backend Conventions (NestJS)

- One module per domain: `src/modules/{domain}/`
- Module structure: `{domain}.module.ts`, `{domain}.controller.ts`, `{domain}.service.ts`, `dto/`, `entities/`
- ALL endpoints protected by `JwtAuthGuard` + `OrganizationGuard` (except auth routes)
- Use `@Permissions('module.action')` decorator for RBAC
- Use Prisma transactions (`prisma.$transaction()`) for multi-table writes
- Auto-generate document numbers: INV-XXX, EST-XXX, JRN-XXX, BILL-XXX

**Response Format:**

```typescript
// Success
{ data: T, meta?: { page, limit, total, totalPages } }

// Error
{ statusCode, message, error, details?: fieldErrors }
```

### Frontend Conventions (Next.js)

- App Router with route groups: `(auth)` for public, `(dashboard)` for protected
- React Server Components by default. Add `'use client'` only for interactive components
- Data fetching: TanStack Query hooks in `lib/hooks/use-{resource}.ts`
- API client: typed functions in `lib/api/{module}.ts`
- Forms: react-hook-form + zodResolver with schemas from `@mizano/validators`
- Every page MUST handle: loading skeleton, error state, empty state

### Database Conventions (Prisma)

- All models include: `id String @id @default(cuid())`, `createdAt`, `updatedAt`, `organizationId`
- Money fields: `Decimal @db.Decimal(19, 4)` (supports up to 999 trillion with 4 decimals)
- Financial models add: `deletedAt DateTime?` for soft delete
- Indexes: `[organizationId, status]`, `[organizationId, createdAt]`

## Business Domain Modules

| Module        | Path                     | Key Entities                                               |
| ------------- | ------------------------ | ---------------------------------------------------------- |
| Accounting    | `modules/accounting/`    | Accounts, Journals, RecurringProfiles                      |
| Sales         | `modules/sales/`         | Customers, Quotes, Invoices, CreditNotes, PaymentsReceived |
| Purchases     | `modules/purchases/`     | Vendors, Bills, Expenses, VendorCredits, PaymentsMade      |
| Inventory     | `modules/inventory/`     | Items, Warehouses, Movements, Adjustments, PriceLists      |
| Banking       | `modules/banking/`       | BankAccounts, BankTransactions, BankRules                  |
| HR            | `modules/hr/`            | Employees, Attendance, PayrollRuns, Payslips               |
| Manufacturing | `modules/manufacturing/` | BOMs, WorkOrders                                           |
| Projects      | `modules/projects/`      | Projects, Tasks, TimesheetEntries                          |
| Tax           | `modules/tax/`           | TaxRates, VATReturns, VATPayments                          |
| CRM           | `modules/crm/`           | Leads, Deals                                               |
| Reports       | `modules/reports/`       | P&L, Balance Sheet, AR/AP Aging                            |
| AI            | `modules/ai/`            | AIInsights, reconciliation, forecasting                    |

## Common Patterns

### Creating a New API Endpoint

```typescript
// controller
@Controller('invoices')
@UseGuards(JwtAuthGuard, OrganizationGuard)
export class InvoicesController {
  @Get()
  @Permissions('sales.view')
  findAll(@CurrentOrg() orgId: string, @Query() query: ListQueryDto) {}

  @Post()
  @Permissions('sales.create')
  create(@CurrentOrg() orgId: string, @Body() dto: CreateInvoiceDto) {}
}
```

### Creating a React Query Hook

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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['invoices'] }),
  });
}
```

### Journal Entry Pattern

```typescript
// Ensure debits === credits
const totalDebits = lines.reduce((sum, l) => sum.add(l.debit), new Decimal(0));
const totalCredits = lines.reduce((sum, l) => sum.add(l.credit), new Decimal(0));
if (!totalDebits.equals(totalCredits)) {
  throw new BadRequestException('Journal entry must balance');
}
```

## AI Features Guidelines

- All AI suggestions MUST be dismissible (Human-in-the-Loop)
- Show confidence scores on AI-generated data
- Learn from user corrections
- Run pattern analysis in background jobs
- NEVER auto-post financial transactions without explicit user confirmation

## Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
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

## Code Quality Checklist

When writing code, ensure:

- [ ] TypeScript types are explicit (no `any`)
- [ ] Loading, error, and empty states handled
- [ ] `organizationId` included in all queries
- [ ] Journal entries balance before saving
- [ ] Prisma transactions for multi-table writes
- [ ] Mobile-responsive UI (test at 375px)
- [ ] Proper error messages for business rules
