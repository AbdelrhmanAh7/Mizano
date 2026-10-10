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

- **Tested commit**: `289fff4634e7557f15dd816e3f5190c8cbb0c863` (branch `ai/108`, review round 2)
- **Suite**: `apps/api/test/tenant-isolation.e2e-spec.ts`. Two registered tenants (A: 1111, B: 7777), each with a sent invoice, an approved bill, a manual journal and a distinct unapplied vendor credit (A 222.22, B 333.33)
- **Database**: throwaway Postgres 16 (`mizano_e2e_108` on `127.0.0.1:5432`, `prisma migrate deploy`), Redis `127.0.0.1:6380`. No new services or secrets
- **Production code changed**: tenant guard on the cursor parameter of the three cursor endpoints — `invoices.service.ts`, `bills.service.ts`, `journals.service.ts` `findAllCursor` (foreign/unknown cursor → 404). No auth-model change.

| REQ      | Requirement                                                             | Test (`@issue-108`)                                                                                                             | Status             |
| -------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| AC1      | A's token on B's invoice, bill, journal, GL account id returns 404      | `AC1: returns 404 for every foreign id` (both GL routes); `AC1: returns 404 for soft-deleted and malformed ids`                 | PASSED             |
| AC2      | Lists, AP aging and both trial balances hold no B rows or totals        | `AC2:` invoice/bill lists, journal lists, AP aging (T3), both trial balances — checked against the tenant's own DB ground truth | PASSED             |
| AC2b     | Cursor endpoints reject the other tenant's id (T4, review finding)      | `AC2b: foreign ids as cursor return 404, own ids 200`                                                                           | PASSED             |
| AC2c     | List endpoints report tenant-scoped `meta.total` (T2, review finding)   | `AC2c:` invoice, bill and journal `meta.total` equals the scoped Prisma count                                                   | PASSED             |
| AC3      | No token, an expired token or a forged signature gets 401 on all routes | three `AC3:` tests (all 14 routes, incl. `/reports/general-ledger/…`)                                                           | PASSED             |
| AC4      | Existing command, no new services                                       | `jest --config ./test/jest-e2e.json` (`pnpm --filter api test:e2e`)                                                             | PASSED             |
| AC5      | Change ≤ ~300 lines                                                     | 300 changed lines in `tenant-isolation.e2e-spec.ts` + 27 in three services + this record                                        | PASSED             |
| E2E gate | pr tests for the touched features                                       | `e2e-army/108-cursor-isolation.e2e.ts` tagged `feat:mz-sales-invoices`, `feat:mz-purchase-bills`, `feat:mz-journals` (lvl:api)  | PASSED (hub stack) |

**Commands and output** (at the tested commit):

```text
$ DATABASE_URL=…mizano_e2e_108 node node_modules/jest/bin/jest.js --config ./test/jest-e2e.json tenant-isolation
Test Suites: 1 passed, 1 total   Tests: 13 passed, 13 total
$ node node_modules/jest/bin/jest.js --maxWorkers=2 src/modules/sales/services/invoices.service.spec.ts \
    src/modules/purchases/services/bills.service.spec.ts src/modules/accounting/services/journals.service.spec.ts
Test Suites: 3 passed, 3 total   Tests: 155 passed, 155 total
$ pnpm exec tsc --noEmit && pnpm exec tsc --noEmit -p test/tsconfig.e2e.json   # clean
$ pnpm exec eslint "{src,test}/**/*.ts"                                        # clean
```

**Mutation check** (issue test plan + CTO round-2 targets: drop one tenant filter, confirm the matching test fails, restore):

| Removed tenant guard                                                                                 | Failing test                   |
| ---------------------------------------------------------------------------------------------------- | ------------------------------ |
| `bills.service.ts:127` `deletedAt: null` in `findOne`                                                | AC1 soft-deleted/malformed ids |
| `bills.service.ts:78` `organizationId` in list                                                       | AC2 invoice and bill lists     |
| `invoices.service.ts:211` / `journals.service.ts:237` `organizationId` in `findOne`                  | AC1 every foreign id           |
| `aging-reports.service.ts:171` `organizationId` in payables aging                                    | AC2 AP aging                   |
| `report-utils.ts:230` org filter on line totals plus the account-list filter of either trial balance | AC2 trial balances             |
| `jwt.strategy.ts:23` `ignoreExpiration: true`                                                        | AC3 expired token              |
| `journals.service.ts` cursor guard lost `organizationId` (round 2)                                   | AC2b cursor 404                |
| `aging-reports.service.ts:187` `organizationId` in the vendor-credit query (round 2)                 | AC2 AP aging (T3)              |
| `invoices.service.ts:149` count query lost `organizationId` (round 2)                                | AC2c invoice `meta.total`      |

Each trial balance has two tenant filters: the account list and the line totals. Removing only one of them leaks nothing, because foreign totals are keyed by foreign account ids that the org-scoped account list never holds. The suite passes in that case, which is correct. Removing both makes the AC2 trial balance test fail.
