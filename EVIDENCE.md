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

# Issue #102: Post-merge CI red after #98

## Overview

- **Issue**: #102 (Post-merge: CI red after #98)
- **Base Commit (`master`)**: `615060ed6294e16375a1f1ea9385cb7e812cd24f`
- **Tested Commit SHA**: `373cd82487a2050b2b7ff8af1766db1fee891b09` (from `git rev-parse HEAD`; the commit the tests ran on; the later commit changes only `EVIDENCE.md`)
- **Audit Date**: 2026-10-08
- **Failing Check**: Deploy to GCP (Workflow: `Deploy to Production`)
- **Root Cause Classification**: **(B)** — deployment host unreachable over SSH (`dial tcp ***:22: i/o timeout`). Contributing observation: documentation-only merges still trigger a rollout (owner decision needed; see `AI_QUESTIONS.md`).
- **Fix status**: not fixed by this PR. Both fixes are owner actions (see `AI_QUESTIONS.md`); #102 stays open.

### One-Line Justification

`CI` on `615060e` passed; the follow-on `Deploy to GCP` job failed because the host in `DEPLOY_HOST` did not accept an SSH connection on port 22 (`dial tcp ***:22: i/o timeout`). Root cause is an SSH connection timeout to the host in `DEPLOY_HOST`; resolution options are documented in `AI_QUESTIONS.md` for owner action.

---

## Requirements Verification Matrix

| REQ ID    | Requirement                                                                                     | Verification Method                                                                                        | Status |
| --------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------ |
| REQ-102-1 | Capture failing run ID, URL, and exact failing step output from 615060e                         | `gh run view 37540990404 --log-failed`                                                                     | PASSED |
| REQ-102-2 | Investigate historical "Deploy to Production" runs prior to #98                                 | `gh run list --workflow "Deploy to Production"`                                                            | PASSED |
| REQ-102-3 | Classify root cause (A vs B vs C) with justification                                            | Analysis against build logs & network errors                                                               | PASSED |
| REQ-102-4 | Propose options and technical analysis in `AI_QUESTIONS.md` without modifying workflows/secrets | Review against repo owner policy                                                                           | PASSED |
| REQ-102-5 | Bind evidence to the verified tree and record exact tested SHA                                  | Tested SHA `373cd82487a2050b2b7ff8af1766db1fee891b09` (from `git rev-parse HEAD`), local gate tests passed | PASSED |
| REQ-102-6 | Preserve #95 audit evidence                                                                     | #95 audit preserved above; `docs/planning/EVIDENCE-95.md` removed                                          | PASSED |

---

## Real Failing Run Evidence (Commit `615060e`)

- **Run ID**: `37540990404`
- **Run URL**: https://github.com/AbdelrhmanAh7/Mizano/actions/runs/37540990404
- **Workflow**: `Deploy to Production`
- **Head SHA**: `615060ed6294e16375a1f1ea9385cb7e812cd24f`
- **Job**: `Deploy to GCP` (ID `112537411880`)
- **Failing Step**: `Clean up server disk and prepare directory` (Action: `appleboy/ssh-action@v1.0.3`)
- **Exact Step Output**:

```text
2026-10-06T22:41:25.7112782Z ##[group]Run appleboy/ssh-action@v1.0.3
2026-10-06T22:41:25.7113179Z with:
2026-10-06T22:41:25.7113594Z   host: ***
2026-10-06T22:41:25.7113899Z   username: ***
2026-10-06T22:41:25.7115963Z   key: ***
2026-10-06T22:41:25.7116224Z   port: 22
...
2026/10/06 22:41:56 dial tcp ***:22: i/o timeout
```

---

## Historical Runs & Pre-Existing Status

