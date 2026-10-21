# Evidence: Issue #210 — Specs for bank statement import service

## Overview

- **Issue**: #210 (test(api): specs for bank statement import service (#134 follow-up 5/5))
- **Base**: `origin/master` (merged cleanly into `ai/210`)
- **Originating Sentry issue**: None (internal unit test spec suite addition; no linked Sentry issue in brief)
- **User-facing flow / E2E**: Not user-facing (backend bank statement import service unit testing; test-only change exempt from user-facing e2e requirements).
- **Changed covering tests**:
  - `apps/api/src/modules/banking/services/bank-statement-import.service.spec.ts` (57 unit tests)

---

## Numbered Acceptance Criteria

1. **AC1 (Parsing and amount signs)**: Auto-detects standard columns (`date`, `description`, `amount`, `reference`) and split `debit`/`credit` columns with sensible fallbacks; parses amounts supporting standard format (`1,234.56`), European format (`1.234,56`), negative parentheses (`(1234.56)`), negative sign (`-1234.56`), and currency symbols; parses diverse date formats; skips rows with zero amounts or invalid dates.
2. **AC2 (Tenant scoping)**: Every Prisma read and write carries `organizationId`. Bank account lookup verifies tenant ownership and throws `NotFoundException` if mismatched. Deduplication queries and bank rule lookups strictly filter by `organizationId`. Another organization's records are never read or written.
3. **AC3 (Duplicate-line detection on re-import & idempotent retries)**: Deduplication checks against existing transactions within a buffered date range using date + amount + reference as primary key and date + amount + description prefix as secondary key; re-importing the same statement lines detects duplicates, returns duplicate counts, and does not create duplicate database records.
4. **AC4 (Exact Decimal values & transaction posting)**: Bank transactions are created with amounts stored as absolute `Decimal` instances with direction tagged via `type` (`DEPOSIT` for credits/positive, `WITHDRAWAL` for debits/negative); bank rules are evaluated and applied to newly created records in order.
5. **AC5 (Mocking, deterministic dates, and runner compatibility)**: Prisma and external services are mocked using `apps/api/src/test/mocks`; tests use deterministic fixed timestamps without reliance on wall-clock time; `node apps/api/_run_tests.js --testPathPattern=bank-statement-import.service.spec.ts` and `pnpm --filter api test` both execute and pass with exit code 0; `pnpm --filter api type-check` and `pnpm --filter api lint` pass with exit code 0.

---

## Verification Matrix

| AC ID   | Requirement Description                                                           | Verification Method / Command                                                                                                                                                                                                                                     | Result Summary                                                                                                   | Exit Code        | Status     |
| ------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------- | ---------- |
| **AC1** | Column detection, amount signs, European decimals, date parsing                   | `pnpm --filter api test -- src/modules/banking/services/bank-statement-import.service.spec.ts`                                                                                                                                                                    | 27 tests under `detectColumnMapping`, `parseAmount`, `parseDate`, `normalizeTransactions` PASS                   | 0                | **PASSED** |
| **AC2** | Tenant scoping on all Prisma queries (`organizationId`)                           | `bank-statement-import.service.spec.ts` tests under `tenant isolation - organizationId scoping`                                                                                                                                                                   | 2 tests PASS; all Prisma calls verified to carry `organizationId`                                                | 0                | **PASSED** |
| **AC3** | Duplicate-line detection & idempotent retries on re-import                        | `bank-statement-import.service.spec.ts` tests under `deduplicateTransactions` & `idempotent retries`                                                                                                                                                              | 9 tests PASS; reference & description deduplication verified                                                     | 0                | **PASSED** |
| **AC4** | Exact `Decimal` amounts, deposit/withdrawal typing, rules application             | `bank-statement-import.service.spec.ts` tests under `Decimal journal lines` & `importStatement`                                                                                                                                                                   | 13 tests PASS; `Decimal` instances and rule execution verified                                                   | 0                | **PASSED** |
| **AC5** | Deterministic mocks & fake dates; runner compatibility (`_run_tests.js` & `pnpm`) | 1. `node apps/api/_run_tests.js --testPathPattern=bank-statement-import.service.spec.ts`<br>2. `pnpm --filter api test -- src/modules/banking/services/bank-statement-import.service.spec.ts`<br>3. `pnpm --filter api type-check`<br>4. `pnpm --filter api lint` | 1. 57/57 tests PASS<br>2. 57/57 tests PASS<br>3. TypeScript check clean (0 errors)<br>4. ESLint clean (0 errors) | 0<br>0<br>0<br>0 | **PASSED** |

