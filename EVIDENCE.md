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

**Status: the acceptance items (A1, A2) are NOT verified.** They need a real Raspberry Pi 5, which this environment does not have; there is no Docker here either. Everything below was checked offline on macOS (arm64, Node 26) at the tested head named under "Commands run".

| Id  | Requirement                                                                                       | Where                                                                                                                                                                                                                                                                                                                                                                                                | How verified here                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | Compose with Postgres 16, Redis, API, web, intake worker, reverse proxy                           | `deploy/pi/docker-compose.pi.yml` (`worker` = `node dist/worker.js`; proxy = `cloudflared`); `apps/api/src/worker.ts`, `worker.module.ts`; `INTAKE_WORKER_ENABLED` in `intake-processor.service.ts`                                                                                                                                                                                                  | YAML parsed with js-yaml and asserted: 7 services, health-gated `depends_on`, no published ports. `nest build` emits `dist/worker.js`. `node dist/worker.js --healthcheck` exits 1 when there is no heartbeat. `worker.module.spec.ts` resolves the intake processor's whole DI graph without the HTTP app. `intake-processor.service.spec.ts` covers the flag (off with Redis = no consumer; off without Redis = still consumes). `worker-heartbeat.spec.ts` covers the heartbeat. **`docker compose config` was not run here (no Docker).**                                                      |
| S2  | Per-service memory limits well under 8GB; Postgres tuned                                          | compose `mem_limit` = `memswap_limit`: 1536 + 256 + 1024 + 2048 + 512 + 128 = **5504 MiB**; Postgres `shared_buffers=384MB`, `work_mem=8MB`, `max_connections=40`, etc.; Node heaps capped                                                                                                                                                                                                           | Sum and `mem_limit == memswap_limit` asserted from the parsed YAML. Real usage: see A1.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| S3  | Data (Postgres, originals, backups) on the SSD, never the SD card; log rotation and size caps     | binds under `MIZANO_DATA_DIR` with `create_host_path: false`; `assert_ssd` in `scripts/lib.sh` (refuses `/dev/mmcblk*` and a data dir on `/`), called before the first write in `deploy.sh`, `backup.sh`, `healthcheck.sh` and `soak-sample.sh`; json-file logs 3 × 10m; `docker-daemon.json`, `journald-mizano.conf`                                                                                | Parsed YAML: every volume is a non-creating bind under `MIZANO_DATA_DIR`, and every service has the 10m log cap. Write-ordering exercised locally: with `MIZANO_DATA_DIR` missing, and with it present but reported by a `findmnt` shim as `/dev/mmcblk0p2` mounted at `/`, all four scripts exit 1 before creating anything (no `deployments.log`, `backups/`, `monitor/` or `soak/`).                                                                                                                                                                                                            |
| S4  | Restart policies, health checks, start order; one-command start/stop in docs/DEVELOPMENT.md       | `restart: unless-stopped` on long-running services; probes: postgres (`pg_isready` over TCP), redis, api `GET /api/health/ready` (503 until Postgres and Redis answer), worker (heartbeat), web `GET /api/health` (new Next route, 503 while the api readiness route fails); `scripts/stack.sh check/up/down/stop/status/logs`; `systemd/mizano-stack.service`; docs/DEVELOPMENT.md "Raspberry Pi 5" | YAML assertions (api probe ends in `/api/health/ready`, web probe in `/api/health`, both `CMD` form). `health.controller.spec.ts` (10 tests): 503 on a failing database query, on a Redis error or wrong round-trip value, 200 otherwise and without a cache manager. `app/api/health/route.test.ts` (3 tests): 200 when the api answers 2xx, 503 when it answers 503 or is unreachable. `bash -n` clean on every script; **shellcheck was not available in this environment** (the previous round ran 0.10.0 clean; the scripts changed since). `stack.sh check` and the usage error run locally. |
| S5  | `.env.pi` template with every required variable, no secrets committed; `pnpm env:check` covers it | `deploy/pi/.env.pi.example`; `.gitignore` (`.env.pi`, `.env.pi.*`); `scripts/check-env.mjs` (`SECRET_KEYS`: required credentials must be placeholders, optional ones empty, `DATABASE_URL` checked on its password); `pnpm env:check`, `pnpm test:deploy`                                                                                                                                            | `pnpm test:deploy`: 18/18 pass, including the template covering every compose variable, a real-looking `DATABASE_URL`, `POSTGRES_PASSWORD`, `CLOUDFLARE_TUNNEL_TOKEN` or `TELEGRAM_BOT_TOKEN` in the template being reported, a placeholder outside the URL password not counting, no values in messages, and the soak service list matching the compose file. CLI: `pnpm env:check --template` OK; `APP_ENV=pi` on the template itself lists the 12 placeholder keys and exits 1. `git check-ignore` confirms `deploy/pi/.env.pi` is ignored and the template tracked.                            |
| A1  | 24h under the demo workload without OOM kills or swap thrash (`docker stats`/`free` samples)      | `scripts/soak-sample.sh` (one row per service in `STACK_SERVICES` every minute, `missing`/`exited`/`restarting` as explicit states), `scripts/soak-report.sh` (FAIL on any OOM kill, restart, not-healthy sample or row gap), `systemd/mizano-soak.{service,timer}`, README section 8                                                                                                                | **Not verified (needs the Pi).** Tooling only: `soak-report.sh` was run on 13 synthetic 24h sample files: PASS; FAIL for an unhealthy api (21 samples), one web `starting` sample, a missing worker, an exited web, a redis row gap, a never-sampled cloudflared, a worker restart, a worker cgroup OOM kill and a kernel OOM kill; INCOMPLETE for a 2h window and for 24h with only every third sample; SWAP-THRASH at 16.67 pages/s. Exit code 0 only for PASS.                                                                                                                                  |
| A2  | Reboot recovers all services automatically                                                        | `systemd/mizano-stack.service` (`RequiresMountsFor`, `stack.sh up`/`stop`), restart policies, README section 5 reboot test                                                                                                                                                                                                                                                                           | **Not verified (needs the Pi).**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

