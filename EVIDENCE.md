# EVIDENCE.md — Diagnosis for Issue #102: Post-merge CI red after #98

## Overview

- **Issue**: #102 (Post-merge: CI red after #98)
- **Base Commit (`master`)**: `615060ed6294e16375a1f1ea9385cb7e812cd24f`
- **Tested Head SHA**: `526c43b4a15190ed7c5f081b183268b3118ccb35`
- **Audit Date**: 2026-10-07
- **Failing Check**: Deploy to GCP (Workflow: `Deploy to Production`)
- **Root Cause Classification**: **(B) & (C)** — Infrastructure Unreachable & Workflow Configuration

### One-Line Justification

The deployment target GCP VM host is unreachable on port 22 (`dial tcp ***:22: i/o timeout`), and `.github/workflows/deploy.yml` automatically triggers on every `master` CI completion instead of being gated for the target Raspberry Pi 5 platform.

---

## Requirements Verification Matrix

| REQ ID    | Requirement                                                                                  | Verification Method                             | Status |
| --------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------- | ------ |
| REQ-102-1 | Capture failing run ID, URL, and exact failing step output from 615060e                      | `gh run view 37540990404 --log-failed`          | PASSED |
| REQ-102-2 | Investigate historical "Deploy to Production" runs prior to #98                              | `gh run list --workflow "Deploy to Production"` | PASSED |
| REQ-102-3 | Classify root cause (A vs B vs C) with justification                                         | Analysis against build logs & network errors    | PASSED |
| REQ-102-4 | Propose change and default decision in `AI_QUESTIONS.md` without modifying workflows/secrets | Review against repo owner policy                | PASSED |
| REQ-102-5 | Record exact tested commit SHA and verify local suite                                        | Git SHA inspection & `pnpm lint` / gate test    | PASSED |

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
- **(B) Infrastructure Failure**: Host SSH port 22 is timing out (`dial tcp ***:22: i/o timeout`). The GCP VM is either stopped, firewall-blocked, or deleted.
- **(C) Workflow Trigger Failure**: `.github/workflows/deploy.yml` triggers automatically on `workflow_run` from `CI` on `master`. Because `rollout-exemption.json` compares the full commit history `baseline..HEAD` against `f8bf699319a37198b585cb67b650069da4c6cd4d`, any master commit after initial runtime merges evaluates `should_deploy=true`, triggering a deployment to an obsolete/offline GCP VM.
