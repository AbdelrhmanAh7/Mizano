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

# EVIDENCE.md — Production compose, login throttling, session and seed hardening (#132)

- **Issue**: #132 (security, high). Branch `ai/132`, based on master `615060e`.
- **Tested code SHA**: `5a842f284d5b55a41cdf0f559491a19849d9bced`. Later commits on the branch change only Markdown (`AI_QUESTIONS.md`, `docs/agents/review-lessons.md`, this file).
- **Provider**: Claude Opus 5.5 (`claude-opus-5-5`) via Claude Code. This record is author evidence, not an independent review.
- **Environment**: macOS, Node 26, PostgreSQL 16 throwaway cluster on `127.0.0.1:55532`, fresh database per full run, `REDIS_URL=` (blank). Docker is not installed here, so the compose test used its YAML fallback; it runs `docker compose config` wherever Docker exists.

## Acceptance criteria

| REQ | Criterion                                                                                                     | Test (`@issue-132`)                                                                     | Result |
| --- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------ |
| AC1 | Compose publishes no 5432/6379; `POSTGRES_PASSWORD` is required; Redis uses `--requirepass`                   | `apps/api/test/production-compose.e2e-spec.ts` (3 tests)                                | pass   |
| AC2 | Login throttling counts per `X-Forwarded-For` (right-most, proxy-appended address); the web login forwards it | `apps/api/test/auth-throttle.e2e-spec.ts` (2), `apps/web/lib/auth-session.spec.ts` (2)  | pass   |
| AC3 | `/api/auth/session` JSON contains no `refreshToken`                                                           | `apps/web/lib/auth-session.spec.ts` (real NextAuth handler: csrf, sign-in, session)     | pass   |
| AC4 | Seed refuses `NODE_ENV=production` unless `SEED_ALLOW_PROD=1`                                                 | `apps/api/test/seed-guard.e2e-spec.ts` (4 tests, real `ts-node prisma/seed.ts` process) | pass   |

The test-only commit `ff870fe` was run before any production change. AC1 failed on 3 of 3 tests, AC2 (API) on 2 of 2, AC2 forwarding and AC3 (web) on 2 of 3, and AC4 on the 2 production-refusal tests. The 3 tests that passed at that point are regression guards: development seeding, explicit `SEED_ALLOW_PROD=1`, and no forwarded header.

## Commands and results

```bash
npx turbo lint type-check test --force
# api:test        Test Suites: 137 passed, 137 total; Tests: 2207 passed, 2207 total
# @mizano/web:test Test Suites: 49 passed, 49 total;  Tests: 461 passed, 461 total
# Tasks: 12 successful, 12 total (web lint: 13 warnings, all pre-existing in files this branch does not touch)

# fresh DB: drop/create mizano_e2e, prisma migrate deploy, then
REDIS_URL= npx jest --config ./test/jest-e2e.json --runInBand   # in apps/api
# run 1: Test Suites: 2 failed, 12 passed; Tests: 9 failed, 257 passed, 266 total
#        (purchases: a 401 midway through setup, then cascading; accountant-journey: 1 test)
# rerun of purchases + accountant-journey alone: 69 passed, 69 total
# run 2 (fresh DB again): Test Suites: 14 passed, 14 total; Tests: 266 passed, 266 total
```

Run 1's failures were in suites this change does not touch. Those suites use `createTestApp`, whose unlimited throttler storage this branch leaves unchanged. Both passed alone and in the second full fresh run. The same flake pattern was seen on earlier branches.

## Remaining risks

- Without `REDIS_PASSWORD`, Redis shares `POSTGRES_PASSWORD`, which is what `.github/workflows/deploy.yml` deploys today. Neither store is published; only containers on `mizano-network` reach them. Giving Redis its own secret is an optional owner CI change, described in `AI_QUESTIONS.md`.
- `TRUST_PROXY_HOPS=1` assumes exactly one proxy appends `X-Forwarded-For` in front of the API. A client that can reach the API or web port directly can choose its own throttle key. That is the trade-off the issue asks for, in place of one shared lockout.
- `docker-compose.yml` (local/SIT) still publishes 5435/6380 with the dev password. It is out of scope for this issue.

## Review round 2 (PR #137 quality review)

- **Tested code SHA**: `47cfa94a56be8631620a120d74000203500eff26`. The commit after it changes only Markdown (`AI_QUESTIONS.md`, `docs/agents/review-lessons.md`, this file).
- **Findings fixed**: (1) `TRUST_PROXY_HOPS` is now passed into the `api` container (`${TRUST_PROXY_HOPS:-1}`). (2) Compose no longer requires a variable that `deploy.yml` does not write. Redis uses `${REDIS_PASSWORD:-${POSTGRES_PASSWORD:?}}`; the API gets `REDIS_PASSWORD` on its own and percent-encodes it into `REDIS_URL` (`apps/api/src/cache/redis-url.ts`, used by the cache module, cache service and intake queue). `deploy.yml` is unchanged.

| REQ | Check                                                                                                                                                    | Test                                                                                                        | Result |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------ |
| AC1 | Every `${VAR:?}` in the compose file is written by deploy.yml's "Write .env on server"; Redis, `REDISCLI_AUTH` and the API share one password expression | `apps/api/test/production-compose.e2e-spec.ts` (5 tests; the 3 new or changed ones failed before `47cfa94`) | pass   |
| AC2 | `TRUST_PROXY_HOPS` reaches the API container                                                                                                             | same file                                                                                                   | pass   |
| AC2 | One `X-Forwarded-For` client at the login limit gets 429, another gets 401, and a spoofed prefix stays limited                                           | `e2e-army/132-auth-hardening.e2e.ts` (`feat:mz-auth`), real stack                                           | pass   |
| AC3 | `/api/auth/session` after a credentials sign-in has `accessToken` and no `refreshToken`                                                                  | `e2e-army/132-auth-hardening.e2e.ts`, real stack                                                            | pass   |
| -   | A Redis password with URL characters round-trips through `REDIS_URL`                                                                                     | `apps/api/src/cache/redis-url.spec.ts` (4 tests)                                                            | pass   |

```bash
# apps/api
REDIS_URL= npx jest --config ./test/jest-e2e.json --runInBand test/production-compose
# Tests: 5 passed, 5 total   (before the fix: 3 failed, 2 passed)
npx jest --config ./_jest.config.js --testPathPattern "(redis-url|cache|intake|trust-proxy)"
# Test Suites: 11 passed, 11 total; Tests: 119 passed, 119 total
npx tsc --noEmit -p tsconfig.json   # exit 0; eslint on the changed files: no findings

# hub: HOLD=1800 ops/verify/e2e-army/run-local.sh Mizano 47cfa94  (throwaway DB, API + next dev), then
e2e run tests/132-auth-hardening.e2e.ts --reporter list
# ✓ @issue-132 AC2: one client exceeding the login limit does not lock other clients out
# ✓ @issue-132 AC3: /api/auth/session after sign-in has the access token but no refreshToken
# Tests  2 passed (2); an immediate rerun (attacker already limited) also passed 2 of 2
```

Per the owner's rule (2026-10-08), the full suite runs on GitHub-hosted CI after the push, not locally. Docker is not installed here, so the compose test used its YAML fallback.
