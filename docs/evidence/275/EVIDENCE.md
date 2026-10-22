# Evidence for Issue #275 (implements #130, replaces #195)

[audit] Route payroll, depreciation and COGM postings through JournalsService (replaces #195)

- **Issue**: #275 (Fresh restart of #130, replaces #195)
- **Base commit (`origin/master`)**: `e5d9b805563c04df3300f00442fd18f7d82ce560`
- **Tested Head (`ai/275`)**: `e69fb73d35a9dfb41d89f6b1be64bba2ed5dfb32`
- **Supersedes**: PR #195
- **Originating Sentry issue**: None (architecture audit finding #130 on direct ledger bypass and private journal sequence generation)
- **Skills used**: `model-effort-routing`, `tdd`, `verification-before-completion`, `improve-codebase-architecture`, `principle-subtract-before-you-add`, `pr`
- **Model and effort**: `Tool: Antigravity · Model: Gemini 3.8 Flash · Effort: High · Why: Complete system posting routing through JournalsService, concurrency guards, and verification evidence`

## Scope & Context

Previously, payroll runs, asset depreciation, asset disposal, and manufacturing COGM (Cost of Goods Manufactured) directly manipulated `tx.journal.create` using private `generateJournalNumber` helpers. This bypassed:

1. `JournalsService` balance validation and decimal string checks.
2. Tenant lock-date enforcement (allowing backdated posts into locked accounting periods).
3. Tenant-scoped idempotency keys `(organizationId, sourceType, sourceId)`.
4. Cache invalidation on controllers posting ledger entries.
5. Linked immutable reversal requirements (depreciation previously set `isPosted = false`).

Additionally, reviewer feedback on the prior PR #195 flagged:

- `work-orders.service.ts`: Route `bulkComplete` through the guarded single completion path (`runBulk`), preventing raw `updateMany` that skipped inventory movements and COGM journal creation.

This implementation routes all four automated posting flows through `JournalsService.create` and `JournalsService.reverse`, enforces ledger locks (`lockOrganizationLedger`), claims records with guarded status transitions, guarantees period order on depreciation and disposal, attaches cache invalidation interceptors to all controllers, and routes bulk work order completion through `completeWorkOrder`.

## Acceptance Criteria

- **AC1 (Approved payroll posting)**: Approved payroll runs (`markAsPaid`, `bulkMarkPaid`) post a single balanced `PAYROLL` journal via `JournalsService` with `totalGross` debited to salary expense, `totalNet` credited to cash/bank, and `totalDeductions` credited to payroll liability. Postings are dated on the period end, idempotent across retries and concurrent executions, and rejected when the period is covered by the organization lock date.
- **AC2 (Asset depreciation posting and reversal in period order)**: Asset monthly depreciation (`runMonthlyDepreciation`) and manual depreciation (`runDepreciationForAsset`) post balanced `DEPRECIATION` journals via `JournalsService` dated on the period end under the ledger lock. Depreciation posts in period order without skipping open periods, enforces organization fiscal locks, and maintains the asset register as the sum of posted periods. Reversing depreciation (`reverseDepreciation`) posts a linked `DEPRECIATION_REVERSAL` journal without un-posting the original, enforces reverse-period order (latest period first), and restores the asset register accordingly.
- **AC3 (Asset disposal posting with balanced gain/loss routing)**: Asset disposal (`dispose`) posts a balanced `ASSET_DISPOSAL` journal via `JournalsService` dated on the disposal date under the ledger lock. Proceeds debit cash/bank (excluding the asset's own account), accumulated depreciation is removed via debit, original cost is credited, and gain is credited to income (account 7100 or highest-coded income) or loss debited to expense (highest-coded expense). Disposal of fully depreciated assets is supported, invalid statuses are rejected, and lock dates are enforced.
- **AC4 (Manufacturing COGM posting on completion & bulk-completion)**: Work order completion (`completeWorkOrder`) and bulk completion (`bulkComplete`) route through the single guarded completion command under the organization ledger lock. It claims the work order, moves stock (consumes materials and adds finished goods proportionally), and posts a balanced `COGM` journal via `JournalsService` crediting inventory/raw materials and overhead and debiting finished goods inventory. Concurrent or repeated attempts report conflict or completion without double-posting or duplicate inventory movements.
- **AC5 (Cache invalidation and system journal protection)**: Controllers (`PayrollController`, `AssetsController`, `WorkOrdersController`) apply `@UseInterceptors(CacheInvalidationInterceptor)` alongside `@InvalidatesLedger(...)` to invalidate ledger caches upon posting or reversal. Direct reversals of system-generated journals (`PAYROLL`, `DEPRECIATION`, `ASSET_DISPOSAL`, `COGM`) outside their source command are rejected by `JournalsService.reverse` with an explicit error naming the source type.

## Verification Report

| Criterion     | Check                                                           | Command / Proof                                                                                                                                                                                                                                                                                                                                                                                                                                       | Observed Output                                                | Exit Code | Status |
| :------------ | :-------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------- | :-------- | :----- |
| **AC1**       | Payroll posting & lock date unit tests                          | `pnpm --filter api exec jest --maxWorkers=2 apps/api/src/modules/hr/services/payroll.service.spec.ts`                                                                                                                                                                                                                                                                                                                                                 | `Tests: 10 passed, 10 total`                                   | 0         | PASSED |
| **AC2**       | Depreciation posting, ordering & reversal unit tests            | `pnpm --filter api exec jest --maxWorkers=2 apps/api/src/modules/assets/services/depreciation.service.spec.ts`                                                                                                                                                                                                                                                                                                                                        | `Tests: 16 passed, 16 total`                                   | 0         | PASSED |
| **AC3**       | Asset disposal, gain/loss accounts & schedule tests             | `pnpm --filter api exec jest --maxWorkers=2 apps/api/src/modules/assets/services/assets.service.spec.ts`                                                                                                                                                                                                                                                                                                                                              | `Tests: 16 passed, 16 total`                                   | 0         | PASSED |
| **AC4**       | COGM posting & guarded bulk completion tests                    | `pnpm --filter api exec jest --maxWorkers=2 apps/api/src/modules/manufacturing/services/work-orders.service.spec.ts`                                                                                                                                                                                                                                                                                                                                  | `Tests: 10 passed, 10 total`                                   | 0         | PASSED |
| **AC5**       | System journal protection & controller cache invalidation tests | `pnpm --filter api exec jest --maxWorkers=2 apps/api/src/modules/accounting/services/journals.service.spec.ts apps/api/src/common/interceptors/cache-invalidation.interceptor.spec.ts`                                                                                                                                                                                                                                                                | `Tests: 58 passed, 58 total`                                   | 0         | PASSED |
| **All Unit**  | Full suite of changed spec files                                | `pnpm --filter api exec jest --maxWorkers=2 apps/api/src/common/interceptors/cache-invalidation.interceptor.spec.ts apps/api/src/modules/accounting/services/journals.service.spec.ts apps/api/src/modules/assets/services/assets.service.spec.ts apps/api/src/modules/assets/services/depreciation.service.spec.ts apps/api/src/modules/hr/services/payroll.service.spec.ts apps/api/src/modules/manufacturing/services/work-orders.service.spec.ts` | `Test Suites: 6 passed, 6 total, Tests: 110 passed, 110 total` | 0         | PASSED |
| **Typecheck** | Full api typecheck                                              | `pnpm --filter api type-check`                                                                                                                                                                                                                                                                                                                                                                                                                        | `tsc --noEmit && tsc --noEmit -p test/tsconfig.e2e.json`       | 0         | PASSED |
| **Lint**      | Full api eslint & prettier                                      | `pnpm --filter api lint`                                                                                                                                                                                                                                                                                                                                                                                                                              | `eslint "{src,apps,libs,test}/**/*.ts"` (no errors)            | 0         | PASSED |

## Changed Covering Tests

- `apps/api/src/modules/hr/services/payroll.service.spec.ts`:
  - `posts one balanced PAYROLL journal dated on the period end`
  - `rejects the posting when the lock date covers the payroll period`
  - `rejects a concurrent second payment without posting`
  - `refuses to post deductions without a payroll liability account`
- `apps/api/src/modules/assets/services/depreciation.service.spec.ts`:
  - `posts one balanced DEPRECIATION journal on the period end under the ledger lock`
  - `updates the asset register to the posted total, so it follows the ledger`
  - `rejects a posting when the lock date covers the period end`
  - `rejects a concurrent second post without double-posting`
  - `rejects a period behind a later posted one`
  - `rejects skipping an open period`
  - `appends a sequence suffix when re-posting after a reversal`
  - `catches up open periods up to the current month in order`
  - `starts an asset with nothing posted yet at the current month`
  - `stops an asset at a period that cannot post`
  - `creates a linked, balanced reversal and never un-posts the original`
  - `returns the asset register to the periods still posted`
  - `returns the asset to its purchase price when no period stays posted`
  - `rejects reversing a period behind a later posted one`
  - `rejects a reversal dated inside a locked period`
  - `rejects reversing a period that was never posted`
- `apps/api/src/modules/assets/services/assets.service.spec.ts`:
  - `builds a Decimal schedule whose last period absorbs the rounding remainder`
  - `posts one balanced ASSET_DISPOSAL journal under the ledger lock and marks the asset disposed`
  - `rejects the disposal when the lock date covers the disposal date`
  - `rejects instead of dropping the loss line when no gain/loss account exists`
  - `disposes a fully depreciated asset`
  - `rejects an asset in a non-disposable status`
  - `credits a gain to income account 7100 when the chart has it`
  - `falls back to the highest-coded income account for a gain`
  - `debits a loss to the highest-coded expense account and never looks up 6100`
- `apps/api/src/modules/manufacturing/services/work-orders.service.spec.ts`:
  - `posts one balanced COGM journal with 4-dp quantities and per-line cost rounding`
  - `derives movements and journal from the work order reloaded inside the transaction`
  - `takes the organization ledger lock before claiming the work order`
  - `rejects the completion when the lock date covers the completion date`
  - `does not post or move stock twice for a concurrent completion`
  - `bulk completion posts one balanced COGM journal per work order through the single command`
  - `bulk completion reports an order completed meanwhile instead of posting it twice`
  - `bulk completion inside a locked period posts nothing and reports every order`
- `apps/api/src/modules/accounting/services/journals.service.spec.ts`:
  - `rejects reversing a PAYROLL journal without an authorized source and names the source type`
  - `rejects reversing a ASSET_DISPOSAL journal without an authorized source and names the source type`
  - `rejects reversing a COGM journal without an authorized source and names the source type`
- `apps/api/src/common/interceptors/cache-invalidation.interceptor.spec.ts`:
  - `AssetsController applies the interceptor its ledger-posting handlers rely on`
  - `PayrollController applies the interceptor its ledger-posting handlers rely on`
  - `WorkOrdersController applies the interceptor its ledger-posting handlers rely on`
- `e2e-army/275-postings.e2e.ts`:
  - Request-level end-to-end tests covering AC1–AC4 against the HTTP API with tenant registration and chart seeding.
