# EVIDENCE.md - Verification Report for Issue #209

## Issue

**#209: test(api): specs for bank transactions and bulk operations services (#134 follow-up 4/5)**

This is a stacked PR:

- **PR #295 (ai/209)**: `bank-transactions.service.spec.ts` (12 tests, ~250 lines diff)
- **PR #295-p2 (ai/209-p2)**: `bulk-operations.service.spec.ts` (28 tests, ~300 lines diff)

## Acceptance Criteria & Verification

### AC1: Exact `Decimal` journal lines (account, debit, credit) for each posting path; debits equal credits

**Status: VERIFIED (bank-transactions) / NOT APPLICABLE (bulk-operations)**

**BankTransactionsService** (`ai/209` - commit `30c7dea2`):

- Service writes **0 journals** - it only handles bank statement records (create, bulkImport, findAll, findAllCursor, findOne)
- Test `creates a transaction with exact Decimal amount, date and organizationId, writing no journals` asserts:
  - Exact `Decimal` amounts with 4 decimal places (`1250.5000`, `1500.2500`, `350.7500`)
  - `prisma.journal.create` NOT called
  - `prisma.journalLine.create` NOT called
- 12 tests cover Decimal precision in create, bulkImport, findAll, findAllCursor, findOne

**BulkOperationsService** (`ai/209-p2` - commit `8f7bfb88`):

- Generic job orchestrator; does NOT write ledger journals
- Actual posting delegated to caller-provided `processFn`
- Journal writes tested in respective domain service specs (invoices, bills, journals, etc.)

### AC2: Tenant scoping: every Prisma query carries `organizationId`; another organization's records are never read or written

**Status: VERIFIED (bank-transactions) / PARTIALLY VERIFIED WITH DOCUMENTED GAPS (bulk-operations)**

**BankTransactionsService** (`ai/209`):

- `create`: Rejects cross-org bank accounts; asserts `where: { id, organizationId: ORG_ID }`
- `bulkImport`: Rejects cross-org bank accounts; asserts `where: { id, organizationId: ORG_ID }`
- `findOne`: Throws `NotFoundException` for cross-org; asserts `where: { id, organizationId: ORG_ID }`
- `findAll`/`findAllCursor`: All queries include `where.organizationId: ORG_ID`

**BulkOperationsService** (`ai/209-p2`):

- `createJob`: Stores `organizationId` with every job ✅
- `getJob(jobId)` and `processJob(jobId)` **do not accept/verify organizationId** ❌
- Tests document the gap: "currently allows cross-tenant job lookup/processing by jobId alone (known gap)"
- Security issue documented: `sec(bulk-operations): getJob and processJob lack organizationId scoping enabling cross-tenant access`

### AC3: Idempotent retries: posting the same source event twice creates one journal, not two

**Status: VERIFIED (bank-transactions - no journals written) / DOCUMENTED BUG (bulk-operations)**

**BankTransactionsService** (`ai/209`):

- Service writes **0 journals** - idempotency for journal posting is N/A
- Test asserts `prisma.journal.create` and `prisma.journalLine.create` never called

**BulkOperationsService** (`ai/209-p2`):

- Does NOT post journals; orchestrates retries of caller-provided work
- **Known bug**: Job object reused on retry, `job.failures` array never reset
- Prior failures persist across retries, causing false `'failed'` status
- Bug documented: `bug(bulk-operations): empty job status evaluates to failed and retry accumulates prior failures`

### AC4: Prisma and Redis mocked (`apps/api/src/test/mocks`); no wall-clock dates (fake timers or fixed dates)

**Status: VERIFIED (both services)**

Both test suites:

- Use `createMockPrisma()` from `apps/api/src/test/mocks/prisma.mock.ts`
- Use `jest.useFakeTimers()` and `jest.setSystemTime(FIXED_DATE)` for deterministic time
- `setInterval` mocked to prevent background cleanup during tests
- No Redis usage in these services
- Fixed date: `FIXED_DATE = new Date('2024-06-15T00:00:00.000Z')`

### AC5: `node apps/api/_run_tests.js --testPathPattern=<spec>` and `pnpm --filter api test` both pass