- **Pre-Existing Failure**: The GCP deployment check was already continuously failing before PR #98.
- **First failing run in this streak**: `36854180434` (2026-10-01T11:15:02Z, commit `40176d6`), same `dial tcp ***:22: i/o timeout`. Every `Deploy to Production` run on master since then has failed.
- **Recent Consecutive Failures**:
  - Run `37540990404` (2026-10-06T22:30:17Z, commit `615060e`): `dial tcp ***:22: i/o timeout`
  - Run `37403603742` (2026-10-06T02:19:58Z, commit `b83d72b`): `dial tcp ***:22: i/o timeout`
  - Run `37394379413` (2026-10-06T00:30:34Z, commit `50db1e8`): `dial tcp ***:22: i/o timeout`
  - Run `37392525356` (2026-10-06T00:09:53Z, commit `8529fff`): `dial tcp ***:22: i/o timeout`
  - Run `37208787051` (2026-10-04T14:18:42Z, commit `987a109`): `dial tcp ***:22: i/o timeout`
  - Run `37132798411` (2026-10-03T15:18:47Z, commit `82f02e4`): `dial tcp ***:22: i/o timeout`
  - Run `37086511261` (2026-10-03T01:32:52Z, commit `56b9a59`): `dial tcp ***:22: i/o timeout`
  - Run `37065100781` (2026-10-02T21:09:12Z, commit `1d37f28`): `dial tcp ***:22: i/o timeout`
  - Run `37063759596` (2026-10-02T20:56:24Z, commit `9951402`): `dial tcp ***:22: i/o timeout`
  - Run `37063704966` (2026-10-02T20:55:53Z, commit `9951402`): `dial tcp ***:22: i/o timeout`
- **Last Green Run Prior to #98**:
  - Run ID: `33939629464`
  - Run URL: https://github.com/AbdelrhmanAh7/Mizano/actions/runs/33939629464
  - Head SHA: `99415b7b70e975e923013eabd027de7aca6bb032` (Date: 2026-09-05T02:34:02Z)
  - Outcome: Green because the deploy step was **skipped** by the scope filter (`should_deploy=false`).
  - Last run where SSH connection actually succeeded: Run `23718725622` (2026-03-29T20:48:05Z, commit `f8bf699319a37198b585cb67b650069da4c6cd4d`).

---

## Root Cause Classification & Verification

- **Not (A)**: PR #98 introduced only markdown planning files (`EVIDENCE.md`, `docs/planning/MERGE-QUEUE.md`). The Docker build step `Build & Push Docker Images` passed in 10m41s (Job ID: `112533724730`). No application code, build, or test broke.
- **(B) Infrastructure Failure (established)**: the TCP connection to the host in `DEPLOY_HOST` on port 22 timed out after 30 s (`dial tcp ***:22: i/o timeout`). The log does not show why. Possible causes (none confirmed): the VM is stopped or deleted, a firewall rule blocks GitHub-hosted runners, or the host IP changed. Confirming one needs GCP console access.
- **Contributing observation**: `.github/workflows/deploy.yml` runs after every successful `CI` on `master`. Its scope gate compares all files changed in `f8bf699..HEAD` with `docs/planning/rollout-exemption.json`; since runtime and workflow changes landed after that baseline, it evaluated `should_deploy=true` for every master commit, including planning-only #98. Changing the trigger or the gate is a proposed option for the owner, not a correction this PR can make: `docs/DEVELOPMENT.md` still names this workflow as the production pipeline, and `deploy/pi/README.md` says the Pi deployment is unverified.

---

## Local Verification & Tested SHA

The changes in this PR are documentation-only (`AI_QUESTIONS.md`, `EVIDENCE.md`, `docs/agents/review-lessons.md`). The failing `Deploy to GCP` step requires SSH connectivity to the remote host.

- **Verified Commit SHA**: `373cd82487a2050b2b7ff8af1766db1fee891b09` (from `git rev-parse HEAD`; the commit the tests ran on; the later commit changes only `EVIDENCE.md`)
- **Local Checks Executed**:

```bash
# 1. Rollout scope unit tests (offline gate)
python3 scripts/test_demo_rollout_scope.py
# Ran 12 tests in 0.028s, OK

# 2. Monorepo lint check
pnpm lint
# turbo lint: 4 successful, 4 cached, 4 total (FULL TURBO)

# 3. Prettier check
npx prettier --check EVIDENCE.md AI_QUESTIONS.md docs/agents/review-lessons.md
# All matched files use Prettier code style!
```

- **Diff from tested SHA to HEAD**: `git diff --stat 373cd82487a2050b2b7ff8af1766db1fee891b09..HEAD` shows only `EVIDENCE.md` changed.
