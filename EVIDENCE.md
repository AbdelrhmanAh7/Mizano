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

# Evidence: #125 AP subledger vs control-account reconciliation

- **Tested SHA**: `48855ecb7187b35cb740d22c71d7d69cc705cea0` (branch `ai/125`, base `615060e`). Later commits on the branch only touch this file.
- **Implementer**: Claude Code (claude-opus-5-5). This is author evidence, not an independent review.
- **Environment**: macOS, Node v26.10.0, a throwaway PostgreSQL 16 cluster on a fresh database (`prisma migrate deploy`), `REDIS_URL=` blank.

| AC  | Requirement                                                               | Verified by                                                                                                                                                                                         |
| --- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC1 | Approved and paid bills give `ok: true`, `difference: 0`                  | e2e `@issue-125 AC1` (bills, a full payment, a partial payment, a voided payment, applied and unapplied vendor credits: 444.0000 on both sides); unit `AC1` (exact decimals)                        |
| AC2 | A corrupted subledger balance gives `ok: false` with the exact difference | e2e `@issue-125 AC2` (`balanceDue` +12.34 gives `difference: "12.3400"`); unit `AC2`                                                                                                                |
| AC3 | Voided and draft bills are excluded                                       | e2e `@issue-125 AC3` (a draft of 1138.86 and a VOID bill of 885.78 hold balances but the total stays 444.0000); unit scope test (status filter is `OPEN, PARTIALLY_PAID, PAID, OVERDUE`)            |
| AC4 | Another tenant never affects the result                                   | e2e `@issue-125 AC4` (tenant B has a bill and a +7 corruption; A stays 444.0000/ok, B shows 7.0000); unit scope test (`organizationId` on every query)                                              |
| AC5 | `asOf` filters both sides consistently                                    | e2e `@issue-125 AC5` (as of day −5: 1268.0000; day −2: 1326.0000; day −11: 0; both sides equal, including a payment voided after `asOf`); unit scope test (end of the `asOf` UTC day on both sides) |
| AC6 | ≤ ~300 lines, no migrations                                               | `git diff --stat master..48855ec`: production code is 153 lines (service 135, controller 10, module 8); the unit and e2e tests add 332 (484 in total). No file under `prisma/migrations` changed    |

Commands and results at the tested SHA:

```text
npx turbo lint type-check test --force                -> Tasks: 12 successful, 12 total
  api:test                                            -> Test Suites: 137 passed; Tests: 2202 passed
  @mizano/web:test                                    -> Test Suites: 48 passed; Tests: 458 passed
npx jest --config ./test/jest-e2e.json (apps/api)     -> Test Suites: 12 passed; Tests: 263 passed
  ap-reconciliation.e2e-spec.ts                       -> 6 passed
```

The failing-first commit `3171958` ran before the implementation: the 6 e2e tests failed with HTTP 404, and the unit suite failed to compile because the service did not exist.

Not covered: bills have no void route today, so the VOID-bill fixture sets its status directly on a never-posted bill. Posting, approval and payment code is unchanged (#11, #12, #94).
