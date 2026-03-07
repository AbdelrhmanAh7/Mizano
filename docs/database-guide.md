# Mizano ERP - Database Guide

## Overview

Mizano uses **PostgreSQL 16** as its primary database, managed through **Prisma ORM**. The schema contains **87+ models** spanning accounting, sales, purchases, inventory, banking, HR, manufacturing, projects, tax, CRM, reporting, and AI domains. Every model enforces multi-tenancy through an `organizationId` field to guarantee data isolation between organizations.

---

## Table of Contents

1. [Prisma ORM Setup](#prisma-orm-setup)
2. [Model Conventions](#model-conventions)
3. [Money Fields](#money-fields)
4. [Soft Delete Pattern](#soft-delete-pattern)
5. [Indexing Strategy](#indexing-strategy)
6. [Multi-Tenancy](#multi-tenancy)
7. [AI-Specific Models](#ai-specific-models)
8. [AiFeature Enum](#aifeature-enum)
9. [Prisma Commands](#prisma-commands)
10. [Migration Workflow](#migration-workflow)
11. [Backup and Restore](#backup-and-restore)
12. [Performance Best Practices](#performance-best-practices)
13. [Connection Pooling](#connection-pooling)
14. [Read Replica Routing](#read-replica-routing)
15. [Performance Monitoring](#performance-monitoring)
16. [Transactions](#transactions)

---

## Prisma ORM Setup

Prisma serves as the type-safe ORM layer between NestJS and PostgreSQL. The schema file lives at:

```
apps/api/prisma/schema.prisma
```

The Prisma client is generated into `node_modules/.prisma/client` and wrapped in a NestJS service at `apps/api/src/prisma/prisma.service.ts`. This service is injected into every module that needs database access. It configures connection pooling and attaches query metrics middleware for monitoring.

```typescript
// prisma.service.ts (simplified)
import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { attachQueryMetricsMiddleware } from './prisma-query.middleware';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    // Configures connection pool via URL params
    // See "Connection Pooling" section for details
    super({ datasources: { db: { url: poolConfiguredUrl } } });
    attachQueryMetricsMiddleware(this, 'primary');
  }

  async onModuleInit() {
    await this.$connect();
  }
}
```

A companion `ReadReplicaService` is also available for routing read-heavy queries (reports, dashboards) to a read replica. See [Read Replica Routing](#read-replica-routing).

---

## Model Conventions

Every model in the Mizano schema follows a consistent structure:

### Required Fields on All Models

| Field            | Type                          | Description                                           |
| ---------------- | ----------------------------- | ----------------------------------------------------- |
| `id`             | `String @id @default(cuid())` | Unique identifier using CUID for collision resistance |
| `createdAt`      | `DateTime @default(now())`    | Timestamp of record creation                          |
| `updatedAt`      | `DateTime @updatedAt`         | Automatically updated on every write                  |
| `organizationId` | `String`                      | Foreign key to Organization for multi-tenancy         |

### Standard Model Template

```prisma
model ExampleEntity {
  id             String       @id @default(cuid())
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id])

  // Domain-specific fields...

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([organizationId])
  @@index([organizationId, createdAt])
}
```

### Naming Conventions

- **Models**: PascalCase singular (e.g., `Invoice`, `BankAccount`, `AiModel`)
- **Fields**: camelCase (e.g., `organizationId`, `totalAmount`, `dueDate`)
- **Enums**: PascalCase for enum name, UPPER_SNAKE_CASE for values (e.g., `InvoiceStatus.DRAFT`)
- **Relations**: camelCase, singular for belongs-to, plural for has-many

---

## Money Fields

All monetary values use Prisma's `Decimal` type mapped to PostgreSQL's `DECIMAL(19, 4)`.

```prisma
model Invoice {
  subtotal    Decimal @db.Decimal(19, 4)
  taxAmount   Decimal @db.Decimal(19, 4)
  totalAmount Decimal @db.Decimal(19, 4)
  paidAmount  Decimal @db.Decimal(19, 4) @default(0)
  balance     Decimal @db.Decimal(19, 4)
}
```

### Why Decimal(19, 4)?

- **19 digits total**: supports values up to 999,999,999,999,999.9999 (999 trillion)
- **4 decimal places**: sufficient for most currencies and handles rounding in tax calculations
- **No floating-point errors**: unlike JavaScript `number` or `float`, `Decimal` provides exact precision

### Usage in Application Code

```typescript
import { Decimal } from '@prisma/client/runtime/library';

// Creating a Decimal value
const amount = new Decimal('1234.5678');

// Arithmetic
const total = amount.add(new Decimal('100'));
const tax = amount.mul(new Decimal('0.15'));

// Comparison
if (totalDebits.equals(totalCredits)) {
  // Journal entry is balanced
}

// NEVER do this:
// const amount = 1234.56; // JavaScript float - will lose precision
```

### Critical Rule

**NEVER use JavaScript `number` or `float` for monetary values.** Always use Prisma's `Decimal` type. This is a hard constraint enforced across the entire codebase.

---

## Soft Delete Pattern

Financial records must never be hard-deleted. Instead, they use a `deletedAt` timestamp field for soft deletion.

### Models with Soft Delete

Financial models include a nullable `deletedAt` field:

```prisma
model Invoice {
  id        String    @id @default(cuid())
  // ... other fields
  deletedAt DateTime?
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
}
```

This applies to: Invoices, Bills, Journal Entries, Payments (Received and Made), Credit Notes, Vendor Credits, Expenses, Quotes/Estimates, and other financial transaction records.

### Querying with Soft Delete

Always filter out soft-deleted records in queries:

```typescript
// Standard query - exclude deleted records
const invoices = await this.prisma.invoice.findMany({
  where: {
    organizationId,
    deletedAt: null, // Only non-deleted records
  },
});

// Soft delete a record
await this.prisma.invoice.update({
  where: { id: invoiceId },
  data: { deletedAt: new Date() },
});

// Include deleted records (for audit/reporting)
const allInvoices = await this.prisma.invoice.findMany({
  where: { organizationId },
  // No deletedAt filter
});
```

### Important Gotchas

- **Employee model**: does NOT have `deletedAt`. Use `isActive: true` or `status: 'ACTIVE'` instead.
- **Journal model**: does NOT have `totalAmount`. Compute from `lines` relation (sum of debits).
- **Invoice model**: does NOT have `paidDate`. Check `status === 'PAID'` and use `updatedAt` as a proxy.
- **AuditLog**: uses `entityType` + `entityId` (separate fields), NOT a single `entity` field.
- **AiFeedback**: has NO `entityType`/`entityId`/`isAccepted`. Use `feature` and `userAction` enum.

---

## Indexing Strategy

### Core Principles

1. **Always index `organizationId`**: every query filters by organization for multi-tenancy
2. **Composite indexes for common query patterns**: combine `organizationId` with frequently filtered/sorted fields
3. **Cover the most common access patterns**: list views, dashboards, and reporting queries

### Standard Indexes

Every model should have at minimum:

```prisma
@@index([organizationId])
@@index([organizationId, createdAt])
```

### Common Composite Indexes

```prisma
// Status-based filtering (invoices, bills, quotes)
@@index([organizationId, status])

// Date-range queries (reports, dashboards)
@@index([organizationId, createdAt])
@@index([organizationId, dueDate])

// Customer/vendor lookups
@@index([organizationId, customerId])
@@index([organizationId, vendorId])

// Account-based queries (journal lines, transactions)
@@index([organizationId, accountId])

// Document number searches
@@index([organizationId, number])

// Soft delete aware queries
@@index([organizationId, deletedAt])
```

### Optimized Composite Indexes (Financial Reports)

These indexes were added to target slow report queries and heavily filtered list views. They include `deletedAt` to cover the universal soft-delete WHERE clause and additional columns matching the most common access patterns:

```prisma
// Invoice & Bill: financial report queries filtering by status + date range
@@index([organizationId, deletedAt, status, date])

// Invoice & Bill: aging reports filtering by outstanding balance
@@index([organizationId, deletedAt, balanceDue])

// Journal: posted entries by date for trial balance / P&L
@@index([organizationId, isPosted, date])

// Journal & Expense: date-range reports (P&L, expense analysis)
@@index([organizationId, deletedAt, date])

// JournalLine: trial balance aggregation (groupBy accountId)
@@index([accountId, journalId])

// Expense & Quote: status-based list views
@@index([organizationId, deletedAt, status])

// Item, CreditNote, PaymentReceived, PaymentMade: soft-delete scans
@@index([organizationId, deletedAt])

// AuditLog: user activity queries
@@index([organizationId, userId, createdAt])
```

**Rationale:** PostgreSQL can use a composite index for queries matching a _left prefix_ of the index columns. For example, `@@index([organizationId, deletedAt, status, date])` accelerates queries filtering by `(orgId)`, `(orgId, deletedAt)`, `(orgId, deletedAt, status)`, or all four columns.

### Unique Constraints

```prisma
// Document numbers must be unique within an organization
@@unique([organizationId, number])

// Account codes must be unique within an organization
@@unique([organizationId, code])
```

---

## Multi-Tenancy

Mizano uses a **shared database, shared schema** multi-tenancy model. Every table includes an `organizationId` column that acts as a tenant discriminator.

### Organization Model

```prisma
model Organization {
  id        String   @id @default(cuid())
  name      String
  // ... other org fields

  // Relations to all tenant-scoped models
  users     User[]
  invoices  Invoice[]
  accounts  Account[]
  // ... etc
}
```

### Enforcement

1. **Every query MUST include `organizationId`** in its `WHERE` clause. No exceptions.
2. **Guards extract organizationId** from the authenticated user's JWT token automatically.
3. **The `@CurrentOrg()` decorator** provides the organizationId to controller methods.

```typescript
@Get()
async findAll(@CurrentOrg() orgId: string) {
  return this.invoiceService.findAll(orgId);
}
```

```typescript
// Service method - orgId is ALWAYS the first parameter
async findAll(organizationId: string, params?: ListQueryDto) {
  return this.prisma.invoice.findMany({
    where: {
      organizationId, // NEVER omit this
      deletedAt: null,
    },
  });
}
```

### Critical Rule

**NEVER leak data across organizations.** Every database query must be scoped to the current organization. This is a security requirement that must be verified in code reviews.

---

## AI-Specific Models

Mizano's AI module uses 18 dedicated database models to store training data, predictions, patterns, and feedback.

| Model                        | Purpose                                                              |
| ---------------------------- | -------------------------------------------------------------------- |
| `AiTrainingData`             | Stores labeled training data for all AI features                     |
| `AiModel`                    | Registry of trained model metadata (version, accuracy, feature type) |
| `AiFeedback`                 | User feedback on AI suggestions (accepts, dismissals, corrections)   |
| `AiPrediction`               | Stored predictions with confidence scores for audit trail            |
| `AiAnomaly`                  | Detected anomalies in financial transactions                         |
| `ItemReorderAnalysis`        | Inventory reorder point calculations and recommendations             |
| `ReconciliationPattern`      | Learned patterns for bank reconciliation matching                    |
| `VendorOcrLayout`            | OCR template layouts learned per vendor for document processing      |
| `ItemDemandForecast`         | Demand forecasting results for inventory items                       |
| `CashFlowForecast`           | Cash flow predictions and projections                                |
| `LeadScore`                  | CRM lead scoring results (70% rule-based + 30% ML blend)             |
| `TransactionPattern`         | Detected patterns in financial transactions                          |
| `PatternSuggestion`          | Suggested actions based on detected patterns                         |
| `AIInsight`                  | High-level AI-generated business insights for dashboards             |
| `EmployeeAiProfile`          | AI-derived employee performance and behavior profiles                |
| `FraudAlert`                 | Fraud detection alerts with severity and evidence                    |
| `CustomerAiProfile`          | AI-derived customer behavior and risk profiles                       |
| `AssetMaintenancePrediction` | Predictive maintenance schedules for fixed assets                    |

### AI Model Lifecycle

```
Training Data --> Model Training --> Model Registry --> Predictions --> User Feedback
      ^                                                                      |
      |______________________________________________________________________|
                            (feedback loop for retraining)
```

---

## AiFeature Enum

The `AiFeature` enum defines all 33 AI capabilities in the system. It is used across `AiModel`, `AiTrainingData`, `AiFeedback`, and `AiPrediction` to categorize AI functionality.

```prisma
enum AiFeature {
  CATEGORIZATION          // Transaction categorization
  RECONCILIATION          // Bank reconciliation matching
  ANOMALY_DETECTION       // Financial anomaly detection
  FORECASTING             // Cash flow forecasting
  DOCUMENT_PROCESSING     // OCR and document intake
  SMART_RULES             // Intelligent automation rules
  TAX_OPTIMIZATION        // Tax planning suggestions
  PAYMENT_PREDICTION      // Payment timing predictions
  INVENTORY_OPTIMIZATION  // Inventory reorder optimization
  FRAUD_DETECTION         // Fraud detection and alerting
  SENTIMENT_ANALYSIS      // Customer communication sentiment
  DEMAND_FORECASTING      // Product demand forecasting
  PRICE_OPTIMIZATION      // Dynamic pricing suggestions
  CUSTOMER_SEGMENTATION   // Customer clustering/segmentation
  CHURN_PREDICTION        // Customer churn risk prediction
  EXPENSE_ANALYSIS        // Expense pattern analysis
  REVENUE_PREDICTION      // Revenue forecasting
  LEAD_SCORING            // CRM lead scoring
  CREDIT_RISK             // Customer credit risk assessment
  VENDOR_EVALUATION       // Vendor performance scoring
  BUDGET_OPTIMIZATION     // Budget allocation optimization
  WORKFLOW_OPTIMIZATION   // Process workflow optimization
  REPORT_GENERATION       // AI-assisted report generation
  DATA_QUALITY            // Data quality scoring
  COMPLIANCE_CHECK        // Regulatory compliance checking
  CONTRACT_ANALYSIS       // Contract term extraction/analysis
  EMPLOYEE_PERFORMANCE    // Employee performance prediction
  ASSET_MAINTENANCE       // Predictive asset maintenance
  NATURAL_LANGUAGE_QUERY  // NLQ for reports and data
  SMART_NOTIFICATIONS     // Intelligent notification routing
  DOCUMENT_CLASSIFICATION // Document type classification
  VOICE_COMMAND           // Voice command processing
  SALES_FORECASTING       // Sales pipeline forecasting
}
```

### Important Note

When adding a new `AiFeature` enum value, you must also update the `RETRAINING_THRESHOLDS` map in `ai-feedback.service.ts` to define when the model should be retrained based on feedback volume.

---

## Prisma Commands

All commands are run from the repository root using pnpm:

| Command            | Description                                                                               |
| ------------------ | ----------------------------------------------------------------------------------------- |
| `pnpm db:generate` | Generate the Prisma client from `schema.prisma`. Run after every schema change.           |
| `pnpm db:push`     | Push schema changes directly to the database (development only). Skips migration history. |
| `pnpm db:migrate`  | Create and apply a migration file. Used for production deployments.                       |
| `pnpm db:seed`     | Run the seed script to populate the database with initial/test data.                      |
| `pnpm db:studio`   | Open Prisma Studio, a GUI for browsing and editing database records.                      |

### Generating the Client

After any change to `schema.prisma`, regenerate the client:

```bash
pnpm db:generate
```

This updates TypeScript types, ensures autocompletion works, and keeps the runtime client in sync with the schema.

---

## Migration Workflow

### Development (Local)

Use `db:push` for rapid iteration. It applies schema changes directly without creating migration files:

```bash
# Make changes to schema.prisma, then:
pnpm db:push
pnpm db:generate
```

This is fast but does NOT create a migration history. Use it only for local development.

### Production

Use `db:migrate` to create versioned, trackable migration files:

```bash
# 1. Create a new migration
pnpm db:migrate --name add_invoice_payment_date

# 2. Review the generated SQL in prisma/migrations/
# 3. Apply the migration
pnpm db:migrate deploy
```

### Migration Best Practices

1. **Always review generated SQL** before applying migrations to production
2. **Never use `db:push` in production** - it can cause data loss
3. **Test migrations on a staging database** before applying to production
4. **Back up the database** before running migrations
5. **Use `prisma migrate resolve`** to handle migration conflicts or mark migrations as applied/rolled-back

### Handling Migration Conflicts

```bash
# If a migration is stuck or needs manual resolution:
npx prisma migrate resolve --applied "20240101000000_migration_name"

# Or mark as rolled back:
npx prisma migrate resolve --rolled-back "20240101000000_migration_name"
```

---

## Backup and Restore

### Backup with pg_dump

```bash
# Full database backup (compressed)
pg_dump -h localhost -U mizano -d mizano_db -Fc -f backup_$(date +%Y%m%d_%H%M%S).dump

# Schema-only backup
pg_dump -h localhost -U mizano -d mizano_db --schema-only -f schema_backup.sql

# Data-only backup
pg_dump -h localhost -U mizano -d mizano_db --data-only -Fc -f data_backup.dump

# Specific table backup
pg_dump -h localhost -U mizano -d mizano_db -t '"Invoice"' -Fc -f invoices_backup.dump
```

### Restore

```bash
# Restore from compressed backup
pg_restore -h localhost -U mizano -d mizano_db -c backup_20240101_120000.dump

# Restore specific table
pg_restore -h localhost -U mizano -d mizano_db -t '"Invoice"' backup.dump
```

### Automated Backup Script

```bash
#!/bin/bash
# backup.sh - Run daily via cron
BACKUP_DIR="/backups/mizano"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=30

pg_dump -h localhost -U mizano -d mizano_db -Fc -f "$BACKUP_DIR/mizano_$TIMESTAMP.dump"

# Remove backups older than retention period
find "$BACKUP_DIR" -name "*.dump" -mtime +$RETENTION_DAYS -delete

echo "Backup completed: mizano_$TIMESTAMP.dump"
```

---

## Performance Best Practices

### Preventing N+1 Queries

Use Prisma's `include` to eagerly load related data:

```typescript
// BAD: N+1 - fetches invoices, then N queries for lines
const invoices = await this.prisma.invoice.findMany({
  where: { organizationId },
});
// Each invoice.lines access triggers a separate query

// GOOD: Single query with JOIN
const invoices = await this.prisma.invoice.findMany({
  where: { organizationId },
  include: {
    lines: true,
    customer: true,
  },
});
```

Use `select` when you only need specific fields:

```typescript
// Only fetch what you need
const invoices = await this.prisma.invoice.findMany({
  where: { organizationId },
  select: {
    id: true,
    number: true,
    totalAmount: true,
    status: true,
    customer: {
      select: {
        id: true,
        name: true,
      },
    },
  },
});
```

### Pagination

Always paginate list queries using `skip` and `take`:

```typescript
async findAll(organizationId: string, params: ListQueryDto) {
  const { page = 1, limit = 20 } = params;
  const skip = (page - 1) * limit;

  const [data, total] = await this.prisma.$transaction([
    this.prisma.invoice.findMany({
      where: { organizationId, deletedAt: null },
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { customer: true },
    }),
    this.prisma.invoice.count({
      where: { organizationId, deletedAt: null },
    }),
  ]);

  return {
    data,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}
```

### Query Optimization Tips

1. **Use `findFirst` instead of `findMany` when expecting a single result**
2. **Add database indexes for frequently filtered columns** (see [Indexing Strategy](#indexing-strategy))
3. **Use `cursor`-based pagination for very large datasets** instead of `skip/take`
4. **Avoid deeply nested `include`** - flatten with separate queries if the join is complex
5. **Use raw SQL via `prisma.$queryRaw`** for complex aggregations or reports

```typescript
// Cursor-based pagination for large datasets
const invoices = await this.prisma.invoice.findMany({
  take: 20,
  cursor: lastId ? { id: lastId } : undefined,
  skip: lastId ? 1 : 0,
  where: { organizationId },
  orderBy: { createdAt: 'desc' },
});
```

---

## Connection Pooling

Mizano's `PrismaService` configures connection pooling by appending query parameters to the `DATABASE_URL`. This avoids overwhelming PostgreSQL with connections during traffic spikes.

### Environment Variables

| Variable                | Default    | Description                           |
| ----------------------- | ---------- | ------------------------------------- |
| `DATABASE_URL`          | (required) | Primary PostgreSQL connection string  |
| `DATABASE_POOL_SIZE`    | `10`       | Max connections in the primary pool   |
| `DATABASE_POOL_TIMEOUT` | `10`       | Seconds to wait for a free connection |

### How It Works

The `PrismaService` constructor parses `DATABASE_URL`, appends `connection_limit` and `pool_timeout` params, and passes the updated URL to `PrismaClient`:

```typescript
constructor() {
  const baseUrl = process.env.DATABASE_URL;
  const poolSize = process.env.DATABASE_POOL_SIZE || '10';
  const poolTimeout = process.env.DATABASE_POOL_TIMEOUT || '10';

  const url = new URL(baseUrl);
  url.searchParams.set('connection_limit', poolSize);
  url.searchParams.set('pool_timeout', poolTimeout);

  super({ datasources: { db: { url: url.toString() } } });
}
```

### Sizing Guidelines

| Deployment                      | Recommended Pool Size                 |
| ------------------------------- | ------------------------------------- |
| Development                     | 5                                     |
| Staging                         | 10                                    |
| Production (single instance)    | 15-20                                 |
| Production (multiple instances) | `max_connections / num_instances - 5` |

**Rule of thumb:** Total pool size across all app instances should stay below PostgreSQL's `max_connections` minus a buffer of ~5 for admin connections.

---

## Read Replica Routing

Heavy read queries (reports, dashboards, aging analysis) are routed to a read replica via the `ReadReplicaService`. If no replica is configured, it falls back to the primary database transparently.

### Environment Variables

| Variable                  | Default                        | Description                         |
| ------------------------- | ------------------------------ | ----------------------------------- |
| `READ_DATABASE_URL`       | (none — falls back to primary) | Read replica connection string      |
| `DATABASE_READ_POOL_SIZE` | `10`                           | Max connections in the replica pool |

### Architecture

```
┌─────────────┐     writes     ┌─────────────────┐
│  NestJS App  │──────────────>│  Primary (RW)    │
│              │               │  PrismaService   │
│              │     reads     ├─────────────────┤
│              │──────────────>│  Replica (RO)    │
│              │               │  ReadReplicaService│
└─────────────┘               └─────────────────┘
                                (falls back to primary
                                 if READ_DATABASE_URL unset)
```

### Usage in Services

Inject `ReadReplicaService` for read-only operations:

```typescript
@Injectable()
export class FinancialReportsService {
  constructor(
    private readonly prisma: PrismaService, // writes
    private readonly readPrisma: ReadReplicaService, // reads
  ) {}

  async getTrialBalance(orgId: string) {
    // Uses read replica for heavy aggregation
    return this.readPrisma.journalLine.groupBy({
      by: ['accountId'],
      where: { journal: { organizationId: orgId, isPosted: true } },
      _sum: { debit: true, credit: true },
    });
  }
}
```

### Checking Replica Status

```typescript
const readService = app.get(ReadReplicaService);
console.log(readService.isUsingReplica()); // true if READ_DATABASE_URL is set
```

### Deployment Notes

- Set `READ_DATABASE_URL` only when a read replica is available
- The replica connection uses its own pool (`DATABASE_READ_POOL_SIZE`)
- PostgreSQL streaming replication typically has <1s lag, acceptable for reports
- All write operations must still go through `PrismaService`

---

## Performance Monitoring

Mizano includes a built-in performance monitoring system that tracks query execution times, provides real-time statistics, and generates AI-powered index recommendations.

### How It Works

1. **Query Metrics Middleware** (`prisma-query.middleware.ts`): A Prisma `$use` middleware attached to both primary and replica clients that captures model, action, duration, and source for every query into a ring buffer (capacity: 10,000 entries).

2. **Performance Module** (`modules/performance/`): NestJS module exposing REST endpoints for metrics, stats, distribution, trends, health, and index recommendations.

3. **Index Advisor** (`index-advisor.service.ts`): Analyzes slow query patterns from the buffer, compares against existing indexes, and generates recommendations scored by frequency × average duration.

### API Endpoints

All endpoints require `settings.manage` permission.

| Endpoint                             | Method | Description                                             |
| ------------------------------------ | ------ | ------------------------------------------------------- |
| `/performance/slow-queries`          | GET    | Paginated list of slow queries (threshold configurable) |
| `/performance/stats`                 | GET    | Aggregate stats: count, avg, P50, P95, P99              |
| `/performance/distribution`          | GET    | Query count per model                                   |
| `/performance/trend`                 | GET    | Average duration over time intervals                    |
| `/performance/health`                | GET    | Primary + replica connectivity                          |
| `/performance/index-recommendations` | GET    | AI-powered index suggestions                            |
| `/performance/reset`                 | POST   | Clear the metrics buffer                                |

### Environment Variables

| Variable                  | Default | Description                                              |
| ------------------------- | ------- | -------------------------------------------------------- |
| `SLOW_QUERY_THRESHOLD_MS` | `100`   | Queries exceeding this duration (ms) are flagged as slow |

### Frontend Dashboard

The performance monitoring dashboard is accessible at **Settings → Performance** (`/settings/performance`). It displays:

- **Health cards**: Database status, replica status, pool size, uptime
- **Statistics cards**: Total queries, avg response time, P95 latency, slow query count
- **Distribution chart**: Queries per model (horizontal bars)
- **Response time trend**: Average duration over time with interval selector
- **Slow queries table**: Paginated, filterable by threshold, color-coded durations
- **Index recommendations**: AI-generated suggestions with SQL and impact scores

### Ring Buffer Design

The metrics buffer uses a fixed-capacity ring buffer (10,000 entries) to bound memory usage. When full, the oldest entries are overwritten. This means:

- No memory growth over time
- Recent queries are always available
- Historical data is approximate (latest 10K queries)
- Buffer can be reset via the `/performance/reset` endpoint

---

## Transactions

Use `prisma.$transaction()` for any operation that writes to multiple tables. This ensures atomicity - either all changes succeed or all are rolled back.

### Sequential Transactions

```typescript
// Journal entry creation - must create header AND balanced lines atomically
async createJournalEntry(orgId: string, dto: CreateJournalDto) {
  return this.prisma.$transaction(async (tx) => {
    // 1. Create the journal entry header
    const journal = await tx.journal.create({
      data: {
        organizationId: orgId,
        number: await this.generateNumber(orgId),
        date: dto.date,
        description: dto.description,
      },
    });

    // 2. Create all journal lines
    const lines = await Promise.all(
      dto.lines.map((line) =>
        tx.journalLine.create({
          data: {
            journalId: journal.id,
            accountId: line.accountId,
            debit: line.debit,
            credit: line.credit,
            description: line.description,
          },
        }),
      ),
    );

    // 3. Verify balance (debits must equal credits)
    const totalDebits = lines.reduce(
      (sum, l) => sum.add(l.debit),
      new Decimal(0),
    );
    const totalCredits = lines.reduce(
      (sum, l) => sum.add(l.credit),
      new Decimal(0),
    );

    if (!totalDebits.equals(totalCredits)) {
      throw new BadRequestException('Journal entry must balance');
      // Transaction will be rolled back automatically
    }

    // 4. Create audit log
    await tx.auditLog.create({
      data: {
        organizationId: orgId,
        entityType: 'Journal',
        entityId: journal.id,
        action: 'CREATE',
        userId: dto.userId,
      },
    });

    return journal;
  });
}
```

### Batch Transactions

For independent operations that should be atomic:

```typescript
// Batch delete with audit logging
const [deleted, auditLog] = await this.prisma.$transaction([
  this.prisma.invoice.update({
    where: { id: invoiceId },
    data: { deletedAt: new Date() },
  }),
  this.prisma.auditLog.create({
    data: {
      organizationId: orgId,
      entityType: 'Invoice',
      entityId: invoiceId,
      action: 'DELETE',
      userId,
    },
  }),
]);
```

### When to Use Transactions

- Creating journal entries (header + lines must balance)
- Processing payments (update invoice status + create payment record + create journal entry)
- Inventory movements (update stock levels + create movement records)
- Any operation touching 2+ tables that must be consistent

---

## Quick Reference

### Common Prisma Patterns

```typescript
// Find with filters
prisma.invoice.findMany({ where: { organizationId, status: 'DRAFT' } });

// Upsert
prisma.account.upsert({
  where: { organizationId_code: { organizationId, code: '1000' } },
  update: { name: 'Cash' },
  create: { organizationId, code: '1000', name: 'Cash' },
});

// Aggregation
prisma.invoice.aggregate({
  where: { organizationId, status: 'PAID' },
  _sum: { totalAmount: true },
});

// Group by
prisma.invoice.groupBy({
  by: ['status'],
  where: { organizationId },
  _count: true,
  _sum: { totalAmount: true },
});

// Raw SQL for complex reports
prisma.$queryRaw`
  SELECT DATE_TRUNC('month', "createdAt") as month,
         SUM("totalAmount") as revenue
  FROM "Invoice"
  WHERE "organizationId" = ${orgId}
    AND "deletedAt" IS NULL
  GROUP BY month
  ORDER BY month DESC
`;
```

---

## Database Testing

### Migration Testing

All database migrations should be tested in the CI pipeline before production deployment:

1. **Forward migration**: Apply migration to a clean database and verify schema
2. **Seed compatibility**: Ensure seed script works after migration
3. **Rollback verification**: Test that rollback procedures work for critical migrations

### Data Integrity Tests

E2E tests verify database constraints and business rules:

- Multi-tenancy isolation (cross-org data never leaks)
- Soft delete enforcement (deleted records excluded from queries)
- Decimal precision (monetary values maintain 4 decimal places)
- Unique constraints (document numbers, account codes per org)
- Foreign key integrity (cascading deletes/updates work correctly)

### Performance Regression

Track query performance across releases using the Performance module (`/performance/slow-queries`). Alert if any query regresses beyond the slow query threshold (default: 100ms).

See `docs/testing-strategy.md` for the full testing strategy and `docs/roadmap.md` for the product roadmap.
