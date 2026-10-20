# Evidence: #125 AP subledger vs control-account reconciliation

- **Issue**: #125 (Add AP subledger vs control-account reconciliation check with test)
- **Originating Sentry issue**: None (internal accounting correctness feature)
- **Scope**: Backend only (service, controller route, module, unit spec, API e2e spec, e2e-army API test). The web report page was moved to branch `ai/125-ui` (follow-up PR) per the CTO decision; no `apps/web` file is in this diff.
- **Tested SHA**: `7ac5dcf5bca2da916f8bb20abedd13b2f16c70a0`
- **Implementer**: AI implementer on branch `ai/125`.

## Acceptance Criteria & Verification Matrix

| AC ID | Acceptance Criterion                                                                           | Verification Method / Command                                                                                    | Exit Code | Status |
| ----- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | --------- | ------ |
| AC1   | A seeded tenant with approved and paid bills returns `ok: true` and `difference` of `0`        | unit `AC1`; API e2e `AC1`; e2e-army `AC1/AC2`                                                                    | 0         | PASSED |
| AC2   | A test fixture that corrupts a subledger balance returns `ok: false` with the exact difference | unit `AC2`; API e2e `AC2` (`balanceDue` +12.34 gives `difference: "12.3400"`)                                    | 0         | PASSED |
| AC3   | Voided and draft bills are excluded from the subledger total                                   | unit scope tests; API e2e `AC3`                                                                                  | 0         | PASSED |
| AC4   | Another tenant's data never affects the result (covered by a test)                             | unit scope test (`organizationId` on every query); API e2e `AC4`                                                 | 0         | PASSED |
| AC5   | The `asOf` date filters both sides consistently                                                | unit `T3`; API e2e `AC5`; e2e-army `AC5`; invalid `asOf` is 400, anonymous 401                                   | 0         | PASSED |
| AC6   | The change is ≤ ~300 lines and adds no migrations                                              | `git diff origin/master..HEAD --stat apps/api/src/` (~294 lines production code); 0 files in `prisma/migrations` | 0         | PASSED |

## Review Findings & Resolutions

| Review Finding                                                                      | Fix Details                                                                                                                                                                                                                                                                                                          | Test Evidence                                                                                                                                                                                                                                                      |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Hardcoded transaction timeout (30,000ms) in `ap-reconciliation.service.ts`          | Lowered default timeout to 15,000ms and made it configurable via optional `ApReconciliationOptions.timeout` or `AP_RECONCILIATION_TIMEOUT_MS` environment variable.                                                                                                                                                  | `apps/api/src/modules/reports/services/ap-reconciliation.service.spec.ts`: tested default 15,000ms and custom overrides via options and env vars (`reads both sides in one repeatable-read transaction with configurable timeout`, `allows overriding timeout...`) |
| Transaction isolation level in high concurrency                                     | `RepeatableRead` is necessary by default to ensure an atomic, non-skewed snapshot across subledger and ledger balances (mandated by CTO P2), but is now configurable via `ApReconciliationOptions.isolationLevel` or `AP_RECONCILIATION_ISOLATION_LEVEL` environment variable.                                       | `apps/api/src/modules/reports/services/ap-reconciliation.service.spec.ts`: tested default `RepeatableRead` and custom overrides (`ReadCommitted`, `Serializable`)                                                                                                  |
| Hardcoded test credentials in `e2e-army/125-ap-reconciliation.e2e.ts`               | Replaced hardcoded string literals with `process.env.E2E_EMAIL ?? 'admin@mizano.com'` and `process.env.E2E_PASSWORD ?? 'password123'`.                                                                                                                                                                               | `e2e-army/125-ap-reconciliation.e2e.ts` lines 22-26                                                                                                                                                                                                                |
| Local execution of test suites (QA recurring finding)                               | Pre-built workspace packages (`@mizano/shared-types`, `@mizano/validators`) and executed all unit tests and API E2E tests against local PostgreSQL (`mizano_e2e_125` on `127.0.0.1:5432`). All 17 unit tests and all 9 API E2E tests executed locally and passed.                                                    | `ap-reconciliation.service.spec.ts` (17 passed), `ap-reconciliation.e2e-spec.ts` (9 passed), exit code 0                                                                                                                                                           |
| Non-AP accounts (discounts, withholding tax, bank fees) misclassified as AP control | In `apps/api/src/modules/reports/services/ap-reconciliation.service.ts` (`controlBalance`), restricted AP account discovery to `AccountType.LIABILITY` excluding tax accounts (`code: 22xx`, name containing Tax/VAT) across all source-typed and legacy branches; explicitly excluded `defaultVatPayableAccountId`. | `apps/api/src/modules/reports/services/ap-reconciliation.service.spec.ts`: 4 dedicated tests `(a)` discount expense excluded, `(b)` withholding tax liability excluded, `(c)` bank-fee expense excluded, `(d)` balanced ledger ties                                |
| One database snapshot                                                               | `reconcileApControl` runs inside a `RepeatableRead` `$transaction` (configurable)                                                                                                                                                                                                                                    | unit "reads both sides in one repeatable-read transaction with configurable timeout"                                                                                                                                                                               |
| Source-less legacy journals / changed AP account                                    | Legacy reference branches in `controlBalance` restricted to AP liabilities                                                                                                                                                                                                                                           | unit `T2`, API e2e `AC1 legacy`                                                                                                                                                                                                                                    |
| Payments before future-dated bills                                                  | `prepaid` aggregate deducted from subledger                                                                                                                                                                                                                                                                          | unit `T3`, API e2e `AC5 prepaid`                                                                                                                                                                                                                                   |
| Return the currency                                                                 | `currencyCode` read from `getBaseCurrency`                                                                                                                                                                                                                                                                           | unit `T4`                                                                                                                                                                                                                                                          |
| Bills voided after the cutoff                                                       | `billsVoidedAfter` reconstructs open payable from gross                                                                                                                                                                                                                                                              | unit "includes a bill voided after asOf", API e2e `AC3/AC5 void later`                                                                                                                                                                                             |
| Precision above 20 significant digits                                               | `Decimal.clone({ precision: 40 })`                                                                                                                                                                                                                                                                                   | unit "keeps full precision"                                                                                                                                                                                                                                        |
| Verifier looked for web page / 404                                                  | Confirmed endpoint is `GET /api/reports/reconciliation/ap` (REST API). Documented in controller and e2e test titles that no web route exists; verified via `e2e-army/125-ap-reconciliation.e2e.ts`.                                                                                                                  | `e2e-army/125-ap-reconciliation.e2e.ts` (3 tests, 0 failed), API e2e (9 tests, 0 failed)                                                                                                                                                                           |

