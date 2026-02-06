# Mizano - AI-Powered ERP System

An autonomous accounting platform designed for zero-touch accounting, enabling AI to handle 95% of accounting work without requiring accounting knowledge from users.

**Key Concepts:** Zero-Day Close | Perpetual General Ledger | Human-in-the-Loop

## Table of Contents

- [Project Overview](#project-overview)
- [Tech Stack](#tech-stack)
- [Quick Start](#quick-start)
- [Project Structure](#project-structure)
- [Architecture Rules](#architecture-rules)
- [Development Guide](#development-guide)
- [Database Management](#database-management)
- [Deployment](#deployment)
- [Business Modules](#business-modules)
- [Common Patterns](#common-patterns)
- [Troubleshooting](#troubleshooting)
- [Important Documents](#important-documents)

---

## Project Overview

Mizano is a modern ERP (Enterprise Resource Planning) system built with AI at its core. It provides comprehensive business management solutions including:

- **Accounting & Financial Management:** Double-entry accounting, journal entries, balance sheets, P&L reports
- **Sales Management:** Invoices, quotes, credit notes, customer tracking
- **Purchase Management:** Bills, expenses, vendor tracking, vendor credits
- **Inventory Management:** Stock tracking, movements, adjustments, price lists
- **HR Management:** Employee tracking, attendance, payroll
- **Manufacturing:** BOMs (Bill of Materials), work orders
- **Projects & CRM:** Project tracking, leads, deals, activities
- **Banking:** Bank reconciliation, multi-account management
- **Tax Management:** VAT returns, tax rate management
- **AI Features:** Forecasting, anomaly detection, pattern recognition, OCR, automated categorization

### Core Principles

1. **Zero-Touch Accounting:** AI should handle 95% of tasks automatically
2. **Multi-tenancy:** Complete data isolation between organizations
3. **Double-Entry Accounting:** All transactions must balance
4. **Audit Trail:** Every change is logged for compliance
5. **Human-in-the-Loop:** Users can review and override AI suggestions

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| **Frontend** | Next.js (App Router) | 14+ |
| **Frontend Framework** | React | 18+ |
| **Language** | TypeScript | 5.7+ (strict mode) |
| **Backend** | NestJS | 10+ |
| **Database** | PostgreSQL | 16+ |
| **ORM** | Prisma | Latest |
| **Cache/Queue** | Redis + BullMQ | Latest |
| **UI Components** | shadcn/ui, Radix UI | Latest |
| **Styling** | Tailwind CSS | 3.4+ |
| **State Management** | Zustand (client), TanStack Query (server) | Latest |
| **Forms** | React Hook Form + Zod | Latest |
| **Charts** | Recharts | Latest |
| **Authentication** | NextAuth.js + JWT | Latest |
| **Package Manager** | pnpm | 8+ |
| **Monorepo** | Turborepo | Latest |
| **Icons** | Lucide Icons | Latest |

---

## Quick Start

### Prerequisites

- Node.js 18+ or 20+
- pnpm 8+
- PostgreSQL 16+
- Redis 7+
- Docker & Docker Compose (optional, for PostgreSQL + Redis)

### 1. Clone Repository

```bash
git clone <repository-url>
cd mizano
```

### 2. Install Dependencies

```bash
pnpm install
```

### 3. Setup Environment Variables

Copy the example file and configure:

```bash
cp .env.example .env.local
```

Edit `.env.local` with your configuration:

```env
# Database
DATABASE_URL="postgresql://mizano:mizano_secret@localhost:5432/mizano_db"

# Redis
REDIS_URL="redis://localhost:6379"

# JWT
JWT_SECRET="your-super-secret-jwt-key-change-me"
JWT_REFRESH_SECRET="your-super-secret-refresh-key-change-me"

# NextAuth
NEXTAUTH_SECRET="your-nextauth-secret-change-me"
NEXTAUTH_URL="http://localhost:3001"
API_URL="http://localhost:3000"

# API Configuration
API_PORT=3000
WEB_PORT=3001

# Optional: AI Features
OPENAI_API_KEY="your-openai-key-if-using-ai-features"
```

### 4. Start Infrastructure (PostgreSQL + Redis)

```bash
docker-compose up -d
```

Or if using production compose:

```bash
docker-compose -f docker-compose.production.yml up -d
```

### 5. Setup Database

```bash
# Generate Prisma client
pnpm db:generate

# Push schema to database
pnpm db:push

# (Optional) Run migrations
pnpm db:migrate

# (Optional) Seed database with sample data
pnpm db:seed

# (Optional) Open Prisma Studio GUI
pnpm db:studio
```

### 6. Start Development Servers

```bash
# Start both API (port 3000) and Web (port 3001)
pnpm dev

# Or start individually:
pnpm --filter @mizano/api dev      # API only
pnpm --filter @mizano/web dev      # Web only
```

### 7. Access the Application

- **Web:** http://localhost:3001
- **API:** http://localhost:3000
- **API Docs:** http://localhost:3000/api (if Swagger is configured)

---

## Project Structure

```
mizano/
├── apps/
│   ├── api/                        # NestJS Backend (Port 3000)
│   │   ├── src/
│   │   │   ├── modules/            # Business logic organized by domain
│   │   │   │   ├── accounting/     # GL, journals, accounting rules
│   │   │   │   ├── sales/          # Invoices, quotes, customers
│   │   │   │   ├── purchases/      # Bills, expenses, vendors
│   │   │   │   ├── inventory/      # Stock, movements, adjustments
│   │   │   │   ├── banking/        # Bank accounts, reconciliation
│   │   │   │   ├── hr/             # Employees, payroll, attendance
│   │   │   │   ├── manufacturing/  # BOMs, work orders
│   │   │   │   ├── projects/       # Projects, tasks, timesheets
│   │   │   │   ├── tax/            # Tax rates, VAT returns
│   │   │   │   ├── crm/            # Leads, deals, activities
│   │   │   │   ├── reports/        # Financial reports
│   │   │   │   ├── ai/             # AI insights and automation
│   │   │   │   ├── auth/           # Authentication
│   │   │   │   └── organizations/  # Multi-tenancy
│   │   │   ├── common/             # Shared utilities, filters, guards
│   │   │   ├── cache/              # Redis caching
│   │   │   ├── exceptions/         # Custom exceptions
│   │   │   ├── health/             # Health checks
│   │   │   ├── i18n/               # Internationalization
│   │   │   └── app.module.ts       # Main app module
│   │   ├── prisma/
│   │   │   └── schema.prisma       # Database schema
│   │   ├── nest-cli.json           # NestJS configuration
│   │   └── package.json
│   │
│   └── web/                        # Next.js Frontend (Port 3001)
│       ├── app/
│       │   ├── (auth)/             # Public pages: login, register
│       │   ├── [locale]/           # Locale routing
│       │   │   ├── (dashboard)/    # Protected dashboard pages
│       │   │   ├── layout.tsx       # Locale layout
│       │   │   └── ...
│       │   ├── layout.tsx           # Root layout
│       │   └── api/                # API routes (Backend For Frontend)
│       ├── components/
│       │   ├── ui/                 # shadcn/ui primitives
│       │   ├── ai/                 # AI-related components
│       │   ├── dashboard/          # Dashboard widgets
│       │   ├── accounting/         # Accounting module components
│       │   ├── sales/              # Sales module components
│       │   └── ...                 # Other module components
│       ├── lib/
│       │   ├── api/                # API client functions
│       │   ├── hooks/              # React Query hooks
│       │   └── utils/              # Utilities
│       ├── messages/               # i18n translations (en, ar, etc)
│       ├── middleware.ts           # Next.js middleware
│       ├── next.config.js          # Next.js config
│       └── package.json
│
├── packages/
│   ├── shared-types/               # Shared TypeScript types
│   └── validators/                 # Shared Zod validation schemas
│
├── docker-compose.yml              # Dev: PostgreSQL + Redis
├── docker-compose.production.yml    # Production config
├── turbo.json                       # Turborepo configuration
├── pnpm-workspace.yaml             # pnpm workspace config
├── .env.example                    # Environment template
├── CLAUDE.md                        # Development rules & conventions
└── README.md                        # This file
```

---

## Architecture Rules

### Critical Constraints

#### 1. Multi-Tenancy
- **MANDATORY:** ALL database queries MUST include `organizationId`
- Never filter by user alone; always include organization filter
- Data from one organization must NEVER leak to another
- Use the `OrganizationGuard` on all protected endpoints

```typescript
// Example: Always include organizationId
const invoices = await prisma.invoice.findMany({
  where: {
    organizationId: orgId, // REQUIRED
    status: 'DRAFT'
  }
});
```

#### 2. Double-Entry Accounting
- Every financial transaction MUST have balanced journal entries
- Total debits MUST equal total credits
- Block save if entries are unbalanced
- Use Prisma transactions for atomic multi-entry operations

```typescript
// Example: Validate balance
const totalDebits = lines.reduce((sum, l) => sum.add(l.debit), new Decimal(0));
const totalCredits = lines.reduce((sum, l) => sum.add(l.credit), new Decimal(0));

if (!totalDebits.equals(totalCredits)) {
  throw new BadRequestException('Journal entry must balance: debits must equal credits');
}
```

#### 3. Monetary Values
- **NEVER** use JavaScript `number` or `float` for monetary values
- **ALWAYS** use `Decimal` from Prisma (`Prisma.Decimal`)
- Database column type: `Decimal @db.Decimal(19, 4)`
- Supports up to 999 trillion with 4 decimal places

```typescript
// Correct ✓
const amount = new Decimal('1234.56');

// Wrong ✗
const amount = 1234.56;
```

#### 4. Soft Delete
- Financial records NEVER use hard delete
- Use `deletedAt DateTime?` field for soft delete
- Query: Always filter `where: { deletedAt: null }`
- Restore by setting `deletedAt: null`

```typescript
// Schema
model Invoice {
  id String @id
  deletedAt DateTime?
  // ...
}

// Query
const active = await prisma.invoice.findMany({
  where: {
    organizationId: orgId,
    deletedAt: null
  }
});
```

#### 5. Audit Trail
- Every write operation creates an audit log entry automatically
- Implemented via database triggers or middleware
- Essential for regulatory compliance and troubleshooting
- Never delete audit logs

### Backend Conventions (NestJS)

#### Module Structure

```
src/modules/{domain}/
├── {domain}.module.ts          # Module definition
├── {domain}.controller.ts       # API endpoints
├── {domain}.service.ts          # Business logic
├── dto/
│   ├── create-{entity}.dto.ts
│   ├── update-{entity}.dto.ts
│   └── {entity}-query.dto.ts
├── entities/
│   └── {entity}.entity.ts
└── {domain}.service.spec.ts     # Tests
```

#### Controller Pattern

```typescript
import { Controller, Get, Post, UseGuards, Body, Param } from '@nestjs/common';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { OrganizationGuard } from '@common/guards/organization.guard';
import { Permissions } from '@common/decorators/permissions.decorator';
import { CurrentOrg } from '@common/decorators/current-org.decorator';

@Controller('invoices')
@UseGuards(JwtAuthGuard, OrganizationGuard)
export class InvoicesController {
  constructor(private invoicesService: InvoicesService) {}

  @Get()
  @Permissions('sales.view')
  findAll(
    @CurrentOrg() orgId: string,
    @Query() query: ListQueryDto
  ) {
    return this.invoicesService.findAll(orgId, query);
  }

  @Post()
  @Permissions('sales.create')
  create(
    @CurrentOrg() orgId: string,
    @Body() dto: CreateInvoiceDto
  ) {
    return this.invoicesService.create(orgId, dto);
  }
}
```

#### Service Pattern

```typescript
import { Injectable } from '@nestjs/common';
import { PrismaService } from '@prisma/prisma.service';

@Injectable()
export class InvoicesService {
  constructor(private prisma: PrismaService) {}

  async create(orgId: string, dto: CreateInvoiceDto) {
    // Always validate organization
    return this.prisma.invoice.create({
      data: {
        ...dto,
        organizationId: orgId,
        number: await this.generateInvoiceNumber(orgId)
      }
    });
  }

  async findAll(orgId: string, query: ListQueryDto) {
    return this.prisma.invoice.findMany({
      where: {
        organizationId: orgId,
        deletedAt: null
      },
      skip: query.skip,
      take: query.take,
      orderBy: { createdAt: 'desc' }
    });
  }
}
```

#### Response Format

All endpoints follow a consistent response format:

```typescript
// Success with data
{
  data: T,
  meta?: {
    page: number,
    limit: number,
    total: number,
    totalPages: number
  }
}

// Error response
{
  statusCode: number,
  message: string,
  error: string,
  details?: {
    fieldName: ["error message"]
  }
}
```

#### Document Number Generation

Auto-generate formatted document numbers:

```typescript
// INV-2024-00001, BILL-2024-00001, EST-2024-00001, etc.
async generateInvoiceNumber(orgId: string): Promise<string> {
  const count = await this.prisma.invoice.count({
    where: { organizationId: orgId }
  });
  const year = new Date().getFullYear();
  return `INV-${year}-${String(count + 1).padStart(5, '0')}`;
}
```

### Frontend Conventions (Next.js)

#### Routing Structure

- `(auth)` route group: Public pages (login, register, forgot password)
- `(dashboard)` route group: Protected pages (requires authentication)
- `[locale]` dynamic segment: Multi-language support
- Locale routing: `/en/dashboard`, `/ar/dashboard`

#### Server Components by Default

```typescript
// Default: Server Component (no 'use client')
export default async function DashboardPage() {
  const data = await fetchData();
  return <div>{/* render server data */}</div>;
}

// Interactive: Client Component (add 'use client')
'use client';

export function InteractiveForm() {
  const [state, setState] = useState();
  return <form>{/* interactive elements */}</form>;
}
```

#### API Client Pattern

```typescript
// lib/api/invoices.ts
import { apiClient } from './client';

export const invoicesApi = {
  list: (params?: ListParams) =>
    apiClient.get('/invoices', { params }),

  get: (id: string) =>
    apiClient.get(`/invoices/${id}`),

  create: (data: CreateInvoiceDto) =>
    apiClient.post('/invoices', data),

  update: (id: string, data: UpdateInvoiceDto) =>
    apiClient.put(`/invoices/${id}`, data),

  delete: (id: string) =>
    apiClient.delete(`/invoices/${id}`)
};
```

#### React Query Hook Pattern

```typescript
// lib/hooks/use-invoices.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { invoicesApi } from '@/lib/api/invoices';

export function useInvoices(params?: ListParams) {
  return useQuery({
    queryKey: ['invoices', params],
    queryFn: () => invoicesApi.list(params),
    staleTime: 1000 * 60 * 5 // 5 minutes
  });
}

export function useInvoice(id: string) {
  return useQuery({
    queryKey: ['invoices', id],
    queryFn: () => invoicesApi.get(id),
    enabled: !!id
  });
}

export function useCreateInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: invoicesApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
    }
  });
}

export function useUpdateInvoice(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateInvoiceDto) => invoicesApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['invoices', id] });
    }
  });
}
```

#### Form Pattern

```typescript
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CreateInvoiceDto, createInvoiceSchema } from '@mizano/validators';

export function InvoiceForm() {
  const { mutate: create } = useCreateInvoice();
  const form = useForm<CreateInvoiceDto>({
    resolver: zodResolver(createInvoiceSchema),
    defaultValues: {}
  });

  const onSubmit = (data: CreateInvoiceDto) => {
    create(data, {
      onSuccess: () => {
        toast.success('Invoice created');
        router.push('/invoices');
      }
    });
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
      {/* form fields */}
      <button type="submit" disabled={form.formState.isSubmitting}>
        Create Invoice
      </button>
    </form>
  );
}
```

#### Page States (Loading, Error, Empty)

Every page should handle:

```typescript
'use client';

import { LoadingSkeleton } from '@/components/ui/loading-skeleton';
import { ErrorAlert } from '@/components/ui/error-alert';

export default function InvoicesPage() {
  const { data, isLoading, error } = useInvoices();

  if (isLoading) return <LoadingSkeleton />;
  if (error) return <ErrorAlert error={error} />;
  if (!data?.length) return <EmptyState />;

  return (
    <div>
      {data.map(invoice => (
        <InvoiceCard key={invoice.id} invoice={invoice} />
      ))}
    </div>
  );
}
```

### Database Conventions (Prisma)

#### Model Template

```prisma
model Invoice {
  // Core fields
  id String @id @default(cuid())
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  // Multi-tenancy
  organizationId String
  organization Organization @relation(fields: [organizationId], references: [id])

  // Business fields
  number String @unique
  customerId String
  customer Customer @relation(fields: [customerId], references: [id])
  status String @default("DRAFT") // DRAFT, SENT, PAID, OVERDUE
  amount Decimal @db.Decimal(19, 4)
  tax Decimal @db.Decimal(19, 4)
  total Decimal @db.Decimal(19, 4)
  dueDate DateTime

  // Soft delete
  deletedAt DateTime?

  // Relations
  lines InvoiceLine[]
  payments InvoicePayment[]

  // Indexes for performance
  @@index([organizationId])
  @@index([organizationId, status])
  @@index([organizationId, createdAt])
  @@index([customerId])
}

model InvoiceLine {
  id String @id @default(cuid())
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  invoiceId String
  invoice Invoice @relation(fields: [invoiceId], references: [id], onDelete: Cascade)

  itemId String
  item Item @relation(fields: [itemId], references: [id])

  quantity Decimal @db.Decimal(19, 4)
  unitPrice Decimal @db.Decimal(19, 4)
  amount Decimal @db.Decimal(19, 4)

  @@index([invoiceId])
  @@index([itemId])
}
```

#### Decimal Fields (Money)

```prisma
// Always use for monetary amounts
amount Decimal @db.Decimal(19, 4)

// Breakdown:
// - Total digits: 19
// - Decimal places: 4
// - Range: -999,999,999,999,999.9999 to +999,999,999,999,999.9999
```

#### Indexing Strategy

```prisma
// Always index organizationId (multi-tenancy)
@@index([organizationId])

// Index common filter+sort combinations
@@index([organizationId, status])
@@index([organizationId, createdAt])
@@index([organizationId, dueDate])

// Composite index for complex queries
@@index([organizationId, customerId, status])
```

---

## Development Guide

### Common Commands

```bash
# Development
pnpm dev                          # Start all services
pnpm --filter @mizano/api dev     # API only
pnpm --filter @mizano/web dev     # Web only

# Building
pnpm build                        # Build all apps
pnpm lint                         # Lint all code

# Database
pnpm db:generate                  # Generate Prisma client
pnpm db:push                      # Push schema to database
pnpm db:migrate                   # Run migrations
pnpm db:seed                      # Seed sample data
pnpm db:studio                    # Open Prisma Studio (GUI)

# Testing
pnpm test                         # Run all tests
pnpm test:watch                   # Watch mode
pnpm test:coverage                # Coverage report

# Code Quality
pnpm lint:fix                     # Fix linting issues
pnpm type-check                   # Type check (TypeScript)
pnpm format                       # Format code with Prettier
```

### Creating a New Module

1. **Backend (NestJS):**

```bash
# Create module structure
mkdir -p apps/api/src/modules/{moduleName}/{dto,entities}
touch apps/api/src/modules/{moduleName}/{moduleName}.module.ts
touch apps/api/src/modules/{moduleName}/{moduleName}.controller.ts
touch apps/api/src/modules/{moduleName}/{moduleName}.service.ts
```

2. **Frontend (Next.js):**

```bash
# Create pages and components
mkdir -p apps/web/app/\[locale\]/\(dashboard\)/{moduleName}
mkdir -p apps/web/components/{moduleName}
mkdir -p apps/web/lib/hooks/use-{moduleName}
mkdir -p apps/web/lib/api/{moduleName}
```

### Adding a New Feature

1. **Define Schema** → Update `apps/api/prisma/schema.prisma`
2. **Generate Client** → Run `pnpm db:generate`
3. **Create Migration** → Run `pnpm db:migrate`
4. **Backend Implementation:**
   - Create DTO in `{module}/dto/`
   - Create Service in `{module}/{module}.service.ts`
   - Create Controller in `{module}/{module}.controller.ts`
5. **Frontend Implementation:**
   - Create API client in `lib/api/{module}.ts`
   - Create hooks in `lib/hooks/use-{module}.ts`
   - Create components in `components/{module}/`
   - Create pages in `app/[locale]/(dashboard)/{module}/`
6. **Test & Validate**
7. **Update Documentation** → Add to CLAUDE.md if needed

### Code Quality Standards

- **TypeScript:** Strict mode enabled, no `any` types
- **Linting:** ESLint + Prettier
- **Testing:** Jest for unit tests, Cypress for E2E
- **Error Handling:** Proper error messages, validation at boundaries
- **Security:** Input validation, SQL injection prevention, XSS prevention
- **Performance:** Database query optimization, index usage
- **Mobile:** Test at 375px width for responsive design

---

## Database Management

### Prisma Commands

```bash
# Generate Prisma Client after schema changes
pnpm db:generate

# View schema in interactive GUI
pnpm db:studio

# Sync schema with database (for development)
pnpm db:push

# Create and run migrations (for production)
pnpm db:migrate

# Seed database with initial data
pnpm db:seed

# Reset database (WARNING: deletes all data)
pnpm db:reset
```

### Schema Changes Workflow

```bash
# 1. Update schema.prisma
# 2. Generate Prisma client
pnpm db:generate

# 3. For development (quick sync)
pnpm db:push

# 4. For production (with migration history)
pnpm db:migrate dev --name add_new_feature

# 5. Deploy migration to production
pnpm db:migrate deploy
```

### Backup & Restore

```bash
# Backup PostgreSQL
docker exec mizano_db pg_dump -U mizano mizano_db > backup.sql

# Restore from backup
docker exec -i mizano_db psql -U mizano mizano_db < backup.sql
```

### Performance Optimization

1. **Add Indexes** for frequently queried fields:
   ```prisma
   @@index([organizationId, status])
   ```

2. **Use Selective Queries** instead of N+1:
   ```typescript
   // Good: Load relations in single query
   const invoices = await prisma.invoice.findMany({
     include: {
       customer: true,
       lines: true,
       payments: true
     }
   });

   // Bad: N+1 queries
   const invoices = await prisma.invoice.findMany();
   for (const inv of invoices) {
     const customer = await prisma.customer.findUnique({...});
   }
   ```

3. **Pagination** for large datasets:
   ```typescript
   const invoices = await prisma.invoice.findMany({
     skip: (page - 1) * pageSize,
     take: pageSize,
     orderBy: { createdAt: 'desc' }
   });
   ```

---

## Deployment

### Environment-Specific Configuration

**Development** (`.env.local`):
```env
NODE_ENV=development
DATABASE_URL=postgresql://...
REDIS_URL=redis://localhost:6379
DEBUG=true
```

**Production** (`.env.production`):
```env
NODE_ENV=production
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
DEBUG=false
LOG_LEVEL=warn
```

### Docker Deployment

```bash
# Build images
docker-compose -f docker-compose.production.yml build

# Start services
docker-compose -f docker-compose.production.yml up -d

# View logs
docker-compose -f docker-compose.production.yml logs -f

# Stop services
docker-compose -f docker-compose.production.yml down
```

### Database Migration on Deploy

```bash
# Run migrations before starting app
pnpm db:migrate deploy

# Start application
pnpm start
```

### Health Checks

API provides health endpoints:
```bash
GET /health              # Overall health
GET /health/db           # Database connection
GET /health/redis        # Redis connection
```

Monitor these in production using your monitoring solution.

---

## Business Modules

### Accounting Module
- **Path:** `apps/api/src/modules/accounting/`
- **Key Entities:** Accounts, JournalEntries, RecurringProfiles, ChartOfAccounts
- **Responsibilities:**
  - General Ledger management
  - Journal entry creation & validation
  - Account reconciliation
  - Financial period management

### Sales Module
- **Path:** `apps/api/src/modules/sales/`
- **Key Entities:** Customers, Invoices, Quotes, CreditNotes, PaymentsReceived, DeliveryChallans
- **Responsibilities:**
  - Customer management
  - Invoice generation & tracking
  - Quote management
  - Payment collection tracking

### Purchases Module
- **Path:** `apps/api/src/modules/purchases/`
- **Key Entities:** Vendors, Bills, Expenses, VendorCredits, PaymentsMade
- **Responsibilities:**
  - Vendor management
  - Bill entry & tracking
  - Expense management
  - Payment tracking

### Inventory Module
- **Path:** `apps/api/src/modules/inventory/`
- **Key Entities:** Items, Warehouses, Movements, Adjustments, PriceLists
- **Responsibilities:**
  - Stock level tracking
  - Inventory movements
  - Stock adjustments
  - Multi-warehouse management

### HR Module
- **Path:** `apps/api/src/modules/hr/`
- **Key Entities:** Employees, Attendance, PayrollRuns, Payslips
- **Responsibilities:**
  - Employee records
  - Attendance tracking
  - Payroll processing
  - Leave management

### Manufacturing Module
- **Path:** `apps/api/src/modules/manufacturing/`
- **Key Entities:** BOMs (Bill of Materials), WorkOrders
- **Responsibilities:**
  - BOM management
  - Work order creation
  - Production tracking
  - Resource planning

### Projects Module
- **Path:** `apps/api/src/modules/projects/`
- **Key Entities:** Projects, Tasks, TimesheetEntries
- **Responsibilities:**
  - Project management
  - Task tracking
  - Timesheet management
  - Project costing

### Banking Module
- **Path:** `apps/api/src/modules/banking/`
- **Key Entities:** BankAccounts, BankTransactions, BankRules
- **Responsibilities:**
  - Multi-account management
  - Transaction tracking
  - Bank reconciliation
  - Automated categorization rules

### Tax Module
- **Path:** `apps/api/src/modules/tax/`
- **Key Entities:** TaxRates, VATReturns, VATPayments
- **Responsibilities:**
  - Tax rate management
  - VAT return filing
  - Tax compliance tracking

### CRM Module
- **Path:** `apps/api/src/modules/crm/`
- **Key Entities:** Leads, Deals, Activities
- **Responsibilities:**
  - Lead management
  - Deal tracking
  - Activity logging
  - Lead scoring (AI)

### AI Module
- **Path:** `apps/api/src/modules/ai/`
- **Key Features:**
  - Transaction categorization
  - Anomaly detection
  - Cash flow forecasting
  - Lead scoring
  - Pattern recognition
  - OCR for document processing
  - Payment prediction
  - Demand forecasting
- **Important:** All AI features must be dismissible (human-in-the-loop)

### Reports Module
- **Path:** `apps/api/src/modules/reports/`
- **Key Reports:**
  - Profit & Loss (P&L)
  - Balance Sheet
  - AR/AP Aging
  - Trial Balance
  - Cash Flow Statement

---

## Common Patterns

### Journal Entry Creation

```typescript
// Ensure balanced entry
const createJournalEntry = async (
  orgId: string,
  data: CreateJournalEntryDto
) => {
  // Validate balance
  const totalDebits = data.lines
    .filter(l => l.type === 'DEBIT')
    .reduce((sum, l) => sum.add(new Decimal(l.amount)), new Decimal(0));

  const totalCredits = data.lines
    .filter(l => l.type === 'CREDIT')
    .reduce((sum, l) => sum.add(new Decimal(l.amount)), new Decimal(0));

  if (!totalDebits.equals(totalCredits)) {
    throw new BadRequestException(
      `Journal entry must balance. Debits: ${totalDebits}, Credits: ${totalCredits}`
    );
  }

  // Create in transaction
  return this.prisma.$transaction(async (tx) => {
    const entry = await tx.journalEntry.create({
      data: {
        organizationId: orgId,
        number: await this.generateNumber(orgId),
        date: new Date(),
        description: data.description
      }
    });

    // Create all lines
    await tx.journalEntryLine.createMany({
      data: data.lines.map(line => ({
        journalEntryId: entry.id,
        accountId: line.accountId,
        type: line.type,
        amount: new Decimal(line.amount)
      }))
    });

    return entry;
  });
};
```

### Soft Delete Pattern

```typescript
// Soft delete
await prisma.invoice.update({
  where: { id: invoiceId },
  data: { deletedAt: new Date() }
});

// Restore
await prisma.invoice.update({
  where: { id: invoiceId },
  data: { deletedAt: null }
});

// Query only active records
const activeInvoices = await prisma.invoice.findMany({
  where: {
    organizationId: orgId,
    deletedAt: null
  }
});
```

### AI Suggestion Pattern

```typescript
// AI suggests categorization, user can accept/reject
interface AITransactionCategory {
  transactionId: string;
  suggestedAccount: string;
  confidence: number; // 0-100
  reasoning: string;
  userAccepted?: boolean;
  feedback?: string;
}

// User feedback helps model improve
const recordFeedback = async (suggestion: AITransactionCategory) => {
  await prisma.aiFeedback.create({
    data: {
      organizationId: orgId,
      transactionId: suggestion.transactionId,
      suggestedValue: suggestion.suggestedAccount,
      userAccepted: suggestion.userAccepted,
      feedback: suggestion.feedback
    }
  });

  // Trigger model retraining in background job
  await this.retrainingQueue.add('retrain-categorizer', { orgId });
};
```

### Pagination Pattern

```typescript
// Backend
interface ListQueryDto {
  skip?: number;
  take?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

const findAll = async (orgId: string, query: ListQueryDto) => {
  const skip = query.skip || 0;
  const take = query.take || 20;

  const [data, total] = await Promise.all([
    this.prisma.invoice.findMany({
      where: { organizationId: orgId, deletedAt: null },
      skip,
      take,
      orderBy: { [query.sortBy || 'createdAt']: query.sortOrder || 'desc' }
    }),
    this.prisma.invoice.count({
      where: { organizationId: orgId, deletedAt: null }
    })
  ]);

  return {
    data,
    meta: {
      skip,
      take,
      total,
      totalPages: Math.ceil(total / take)
    }
  };
};

// Frontend
const useInvoices = (params?: ListParams) => {
  return useQuery({
    queryKey: ['invoices', params],
    queryFn: () => invoicesApi.list(params)
  });
};
```

---

## Troubleshooting

### Database Connection Issues

```bash
# Check PostgreSQL is running
docker ps | grep postgres

# Test connection
psql -h localhost -U mizano -d mizano_db

# View PostgreSQL logs
docker logs mizano_db

# Reset database (development only)
pnpm db:reset
```

### Redis Connection Issues

```bash
# Check Redis is running
docker ps | grep redis

# Test Redis connection
redis-cli ping

# View Redis logs
docker logs mizano_redis

# Check Redis keys
redis-cli KEYS '*'
```

### Build Errors

```bash
# Clear node_modules and reinstall
rm -rf node_modules pnpm-lock.yaml
pnpm install

# Regenerate Prisma client
pnpm db:generate

# Type check TypeScript
pnpm type-check

# Run linter
pnpm lint:fix
```

### Port Already in Use

```bash
# API (3000)
lsof -i :3000
kill -9 <PID>

# Web (3001)
lsof -i :3001
kill -9 <PID>

# Change ports in .env
API_PORT=3100
WEB_PORT=3101
```

### Authentication Issues

```bash
# Check JWT secrets in .env
echo $JWT_SECRET
echo $NEXTAUTH_SECRET

# Verify token format
# Should be in Authorization header: Bearer <token>

# Check NextAuth configuration
# sessions stored in database or cookies
```

### Performance Issues

```bash
# Analyze database queries
pnpm db:studio  # Use query profiler

# Check indexes
# Ensure frequently filtered fields are indexed

# Monitor Redis memory
redis-cli INFO memory

# Check API response times
# Implement request logging middleware
```

### Linting/Type Errors

```bash
# Fix linting issues automatically
pnpm lint:fix

# Type check all code
pnpm type-check

# View specific errors
pnpm --filter @mizano/api lint
pnpm --filter @mizano/web lint
```

---

## Important Documents

- **[CLAUDE.md](./CLAUDE.md)** - Development rules, architecture constraints, and conventions
- **[.env.example](./.env.example)** - Environment variable template
- **[docker-compose.yml](./docker-compose.yml)** - Development infrastructure
- **[turbo.json](./turbo.json)** - Turborepo task configuration

---

## Git Workflow

### Branch Naming
```
feature/module-name-feature-name
bugfix/module-name-bug-name
hotfix/critical-issue-name
chore/task-name
```

### Commit Messages
```
<type>: <subject>

<body>

Closes #<issue-number>
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`

### Creating a Pull Request

```bash
git checkout -b feature/new-feature
# Make changes
git add .
git commit -m "feat: add new feature"
git push origin feature/new-feature
# Create PR on GitHub
```

---

## Support & Resources

### Getting Help

- Check [CLAUDE.md](./CLAUDE.md) for architecture decisions
- Review existing module implementations for patterns
- Check database schema in `apps/api/prisma/schema.prisma`
- Search codebase for similar implementations

### Key Contacts

When handing over project:
- Database admin: PostgreSQL/Redis maintenance
- DevOps: Deployment & infrastructure
- Product: Feature requirements & prioritization

### Useful Links

- NestJS Docs: https://docs.nestjs.com
- Next.js Docs: https://nextjs.org/docs
- Prisma Docs: https://www.prisma.io/docs
- TanStack Query Docs: https://tanstack.com/query/latest
- Tailwind CSS: https://tailwindcss.com/docs
- shadcn/ui: https://ui.shadcn.com

---

## License

[Add license information]

## Changelog

All notable changes are documented in git history. Use `git log` to view commits.

---

**Last Updated:** February 2025

For questions or clarifications, refer to the project maintainers or consult the CLAUDE.md file for architectural guidance.
