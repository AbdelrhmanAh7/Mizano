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

# EVIDENCE.md — Post-merge CI red after #98 (#113, MZ #102)

| Item            | Value                                                                                    |
| --------------- | ---------------------------------------------------------------------------------------- |
| Master SHA      | `615060ed6294e16375a1f1ea9385cb7e812cd24f` (merge of PR #98)                             |
| Red check       | `Deploy to GCP`, workflow `Deploy to Production`, run 37540990404                        |
| Observed cause  | TCP 22 connection to `DEPLOY_HOST` times out; the underlying reason is unknown           |
| Caused by #98?  | No. The same error is on every deploy run since 2026-10-01                               |
| Code fix        | `.github/workflows/deploy.yml` deleted in this PR (CTO decision: GCP server unreachable) |
| Regression test | `apps/api/test/ci-health.e2e-spec.ts` (AC1: API boots and `/health` healthy)             |

## What PR #98 changed

`git diff --stat 615060e~1 615060e`: two markdown files (`EVIDENCE.md`, `docs/planning/MERGE-QUEUE.md`),
230 insertions. No source, lockfile, compose, env or workflow file.

## Same checks on the merge commit and its parent

`gh api repos/AbdelrhmanAh7/Mizano/commits/615060e.../check-runs` (repo workflows only):

```text
Deploy to GCP              | failure | run 37540990404   <-- the only red check
Build & Push Docker Images | success | run 37540990404
Unit Tests / Build / Lint & Type Check / Install Dependencies | success | run 37540682498
```

Parent `b83d72b`, run 37403603742 (`gh run view 37403603742 --log-failed`):

```text
2026-10-06T02:29:27.0159571Z 2026/10/06 02:29:27 dial tcp ***:22: i/o timeout
```

Merge commit, run 37540990404, step `Clean up server disk and prepare directory` (first SSH step):

```text
2026-10-06T22:41:56.8152060Z 2026/10/06 22:41:56 dial tcp ***:22: i/o timeout
```

`gh run list --workflow deploy.yml`: failure on all 12 runs from 36854180434 (2026-10-01, first
failure) to 37540990404; last success is 33939629464 (2026-09-05). MZ #102 compared the merge
commit with "all green" instead of with its parent.

## State of workflows

`.github/workflows/deploy.yml` was removed in this PR (not as a follow-up): the GCP server is
unreachable, so the deploy job cannot succeed, and the workflow was the only red check on master.
`CI` and `Deploy to Production` were `disabled_manually` after the diagnosis; removing the file
keeps the pipeline green even if the workflow is re-enabled. The deploy can be re-added when the
GCP server is back (DEPLOY issue #25).

## Regression test

`apps/api/test/ci-health.e2e-spec.ts` checks that the API boots and `/health` is healthy. This
test cannot detect the deploy SSH timeout; the canary for that failure class is the suggestion
in `AI_QUESTIONS.md` (CI changes stop at the owner).

Run 2026-10-09 on own Postgres 16 (local socket, fresh DB `mizano_113_e2e`, `prisma db push`),
`REDIS_URL=` blank:

```text
PASS test/ci-health.e2e-spec.ts (8.436 s)
  CI health after PR #98 (e2e)
    ✓ @e2e @flow:ci-health @issue-113 AC1: API boots and /health reports healthy (11 ms)
Tests: 1 passed, 1 total
```

## Tested commit

`56cf184` (`fix(#113): remove failing deploy workflow to restore green ci`). The only commit
after it edits this file.
