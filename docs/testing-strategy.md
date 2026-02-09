# Mizano ERP - Testing Strategy

## Overview

This document defines the testing strategy for the Mizano ERP system. The goal is to ensure correctness of business logic, data integrity, security enforcement, and AI model accuracy through a layered testing approach.

## Testing Pyramid

```
         /  E2E Tests  \          ← 8 test suites (API integration)
        / Integration    \        ← Service + database interaction
       /  Unit Tests      \       ← ~25 test suites (pure logic + mocked deps)
      /____________________\
```

| Layer | Count | Target | Tools |
|-------|-------|--------|-------|
| Unit Tests | ~25 suites | Pure functions, services, guards | Jest + ts-jest + jest-mock-extended |
| E2E Tests | 8 suites | API endpoints end-to-end | Jest + supertest + test database |

## Test Infrastructure

### Framework & Configuration

- **Test runner**: Jest (configured in `apps/api/package.json`)
- **Test pattern**: `*.spec.ts` for unit tests, `*.e2e-spec.ts` for E2E
- **Transform**: ts-jest for TypeScript compilation
- **Environment**: Node.js
- **Coverage**: Collected from all `.ts` files, output to `apps/api/coverage/`

### Directory Structure

```
apps/api/
├── src/
│   ├── test/                           # Unit test infrastructure
│   │   ├── setup.ts                    # Global test setup
│   │   ├── mocks/
│   │   │   ├── prisma.mock.ts          # PrismaService mock
│   │   │   └── redis.mock.ts           # Redis/cache mock
│   │   └── helpers/
│   │       ├── test-utils.ts           # Factory functions
│   │       └── decimal.helpers.ts      # Decimal comparison helpers
│   ├── common/
│   │   └── guards/
│   │       ├── organization.guard.spec.ts
│   │       ├── jwt-auth.guard.spec.ts
│   │       └── permissions.guard.spec.ts
│   └── modules/
│       ├── ai/
│       │   ├── utils/
│       │   │   ├── statistics.util.spec.ts
│       │   │   ├── holt-winters.util.spec.ts
│       │   │   ├── monte-carlo.util.spec.ts
│       │   │   ├── text-similarity.util.spec.ts
│       │   │   ├── date-pattern.util.spec.ts
│       │   │   ├── isolation-forest.util.spec.ts
│       │   │   ├── logistic-regression.util.spec.ts
│       │   │   └── pdf-extractor.util.spec.ts
│       │   └── services/
│       │       ├── transaction-categorizer.service.spec.ts
│       │       ├── anomaly-detection.service.spec.ts
│       │       ├── cash-flow-prediction.service.spec.ts
│       │       ├── lead-scoring.service.spec.ts
│       │       ├── reconciliation-matcher.service.spec.ts
│       │       └── ocr.service.spec.ts
│       ├── accounting/
│       │   └── journals.service.spec.ts
│       ├── sales/
│       │   └── invoices.service.spec.ts
│       ├── purchases/
│       │   └── bills.service.spec.ts
│       ├── inventory/
│       │   └── items.service.spec.ts
│       ├── banking/
│       │   └── reconciliation.service.spec.ts
│       └── hr/
│           └── payroll.service.spec.ts
└── test/                               # E2E test infrastructure
    ├── jest-e2e.json                   # E2E Jest config
    ├── setup-e2e.ts                    # E2E setup & teardown
    ├── helpers/
    │   ├── auth.helper.ts              # Test JWT token generation
    │   └── api.helper.ts              # Supertest wrapper
    ├── auth.e2e-spec.ts
    ├── accounting.e2e-spec.ts
    ├── sales.e2e-spec.ts
    ├── purchases.e2e-spec.ts
    ├── inventory.e2e-spec.ts
    ├── banking.e2e-spec.ts
    ├── ai.e2e-spec.ts
    └── multi-tenancy.e2e-spec.ts
```

## Unit Test Tiers

### Tier 1: Pure Functions (Highest ROI)

AI utility modules with zero dependencies — easiest to test, highest confidence value.

| Module | Key Tests |
|--------|-----------|
| `statistics.util.ts` | mean, standardDeviation, zScore, percentile, interquartileRange, linearRegression, simpleMovingAverage |
| `holt-winters.util.ts` | Insufficient data error, multiplicative/additive seasonality, forecast accuracy (MAPE), trend detection |
| `monte-carlo.util.ts` | Simulation determinism (with seeded random), P10 < P50 < P90, negative balance detection, what-if scenarios |
| `text-similarity.util.ts` | Levenshtein distance/similarity, Jaccard similarity, normalizeText, documentNumberSimilarity, extractNumbers |
| `date-pattern.util.ts` | Month name detection (English + Arabic), frequency detection (daily/weekly/monthly/quarterly/yearly), amount matching within 1% variance |
| `isolation-forest.util.ts` | Anomaly scores: outliers score >0.6, normal data ~0.5, 1D wrapper correctness |
| `logistic-regression.util.ts` | Training with test split, probability output 0-1, serialization/deserialization round-trip |
| `pdf-extractor.util.ts` | Native PDF text extraction, isNativeText heuristic (50 chars/page) |

### Tier 2: Core Business Services

Critical business logic with Prisma mocks.

