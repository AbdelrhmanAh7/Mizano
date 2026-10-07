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

## Overview

| Item                 | Value                                                                                    |
| -------------------- | ---------------------------------------------------------------------------------------- |
| Master SHA at report | `615060ed6294e16375a1f1ea9385cb7e812cd24f` (merge of PR #98)                             |
| Failing check        | `Deploy to GCP` job of workflow `Deploy to Production` (`.github/workflows/deploy.yml`)  |
| Failing run          | https://github.com/AbdelrhmanAh7/Mizano/actions/runs/37540990404 (job `112537411880`)    |
| Root cause class     | **(B) infrastructure** — the GCP VM behind `DEPLOY_HOST` does not answer on TCP port 22  |
| Introduced by #98?   | **No.** Same error on every deploy run since 2026-10-01, five commits before #98 merged  |
| Code fix in this PR  | None possible; this PR records the diagnosis and the owner decision in `AI_QUESTIONS.md` |
| Tested head SHA      | recorded in the final commit of this branch, see "Tested commit" below                   |

## What PR #98 changed

`git diff --stat 615060e~1 615060e`:

```text
 EVIDENCE.md                  | 144 +++++++++++++++++++++++++++++++++++++++++++
 docs/planning/MERGE-QUEUE.md |  86 ++++++++++++++++++++++++++
 2 files changed, 230 insertions(+)
```

Two markdown files only. No source, lockfile, compose, env or workflow change.

## CI status on the merge commit

`gh api repos/AbdelrhmanAh7/Mizano/commits/615060ed6294e16375a1f1ea9385cb7e812cd24f/status`:

```text
success
Install Dependencies success
Lint & Type Check success
Unit Tests success
Build success
```

`gh api --paginate .../commits/615060e.../check-runs` (repo workflows only, AI-implementer jobs omitted):

```text
Health Check               | skipped | run 37540990404
Deploy to GCP              | failure | run 37540990404  <-- the only red check
Build & Push Docker Images | success | run 37540990404
Verify CI Passed           | success | run 37540990404
Unit Tests                 | success | run 37540682498
Build                      | success | run 37540682498
Lint & Type Check          | success | run 37540682498
Install Dependencies       | success | run 37540682498
```

The `CI` workflow (lint, type-check, unit tests, build) is green on master. The red check is
the deployment workflow that `workflow_run` chains after CI.

## Failing step output

`gh run view 37540990404 --log-failed`, step `Clean up server disk and prepare directory`
(`appleboy/ssh-action@v1.0.3`, first SSH step of the `Deploy to GCP` job):

```text
2026-10-06T22:41:25.7112782Z ##[group]Run appleboy/ssh-action@v1.0.3
2026-10-06T22:41:25.7113594Z   host: ***
2026-10-06T22:41:25.7116224Z   port: 22
2026-10-06T22:41:25.7118237Z   timeout: 30s
2026-10-06T22:41:26.8143179Z ======CMD======
2026-10-06T22:41:26.8143880Z echo "=== Disk before cleanup ==="
2026-10-06T22:41:26.8148564Z ======END======
2026-10-06T22:41:56.8152060Z 2026/10/06 22:41:56 dial tcp ***:22: i/o timeout
```

The SSH client never reaches the host. Nothing from the repository runs on the VM before the
failure, so no repository content can influence this step.

## The failure predates #98

`gh run list --workflow deploy.yml --limit 100` (conclusion, head SHA, created):

```text
37540990404 failure 615060e 2026-10-06T22:30:17Z   <- merge of #98 (MZ #102 opened on this)
37403603742 failure b83d72b 2026-10-06T02:19:58Z   <- parent of #98, same error (below)
37394379413 failure 50db1e8 2026-10-06T00:30:34Z
37392525356 failure 8529fff 2026-10-06T00:09:53Z
37208787051 failure 987a109 2026-10-04T14:18:42Z
37132798411 failure 82f02e4 2026-10-03T15:18:47Z
37086511261 failure 56b9a59 2026-10-03T01:32:52Z
37065100781 failure 1d37f28 2026-10-02T21:09:12Z
37063759596 failure 9951402 2026-10-02T20:56:24Z
37041580340 failure 3d0c719 2026-10-02T17:34:08Z
37027962235 failure a58ce52 2026-10-02T15:34:42Z
36854180434 failure 40176d6 2026-10-01T11:15:02Z   <- first failure after the last green run
33939629464 success 99415b7 2026-09-05T02:38:07Z   <- last green deploy
```

Parent-of-#98 run `37403603742` (`gh run view 37403603742 --log-failed`):

```text
2026-10-06T02:29:27.0159571Z 2026/10/06 02:29:27 dial tcp ***:22: i/o timeout
```

First failing run `36854180434` (`gh run view 36854180434 --log-failed`):

```text
2026-10-01T11:30:08.8250369Z 2026/10/01 11:30:08 dial tcp ***:22: i/o timeout
```

Same step, same error, on every run from 2026-10-01 onward. The MZ #102 "CI red after #98"
alert is a false attribution: the Follow-up Manager compared the merge commit's checks against
"all green" instead of against the parent commit's checks.

## Workflow state at the time of this report

`gh workflow list --all`:

```text
AI implementers (Claude <-> Codex) | .github/workflows/ai-implementers.yml | disabled_manually
CI                                 | .github/workflows/ci.yml              | disabled_manually
Demo planning metadata             | .github/workflows/demo-planning.yml   | disabled_manually
Deploy to Production               | .github/workflows/deploy.yml          | disabled_manually
```

Both `CI` and `Deploy to Production` are now disabled by hand. No GitHub run will be produced
for this PR or for master after it merges until the owner re-enables them; the "post-merge master
run is green" checklist item therefore cannot be satisfied with a run link. The local gate
below is the substitute, and `AI_QUESTIONS.md` asks the owner which workflows to re-enable.

## Unrelated failure seen while reading the logs

Run `37629176009` (`AI implementers`, job `automerge`) fails with:

```text
/Users/abdelrahmanahmed/agents/nql-agents/bin/automerge.sh: line 103: syntax error near unexpected token `done'
##[error]Process completed with exit code 2.
```

That script lives on the Mac mini hub, outside this repository. Reported in `AI_QUESTIONS.md`,
not fixed here.

## Regression test

None added. The failing behaviour is TCP reachability of an external VM from a GitHub-hosted
runner. No test in this repository can fail for that reason on master and pass after a repository
change, and the owner rule forbids editing `.github/workflows`. `AI_QUESTIONS.md` records the
reachability preflight the owner can add to the deploy job instead.

## Local gate on this branch

Run on commit `628525baf084e4a2ba55c3dab763e05cb43a4e70` (the diagnosis commit; the final commit
only adds this section). Mac mini, Node v26.10.0, offline `pnpm install --frozen-lockfile`
followed by `pnpm db:generate`.

```text
$ node_modules/.bin/prettier --check EVIDENCE.md AI_QUESTIONS.md
Checking formatting...
All matched files use Prettier code style!

$ pnpm lint
 Tasks:    4 successful, 4 total
LINT_EXIT=0

$ pnpm type-check
 Tasks:    6 successful, 6 total
TYPECHECK_EXIT=0

$ cd apps/web && npx jest
Test Suites: 48 passed, 48 total
Tests:       458 passed, 458 total

$ node apps/api/_run_tests.js
FAIL src/modules/import-export/services/import.service.hardening.spec.ts
Test Suites: 1 failed, 135 passed, 136 total
Tests:       4 failed, 2193 passed, 2197 total
```

The one API failure is pre-existing and environment-dependent, not caused by this branch (which
changes two markdown files): all four assertions fail with `TypeError: csv is not a function`
from `import * as csv from 'csv-parser'` in `apps/api/src/modules/import-export/services/import.service.ts`
line 5, called at lines 87 and 1488. The same spec fails identically when run alone on this
machine under Node v26.10.0. The `Unit Tests` check on master `615060e` (GitHub runner, Node 20
per `deploy.yml` and `ci.yml`) is `success`, so the difference is the local Node major, not the
code. Reported, not fixed here.

## Tested commit

- Diagnosis and gate: `628525baf084e4a2ba55c3dab763e05cb43a4e70`
- Final head (this section added, `prettier --check` re-run on it): see the last commit on
  branch `ai/113`; its SHA is in the PR description.