---

## Detailed Execution Outputs

### AC5: Isolated Spec Run via `_run_tests.js`

Command:

```bash
node apps/api/_run_tests.js --testPathPattern=bank-statement-import.service.spec.ts
```

Output:

```
Using jest from: /Users/abdelrahmanahmed/agents/work.noindex/impl/Mizano-210/node_modules/jest/bin/jest.js
PASS src/modules/banking/services/bank-statement-import.service.spec.ts
  BankStatementImportService
    detectColumnMapping
      ✓ detects standard date, description, amount, reference columns (1 ms)
      ✓ detects split debit/credit columns
      ✓ falls back to first column for date when no match
      ✓ falls back to second column for description when no match
      ✓ handles case-insensitive and partial matches (1 ms)
    parseAmount
      ✓ parses 1234.56 as 1234.56
      ✓ parses 1,234.56 as 1234.56
      ✓ parses -1234.56 as -1234.56
      ✓ parses (1234.56) as -1234.56
      ✓ parses 1.234,56 as 1234.56
      ✓ parses -1.234,56 as -1234.56
      ✓ parses (1.234,56) as -1234.56
      ✓ parses 1234 as 1234
      ✓ parses 0 as 0 (1 ms)
      ✓ parses 0.00 as 0
      ✓ returns 0 for empty/null/undefined
      ✓ handles currency symbols and extra characters
    parseDate
      ✓ parses 2026-03-15 without error
      ✓ parses 2026-03-15T10:30:00Z without error
      ✓ parses 15/03/2026 without error
      ✓ parses 15-03-2026 without error
      ✓ parses 15.03.2026 without error
      ✓ parses 03/15/2026 without error
      ✓ parses 15-Jan-2026 without error
      ✓ parses 15 Jan 2026 without error
      ✓ returns null for invalid dates
    normalizeTransactions
      ✓ normalizes single amount column with positive = DEPOSIT, negative = WITHDRAWAL
      ✓ normalizes split debit/credit columns (1 ms)
      ✓ skips rows with zero amount
      ✓ skips rows without valid date
      ✓ handles European number format in amount column
    deduplicateTransactions
      ✓ detects duplicates by reference (primary key)
      ✓ detects duplicates by description prefix when no reference (same date + amount)
      ✓ does not match across organizations (1 ms)
      ✓ uses signed amount for reference matching, absolute for description
      ✓ returns all new when no existing transactions
      ✓ queries with organizationId and bankAccountId scope
    importStatement
      ✓ imports transactions and returns counts
      ✓ validates bank account belongs to organization (12 ms)
      ✓ throws when file has no transactions
      ✓ creates bank transactions with organizationId scoping
      ✓ stores amount as absolute Decimal with type indicating direction
      ✓ applies bank rules to new transactions (1 ms)
      ✓ does not create duplicate transactions on re-import (idempotent)
      ✓ does not read or write another organization's records (1 ms)
      ✓ uses fixed date for bank rule date range query (no wall-clock)
    tenant isolation - organizationId scoping
      ✓ never reads org-2 data when importing for org-1
      ✓ rejects bank account from another organization
    idempotent retries - same source event creates one journal
      ✓ first import creates transaction, second import with same reference skips it
      ✓ deduplication uses date + amount + reference as primary key (1 ms)
      ✓ deduplication uses date + amount + description prefix as secondary key
    Decimal journal lines - debits equal credits (via bank transaction posting)
      ✓ creates DEPOSIT transactions with positive amount as credit
      ✓ creates WITHDRAWAL transactions with negative amount as debit (stored positive)
      ✓ handles European decimal format correctly in stored amounts
      ✓ handles parenthesized negative amounts correctly (1 ms)
    no wall-clock dates - fixed timestamps in tests
      ✓ does not rely on Date.now() for transaction dates
      ✓ applyBankRules uses transaction dates from DB, not wall-clock

Test Suites: 1 passed, 1 total
Tests:       57 passed, 57 total
Snapshots:   0 total
Time:        3.372 s
Ran all test suites matching /bank-statement-import.service.spec.ts/i.
```

### AC5: Spec Run via Package Script (`pnpm --filter api test`)

Command:

```bash
pnpm --filter api test -- src/modules/banking/services/bank-statement-import.service.spec.ts
```

Output:

