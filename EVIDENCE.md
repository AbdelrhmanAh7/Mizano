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

# EVIDENCE.md — Cross-tenant isolation of ledger and invoice reads (#108)

- **Tested commit**: `8da8aea0d286c73af6c4f2a846c88d0a88a4f152` (branch `ai/108`; this doc is the only later change)
- **Suite**: `apps/api/test/tenant-isolation.e2e-spec.ts`. Two registered tenants (A: 1111, B: 7777), each with a sent invoice, an approved bill and a manual journal
- **Database**: throwaway Postgres 16 on `127.0.0.1:55461`, `prisma migrate deploy`, `REDIS_URL=` blank. No new services or secrets
- **Production code changed**: none. No endpoint leaked, so no fix was needed

| REQ | Requirement                                                                | Test (`@issue-108`)                                                                            | Status |
| --- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------ |
| AC1 | A's token on B's invoice, bill, journal or GL account id returns 404       | `AC1: returns 404 for every foreign id`; `AC1: returns 404 for soft-deleted and malformed ids` | PASSED |
| AC2 | Lists, AP aging and both trial balances hold no B rows or totals           | four `AC2:` tests, checked against the tenant's own DB ground truth                            | PASSED |
| AC3 | No token, an expired token or a forged signature gets 401 on all 13 routes | three `AC3:` tests                                                                             | PASSED |
| AC4 | Existing command, no new services                                          | `jest --config ./test/jest-e2e.json` (`pnpm --filter api test:e2e`)                            | PASSED |
| AC5 | Change ≤ ~300 lines                                                        | 280 test lines plus this record; no production code                                            | PASSED |

**Commands and output** (at the tested commit):

```text
$ npx jest --config ./test/jest-e2e.json tenant-isolation
Tests:       9 passed, 9 total
$ npx jest --config ./test/jest-e2e.json        # fresh DB, all 12 suites in parallel
Tests:       2 failed, 264 passed, 266 total   # ai + intake: HTTP 407, unrelated
$ npx jest --config ./test/jest-e2e.json "ai|intake|purchases"
Tests:       65 passed, 65 total
$ pnpm --filter api lint && pnpm --filter api type-check   # clean
$ node apps/api/_run_tests.js                   # API unit suite
Tests:       4 failed, 2193 passed, 2197 total  # import.service.hardening: "csv is not a function"
```

The full parallel run is flaky outside this suite. One run failed one `purchases` test and the next failed `ai` and `intake` with 407s. Each of those suites passes when rerun. `tenant-isolation` passed in every run. The unit failures come from this worktree's offline dependency install. This branch changes no file under `apps/api/src` and no unit spec.

**Mutation check** (issue test plan): each filter was removed, the suite was rerun, and the file was restored.

| Removed tenant guard                                                                                 | Failing test                   |
| ---------------------------------------------------------------------------------------------------- | ------------------------------ |
| `bills.service.ts:127` `deletedAt: null` in `findOne`                                                | AC1 soft-deleted/malformed ids |
| `bills.service.ts:78` `organizationId` in list                                                       | AC2 invoice and bill lists     |
| `invoices.service.ts:211` / `journals.service.ts:237` `organizationId` in `findOne`                  | AC1 every foreign id           |
| `aging-reports.service.ts:171` `organizationId` in payables aging                                    | AC2 AP aging                   |
| `report-utils.ts:230` org filter on line totals plus the account-list filter of either trial balance | AC2 trial balances             |
| `jwt.strategy.ts:23` `ignoreExpiration: true`                                                        | AC3 expired token              |

Each trial balance has two tenant filters: the account list and the line totals. Removing only one of them leaks nothing, because foreign totals are keyed by foreign account ids that the org-scoped account list never holds. The suite passes in that case, which is correct. Removing both makes the AC2 trial balance test fail.
