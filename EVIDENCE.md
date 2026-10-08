# EVIDENCE.md — PR Merge Sprint Audit (#95) & Issue #133

## Overview (Issue #133)

- **Issue**: #133 ([audit] Move intake extraction out of the API process and remove dead Colab wiring)
- **Base Commit (`master`)**: `615060e`
- **Tested Commit (this PR head)**: `bbd3cc4`
- **Branch commits** (newest first):
  - `bbd3cc4` — implementation (this PR head): gates `ai/schedulers/*` behind `AI_SCHEDULERS_ENABLED`, names all 29 AI cron jobs, paginates notification cron checks over all orgs, rewrites AC1–AC4 tests, Dockerfile + env + docs fixes
  - `99e1c27`, `596fa0b`, `e0954ee` — evidence draft, refactor, and failing AC tests (earlier commits on this branch)
- **Audit Date**: 2026-10-08
- **Branch**: `ai/133`

---

## Requirements Verification Matrix (Issue #133)

| REQ ID | Requirement                                                                      | Verification Method                                                                     | Status |
| ------ | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------ |
| AC1    | Exactly one handler for `GET ai/narrative/monthly` and it works                  | DiscoveryService route-metadata scan + live HTTP request (guard 401, not 404)           | PASSED |
| AC2    | `POST/GET internal/tunnel-update` and `ollama-status` return 404                 | supertest against removed endpoints (plain and `/api`-prefixed)                         | PASSED |
| AC3    | With `AI_SCHEDULERS_ENABLED` unset, SchedulerRegistry has no AI cron jobs        | Registry key inspection (derived from class metadata, non-vacuous) + provider absence   | PASSED |
| AC3b   | Positive control: with `AI_SCHEDULERS_ENABLED=true`, all 29 `ai:` crons register | Second module graph booted via `jest.resetModules()` with the flag set                  | PASSED |
| AC4    | Notification cron queries are org-scoped, `take`-bounded, and page all orgs      | Mocked Prisma assertions: cursor pagination, per-org scoping, bounds, no duplicate orgs | PASSED |

---

## Detailed Changes & Verification (Issue #133)

### AC1: Exactly one narrative handler, no DI break

- **Change**: `NarrativeController` and `FinancialNarrativeService` are no longer registered in `apps/api/src/modules/ai/ai.module.ts`.
- **Kept (single source)**: `AiForecastingModule` registers `NarrativeController` and **provides + exports** `FinancialNarrativeService`
  (`apps/api/src/modules/ai/forecasting/ai-forecasting.module.ts` lines 26/33/40).
- **DI consumers of the single exported service**: `narrative.controller.ts`, `ai-operations.scheduler.ts`, `reports/controllers/reports.controller.ts` — all resolve through the forecasting module's export. `grep` confirms no other provider registration exists.
- **Verified at head**: `grep -rn NarrativeController apps/api/src` matches only `ai-forecasting.module.ts` and `controllers/narrative.controller.ts`.

### AC2: Remove dead Colab wiring

- **Deleted files** (confirmed present on `master`, removed on this branch):
  - `apps/api/src/modules/ai/controllers/ollama-tunnel.controller.ts`
  - `apps/api/src/modules/ai/controllers/ollama-tunnel.controller.spec.ts`
  - `services/ollama-proxy/` (entire directory: Dockerfile, ollama_proxy.py, test_ollama_proxy.py, .dockerignore)