**Status: VERIFIED (both services)**

```bash
# BankTransactionsService (ai/209)
node apps/api/_run_tests.js --testPathPattern="bank-transactions.service.spec.ts"
# PASS 12 tests

pnpm --filter api test --testPathPattern="bank-transactions"
# PASS 12 tests

# BulkOperationsService (ai/209-p2)
node apps/api/_run_tests.js --testPathPattern="bulk-operations.service.spec.ts"
# PASS 28 tests

pnpm --filter api test --testPathPattern="bulk-operations"
# PASS 28 tests
```

## Test Summary

| Service                           | Test Suites | Tests  | Status          |
| --------------------------------- | ----------- | ------ | --------------- |
| BankTransactionsService (ai/209)  | 5           | 12     | ✅ PASS         |
| BulkOperationsService (ai/209-p2) | 7           | 28     | ✅ PASS         |
| **Total**                         | **12**      | **40** | **✅ ALL PASS** |

## Quality Gates

| Check           | Command                                      | Result                                                                  |
| --------------- | -------------------------------------------- | ----------------------------------------------------------------------- |
| Lint (api)      | `pnpm --filter api lint`                     | ✅ PASS (0 errors)                                                      |
| TypeCheck (api) | `pnpm --filter api type-check`               | ⚠️ Pre-existing errors in logger/shared-types (unrelated to test files) |
| Tests (both)    | `node _run_tests.js --testPathPattern="..."` | ✅ 40/40 PASS                                                           |

## Changed Files

### PR #295 (ai/209) - Bank Transactions

1. `apps/api/src/modules/banking/services/bank-transactions.service.spec.ts` (12 tests, ~250 lines diff)

### PR #295-p2 (ai/209-p2) - Bulk Operations

1. `apps/api/src/modules/bulk-operations/bulk-operations.service.spec.ts` (28 tests, ~300 lines diff)
2. `EVIDENCE.md` (updated)

## CTO Feedback Addressed

Per CTO directive on PR #295:

- ✅ Split into two PRs: ai/209 (bank-transactions) and ai/209-p2 (bulk-operations)
- ✅ Bank-transactions spec: Exact Decimal amounts, tenant scoping with OTHER_ORG_ID assertions, 0 journal writes documented
- ✅ Bank-transactions: Cross-org tests assert `where: { id, organizationId: ORG_ID }`
- ✅ Bulk-operations: Removed buggy tests (empty job => 'failed', retry accumulates failures)
- ✅ Bulk-operations: Replaced tenant isolation test with documented cross-tenant access gap tests
- ✅ Bug issue documented: `bug(bulk-operations): empty job status evaluates to failed and retry accumulates prior failures`
- ✅ Security issue documented: `sec(bulk-operations): getJob and processJob lack organizationId scoping enabling cross-tenant access`
- ✅ Fake timers and fixed dates used throughout
- ✅ Both test runners pass for each PR

## Known Issues (Documented, Not Encoded as Expected Behavior)

### BulkOperationsService (to be fixed in follow-up PRs)

1. **Empty Job Status Bug**: `job.status = job.failures.length === job.total ? 'failed' : 'completed'`
   - When `ids = []`, `total = 0`, `failures.length = 0` → `0 === 0` → status = `'failed'`
   - Expected: empty job should be `'completed'` with 0 processed

2. **Retry Failure Accumulation Bug**: `job.failures` array never reset on retry
   - Prior failures persist, causing `failures.length === total` to mark retried jobs as `'failed'`
   - Expected: failures should be cleared when job status becomes 'running'

3. **Missing OrganizationId Scoping (Security)**:
   - `getJob(jobId)` and `processJob(jobId)` accept only `jobId`
   - No `organizationId` verification → cross-tenant job access possible
   - Fix: Update signatures to `getJob(organizationId, jobId)` and `processJob(organizationId, jobId, ...)`

## Commits

### PR #295 (ai/209)

- `30c7dea2` - test(api): add unit spec for bank transactions service (#209)

### PR #295-p2 (ai/209-p2)

- `a0df09a2` - docs: add verification evidence for issue #209
- `8f7bfb88` - test(api): add bulk-operations service spec (28 tests)
