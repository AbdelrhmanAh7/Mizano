# Verification Report — Issue #133

- **Issue**: [#133 [audit] Move intake extraction out of the API process and remove dead Colab wiring](https://github.com/AbdelrhmanAh7/Mizano/issues/133)
- **PR**: Refs #133 (PR #144 — narrowed per CTO directive to scheduler gating, dead code removal, narrative dedupe, and notification pagination; does **not** close #133)
- **Date**: 2026-10-21
- **Platform**: macOS (Apple Silicon arm64)
- **Base SHA (`master`)**: `113500149241f4890ade939099e376a7a0eddbe2`

---

## 1. Explicit Acceptance Criteria Mapping

Per Issue #133's formal brief and CTO decision (2026-10-12 / 2026-10-18):

| AC ID   | Requirement from Issue #133 Brief                                                                 | Status                  | Evidence / Verification Method                                                                                                                                                                                                                                                                                                                                                                        | Observed Exit Code |
| ------- | ------------------------------------------------------------------------------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| **AC1** | API container starts without `tesseract.js`/`pdf-parse` loaded (process memory & `require.cache`) | **NOT DONE** (Deferred) | Extraction worker extraction into dedicated container deferred to follow-up issue #141 (and branches `ai/42`/`ai/39`). Recorded in `AI_QUESTIONS.md` and `docs/follow-ups.md`.                                                                                                                                                                                                                        | N/A (deferred)     |
| **AC2** | Intake E2E passes with the worker container                                                       | **NOT DONE** (Deferred) | Worker container split is deferred to #141. Recorded in `AI_QUESTIONS.md` and `docs/follow-ups.md`.                                                                                                                                                                                                                                                                                                   | N/A (deferred)     |
| **AC3** | Only one route handler for `ai/narrative`                                                         | **PASSED**              | `NarrativeController` and `FinancialNarrativeService` registration removed from `apps/api/src/modules/ai/ai.module.ts` and kept exclusively in `apps/api/src/modules/ai/forecasting/ai-forecasting.module.ts`. Verified by `apps/api/test/issue-133.e2e-spec.ts`: exactly 1 GET handler registered for `/ai/narrative/monthly`, responds with 401 guard (not 404), proving DI graph resolves cleanly. | 0                  |

### Additional Scope Delivered from Issue #133 Brief

| Scope Item                   | Requirement from Brief                                                                                         | Status     | Evidence / Verification Method                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Observed Exit Code |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| **Scope-DeadCode**           | Delete `ollama-tunnel` controller and `services/ollama-proxy`                                                  | **PASSED** | Deleted `apps/api/src/modules/ai/controllers/ollama-tunnel.controller.ts`, `apps/api/src/modules/ai/controllers/ollama-tunnel.controller.spec.ts`, and `services/ollama-proxy/`. Verified by `apps/api/test/issue-133.e2e-spec.ts`: `POST /internal/tunnel-update` and `GET /internal/ollama-status` return 404.                                                                                                                                                                                                                        | 0                  |
| **Scope-Schedulers**         | Gate AI schedulers behind `AI_SCHEDULERS_ENABLED` (defaulting off on Pi profile, enabled on standard profiles) | **PASSED** | 5 AI schedulers (`AiOperationsScheduler`, `AiHrOpsScheduler`, `AiNlpChatScheduler`, `AiSalesCrmScheduler`, `AiSecurityScheduler`) with 29 `@Cron` jobs (out of 36 total API crons) gated behind `AI_SCHEDULERS_ENABLED`. Unset = no AI providers or crons registered. Default off on Pi (`deploy/pi/.env.pi.example`, `deploy/pi/docker-compose.pi.yml`), default enabled in non-Pi profiles (`docker-compose.production.yml`, `.env.*`). Verified by `ai-schedulers.enabled.spec.ts` (7 tests) and `issue-133.e2e-spec.ts` (AC3/AC3b). | 0                  |
| **Scope-NotificationPaging** | Paginate notification cron queries with cursor, limit, and `organizationId` scope                              | **PASSED** | `notifications.service.ts` refactored with `eachPage` generator: cursor pagination with stable `orderBy: { id: 'asc' }`, `take: NOTIFICATION_QUERY_LIMIT` (100) and `NOTIFICATION_BATCH_SIZE` (50), all queries scoped by `organizationId`. Verified by `notifications.service.spec.ts` (6 tests with > 100 rows per org) and `issue-133.e2e-spec.ts`.                                                                                                                                                                                  | 0                  |
| **Scope-Dockerfile**         | Remove `@mizano/validators` build from `apps/api/Dockerfile`                                                   | **PASSED** | Removed `pnpm --filter @mizano/validators build` from `apps/api/Dockerfile:37`. Verified container builds without it.                                                                                                                                                                                                                                                                                                                                                                                                                   | 0                  |

---

## 2. Cron Job Inventory Reconciliation (29 vs 36)

- **AI Schedulers Gated (29 `@Cron` jobs total)**:
  - `AiOperationsScheduler`: 13 jobs
  - `AiHrOpsScheduler`: 5 jobs
  - `AiSalesCrmScheduler`: 5 jobs
  - `AiSecurityScheduler`: 4 jobs
  - `AiNlpChatScheduler`: 2 jobs
- **Core / Non-AI Schedulers (7 `@Cron` jobs total, always active)**:
  - `NotificationsService`: 3 jobs (`checkOverdueInvoices`, `checkUpcomingBillPayments`, `checkLowInventory`)
  - `RecurringProfilesService`: 1 job
  - `BillsService`: 1 job
  - `InvoicesService`: 1 job
  - `DepreciationService`: 1 job
- **Total API `@Cron` jobs**: 29 + 7 = 36 jobs.

---

## 3. Covering Tests Changed / Added

| Test File                                                                      | Type | Tests Executed     | Result          |
| ------------------------------------------------------------------------------ | ---- | ------------------ | --------------- |
| `apps/api/src/modules/ai/schedulers/ai-schedulers.enabled.spec.ts`             | Unit | 7 passed, 0 failed | PASSED (exit 0) |
| `apps/api/src/modules/notifications/services/notifications.service.spec.ts`    | Unit | 6 passed, 0 failed | PASSED (exit 0) |
| `apps/api/test/issue-133.e2e-spec.ts`                                          | E2E  | 9 passed, 0 failed | PASSED (exit 0) |
| `apps/api/src/modules/import-export/services/import.service.hardening.spec.ts` | Unit | 9 passed, 0 failed | PASSED (exit 0) |

---

## 4. Verification Commands and Observed Outputs

### 4.1 Type Check

```bash
pnpm --filter api type-check
```

**Output**:

```text
> api@0.1.0 type-check /Users/abdelrahmanahmed/agents/work.noindex/impl/Mizano-133/apps/api
> tsc --noEmit && tsc --noEmit -p test/tsconfig.e2e.json

(exit 0)
```

### 4.2 Linter

```bash
pnpm --filter api lint
```

**Output**:

```text
> api@0.1.0 lint /Users/abdelrahmanahmed/agents/work.noindex/impl/Mizano-133/apps/api
> eslint "{src,apps,libs,test}/**/*.ts"

(0 errors, 0 warnings; exit 0)
```

### 4.3 Unit Tests

```bash
pnpm --filter api exec jest src/modules/ai/schedulers/ai-schedulers.enabled.spec.ts src/modules/notifications/services/notifications.service.spec.ts
```

**Output**:

```text
PASS src/modules/ai/schedulers/ai-schedulers.enabled.spec.ts
PASS src/modules/notifications/services/notifications.service.spec.ts

Test Suites: 2 passed, 2 total
Tests:       13 passed, 13 total
Snapshots:   0 total
Time:        2.724 s
(exit 0)
```

### 4.4 E2E Acceptance Suite

```bash
DATABASE_URL="postgresql://mizano:mizano_secret@localhost:5432/mizano_e2e_133?schema=public" pnpm --filter api exec jest --config ./test/jest-e2e.json issue-133
```

**Output**:

```text
PASS test/issue-133.e2e-spec.ts (6.006 s)
  @issue-133 AC3: exactly one route handler for GET ai/narrative
    ✓ registers exactly one GET handler for /ai/narrative/monthly (5 ms)
    ✓ answers on the single handler (guard 401, not 404), proving the DI graph resolves (15 ms)
  @issue-133 dead code removal: ollama-tunnel endpoints return 404
    ✓ rejects POST /internal/tunnel-update and GET /internal/ollama-status (14 ms)
  @issue-133 scheduler gating: no AI cron jobs with AI_SCHEDULERS_ENABLED unset
    ✓ has zero AI cron jobs registered, and the gate itself is inspectable (1 ms)
    ✓ does not register any of the five gated scheduler providers
  @issue-133 scheduler gating: AI cron jobs register when AI_SCHEDULERS_ENABLED=true (positive control)
    ✓ registers every ai: cron job from the five scheduler classes (5 ms)
  @issue-133 notification paging: checks are org-scoped, paginated and bounded
    ✓ checkOverdueInvoices pages through every org, scoping and bounding each invoice query (9 ms)
    ✓ checkUpcomingBillPayments scopes and bounds the bill query
    ✓ checkLowInventory scopes and bounds the item query

Test Suites: 1 passed, 1 total
Tests:       9 passed, 9 total
Snapshots:   0 total
Time:        6.156 s
(exit 0)
```

### 4.5 API Build

```bash
pnpm --filter api build
```

**Output**:

```text
> api@0.1.0 build /Users/abdelrahmanahmed/agents/work.noindex/impl/Mizano-133/apps/api
> nest build

-  TSC  Initializing type checker...
✔  TSC  Initializing type checker...
>  TSC  Found 0 issues.
>  SWC  Running...
Successfully compiled: 652 files with swc (182.42ms)
(exit 0)
```

---

## 5. UI and E2E-Army Gate Status

- **UI Changes**: None. This issue is a backend architecture refactor and dead-code deletion.
- **E2E-Army Gate**: Pure backend refactor / internal:
  `E2E: not needed — pure backend refactor / internal (AI scheduler gating, dead ollama tunnel deletion, narrative route dedupe, notification cron pagination)`
