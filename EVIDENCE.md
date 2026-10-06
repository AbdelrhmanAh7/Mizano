# Evidence: Issue #96 Duplicate-invoice warning before posting (vendor + exact amount + date window)

Implementation of Slice 1: read-only duplicate-check service and endpoint in `apps/api` with full domain and multi-tenancy tests.

- **Base commit:** `master` at `b83d72b4cfa358f3a6ba4be9d9f1b613ac9fe1f2`
- **Tested SHA:** `bcc65a236fe01f5b5dfec15cbfdbd7e8daa342ad`
- **Author:** Antigravity (Gemini 3.8 Flash High)
- **Host:** Darwin arm64 (macOS), Node v22.13.1, pnpm 8.14.0

---

## Requirements Verification

| REQ    | Requirement                                                                                                                                                                                                   | Verified By                                                                                                  | Result   |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------- |
| REQ-1  | **Date window (±3 days inclusive)**: Day 0, −3, and +3 match (`possible`); day ±4 does not (`none`). Calendar date comparison in UTC across timezones.                                                        | `bills.service.spec.ts` › `exact match on day 0, -3 and +3 returns possible; day +/-4 returns none`          | **PASS** |
| REQ-2  | **Exact Decimal comparison**: `"100.10"` vs `"100.1"` matches; `"100.10"` vs `"100.11"` does not. No float conversion / `Number()` / `parseFloat()` on monetary values.                                       | `bills.service.spec.ts` › `matches 100.10 vs 100.1 but rejects 100.10 vs 100.11 without float conversion`    | **PASS** |
| REQ-3  | **Currency isolation**: Different currency does not match. Evaluates explicit draft currency vs bill currency / org base currency.                                                                            | `bills.service.spec.ts` › `rejects different currency as no match`                                           | **PASS** |
| REQ-4  | **Vendor matching & normalization**: Normalizes vendor name (NFKC, casefold, trimmed, whitespace collapsed). Arabic vendor name (`'شركة الأمل'`) matches exactly. Resolves vendor ID directly when available. | `bills.service.spec.ts` › `matches vendor name differing only in case or whitespace, and Arabic vendor name` | **PASS** |
| REQ-5  | **Multi-tenant scoping**: All queries strictly scoped by authorized `organizationId` from session (`@CurrentOrg()`). Bills from other organizations are never returned even if known.                         | `bills.service.spec.ts` › `scopes by organization: a bill in another org is never queried or returned`       | **PASS** |
| REQ-6  | **Posted bills only**: Draft and unposted bills (`DRAFT`, `PENDING`) are ignored. Only posted bills (`OPEN`, `PARTIALLY_PAID`, `PAID`, `OVERDUE`, `VOID`) are candidates.                                     | `bills.service.spec.ts` › `ignores draft and unposted bills`                                                 | **PASS** |
| REQ-7  | **Missing values handling**: Missing amount, date, or vendor returns `status: "unknown"` with empty matches.                                                                                                  | `bills.service.spec.ts` › `returns unknown when amount, date or vendor is missing`                           | **PASS** |
| REQ-8  | **Strict ISO date validation**: Malformed date (`2026-10-06x`) rejected with 400 `BadRequestException` via strict anchored ISO calendar validation.                                                           | `bills.service.spec.ts` › `rejects malformed date (2026-10-06x) using strict ISO validation`                 | **PASS** |
| REQ-9  | **Ordering & stable tiebreaker**: Matches sorted by `document_date DESC, id DESC`. Stable ID tiebreaker when two matches share a date.                                                                        | `bills.service.spec.ts` › `sorts matches by document_date DESC, id DESC with stable ID tiebreaker`           | **PASS** |
| REQ-10 | **Result limit & read-only guarantee**: Returns at most 5 matches. Takes no locks, writes no rows, and never blocks or alters posting.                                                                        | `bills.service.spec.ts` › `returns at most 5 matches`                                                        | **PASS** |
| REQ-11 | **Route protection & permissions**: `GET /bills/possible-duplicates` and `GET /bills/:id/possible-duplicates` protected by `purchases.view` permission.                                                       | `bills.controller.spec.ts` › `is protected by purchases.view permission`                                     | **PASS** |

---

## Acceptance Checklist

- [x] The endpoint returns `possible`, `none` or `unknown` as the tests specify.
- [x] Results are scoped by organization; the cross-organization test passes.
- [x] Amounts stay decimal strings end to end; there are no `Number`/`parseFloat` calls on money.
- [x] Posting behaviour is unchanged; all existing posting and approval tests pass (150/150 passed in purchases module).
- [x] The diff is kept minimal, and no CI workflows or secrets files are touched.
- [x] EVIDENCE.md contains the real command output and the tested commit SHA.

---

## Performance & Database Index Note

Per the Tech Lead plan notes:

> "Performance: confirm an index on (org, vendor, amount) exists. If one is needed, write it in AI_QUESTIONS.md rather than adding a migration silently."