## Commands Run Locally in this Session

```bash
# 1. API Unit tests (17 tests, 0 failures)
pnpm --filter api exec jest src/modules/reports/services/ap-reconciliation.service.spec.ts
# Output:
# PASS src/modules/reports/services/ap-reconciliation.service.spec.ts
#   @issue-125 ApReconciliationService.reconcileApControl
#     ✓ AC1: ties open balances, later settlements and unapplied credits in exact decimals (4 ms)
#     ✓ AC2: returns ok false with the exact signed difference when the sides disagree (1 ms)
#     ✓ AC3/AC4/AC5: scopes every query to the tenant, posted bills and the end of the asOf day (2 ms)
#     ✓ reads both sides in one repeatable-read transaction with configurable timeout
#     ✓ allows overriding timeout and isolation level via options or environment variables (1 ms)
#     ✓ T3: a payment dated before its future-dated bill reduces the subledger like the ledger
#     ✓ T2: the default AP account changed after posting: old and legacy accounts still count (1 ms)
#     ✓ T4: returns the organization base currency, falling back to the registration currency
#     ✓ includes a bill voided after asOf from its gross total less settlements in effect (1 ms)
#     ✓ adds no voided-after bills when no approval journal was reversed later (4 ms)
#     ✓ keeps full precision when the control credits pass 20 significant digits
#     ✓ treats empty aggregates and a tenant without AP accounts as zero on both sides
#     ✓ rejects an invalid asOf date (1 ms)
#     AP control account discovery filtering (CTO P2)
#       ✓ (a) a bill with a discount or negative line crediting an expense account leaves controlBalance unchanged
#       ✓ (b) a withholding-tax line crediting a tax liability is excluded
#       ✓ (c) a payment with a bank-fee or FX-loss line debiting an expense account is excluded
#       ✓ (d) all three return ok:true, difference 0 on a consistent ledger (1 ms)
# Test Suites: 1 passed, 1 total
# Tests:       17 passed, 17 total
# Snapshots:   0 total
# Time:        5.067 s
# Exit code: 0

# 2. API E2E tests (9 tests, 0 failures)
DATABASE_URL="postgresql://abdelrahmanahmed@127.0.0.1:5432/mizano_e2e_125?schema=public" pnpm --filter api exec jest --config ./test/jest-e2e.json ap-reconciliation
# Output:
# PASS test/ap-reconciliation.e2e-spec.ts (7.888 s)
#   @e2e @flow:ap-reconciliation @issue-125 AP subledger vs control account
#     ✓ @issue-125 AC1: approved and paid bills reconcile with ok true and a zero difference [REST API] (57 ms)
#     ✓ @issue-125 AC3: voided and draft bills are excluded from the subledger total [REST API] (18 ms)
#     ✓ @issue-125 AC5: asOf filters bills, payments, voids and credits on both sides [REST API] (48 ms)
#     ✓ @issue-125 AC2: a corrupted subledger balance returns ok false with the exact difference [REST API] (25 ms)
#     ✓ @issue-125 AC4: another tenant's bills and corrupted balances never affect the result [REST API] (90 ms)
#     ✓ @issue-125 AC5: a payment dated before its future-dated bill ties on both sides [REST API] (453 ms)
#     ✓ @issue-125 AC1: still ties after the default AP account changed over source-less legacy journals [REST API] (280 ms)
#     ✓ @issue-125 AC3/AC5: a bill voided after the cutoff stays in the subledger as of the cutoff [REST API] (291 ms)
#     ✓ @issue-125 rejects an invalid asOf and anonymous callers [REST API] (5 ms)
# Test Suites: 1 passed, 1 total
# Tests:       9 passed, 9 total
# Snapshots:   0 total
# Time:        8.029 s
# Exit code: 0

# 3. Lint check
pnpm --filter api lint
# Output:
# > api@0.1.0 lint /Users/abdelrahmanahmed/agents/work.noindex/impl/Mizano-125/apps/api
# > eslint "{src,apps,libs,test}/**/*.ts"
# Exit code: 0

# 4. Type check
pnpm --filter api exec tsc --noEmit
# Output:
# Exit code: 0
```

Bills have no void route today, so void fixtures set the status and write the reversal journal directly. Posting, approval and payment code is unchanged (#11, #12, #94).