```
> api@0.1.0 test /Users/abdelrahmanahmed/agents/work.noindex/impl/Mizano-210/apps/api
> jest --maxWorkers=2 "src/modules/banking/services/bank-statement-import.service.spec.ts"

PASS src/modules/banking/services/bank-statement-import.service.spec.ts
  BankStatementImportService
    detectColumnMapping
      ✓ detects standard date, description, amount, reference columns (2 ms)
      ✓ detects split debit/credit columns
      ✓ falls back to first column for date when no match (1 ms)
      ✓ falls back to second column for description when no match
      ✓ handles case-insensitive and partial matches
    parseAmount
      ✓ parses 1234.56 as 1234.56
      ✓ parses 1,234.56 as 1234.56
      ✓ parses -1234.56 as -1234.56
      ✓ parses (1234.56) as -1234.56
      ✓ parses 1.234,56 as 1234.56
      ✓ parses -1.234,56 as -1234.56
      ✓ parses (1.234,56) as -1234.56
      ✓ parses 1234 as 1234
      ✓ parses 0 as 0
      ✓ parses 0.00 as 0
      ✓ returns 0 for empty/null/undefined
      ✓ handles currency symbols and extra characters
    parseDate
      ✓ parses 2026-03-15 without error
      ✓ parses 2026-03-15T10:30:00Z without error
      ✓ parses 15/03/2026 without error
      ✓ parses 15-03-2026 without error
      ✓ parses 15.03.2026 without error
      ✓ parses 03/15/2026 without error
      ✓ parses 15-Jan-2026 without error
      ✓ parses 15 Jan 2026 without error
      ✓ returns null for invalid dates
    normalizeTransactions
      ✓ normalizes single amount column with positive = DEPOSIT, negative = WITHDRAWAL (1 ms)
      ✓ normalizes split debit/credit columns
      ✓ skips rows with zero amount
      ✓ skips rows without valid date
      ✓ handles European number format in amount column
    deduplicateTransactions
      ✓ detects duplicates by reference (primary key) (1 ms)
      ✓ detects duplicates by description prefix when no reference (same date + amount)
      ✓ does not match across organizations
      ✓ uses signed amount for reference matching, absolute for description
      ✓ returns all new when no existing transactions
      ✓ queries with organizationId and bankAccountId scope
    importStatement
      ✓ imports transactions and returns counts (1 ms)
      ✓ validates bank account belongs to organization (8 ms)
      ✓ throws when file has no transactions
      ✓ creates bank transactions with organizationId scoping
      ✓ stores amount as absolute Decimal with type indicating direction
      ✓ applies bank rules to new transactions (1 ms)
      ✓ does not create duplicate transactions on re-import (idempotent)
      ✓ does not read or write another organization's records
      ✓ uses fixed date for bank rule date range query (no wall-clock) (1 ms)
    tenant isolation - organizationId scoping
      ✓ never reads org-2 data when importing for org-1
      ✓ rejects bank account from another organization
    idempotent retries - same source event creates one journal
      ✓ first import creates transaction, second import with same reference skips it
      ✓ deduplication uses date + amount + reference as primary key (1 ms)
      ✓ deduplication uses date + amount + description prefix as secondary key
    Decimal journal lines - debits equal credits (via bank transaction posting)
      ✓ creates DEPOSIT transactions with positive amount as credit
      ✓ creates WITHDRAWAL transactions with negative amount as debit (stored positive)
      ✓ handles European decimal format correctly in stored amounts
      ✓ handles parenthesized negative amounts correctly
    no wall-clock dates - fixed timestamps in tests
      ✓ does not rely on Date.now() for transaction dates (1 ms)
      ✓ applyBankRules uses transaction dates from DB, not wall-clock

Test Suites: 1 passed, 1 total
Tests:       57 passed, 57 total
Snapshots:   0 total
Time:        3.552 s
Ran all test suites matching /src\/modules\/banking\/services\/bank-statement-import.service.spec.ts/i.
```

### TypeScript Validation (`pnpm --filter api type-check`)

Command:

```bash
pnpm --filter api type-check
```

Output:

```
> api@0.1.0 type-check /Users/abdelrahmanahmed/agents/work.noindex/impl/Mizano-210/apps/api
> tsc --noEmit && tsc --noEmit -p test/tsconfig.e2e.json

(exited with 0 errors, exit code 0)
```

### ESLint Validation (`pnpm --filter api lint`)

Command:

```bash
pnpm --filter api lint
```

Output:

```
> api@0.1.0 lint /Users/abdelrahmanahmed/agents/work.noindex/impl/Mizano-210/apps/api
> eslint "{src,apps,libs,test}/**/*.ts"

(exited with 0 errors, 0 warnings, exit code 0)
```
