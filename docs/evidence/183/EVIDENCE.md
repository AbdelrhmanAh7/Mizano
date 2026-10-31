# EVIDENCE — #183 Secure Docker Compose production stacks (Mizano #132-1)

- **Issue**: #183 `Mizano #132-1: Secure Docker Compose Production Stacks`
- **PR**: #203
- **Branch**: `ai/183`
- **Tested commit**: `0defea19539502029120c87e1135f90a44491e60` (ai/183; clean head on origin/master).
- **Originating Sentry Issue**: None. This is a security remediation sub-issue split from audit #132.
- **User-facing flow / E2E**: Not user-facing (infrastructure compose hardening and internal API Redis URL resolution). An E2E request-level test is added at `e2e-army/183-redis-password-api.e2e.ts` covering `feat:mz-system-diagnostics` and `feat:mz-intake-processor`.
- **Changed covering tests**:
  - `apps/api/src/cache/production-compose.spec.ts` (19 tests)
  - `apps/api/src/cache/redis-url.spec.ts` (5 tests)
  - `e2e-army/183-redis-password-api.e2e.ts` (2 tests)

---

## Acceptance Criteria (Explicit & Numbered)

| AC #    | Criterion                                                                                                                                                                                                                                                               | Verification Method                                                                                                                                                                                     | Status |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| **AC1** | No published ports for Postgres (5432) or Redis (6379) in `docker-compose.production.yml` and `deploy/pi/docker-compose.pi.yml` (`ports:` block removed/omitted).                                                                                                       | `production-compose.spec.ts` ("publishes no Postgres or Redis port") & `check-compose-security.sh`                                                                                                      | PASSED |
| **AC2** | `POSTGRES_PASSWORD` is required via `${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}`; compose config fails fast when unset.                                                                                                                                        | `production-compose.spec.ts` ("fails to render without POSTGRES_PASSWORD") & `check-compose-security.sh`                                                                                                | PASSED |
| **AC3** | Redis service runs with `--requirepass` in YAML array form (`[ 'redis-server', '--requirepass', ... ]`) ensuring single argv entry immune to shell word splitting with special characters.                                                                              | `production-compose.spec.ts` ("runs Redis with --requirepass…", "passes the Redis password as one argv entry…")                                                                                         | PASSED |
| **AC4** | Redis authentication is wired across all consumers: API builds Redis connection via `resolveRedisUrl` (URL-encoding special characters), preserving credentials if already present in `REDIS_URL`, or injecting `REDIS_PASSWORD` (falling back to `POSTGRES_PASSWORD`). | `redis-url.spec.ts` & `production-compose.spec.ts` ("preserves existing credentials in an external REDIS_URL", "lets the API connect with a fallback POSTGRES_PASSWORD full of URL-special characters") | PASSED |
| **AC5** | Redis healthchecks authenticate without embedding passwords in command argv via `REDISCLI_AUTH` and `test: ["CMD", "redis-cli", "--no-auth-warning", "ping"]`.                                                                                                          | `production-compose.spec.ts` ("keeps the password out of the Redis healthcheck command")                                                                                                                | PASSED |

---

## Verification Report

| AC   | Command / test                                                                                                                      | Observed                                                                          | Exit Code | Status |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | --------- | ------ |
| AC1  | `npx jest src/cache/production-compose.spec.ts` ("publishes no Postgres or Redis port")                                             | exit 0, pass (both compose files have no `ports:` for postgres or redis)          | 0         | PASSED |
| AC2  | `npx jest src/cache/production-compose.spec.ts` ("fails to render without POSTGRES_PASSWORD")                                       | exit 0, pass (throws "POSTGRES_PASSWORD is required")                             | 0         | PASSED |
| AC3  | `npx jest src/cache/production-compose.spec.ts` ("runs Redis with --requirepass…", "…one argv entry…")                              | exit 0, pass (array form command: with 9 arguments, argv[--requirepass+1] intact) | 0         | PASSED |
| AC4  | `npx jest src/cache/redis-url.spec.ts` and `production-compose.spec.ts` ("preserves existing credentials in an external REDIS_URL") | exit 0, pass (encodes special characters; preserves external URL credentials)     | 0         | PASSED |
| AC5  | `npx jest src/cache/production-compose.spec.ts` ("keeps the password out of the Redis healthcheck command")                         | exit 0, pass (REDISCLI_AUTH env used; no -a flag in test command)                 | 0         | PASSED |
| all  | `pnpm --filter api exec jest src/cache src/modules/ai/intake`                                                                       | 11 suites, 108 tests passed                                                       | 0         | PASSED |
| type | `pnpm --filter api exec tsc --noEmit`                                                                                               | Clean type-check, 0 errors                                                        | 0         | PASSED |
| lint | `pnpm --filter api exec eslint "src/cache/**/*.ts" "src/modules/ai/intake/intake-queue.service.ts"`                                 | Clean lint, 0 errors                                                              | 0         | PASSED |

---

## Bug Fix & Hardening Regression Proof (Fails on Base, Passes on Head)

- **On Base (`origin/master`)**:
  Running `production-compose.spec.ts` against `origin/master`:
  - `docker-compose.production.yml` published `5432:5432` and `6379:6379`.
  - Postgres used default fallback `POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-mizano_secret}` instead of enforcing required variable (`:?`).
  - Redis lacked `--requirepass` entirely.
  - Redis healthcheck ran without authentication.
  - Result on base: **exit 1, 12 tests failed / 3 passed**.