- **Removed registration**: `OllamaTunnelController` from `ai-operations.module.ts` (import + controllers array).
- **Docs cleanup**: `docs/ARCHITECTURE.md`, `docs/DEVELOPMENT.md`; `CLAUDE.md` AI section rewritten to current facts (BullMQ worker runs inside the API process; worker container is a _target_ pending issues #39/#42 — see `AI_QUESTIONS.md`).
- **Verification**: `POST/GET /internal/tunnel-update` and `/internal/ollama-status` (and `/api/...` variants) all return 404. `grep` finds no `ollama-tunnel`/`ollama-proxy` references left in `apps/api/src` or `deploy/`.

### AC3: Gate AI schedulers behind AI_SCHEDULERS_ENABLED (default off)

- **New**: `apps/api/src/modules/ai/schedulers/ai-schedulers.enabled.ts` — `aiSchedulersEnabled()`/`aiSchedulerProviders()` read `process.env.AI_SCHEDULERS_ENABLED` at module-import time (before ConfigModule loads `.env`), so the flag must be exported in the process environment.
- **Gated modules** (conditional provider spread `...aiSchedulerProviders([...])`): `ai.module.ts`, `hr/ai-hr.module.ts`, `nlp/ai-nlp.module.ts`, `sales-crm/ai-sales-crm.module.ts`, `security/ai-security.module.ts`.
- **Named crons**: all 29 `@Cron` jobs across the 5 schedulers now carry deterministic `ai:` names (13 operations, 5 hr, 2 nlp, 5 sales-crm, 4 security). Previously `@nestjs/schedule` fell back to UUID keys, which made any registry assertion vacuous.
- **Runtime guards kept**: the ConfigService early-return guards oc-ling added remain as defense-in-depth.
- **Pi deployment**: `deploy/pi/.env.pi.example` documents `AI_SCHEDULERS_ENABLED=false`; `deploy/pi/docker-compose.pi.yml` sets `AI_SCHEDULERS_ENABLED: ${AI_SCHEDULERS_ENABLED:-false}`.
- **Test isolation**: `apps/api/test/setup-e2e.ts` deletes the flag before any spec imports `AppModule`, so e2e always runs the flag-off contract.
- **Verification**: e2e asserts zero `ai:` cron keys + no scheduler providers with flag unset **and** the registry still contains non-AI cron jobs (not vacuous); AC3b boots a second graph with the flag set and asserts all 29 register.

### AC4: Notification cron checks paginate all orgs, org-scoped and bounded

- **Modified**: `apps/api/src/modules/notifications/services/notifications.service.ts`.
- **Changes**:
  - Exported `NOTIFICATION_BATCH_SIZE = 50` / `NOTIFICATION_QUERY_LIMIT = 100` constants.
  - New cursor-pagination generator `eachOrganizationBatch()` pages **every** organization in id order (`take: 50`, cursor + `skip: 1`), instead of only the first 50 orgs.
  - `checkOverdueInvoices`, `checkUpcomingBillPayments`, `checkLowInventory` iterate all org batches; every entity query is scoped by `organizationId` and bounded by `take: NOTIFICATION_QUERY_LIMIT`.
- **Verification**: e2e mocks `organization.findMany` to return a full first page + a second page and asserts two fetches, correct cursor (`{ id: 'org-49' }`), per-org scoping of every invoice/bill/item query, `take` bounds, and no duplicated org visits. Unit spec regression fixed (added `organization.findMany` mock).

### Additional: API Dockerfile and validators

- **Modified**: `apps/api/Dockerfile`.
- **Changes**: Removed the `@mizano/validators` **build step**; **kept** `COPY packages/validators/package.json` because `apps/api/package.json` still declares `@mizano/validators: workspace:*` and `pnpm install` needs the manifest. Source tree has zero imports of the package.
- **Verification**: `pnpm --filter api build` (below); `dist/` contains no `@mizano/validators` reference.

---

## Build, Test & Lint Verification (tested at `bbd3cc4`)

```bash
# Unit suite (full API unit tests, standard jest config)
pnpm exec jest
# Test Suites: 135 passed, 135 total; Tests: 2188 passed, 2188 total

# Repository-wide gates
pnpm run lint
# ESLint: 0 errors; 4 warnings (no-var-requires in apps/api/test/issue-133.e2e-spec.ts,
# intentional for the jest.resetModules() positive control in AC3b)

pnpm run type-check
# All tasks OK (6)

pnpm --filter api build
# TSC: 0 issues; 650 files compiled (swc)

# E2E suite (fresh DB, local Redis) — apps/api/test/jest-e2e.json
# DATABASE_URL=...mizano_133_e2e?schema=public REDIS_URL=redis://localhost:6379
pnpm --filter api test:e2e -- --runInBand
# 266 passed, 266 total
pnpm --filter api test:e2e -- --maxWorkers=2
# 266 passed, 266 total (second parallel run)
```

Additionally `node apps/api/_run_tests.js` reports **134 passed / 4 failed**: the 4 failures are a pre-existing runner artifact
(`TypeError: csv is not a function` in `import.service.hardening.spec.ts` — csv-parser interop under the custom
`_jest.config.js` resolver). They fail identically at `master`, and this branch does not touch those files; the same tests
pass under the standard config above. Documented here as a known artifact, not introduced by this PR.

### Noted flake (not caused by this branch)

One parallel e2e run reported 5 transient failures in **intake** specs (untouched by this branch); they did not reproduce
(`--runInBand` pass, second `--maxWorkers=2` pass, intake suite standalone 16/16). Suspected cross-suite
shared-Redis BullMQ queue contention during parallel extraction. Tracked as a remaining risk in the handover; no code on
this branch was involved.

---

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
