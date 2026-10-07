# EVIDENCE.md — Diagnosis for Issue #102: Post-merge CI red after #98

## Overview

- **Issue**: #102 (Post-merge: CI red after #98)
- **Base Commit (`master`)**: `615060ed6294e16375a1f1ea9385cb7e812cd24f`
- **Tested tree**: the PR #103 head commit that last changed this file. A commit cannot contain its own SHA, so the exact final head and its `CI` run are recorded by the PR checks (`gh pr checks 103`), not here. Parent of that commit: `e680f4e2db25dc0fa0cb66c19b90216149c227ff`. The earlier value `526c43b` was a pre-squash snapshot and is withdrawn.
- **Audit Date**: 2026-10-07
- **Failing Check**: Deploy to GCP (Workflow: `Deploy to Production`)
- **Root Cause Classification**: **(B)** — deployment host unreachable over SSH (established). Contributing observation: documentation-only merges still trigger a rollout (see below; owner decision).
- **Fix status**: not fixed by this PR. Both fixes are owner actions (see `AI_QUESTIONS.md`); #102 stays open.

### One-Line Justification

`CI` on `615060e` passed; the follow-on `Deploy to GCP` job failed because the host in `DEPLOY_HOST` did not accept an SSH connection on port 22 (`dial tcp ***:22: i/o timeout`). Whether GCP is still the intended production/staging target is not established and must be confirmed by the owner.

---

## Requirements Verification Matrix

| REQ ID    | Requirement                                                                            | Verification Method                             | Status |
| --------- | -------------------------------------------------------------------------------------- | ----------------------------------------------- | ------ |
| REQ-102-1 | Capture failing run ID, URL, and exact failing step output from 615060e                | `gh run view 37540990404 --log-failed`          | PASSED |
| REQ-102-2 | Investigate historical "Deploy to Production" runs prior to #98                        | `gh run list --workflow "Deploy to Production"` | PASSED |
| REQ-102-3 | Classify root cause (A vs B vs C) with justification                                   | Analysis against build logs & network errors    | PASSED |
| REQ-102-4 | Propose options and a default in `AI_QUESTIONS.md` without modifying workflows/secrets | Review against repo owner policy                | PASSED |
| REQ-102-5 | Bind evidence to the verified tree and verify local checks                             | PR head checks, `pnpm lint`, offline gate test  | PASSED |

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
- **(B) Infrastructure Failure (established)**: the TCP connection to the host on port 22 timed out after 30 s (`dial tcp ***:22: i/o timeout`). The log does not show why. Possible causes, none confirmed: the VM is stopped or deleted, a firewall rule blocks GitHub-hosted runners, or the host IP changed. Confirming one needs GCP console access.
- **Contributing observation (not a confirmed defect)**: `.github/workflows/deploy.yml` runs after every successful `CI` on `master`. Its scope gate compares all files changed in `f8bf699..HEAD` with `docs/planning/rollout-exemption.json`; since runtime and workflow changes have landed after that baseline, it evaluates `should_deploy=true` for every master commit, including the planning-only #98. `AGENTS.md` says a documentation/planning-only change should not redeploy the application. Changing the trigger or the gate is a proposed option for the owner, not a correction this PR can make: `docs/DEVELOPMENT.md` still names this workflow as the production pipeline, and `deploy/pi/README.md` says the Pi deployment is unverified.

---

## Local Verification (follow-up commit on parent `e680f4e`)

The change is documentation-only (`AI_QUESTIONS.md`, `EVIDENCE.md`, `docs/agents/review-lessons.md`); the failing `Deploy to GCP` step needs SSH to the production host and cannot be reproduced locally. The repository CI commands were run on the working tree of the follow-up commit (pnpm 8.14.0 from `packageManager`, macOS, no database):

```text
pnpm install --frozen-lockfile && pnpm db:generate     # ok
pnpm turbo run lint --force                            # Tasks: 4 successful, 0 cached
pnpm turbo run type-check --force                      # Tasks: 6 successful, 0 cached
pnpm test                                              # api 136 suites / 2197 tests passed; web 48 suites / 458 tests passed
python3 scripts/test_demo_rollout_scope.py             # Ran 12 tests, OK
npx prettier --check AI_QUESTIONS.md EVIDENCE.md       # clean
```

`pnpm build` and the CI `db:push` step were not run locally; the PR `Build` and `Unit Tests` checks cover them.