- **On Head (`ai/183`)**:
  - Ports removed entirely from postgres and redis services in both production and Pi compose files.
  - Required check `:?POSTGRES_PASSWORD is required` enforced on both services.
  - Redis runs with `--requirepass` in array form.
  - `resolveRedisUrl` securely injects/encodes passwords for cache, bullmq intake queue, and ioredis clients.
  - If `REDIS_URL` already contains credentials (external Redis), `resolveRedisUrl` preserves them.
  - Result on head: **exit 0, all 33 cache tests passed**.

---

## Scope & Changed Files

- `docker-compose.production.yml`: Removed postgres and redis exposed ports; added required variable check; configured Redis requirepass in array form; wired REDIS_PASSWORD and REDISCLI_AUTH; kept REDIS_URL overridable as `${REDIS_URL:-redis://redis:6379/0}`.
- `deploy/pi/docker-compose.pi.yml`: Updated postgres required password enforcement; configured Redis requirepass with REDIS_PASSWORD fallback; wired REDISCLI_AUTH; kept REDIS_URL overridable.
- `apps/api/src/cache/redis-url.ts`: Utility for central Redis URL construction and percent-encoding; preserves existing credentials when present in REDIS_URL.
- `apps/api/src/cache/cache.module.ts`: Uses `resolveRedisUrl`.
- `apps/api/src/cache/cache.service.ts`: Uses `resolveRedisUrl`.
- `apps/api/src/modules/ai/intake/intake-queue.service.ts`: Uses `resolveRedisUrl`.
- `apps/api/src/cache/redis-url.spec.ts`: Unit tests for URL resolution, credential preservation, and special character encoding.
- `apps/api/src/cache/production-compose.spec.ts`: Offline specification tests verifying compose rendering, port omission, password enforcement, array argv, healthchecks, and external Redis credential preservation.
- `e2e-army/183-redis-password-api.e2e.ts`: Request-level verification for cache and intake queue Redis connectivity.
- `scripts/check-compose-security.sh`: Offline compose security check script for CI/local verification.
- `.env.example`, `deploy/pi/.env.pi.example`: Documented required variables and external Redis credential handling.
- `docs/DEVELOPMENT.md`, `docs/ops/pending-workflow-changes.md`: Documented pending CI workflow step.

---

## Review Findings Addressed

- **CodeRabbit finding on `docker-compose.production.yml:24` (Preserve authentication for existing external Redis URLs)**:
  `resolveRedisUrl` in `apps/api/src/cache/redis-url.ts` now inspects `url.password`. If credentials are already present in `REDIS_URL`, they are preserved as-is, preventing compose's fallback `POSTGRES_PASSWORD` from overwriting external credentials. Added test in `production-compose.spec.ts` and `redis-url.spec.ts`.
- **CodeRabbit finding on `e2e-army/183-redis-password-api.e2e.ts:60` (Property check on cache stats)**:
  `CacheStatsResponseDto` returns `storeType` (and `connected`), not `type`. Updated assertion to `expect(stats.body).toHaveProperty('storeType')` and `expect(stats.body).toHaveProperty('connected')`.
- **QA finding on `docs/vision.md` and `docs/backlog-restructure.md` (unrelated doc deletion)**:
  Both files restored 100% byte-identical to `origin/master`.
- **QA finding on `REDIS_URL` in compose files**:
  Maintained `${REDIS_URL:-redis://redis:6379/0}` overridable pattern in both compose files.
- **Workflow edits**:
  Accurately documented as pending in `docs/ops/pending-workflow-changes.md`.

---

## Workflow edits: pending

`.github/workflows/ci.yml` is not changed by this PR. Workflow files are owner-only for the implementer; the
step stays documented in `docs/ops/pending-workflow-changes.md` and must be applied by hand. Until then
`scripts/check-compose-security.sh` does not gate CI and has never run against real Docker Compose (see
"Not verified here"). `deploy.yml` needs no change: production reuses the existing `POSTGRES_PASSWORD` secret
as the Redis password, and `redis-url.ts` percent-encodes it.

Once applied, the step runs `bash scripts/check-compose-security.sh`, which sets its own dummy passwords and
asserts:

- No published 5432 or 6379 ports on postgres/redis services
- Redis command includes `--requirepass` with the expected password
- REDISCLI_AUTH is set for the healthcheck
- Every service with REDIS_URL also has REDIS_PASSWORD
- Config fails when POSTGRES_PASSWORD is unset

---

## Test Execution Summary

```text
PASS src/cache/cache.service.spec.ts
PASS src/cache/redis-url.spec.ts
PASS src/cache/production-compose.spec.ts
PASS src/modules/ai/intake/intake-queue.service.spec.ts
PASS src/modules/ai/intake/stage-timer.spec.ts
PASS src/modules/ai/intake/intake-jobs.service.spec.ts
PASS src/modules/ai/intake/intake-job-owner.guard.spec.ts
PASS src/modules/ai/intake/intake-storage.spec.ts
PASS src/modules/ai/intake/intake-processor.timings.spec.ts
PASS src/modules/ai/intake/intake-processor.service.spec.ts
PASS src/modules/ai/intake/intake.worker.spec.ts

Test Suites: 11 passed, 11 total
Tests:       108 passed, 108 total
Snapshots:   0 total
```

## Not verified here

- **`docker compose config` has not been run against real Compose.** Docker is not installed on this machine, so
  `scripts/check-compose-security.sh` was checked only with `bash -n` and by running its `jq` filters on a
  hand-written config; no real `docker compose -f docker-compose.production.yml config` output is attached.
  The Docker-free spec renders the same interpolation subset. Real output needs a machine with Docker, or the
  pending CI step.
- The e2e-army test: not run locally. `run-local.sh` needs a pushed ref, and the implementer does not push.
  The verify job runs it.
- Full suite: runs on GitHub CI after the push.