| Service | Key Tests |
|---------|-----------|
| `journals.service` | Journal balances (debits === credits), unbalanced entry rejected, auto-number generation, lock date enforcement, soft delete, reversal journal creation |
| `invoices.service` | Status transitions (Draft→Sent→Paid), partial payment handling, balance calculation, void creates reversal journal, cannot void PAID invoice |
| `bills.service` | AP journal creation, inventory stock increase, duplicate detection (same vendor + bill#), overdue marking |
| `items.service` | Stock calculation across warehouses, FIFO costing, stock movement logging, reorder point alerts |
| `reconciliation.service` | Match scoring (amount 40% + reference 30% + name 20% + date 10%), confidence thresholds, learning from confirmed matches |
| `payroll.service` | Gross = Basic + Allowances, LOP = Gross/30 * absent days, Net = Gross - LOP - Tax - Deductions, no double-run for same month, balanced journal |

### Tier 3: Guards & Security

| Guard | Key Tests |
|-------|-----------|
| `OrganizationGuard` | Allow when no orgId in request, allow when orgId matches user, reject (403) when orgId doesn't match, reject when user has no org |
| `JwtAuthGuard` | Allow @Public() endpoints without token, reject missing/invalid tokens (401), pass valid user to request |
| `PermissionsGuard` | Allow Admin role (bypass), allow user with required permission, reject (403) missing permission, handle no-permissions-required endpoints |

### Tier 4: AI Services

Complex services with mocked Prisma and model dependencies.

| Service | Key Tests |
|---------|-----------|
| `transaction-categorizer` | Categorization with confidence scores, low confidence (<0.5) not auto-filled, user corrections stored, minimum training data (20 examples) |
| `anomaly-detection` | Z-score thresholds (>3 warning, >4 critical), IQR outlier detection, minimum data requirement (10 points), alert creation |
| `cash-flow-prediction` | Monte Carlo output structure, P10/P50/P90 ordering, negative balance date detection, what-if scenario application |
| `lead-scoring` | Score 0-100 range, demographic/behavioral/recency component weights, decay 5%/week, hot (>70) / cold (<30) classification |
| `reconciliation-matcher` | Direction filtering (deposit→invoice, withdrawal→bill), scoring weight verification, high/medium/low confidence thresholds |
| `ocr` | Text extraction from buffer, field parsing (date, amount, invoice#), vendor layout learning after 3 documents |

## E2E Test Suites

E2E tests validate complete API flows against a test database.

| Suite | Scenarios |
|-------|-----------|
| `auth` | Register → Login → Get tokens, Refresh token rotation, Invalid credentials → 401, Logout invalidates refresh |
| `accounting` | Chart of accounts CRUD, Journal entry balanced → 201, Journal entry unbalanced → 400, Lock date enforcement |
| `sales` | Customer CRUD, Invoice lifecycle (create→send→pay→verify status), Quote → Invoice conversion, Credit note |
| `purchases` | Vendor CRUD, Bill lifecycle, Expense creation (immediate journal), Payment allocation across bills |
| `inventory` | Item CRUD, Stock movement tracking, Adjustment with journal, Warehouse transfer |
| `banking` | Bank account CRUD, Transaction import (CSV), Reconciliation match + confirm |
| `ai` | AI prediction endpoint, Feedback submission, Training data collection |
| `multi-tenancy` | Org A cannot see Org B data (404), Cross-org access rejected, organizationId enforced |

## Running Tests

```bash
# Unit tests
pnpm --filter api test              # Run all unit tests
pnpm --filter api test:watch        # Watch mode (re-run on changes)
pnpm --filter api test:cov          # Generate coverage report

# E2E tests (requires running database)
pnpm --filter api test:e2e          # Run all E2E tests

# Specific test file
pnpm --filter api test -- --testPathPattern=statistics
```

## Coverage Goals

| Category | Target |
|----------|--------|
| AI Utilities | 90%+ (pure functions) |
| Core Business Services | 80%+ (critical logic) |
| Guards | 100% (security) |
| AI Services | 70%+ (complex dependencies) |
| Overall | 60%+ initial, grow to 80% |

## Mocking Strategy

### Prisma Mock
Using `jest-mock-extended` to create a deep mock of PrismaClient:
- Every Prisma method is auto-mocked
- Return values configured per test with `.mockResolvedValue()`
- Transaction mocks pass the mock client to the callback

### Redis Mock
Simple object mock for cache-manager:
- `get()` / `set()` / `del()` with in-memory Map
- No actual Redis connection needed

### Test Factories
Helper functions that create properly-typed mock objects:
- `createMockOrganization()`, `createMockUser()`, `createMockInvoice()`
- Override any field via partial parameter
- Decimal fields use proper Prisma Decimal type

## CI Integration

Recommended GitHub Actions workflow:

```yaml
test:
  runs-on: ubuntu-latest
  services:
    postgres:
      image: postgres:16
      env:
        POSTGRES_USER: test
        POSTGRES_PASSWORD: test
        POSTGRES_DB: mizano_test
    redis:
      image: redis:7
  steps:
    - uses: actions/checkout@v4
    - uses: pnpm/action-setup@v2
    - run: pnpm install
    - run: pnpm db:generate
    - run: pnpm --filter api test:cov
    - run: pnpm --filter api test:e2e
```

## Key Testing Principles

1. **Test business rules, not implementation** — Verify that debits equal credits, not that a specific Prisma method was called
2. **Financial precision** — Always use Decimal for money comparisons, never approximate
3. **Multi-tenancy in every test** — Every test should use a specific organizationId
4. **Deterministic AI tests** — Seed random number generators where possible, test output ranges rather than exact values
5. **Isolated tests** — Each test suite creates its own data, no shared state between suites