## Review round 2 (PR #92): thread to commit

| Thread                                               | Fix                                                                                                                                                                                   | Commit           |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| `scripts/check-env.mjs:73` template secret check     | `SECRET_KEYS` covers every credential key; required ones must be placeholders (`DATABASE_URL` judged on its password), the optional Telegram token must be empty; tests for each case | 0b323e1          |
| `docker-compose.pi.yml:157` / `:237` 2xx-only probes | api probe → `/api/health/ready` (now 503 on a dead Postgres/Redis); web probe → new `/api/health` route (503 while the api is not ready); `healthcheck.sh` probes the same routes     | a62a75e          |
| `deploy/pi/scripts/deploy.sh:37` write before guard  | `assert_ssd` before `touch deployments.log`, `mkdir -p` dropped; same ordering fixed in `backup.sh` and `healthcheck.sh` (alerts every run while the SSD is missing)                  | 49cd225          |
| `soak-report.sh:55` unhealthy never fails            | any sample that is not `healthy`/`none` fails; per-service `unhealthy` and `gaps` columns                                                                                             | e8fe153          |
| `soak-sample.sh:48` only running containers sampled  | iterates `STACK_SERVICES`, emits `missing`/stopped states; report fails on a missing row; `stack.sh status` lists stopped containers; sync test for the service list                  | e8fe153, 8e7756a |

## Commands run (tested head = 8e7756ad9e119b082bfc762d71ca43f848659fa9)

- `node apps/api/_run_tests.js`: 138/139 suites, 2210/2214 tests pass. The 4 failures are in `import.service.hardening.spec.ts` (`TypeError: csv is not a function`), a module this branch does not touch; the previous round reproduced them on `master` @ b83d72b (local Node 26; CI uses Node 20).
- `node apps/api/_run_tests.js --testPathPattern="health"`: 10/10 pass.
- `cd apps/web && jest`: 49/49 suites, 461/461 tests pass (includes `app/api/health/route.test.ts` and `lib/auth.spec.ts`).
- `pnpm --filter api type-check` and `pnpm --filter @mizano/web type-check`: clean (after `pnpm db:generate` and building `@mizano/shared-types` and `@mizano/validators`).
- `eslint src/health/*.ts src/worker.ts --max-warnings 0` (api) and `eslint` on the four touched web files: clean. The whole `pnpm --filter api lint` reports 13 `@typescript-eslint/return-await` errors in 9 service files this branch does not touch (journals, bills, vendor-credits, credit-notes, invoices, payments-received, quotes, vat-returns); left as found. `pnpm --filter @mizano/web lint`: 3 pre-existing unused-variable warnings in untouched spec files.
- `node --test scripts/check-env.test.mjs` (= `pnpm test:deploy`): 18/18 pass.
- `pnpm env:check --template`: OK. `APP_ENV=pi pnpm env:check --file deploy/pi/.env.pi.example`: 12 placeholder errors, exit 1 (expected for the template).
- `prettier --check` on every changed file: clean.
- `bash -n deploy/pi/scripts/*.sh`: clean. shellcheck: not available here (see S4).
- `docker compose config`: NOT run (no Docker). Replaced by the js-yaml assertions in S1, S2, S3 and S4.

## To close the issue (on the Pi)

1. Build and push images from this branch's merge commit (#38 pipeline), then `deploy.sh <sha> <api-digest> <web-digest>`.
2. `stack.sh check`, then `stack.sh up`. Confirm `docker compose config` resolves and all services are `healthy` (api on `/api/health/ready`, web on `/api/health`).
3. Upload a document and confirm the worker (not the api) processes it: the `worker` logs show the job.
4. README section 8: start `mizano-soak.timer` only after `stack.sh up` reports healthy, run the acceptance-contract workload for 24 h, attach the `soak-report.sh` output and `stats.log` excerpts.
5. README section 5: reboot test. Attach `stack.sh status` after boot and the time to healthy.
6. Run `shellcheck -x deploy/pi/scripts/*.sh` on a machine that has it.
