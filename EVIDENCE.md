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

# EVIDENCE.md — Stale and duplicate issue triage (#135)

- **Issue**: #135 · **Base (`master`)**: `615060ed6294e16375a1f1ea9385cb7e812cd24f`
- **Tested commit**: `d1d8295` (e2e salvage; no production code changed) · **Date**: 2026-10-08
- **Verdicts and owner commands**: [docs/planning/STALE-ISSUES.md](docs/planning/STALE-ISSUES.md)

| REQ | Acceptance criterion                                            | Verification                                                                                                                                                                  | Status                           |
| --- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| AC1 | #11/#12/#109 closed or re-scoped with a comment on master lines | Lines checked with `sed -n` on master; #75/#76 e2e moved into `accountant-journey.e2e-spec.ts` (tests tagged `@issue-135 AC1`) and passing; #111 spec run on unchanged master | Evidence ready; owner runs `gh`  |
| AC2 | One of #116/#103 closed                                         | `git diff --stat origin/master...origin/ai/{102,113}`: both docs-only; `gh workflow list --all`: Deploy `disabled_manually`                                                   | Owner action (`gh pr close 103`) |
| AC3 | #97 family off `ai-ready`                                       | `grep` of `apps/api/src`: ZATCA/e-invoicing only in `deep-search.service.ts:99-102`; `gh issue view` labels                                                                   | Owner action (label edit)        |
| AC4 | #82 and #84 merged first                                        | `gh pr view 82`: `MERGEABLE CLEAN APPROVED`; `gh pr view 84`: `MERGEABLE UNSTABLE draft=true`                                                                                 | Owner action (merge)             |

## Commands and results

```bash
# Postgres 16 throwaway cluster on 127.0.0.1:55535, fresh DB, prisma migrate deploy, REDIS_URL=
cd apps/api && npx jest --config ./test/jest-e2e.json --runInBand test/accountant-journey
Test Suites: 1 passed, 1 total
Tests:       37 passed, 37 total

# The two original branch files, run unchanged against master code
Tests:       73 passed, 73 total   # #75 + #76 accountant-journey.e2e-spec.ts

# PR #111's rules-normalize.spec.ts copied onto unchanged master
Tests:       23 passed, 23 total

npx eslint test/accountant-journey.e2e-spec.ts --max-warnings 0   # clean
npx tsc --noEmit -p test/tsconfig.e2e.json                         # clean
UNIT_RESULT_PLACEHOLDER
```

Not done here: no issue or PR was closed, labelled or merged (see [AI_QUESTIONS.md](AI_QUESTIONS.md)).
