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

# EVIDENCE.md — Pi digest deploys, backups and restore drill (#41)

- **Issue**: #41 ([Pi] Exact-digest deploys, nightly backups and a tested restore/rollback)
- **Base commit (`master`)**: `615060ed6294e16375a1f1ea9385cb7e812cd24f`
- **Tested commit**: `b2a7bfe78859b357aa56a530c9544d7a97546e8b` (last code commit on `ai/41`; this file is added after it)
- **Date**: 2026-10-08, macOS dev machine (no Docker, no Raspberry Pi)
- **e2e-army**: no test added. The change is deploy/ops shell and Node scripts under `deploy/pi/`; no UI or user-facing flow changes.

## Requirements

| REQ ID | Requirement                                                           | How it is verified                                                                                                              | Status                              |
| ------ | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| REQ-1  | Deploy by digest for a tested SHA, migrate, restart, health, record   | `deploy.sh` (from #48) plus pre-deploy backup and `deploy-evidence.log` (SHA, digests, health JSON, service states)             | Code done; not run on a Pi          |
| REQ-2  | One-command rollback; forward-only migration policy documented        | `rollback.sh` (from #48) now records evidence; README section 4 "Migration policy (forward-only)" and live restore steps        | Code done; not run on a Pi          |
| REQ-3  | Nightly encrypted `pg_dump` + originals, off-site, retention          | `backup.sh` + systemd timer (from #48); new `BACKUP_REMOTE` rsync copy, FAILED status on copy failure                           | Code done; not run on a Pi          |
| REQ-4  | Restore drill into scratch DB + seeded smoke                          | `restore-drill.sh`: age check, originals sha256, balanced journals, `migrate deploy`, `drill-smoke.mjs`, timings in `drill.log` | Offline tests pass; not run on a Pi |
| AC-1   | A deploy and a rollback performed on the Pi with evidence             | Needs the Pi, registry digests from #38 and operator access                                                                     | **NOT VERIFIED**                    |
| AC-2   | Restore drill from the previous night's backup succeeds, with timings | Needs the Pi, a real nightly backup and the age private key                                                                     | **NOT VERIFIED**                    |

## Commands and output (tested commit)

```text
$ bash deploy/pi/scripts/test/restore-drill.test.sh
ok   no backup found
ok   stale backup is refused
ok   max age 0 accepts any backup
ok   newest backup is picked
ok   originals match
ok   no intake jobs is fine
ok   missing original fails
ok   checksum mismatch fails
ok   traversal key is refused
all passed

$ node --test deploy/pi/scripts/test/
✔ registers a throwaway org, logs in and checks the trial balance
✔ fails when the trial balance does not balance
✔ fails on an unexpected status without echoing the response body
✔ times out when the API never reports healthy
ℹ tests 4  ℹ pass 4  ℹ fail 0

$ bash -n deploy/pi/scripts/*.sh   # syntax OK
$ prettier --check deploy/pi/README.md deploy/pi/scripts/*.mjs deploy/pi/scripts/test/*.mjs
All matched files use Prettier code style!
```

A full drill run with stub `docker` and `age` binaries on `PATH` (not committed) exercised the control flow: the happy path wrote `OK backup=db-20261008T003000Z.dump.age image=... tables=42 originals=1 decrypt=0s restore=0s checks=0s smoke=0s total=0s` to `drill.log` and removed the network, containers and work dir. A tampered original stopped the drill with `DRILL FAILED: original checksum mismatch` and a `FAILED` line.

Not run: `shellcheck` (not installed on this machine), any Docker command, and anything on the Pi. The API/web suites were not rerun because no application code changed.
