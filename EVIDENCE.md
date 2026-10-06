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

# Evidence: issue #39, Pi 5 compose profile (8GB budget, SSD storage)

The issue has no REQ ids, so the ids below are scope (S) and acceptance (A) items in the order the issue lists them. This branch builds on PR #48 (`deploy/pi/`, merged as 1a07d44). Base: `master` @ b83d72b.

**Status: the acceptance items (A1, A2) are NOT verified.** They need a real Raspberry Pi 5, which this environment does not have. There was also no Docker, no Redis, and Postgres could not start inside the sandbox. Everything below was checked offline on macOS (arm64, Node 26).

| Id  | Requirement                                                                                       | Where                                                                                                                                                                                                                                 | How verified here                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | Compose with Postgres 16, Redis, API, web, intake worker, reverse proxy                           | `deploy/pi/docker-compose.pi.yml` (`worker` = `node dist/worker.js`; proxy = `cloudflared`); `apps/api/src/worker.ts`, `worker.module.ts`; `INTAKE_WORKER_ENABLED` in `intake-processor.service.ts`                                   | YAML parsed with js-yaml and asserted: 7 services, health-gated `depends_on`, no published ports. `nest build` emits `dist/worker.js`. `node dist/worker.js --healthcheck` exits 1 when there is no heartbeat. `worker.module.spec.ts` resolves the intake processor's whole DI graph without the HTTP app. `intake-processor.service.spec.ts` covers the flag (off with Redis = no consumer; off without Redis = still consumes). `worker-heartbeat.spec.ts` covers the heartbeat. **`docker compose config` was not run here (no Docker).** |
| S2  | Per-service memory limits well under 8GB; Postgres tuned                                          | compose `mem_limit` = `memswap_limit`: 1536 + 256 + 1024 + 2048 + 512 + 128 = **5504 MiB**; Postgres `shared_buffers=384MB`, `work_mem=8MB`, `max_connections=40`, etc.; Node heaps capped                                            | Sum and `mem_limit == memswap_limit` asserted from the parsed YAML. Real usage: see A1.                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| S3  | Data (Postgres, originals, backups) on the SSD, never the SD card; log rotation and size caps     | binds under `MIZANO_DATA_DIR` with `create_host_path: false`; `assert_ssd` in `scripts/lib.sh` (refuses `/dev/mmcblk*`); json-file logs 3 × 10m; `docker-daemon.json`, `journald-mizano.conf`                                         | Parsed YAML: every volume is a non-creating bind under `MIZANO_DATA_DIR`, and every service has the 10m log cap. `assert_ssd` was exercised with a `findmnt` shim in 6 cases: SD card refused, missing subdirs refused, sda and nvme accepted, unknown device refused, missing dir refused.                                                                                                                                                                                                                                                   |
| S4  | Restart policies, health checks, start order; one-command start/stop in docs/DEVELOPMENT.md       | `restart: unless-stopped` on long-running services; health checks on postgres (TCP), redis, api, worker, web; `scripts/stack.sh check/up/down/stop/status/logs`; `systemd/mizano-stack.service`; docs/DEVELOPMENT.md "Raspberry Pi 5" | YAML assertions. `shellcheck -x` 0.10.0 clean on all `deploy/pi/scripts/*.sh`. `stack.sh check` (against the template) and the usage error were run locally.                                                                                                                                                                                                                                                                                                                                                                                  |
| S5  | `.env.pi` template with every required variable, no secrets committed; `pnpm env:check` covers it | `deploy/pi/.env.pi.example`; `.gitignore` (`.env.pi`, `.env.pi.*`); `scripts/check-env.mjs`; `pnpm env:check`, `pnpm test:deploy`                                                                                                     | `pnpm test:deploy`: 14/14 pass, including the template covering every compose variable, no values in messages, and DATABASE_URL vs credentials. CLI runs: `pnpm env:check` (local: Using .env.local); `--template` OK; `APP_ENV=pi` with no file exits 1; the template as the file lists every placeholder; a generated valid file exits 0. `git check-ignore` confirms `deploy/pi/.env.pi` is ignored and the template is tracked.                                                                                                           |
| A1  | 24h under the demo workload without OOM kills or swap thrash (`docker stats`/`free` samples)      | `scripts/soak-sample.sh`, `scripts/soak-report.sh`, `systemd/mizano-soak.{service,timer}`, README section 8                                                                                                                           | **Not verified (needs the Pi).** Tooling only: `soak-report.sh` was run on synthetic 24h/2h sample files and gave PASS, FAIL (kernel OOM), FAIL (worker restart), INCOMPLETE (2h) and SWAP-THRASH (46.67 pages/s), with the expected exit codes.                                                                                                                                                                                                                                                                                              |
| A2  | Reboot recovers all services automatically                                                        | `systemd/mizano-stack.service` (`RequiresMountsFor`, `stack.sh up`/`stop`), restart policies, README section 5 reboot test                                                                                                            | **Not verified (needs the Pi).**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

## Commands run (tested head = the branch tip that contains this file)

- `node apps/api/_run_tests.js`: 137/138 suites, 2200/2204 tests pass. The 4 failures are in `import.service.hardening.spec.ts` (`TypeError: csv is not a function`). They reproduce identically on `master` @ b83d72b in a clean worktree, so they predate this branch (local Node 26; CI uses Node 20).
- `node apps/api/_run_tests.js --testPathPattern="worker|intake"`: all pass.
- `cd apps/web && npx jest`: 48/48 suites, 458/458 tests pass.
- `apps/api`: `eslint "src/**/*.ts" --max-warnings 0` clean; `tsc --noEmit` and `tsc --noEmit -p test/tsconfig.e2e.json` clean; `nest build` OK.
- `node --test scripts/check-env.test.mjs`: 14/14 pass.
- `shellcheck -x deploy/pi/scripts/*.sh` (v0.10.0): clean.

## To close the issue (on the Pi)

1. Build and push images from this branch's merge commit (#38 pipeline), then `deploy.sh <sha> <api-digest> <web-digest>`.
2. `stack.sh check`, then `stack.sh up`. Confirm `docker compose config` resolves and all services are `healthy`.
3. Upload a document and confirm the worker (not the api) processes it: the `worker` logs show the job.
4. README section 8: 24h soak under the acceptance-contract workload. Attach the `soak-report.sh` output and `stats.log` excerpts.
5. README section 5: reboot test. Attach `stack.sh status` after boot and the time to healthy.

Known limitation: the worker image does not yet bake OCR language data. Without `INTAKE_TESSDATA_DIR`, tesseract.js would try a runtime download, which the CPU-only mandate forbids. That belongs to the CPU extraction issue; `env:check` warns about it.