Inspection of `apps/api/prisma/schema.prisma` shows existing indexes on `Bill`:

- `@@index([organizationId, vendorId])`
- `@@index([organizationId, deletedAt, status, date])`

There is currently no composite index on `(organizationId, vendorId, grandTotal)`. The query filters on `(organizationId, vendorId)` and a narrow `[date - 4d, date + 4d]` window, which effectively leverages `@@index([organizationId, vendorId])`. For high-volume tenants with tens of thousands of bills per vendor, adding an index on `(organizationId, vendorId, grandTotal)` is recommended in a future dedicated schema migration. No migration was added silently in this PR.

---

## Test Execution Outputs

### Red Test Run (commit `7a05e13`)

Failing tests before implementation of `findPossibleDuplicateBills`:

```text
> api@0.1.0 test /Users/abdelrahmanahmed/agents/work/impl/Mizano/apps/api
> jest --maxWorkers=2 "apps/api/src/modules/purchases/services/bills.service.spec.ts"

FAIL src/modules/purchases/services/bills.service.spec.ts
  ● Test suite failed to run

    src/modules/purchases/services/bills.service.spec.ts:647:34 - error TS2339: Property 'findPossibleDuplicateBills' does not exist on type 'BillsService'.

    647       const day0 = await service.findPossibleDuplicateBills(ORG_ID, {
                                         ~~~~~~~~~~~~~~~~~~~~~~~~~~
```

### Green Test Run (commit `bcc65a2`)

Targeted unit tests for bills service and controller:

```text
> api@0.1.0 test /Users/abdelrahmanahmed/agents/work/impl/Mizano/apps/api
> jest --maxWorkers=2 "apps/api/src/modules/purchases/services/bills.service.spec.ts" "apps/api/src/modules/purchases/controllers/bills.controller.spec.ts"

PASS src/modules/purchases/services/bills.service.spec.ts (6.309 s)
PASS src/modules/purchases/controllers/bills.controller.spec.ts (6.319 s)

Test Suites: 2 passed, 2 total
Tests:       57 passed, 57 total
Snapshots:   0 total
Time:        6.984 s
Ran all test suites matching /apps\/api\/src\/modules\/purchases\/services\/bills.service.spec.ts|apps\/api\/src\/modules\/purchases\/controllers\/bills.controller.spec.ts/i.
```

Full purchases module regression suite:

```text
> api@0.1.0 test /Users/abdelrahmanahmed/agents/work/impl/Mizano/apps/api
> jest --maxWorkers=2 "apps/api/src/modules/purchases"

PASS src/modules/purchases/services/vendor-credits.posting.spec.ts (9.995 s)
PASS src/modules/purchases/services/expenses.posting.spec.ts (10.358 s)
PASS src/modules/purchases/services/expenses.pending.spec.ts
PASS src/modules/purchases/services/payments-made.service.spec.ts
PASS src/modules/purchases/services/vendor-credits.review.spec.ts
PASS src/modules/purchases/services/expenses.service.spec.ts
PASS src/modules/purchases/services/vendor-credits.service.spec.ts
PASS src/modules/purchases/services/expenses.categorize.spec.ts
PASS src/modules/purchases/services/bills.service.spec.ts
PASS src/modules/purchases/controllers/bills.controller.spec.ts

Test Suites: 10 passed, 10 total
Tests:       150 passed, 150 total
Snapshots:   0 total
Time:        13.699 s, estimated 15 s
Ran all test suites matching /apps\/api\/src\/modules\/purchases/i.
```

### Turbo Type-Check

```text
> mizano@0.1.0 type-check /Users/abdelrahmanahmed/agents/work/impl/Mizano
> turbo type-check

• turbo 2.8.12
• Packages in scope: @mizano/shared-types, @mizano/validators, @mizano/web, api
• Running type-check in 4 packages
• Remote caching disabled, using shared worktree cache
@mizano/validators:build: cache hit, replaying logs 8d836b18215331a3
@mizano/shared-types:type-check: cache hit, replaying logs b114151b7b26044f
@mizano/validators:type-check: cache hit, replaying logs 3b2af16a1570bd0c
@mizano/shared-types:build: cache hit, replaying logs cb70284cf0116b75
api:type-check: cache miss, executing 1a79b9b3716a08b7
@mizano/web:type-check: cache hit, replaying logs 84e3d652988325a7

 Tasks:    6 successful, 6 total
Cached:    5 cached, 6 total
  Time:    12.625s
```

### ESLint & Prettier

```text
> api@0.1.0 lint /Users/abdelrahmanahmed/agents/work/impl/Mizano/apps/api
> eslint "{src,apps,libs,test}/**/*.ts"

> @mizano/shared-types@0.1.0 lint /Users/abdelrahmanahmed/agents/work/impl/Mizano/packages/shared-types
> eslint "src/**/*.ts"
```

Both exited with code 0.
