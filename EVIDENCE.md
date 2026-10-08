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

## Issue #110 (API readiness endpoint)

- **Tested commit SHA**: `9527405cbf64b3b9a605c72cc4c12f0f133199bd` (no source change after it; later commits touch only this file)
- **Branch**: `ai/110`
- **Run date**: 2026-10-08
- **Environment**: throwaway local PostgreSQL 16 on port 55481 (fresh database, `prisma migrate deploy`), `REDIS_URL` blank, Jest `--runInBand`. The DB query and `fs.promises.statfs` are stubbed inside the spec; the app, routing and guards are real.

| REQ ID | Requirement                                                 | Verification                                                                                       | Status   |
| ------ | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | -------- |
| AC1    | Healthy DB and enough disk returns 200 with the JSON shape  | `health-ready.e2e-spec.ts`: AC1, AC1 boundary (exactly 10 % passes), `/health` liveness unchanged  | VERIFIED |
| AC2    | Failing DB returns 503 within the timeout, names `db`       | `health-ready.e2e-spec.ts`: AC2 and AC2 timeout (hung query, 216 ms, one shared probe)             | VERIFIED |
| AC3    | Free space below the threshold returns 503, names `disk`    | `health-ready.e2e-spec.ts`: AC3 (below threshold, statfs error, unrounded `bavail`, env fallbacks) | VERIFIED |
| AC4    | No connection strings, paths or tenant data in the response | `health-ready.e2e-spec.ts`: AC4 (DSN and path in thrown errors absent from body and warn logs)     | VERIFIED |
| AC5    | Change is ≤ ~200 lines                                      | `git diff --numstat`: implementation +96/−8 fits; branch total with tests does not (see below)     | PARTIAL  |

- **Test command** (from `apps/api`, `DATABASE_URL` pointing at the throwaway database):
  ```bash
  npx jest --config ./test/jest-e2e.json --runInBand health-ready
  ```
- **Result**: `Test Suites: 1 passed, 1 total`, `Tests: 13 passed, 13 total` (26.3 s).
- **Static checks on the changed files**: `eslint src/health test/health-ready.e2e-spec.ts` no output, `tsc --noEmit -p tsconfig.json` no output, `prettier --check` clean.
- **Line counts** (`git diff origin/master...HEAD --numstat`, measured on this branch): `readiness.service.ts` +86, `health.controller.ts` +8/−8, `health.module.ts` +2 (implementation +96/−8, within ~200); `apps/api/test/health-ready.e2e-spec.ts` +184; `docs/DEVELOPMENT.md` +6/−1; `AI_QUESTIONS.md` +7; this file +24. Whole branch: 7 files, +317/−9. AC5 is therefore met for the implementation only: service plus e2e spec alone is 270 lines, so the ~200 line figure is exceeded once tests are counted. Marked PARTIAL, not VERIFIED.
- **Not run locally**: the full API unit suite and the web suite (the full suite runs on GitHub-hosted CI after the push). Status of those is unverified here. No e2e-army test was added: the endpoint has no UI flow, and its request-level behaviour is covered by the e2e spec above.
