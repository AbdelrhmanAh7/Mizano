# EVIDENCE.md — PR Merge Sprint Audit (#95)

## Overview

- **Issue**: #95 (MZ · PR merge sprint until queue ≤ 5)
- **Base Commit (`master`)**: `b83d72b5a1900350d7575dfa39396e95b058a5c4`
- **Audit Date**: 2026-10-07
- **Reviewed Scope**: 6 oldest open pull requests (#58, #60, #65, #66, #67, #68)

---

## Requirements Verification Matrix

| REQ ID | Requirement                                         | Verification Method                                | Status |
| ------ | --------------------------------------------------- | -------------------------------------------------- | ------ |
| REQ-1  | Retrieve 6 oldest open PRs                          | `gh pr list --search "sort:created-asc" --limit 6` | PASSED |
| REQ-2  | Record exact tested commit SHAs                     | Git ref inspection (`headRefOid` per PR)           | PASSED |
| REQ-3  | Execute local test suites per PR                    | Run unit/web suites with output captured           | PASSED |
| REQ-4  | Domain risk audit (money, tenant, idempotency, RTL) | Diff inspection against AGENTS.md rules            | PASSED |
| REQ-5  | Commit audit table & gh commands                    | Committed to `docs/planning/MERGE-QUEUE.md`        | PASSED |
| REQ-6  | Non-destructive execution (<300 doc lines)          | No PRs merged; doc-only additions                  | PASSED |

---

## Detailed Test Logs & Commit Evidence

### PR #58

- **Commit SHA**: `2b3f01c3d7e9fe4877bb29b8af903437b3eee92a`
- **Branch**: `demo/20-telegram-intake`
- **Commands**:
  ```bash
  git checkout --detach 2b3f01c3d7e9fe4877bb29b8af903437b3eee92a
  pnpm --filter ./apps/api exec prisma generate
  pnpm --filter ./apps/api test telegram
  pnpm lint
  ```
- **Output**:
  ```text
  PASS src/modules/telegram/telegram.client.spec.ts
  PASS src/modules/telegram/telegram-link.service.spec.ts
  PASS src/modules/telegram/telegram-intake.service.spec.ts
  Test Suites: 3 passed, 3 total
  Tests:       74 passed, 74 total
  Lint: 4 packages successful
  ```

### PR #60

- **Commit SHA**: `d01e25239b4a3a62c1034a0258c53e614655ed69`
- **Branch**: `demo/38-arm64-images`
- **Commands**:
  ```bash
  git checkout --detach d01e25239b4a3a62c1034a0258c53e614655ed69
  pnpm --filter ./apps/api test intake
  pnpm lint
  ```
- **Output**:
  ```text
  Test Suites: 1 skipped, 17 passed, 17 of 18 total
  Tests:       9 skipped, 284 passed, 293 total
  Lint: 4 packages successful
  ```

### PR #65

- **Commit SHA**: `5eb0340b0e002730f52709d3a7ad8a6097203f77`
- **Branch**: `demo/followup-vat`
- **Commands**:
  ```bash
  git checkout --detach 5eb0340b0e002730f52709d3a7ad8a6097203f77
  pnpm --filter ./apps/api test vat
  pnpm --filter ./apps/api test default-roles
  pnpm lint
  ```
- **Output**:
  ```text
  PASS src/modules/tax/controllers/vat-returns.controller.spec.ts
  PASS src/modules/tax/interceptors/vat-decimal.interceptor.spec.ts
  PASS src/modules/tax/services/vat-returns.service.spec.ts
  Test Suites: 3 passed, 3 total | Tests: 74 passed, 74 total
  PASS src/modules/roles/constants/default-roles.constant.spec.ts (1 passed)
  Lint: 4 packages successful
  ```

### PR #66

- **Commit SHA**: `310ac2b1aa7129b4c51403f46eb6ee36f4d1e778`
- **Branch**: `demo/followup-reports-ledger`
- **Commands**:
  ```bash
  git checkout --detach 310ac2b1aa7129b4c51403f46eb6ee36f4d1e778
  pnpm --filter ./apps/api test aging-reports
  pnpm --filter ./apps/api test depreciation
  pnpm --filter ./apps/api test work-orders
  pnpm lint
  ```
- **Output**:
  ```text
  PASS src/modules/reports/services/aging-reports.receivables.spec.ts (28 passed)
  PASS src/modules/assets/services/depreciation.service.spec.ts (22 passed)
  PASS src/modules/manufacturing/services/work-orders.service.spec.ts (29 passed)
  Test Suites: 6 passed, 6 total | Tests: 79 passed, 79 total
  Lint: 4 packages successful
  ```

### PR #67

- **Commit SHA**: `be7478f715f1e0f0efb8447e922db9d79d37fbc1`
- **Branch**: `demo/followup-sales-banking`
- **Commands**:
  ```bash
  git checkout --detach be7478f715f1e0f0efb8447e922db9d79d37fbc1
  pnpm --filter ./apps/api test recurring-profiles credit-notes
  pnpm --filter ./apps/web test payments bill-form invoices
  pnpm lint
  ```
- **Output**:
  ```text
  PASS src/modules/accounting/services/recurring-profiles.service.spec.ts (41 passed)
  PASS src/modules/sales/services/credit-notes.service.spec.ts (47 passed)
  PASS @mizano/web (payments, bill-form, invoices): 4 passed, 16 passed
  Total: 8 suites passed, 104 tests passed
  Lint: 4 packages successful
  ```

### PR #68

- **Commit SHA**: `7c632bdf74832cfc94f97cb49c196d168e99127f`
- **Branch**: `demo/followup-org-currency`
- **Commands**:
  ```bash
  git checkout --detach 7c632bdf74832cfc94f97cb49c196d168e99127f
  pnpm --filter ./apps/api test organizations
  pnpm --filter ./apps/web test report-currency report-labels purchases-currency
  pnpm lint
  ```
- **Output**:
  ```text
  PASS src/modules/organizations/organizations.service.spec.ts (26 passed)
  PASS @mizano/web (report-currency, report-labels, purchases-currency): 3 passed, 78 passed
  Total: 4 suites passed, 104 tests passed
  Lint: 4 packages successful
  ```

---

# Issue #130 — Payroll, depreciation and COGM post through JournalsService

- **Tested code SHA**: `9bae74c92cfbce4ace45cf98952894f62664bfeb` (branch `ai/130`, based on master `615060e`). Later commits on the branch only touch `EVIDENCE.md` and `docs/agents/review-lessons.md`.
- **Environment**: macOS, Node with offline pnpm install, private PostgreSQL 16 cluster on `127.0.0.1:55130` (fresh database, `prisma migrate deploy`), `REDIS_URL=` blank.

## Acceptance criteria

| REQ                                                                                                     | Verified by                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| AC1 a double run of each posting yields one journal                                                     | `test/system-postings.e2e-spec.ts`: concurrent `POST /payroll/runs/:id/paid` x2, manual `POST /assets/:id/depreciate` + `POST /assets/depreciation/run`, concurrent `POST /assets/:id/dispose` x2, concurrent `POST /manufacturing/work-orders/:id/complete` x2 each leave exactly one journal for `PAYROLL`, `DEPRECIATION`, `ASSET_DISPOSAL`, `COGM` + source id |
| AC2 reversing depreciation keeps the original `isPosted=true` and creates a linked reversal             | e2e `AC2: reversing depreciation…` (original still posted, `reversedBy` set, reversal posted and balanced, period re-runnable); unit `depreciation.service.spec.ts` (no `journal.update`, `reversalOfId` set)                                                                                                                                                      |
| AC3 unit tests assert debits = credits and that a lock date rejects the post                            | `payroll.service.spec.ts`, `depreciation.service.spec.ts`, `assets.service.spec.ts` (disposal), `work-orders.service.spec.ts` (COGM) run the real `JournalsService` over the mocked client; e2e `AC3` tests for payroll, depreciation and COGM                                                                                                                     |
| Decimal: gross = net + deductions; schedule sums to the depreciable amount; COGM quantities not rounded | e2e `AC-Decimal` tests and the COGM AC1 test (`0.3333` consumed, not `0`); unit tests for payslip and schedule rounding                                                                                                                                                                                                                                            |
| Payslips soft-deleted, draft runs reused instead of hard-deleted                                        | e2e `AC-SoftDelete` tests; migration `20261008000000_payslip_soft_delete`                                                                                                                                                                                                                                                                                          |

The acceptance tests were committed failing first (`5bb0a38`): 12 of 12 failed on master behaviour (float totals `569.6891`, no source-linked journal, lock date ignored, two concurrent disposals/completions both returning 2xx). `4bb3a60` changed the expected rounding scale from 4 dp to the codebase's `CURRENCY_SCALE` (2 dp); the assertions stay exact.

## Commands and results

```bash
cd apps/api && npx jest --config ./test/jest-e2e.json --runInBand   # fresh DB
```

```text
Test Suites: 12 passed, 12 total
Tests:       269 passed, 269 total
```

```bash
cd apps/api && node _run_tests.js
```

```text
Test Suites: 1 failed, 136 passed, 137 total
Tests:       4 failed, 2213 passed, 2217 total
```

The one failing suite is `import.service.hardening.spec.ts`, which this branch does not touch. It passes on its own (`npx jest src/modules/import-export/services/import.service.hardening.spec.ts`: 9 passed) and fails only inside the full run after the offline install.

```bash
cd apps/web && npx jest
cd apps/api && npx tsc --noEmit -p . && npx tsc --noEmit -p test/tsconfig.e2e.json
cd apps/api && npx eslint "{src,test}/**/*.ts" --max-warnings 0
```

```text
Test Suites: 48 passed, 48 total
Tests:       458 passed, 458 total
tsc: exit 0 (both projects)
eslint: exit 0, no warnings
```

## Remaining limitations

- Account selection for payroll, disposal and COGM still uses the existing name/code lookups (now ordered by code and rejecting a missing account). The disposal gain/loss lookup still accepts code `6100`, which is "Rent Expense" in the default chart; choosing dedicated configured accounts is left for a follow-up.
- `POST /manufacturing/work-orders/bulk-complete` still marks work orders completed with an `updateMany` and posts no COGM journal. It should reuse `completeWorkOrder` through `runBulk`; left out to keep this PR's scope.
- `checkMaterialAvailability` and the asset summary still use float arithmetic for display figures (not postings).
- Reviewer: none yet. This record is the author's own run.
