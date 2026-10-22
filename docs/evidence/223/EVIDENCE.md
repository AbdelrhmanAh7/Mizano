# Evidence for Issue #223: General Ledger Endpoint Isolation Tests

## Acceptance Criteria

| AC  | Description                                                                       | Verified |
| --- | --------------------------------------------------------------------------------- | -------- |
| AC1 | Owner gets 200 and ledger entries for owned account                               | ✅       |
| AC1 | Owner sees its account in the trial balance list                                  | ✅       |
| AC2 | Foreign tenant gets 404 for foreign account ID                                    | ✅       |
| AC2 | Foreign tenant gets 404 for unknown account ID                                    | ✅       |
| AC2 | Foreign account never appears in other tenant's trial balance                     | ✅       |
| AC3 | Missing, malformed, and wrongly signed tokens get 401 on by-id and list endpoints | ✅       |

## Test Results

### API E2E Tests (`apps/api/test/general-ledger.isolation-spec.ts`)

```
PASS test/general-ledger.isolation-spec.ts
  General ledger tenant isolation (e2e) @issue-223
    ✓ AC1: the owner gets 200 and its ledger entries by account id (22 ms)
    ✓ AC1: the owner sees its account in the trial balance list (5 ms)
    ✓ AC2: another tenant gets 404 for the foreign account id and no ledger data (3 ms)
    ✓ AC2: another tenant gets 404 for an unknown account id (same answer as foreign) (2 ms)
    ✓ AC2: the foreign account never appears in the other tenant trial balance list (4 ms)
    ✓ AC3: missing, malformed and wrongly signed tokens get 401 on by-id and list (5 ms)

Test Suites: 1 passed, 1 total
Tests:       6 passed, 6 total
```

Command: `cd apps/api && DATABASE_URL="postgresql://mizano:mizano_secret@localhost:5432/mizano_db?schema=public" pnpm test:e2e -- general-ledger.isolation-spec.ts`

Exit code: 0

### Reports E2E Tests (Regression Check)

```
PASS test/reports.e2e-spec.ts
  Reports and dashboard reconcile with the ledger (e2e)
    isolation and authentication
      ✓ tenant B sees none of tenant A's figures (91 ms)
      ✓ rejects anonymous callers with 401 (11 ms)
      ✓ rejects invalid or malformed tokens with 401 (2 ms)
```

Command: `cd apps/api && DATABASE_URL="postgresql://mizano:mizano_secret@localhost:5432/mizano_db?schema=public" pnpm test:e2e -- reports`

Exit code: 0

### Type Checking

```
> api@0.1.0 type-check /Users/abdelrahmanahmed/agents/work.noindex/impl/Mizano-223/apps/api
> tsc --noEmit && tsc --noEmit -p test/tsconfig.e2e.json
```

Exit code: 0

### Linting

```
> api@0.1.0 lint /Users/abdelrahmanahmed/agents/work.noindex/impl/Mizano-223/apps/api
> eslint "{src,apps,libs,test}/**/*.ts"
```

Exit code: 0

## Implementation Summary

### Files Modified

1. **`apps/api/src/modules/reports/controllers/reports.controller.ts`**
   - Added `assertAccountOwnership` private method (line 522-524)
   - Called it in `getGeneralLedger` handler (line 517)
   - Method signature: `private async assertAccountOwnership(orgId: string, accountId: string): Promise<void>`

2. **`apps/api/src/modules/reports/services/financial-reports.service.ts`**
   - Added `assertAccountOwnership` method (line 625-631)
   - Return type: `Promise<void>` (assertion contract)
   - Throws `NotFoundException` when account not found or belongs to another tenant

3. **`apps/api/test/general-ledger.isolation-spec.ts`** (new file)
   - Comprehensive e2e test covering all 3 acceptance criteria
   - Tests both `/reports/general-ledger/:accountId` (by-id) and `/reports/trial-balance` (list) endpoints
   - Uses real API with two tenants for true isolation testing

### Code Changes (Diff Stat)

```
apps/api/src/modules/reports/controllers/reports.controller.ts | 22 ++++
apps/api/src/modules/reports/services/financial-reports.service.ts | 11 +++
apps/api/test/general-ledger.isolation-spec.ts | 87 ++++++++++++++++
3 files changed, 120 insertions(+)
```

Note: The implementation is within the ~100 lines limit for the core logic (tests are separate).

## Verification Commands

All commands run successfully on commit `c3917283` (HEAD of `ai/223` branch):

```bash
# API type check
pnpm --filter api type-check
# Exit code: 0

# API lint
pnpm --filter api lint
# Exit code: 0

# General ledger isolation tests
cd apps/api && DATABASE_URL="postgresql://mizano:mizano_secret@localhost:5432/mizano_db?schema=public" pnpm test:e2e -- general-ledger.isolation-spec.ts
# Exit code: 0, 6 tests passed

# Reports regression tests
cd apps/api && DATABASE_URL="postgresql://mizano:mizano_secret@localhost:5432/mizano_db?schema=public" pnpm test:e2e -- reports
# Exit code: 0, 16 tests passed
```

## Review Findings Addressed

Previous review rounds identified:

1. ✅ `getGeneralLedger` missing `async` keyword - Fixed in commit `943494e4`
2. ✅ `assertAccountOwnership` return type should be `Promise<void>` - Fixed in commit `f84f36bf`

Both fixes verified in current codebase.
