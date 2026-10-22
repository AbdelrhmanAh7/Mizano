# Verification Report — Issue #133

- **Issue**: [#133 [audit] Move intake extraction out of the API process and remove dead Colab wiring](https://github.com/AbdelrhmanAh7/Mizano/issues/133)
- **PR**: Refs #133 (PR #354 — narrowed per CTO directive to scheduler gating, dead code removal, narrative dedupe, and notification pagination; does **not** close #133)
- **Date**: 2026-10-22
- **Platform**: macOS (Apple Silicon arm64)
- **Base SHA (`master`)**: `bf3f67a8459424775d7102e3b2e3a152fe1f1ec7`
- **Tested Code Head**: `7f5b190476a8e3306333335b7dfe7a69ae9150f7`
- **Originating Sentry Issue**: None (originates from architecture audit #133).
- **Skills Used**: `verification-before-completion`, `systematic-debugging`, `diagnosing-bugs`, `model-effort-routing`, `test-first-engineering`.
- **Model and Effort**: `Tool: Antigravity (agy) · Model: Gemini 3.8 Flash · Effort: High · Why: Fix verification findings (AI insights invalid time value, CORS errors, navigation links), e2e-army test addition, and evidence binding for issue #133`.

---

## 1. Explicit Acceptance Criteria Mapping

Per Issue #133's formal brief and CTO decision (2026-10-12 / 2026-10-18):

| AC ID   | Requirement from Issue #133 Brief                                                                 | Status                  | Evidence / Verification Method                                                                                                                                                                                                                                                                                                                                                                        | Observed Exit Code |
| ------- | ------------------------------------------------------------------------------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| **AC1** | API container starts without `tesseract.js`/`pdf-parse` loaded (process memory & `require.cache`) | **NOT DONE** (Deferred) | Extraction worker extraction into dedicated container deferred to follow-up issue #141 (and branches `ai/42`/`ai/39`). Recorded in `AI_QUESTIONS.md` and `docs/follow-ups.md`.                                                                                                                                                                                                                        | N/A (deferred)     |
| **AC2** | Intake E2E passes with the worker container                                                       | **NOT DONE** (Deferred) | Worker container split is deferred to #141. Recorded in `AI_QUESTIONS.md` and `docs/follow-ups.md`.                                                                                                                                                                                                                                                                                                   | N/A (deferred)     |
| **AC3** | Only one route handler for `ai/narrative`                                                         | **PASSED**              | `NarrativeController` and `FinancialNarrativeService` registration removed from `apps/api/src/modules/ai/ai.module.ts` and kept exclusively in `apps/api/src/modules/ai/forecasting/ai-forecasting.module.ts`. Verified by `apps/api/test/issue-133.e2e-spec.ts`: exactly 1 GET handler registered for `/ai/narrative/monthly`, responds with 401 guard (not 404), proving DI graph resolves cleanly. | 0                  |

### Additional Scope Delivered from Issue #133 Brief

| Scope Item                   | Requirement from Brief                                                                                         | Status     | Evidence / Verification Method                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Observed Exit Code |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| **Scope-DeadCode**           | Delete `ollama-tunnel` controller and `services/ollama-proxy`                                                  | **PASSED** | Deleted `apps/api/src/modules/ai/controllers/ollama-tunnel.controller.ts`, `apps/api/src/modules/ai/controllers/ollama-tunnel.controller.spec.ts`, and `services/ollama-proxy/`. Verified by `apps/api/test/issue-133.e2e-spec.ts`: `POST /internal/tunnel-update` and `GET /internal/ollama-status` return 404.                                                                                                                                                                                                              | 0                  |
| **Scope-Schedulers**         | Gate AI schedulers behind `AI_SCHEDULERS_ENABLED` (defaulting off on Pi profile, enabled on standard profiles) | **PASSED** | 5 AI schedulers (`AiOperationsScheduler`, `AiHrOpsScheduler`, `AiNlpChatScheduler`, `AiSalesCrmScheduler`, `AiSecurityScheduler`) with 29 `@Cron` jobs (out of 36 total API crons) gated behind `AI_SCHEDULERS_ENABLED`. Unset = no AI providers or crons registered. Default off on Pi (`deploy/pi/.env.pi.example`, `deploy/pi/docker-compose.pi.yml`), default enabled in non-Pi profiles (`docker-compose.production.yml`, `.env.*`). Verified by `ai-schedulers.enabled.spec.ts` (14 tests) and `issue-133.e2e-spec.ts`. | 0                  |
| **Scope-NotificationPaging** | Paginate notification cron queries with cursor, limit, and `organizationId` scope                              | **PASSED** | `notifications.service.ts` refactored with `eachPage` generator: cursor pagination with stable `orderBy: { id: 'asc' }`, `take: NOTIFICATION_QUERY_LIMIT` (100) and `NOTIFICATION_BATCH_SIZE` (50), all queries scoped by `organizationId`. Verified by `notifications.service.spec.ts` (6 tests with > 100 rows per org) and `issue-133.e2e-spec.ts`.                                                                                                                                                                        | 0                  |
| **Scope-Dockerfile**         | Remove `@mizano/validators` build from `apps/api/Dockerfile`                                                   | **PASSED** | Removed `pnpm --filter @mizano/validators build` from `apps/api/Dockerfile:37`. Verified container builds without it.                                                                                                                                                                                                                                                                                                                                                                                                         | 0                  |

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

| Test File                                                                   | Type | Tests Executed      | Result          |
| --------------------------------------------------------------------------- | ---- | ------------------- | --------------- |
| `apps/api/src/modules/ai/schedulers/ai-schedulers.enabled.spec.ts`          | Unit | 17 passed, 0 failed | PASSED (exit 0) |
| `apps/api/src/modules/notifications/services/notifications.service.spec.ts` | Unit | 6 passed, 0 failed  | PASSED (exit 0) |
| `apps/api/test/issue-133.e2e-spec.ts`                                       | E2E  | 10 passed, 0 failed | PASSED (exit 0) |
| `apps/web/app/[locale]/(dashboard)/ai-insights/page.spec.tsx`               | Unit | 1 passed, 0 failed  | PASSED (exit 0) |
| `apps/web/app/[locale]/(dashboard)/ai-insights/revenue/page.spec.tsx`       | Unit | 2 passed, 0 failed  | PASSED (exit 0) |
| `apps/web/app/[locale]/(dashboard)/ai-insights/forecast/page.spec.tsx`      | Unit | 2 passed, 0 failed  | PASSED (exit 0) |
| `apps/web/app/[locale]/(dashboard)/ai-insights/[id]/page.spec.tsx`          | Unit | 5 passed, 0 failed  | PASSED (exit 0) |
| `e2e-army/133-ai-insights.e2e.ts`                                           | E2E  | Automated army test | Added           |

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
  AI scheduler gate (issue #133)
    ✓ AI_SCHEDULERS_ENABLED=undefined registers no scheduler providers
    ✓ AI_SCHEDULERS_ENABLED="" registers no scheduler providers
    ✓ AI_SCHEDULERS_ENABLED="false" registers no scheduler providers
    ✓ AI_SCHEDULERS_ENABLED="FALSE" registers no scheduler providers
    ✓ AI_SCHEDULERS_ENABLED="1" registers no scheduler providers
    ✓ AI_SCHEDULERS_ENABLED="yes" registers no scheduler providers
    ✓ AI_SCHEDULERS_ENABLED=true registers the scheduler providers
    scheduler gating: schedulers instantiate cleanly with isEnabled=false and guard execution when disabled
      ✓ AiHrOpsScheduler instantiates with isEnabled=false and skips cron execution when disabled (3 ms)
      ✓ AiHrOpsScheduler instantiates with isEnabled=true when AI_SCHEDULERS_ENABLED is true
      ✓ AiSecurityScheduler instantiates with isEnabled=false and skips cron execution when disabled
      ✓ AiSecurityScheduler instantiates with isEnabled=true when AI_SCHEDULERS_ENABLED is true
      ✓ AiOperationsScheduler instantiates with isEnabled=false and skips cron execution when disabled
      ✓ AiOperationsScheduler instantiates with isEnabled=true when AI_SCHEDULERS_ENABLED is true
      ✓ AiNlpChatScheduler instantiates with isEnabled=false and skips cron execution when disabled
      ✓ AiNlpChatScheduler instantiates with isEnabled=true when AI_SCHEDULERS_ENABLED is true
      ✓ AiSalesCrmScheduler instantiates with isEnabled=false and skips cron execution when disabled
      ✓ AiSalesCrmScheduler instantiates with isEnabled=true when AI_SCHEDULERS_ENABLED is true
PASS src/modules/notifications/services/notifications.service.spec.ts
  NotificationsService movement signs
    ✓ legacy rows report the same low stock (2 ms)
    ✓ new rows report the same low stock
  NotificationsService cursor paging
    ✓ notifies for every overdue invoice of an org with more than one page (1 ms)
    ✓ notifies for every upcoming bill of an org with more than one page (1 ms)
    ✓ checks stock for every goods item of an org with more than one page (1 ms)
    ✓ pages organizations by cursor too, so tenants past the first batch are not skipped (1 ms)

Test Suites: 2 passed, 2 total
Tests:       23 passed, 23 total
Snapshots:   0 total
Time:        3.15 s
(exit 0)
```

### 4.4 E2E Acceptance Suite

```bash
DATABASE_URL="postgresql://mizano:***@localhost:5432/mizano_e2e_133?schema=public" pnpm --filter api exec jest --config ./test/jest-e2e.json issue-133
```

**Output**:

```text
PASS test/issue-133.e2e-spec.ts (10.55 s)
  @issue-133 AC3: exactly one route handler for GET ai/narrative
    ✓ registers exactly one GET handler for /ai/narrative/monthly (2 ms)
    ✓ answers on the single handler (guard 401, not 404), proving the DI graph resolves (8 ms)
  @issue-133 dead code removal: ollama-tunnel endpoints return 404
    ✓ rejects POST /internal/tunnel-update and GET /internal/ollama-status (13 ms)
  @issue-133 scheduler gating: no AI cron jobs with AI_SCHEDULERS_ENABLED unset
    ✓ has zero AI cron jobs registered, and the gate itself is inspectable
    ✓ does not register any of the five gated scheduler providers (1 ms)
    ✓ does not register IntakeProcessorService in the API application (worker isolation) (1 ms)
  @issue-133 scheduler gating: AI cron jobs register when AI_SCHEDULERS_ENABLED=true (positive control)
    ✓ registers every ai: cron job from the five scheduler classes (12 ms)
  @issue-133 notification paging: checks are org-scoped, paginated and bounded
    ✓ checkOverdueInvoices pages through every org, scoping and bounding each invoice query (10 ms)
    ✓ checkUpcomingBillPayments scopes and bounds the bill query (2 ms)
    ✓ checkLowInventory scopes and bounds the item query (4 ms)

Test Suites: 1 passed, 1 total
Tests:       10 passed, 10 total
Snapshots:   0 total
Time:        10.655 s
(exit 0)
```

---

## 5. UI and E2E-Army Gate Status

- **UI Changes**: Addressed verification issues on AI Insights subpages (`/en/ai-insights`, `/en/ai-insights/forecast`, `/en/ai-insights/revenue`, `/en/ai-insights/[id]`, `/en/reports/ap-aging`): safe date formatting and locale-aware link routing (`@/i18n/routing`).
- **E2E-Army Gate**: Natural-language test added at `e2e-army/133-ai-insights.e2e.ts` tagged `feat:mz-ai-insights` covering dashboard navigation, forecast, revenue, and Arabic RTL layout (`/ar/ai-insights`).

---

## 6. QA Review Findings Resolution & CTO Hard-Rule Alignment

1. **Finding 5e46ab104a1d (`apps/api/src/modules/ai/operations/ai-operations.module.ts:58`)**:
   - _Review finding_: `IntakeQueueService/IntakeProcessorService are still registered as providers in the API module... The extraction worker must be moved to a separate entrypoint and unregistered from the API module before #133 can close.`
   - _Root cause & Resolution_: Master already integrated PR #141 (`b8c0ab1e8b2d`), decoupling `IntakeProcessorService` into `IntakeWorkerModule` and dedicated worker entrypoint `intake-worker.ts`. In `ai-operations.module.ts:57-59`, clarified with explicit comments that `IntakeProcessorService` is decoupled and only the client `IntakeQueueService` is provided for enqueueing. Added an automated regression test in `apps/api/test/issue-133.e2e-spec.ts:194-197` proving `app.get(IntakeProcessorService, { strict: false })` throws in the API container context.
2. **Finding b49fd5c3ec79 (`apps/api/src/modules/ai/schedulers/ai-hr-ops.scheduler.ts:23`) & Finding bcd64679ec8b (`apps/api/src/modules/ai/schedulers/ai-security.scheduler.ts:11`)**:
   - _Review finding_: `The guard() method is called in all cron methods but there's no check in the constructor to prevent the service from being registered entirely when AI_SCHEDULERS_ENABLED is false.`
   - _CTO directive_: `PR 3: Implement scheduler gating via AI_SCHEDULERS_ENABLED without throwing in constructors when disabled.`
   - _Root cause & Resolution_: Throwing exceptions in provider constructors breaks NestJS dependency injection graph compilation. Instead of throwing, gating is enforced cleanly:
     - At registration time, `aiSchedulerProviders(...)` omits all five AI schedulers from module provider lists unless `AI_SCHEDULERS_ENABLED=true`.
     - At instantiation time, constructors set `this.enabled = false` and log the disabled state without throwing.
     - Schedulers provide `isEnabled(): boolean` and `guard()` short-circuits any `@Cron` executions before reaching Prisma or dependencies.
     - Verified with 17 unit tests in `apps/api/src/modules/ai/schedulers/ai-schedulers.enabled.spec.ts` covering clean instantiation, `isEnabled()`, and complete no-op short-circuiting on crons.
3. **Hard-Rule Security Clearance (CTO `decision=blocked-hard-rule` / `credentials / secrets`)**:
   - _Hold Cause_: Modifications to `.env.dev`, `.env.local`, `.env.prod`, and `.env.sit` matched `SECRET_PATH` in `prHardRule`, triggering the automated credentials hold.
   - _Resolution_: Reverted `.env.dev`, `.env.local`, `.env.prod`, and `.env.sit` to `origin/master`. Non-example environment files are kept untouched. `AI_SCHEDULERS_ENABLED` is cleanly configured via `.env.example`, `deploy/pi/.env.pi.example`, and compose profile defaults (`docker-compose.production.yml` and `deploy/pi/docker-compose.pi.yml`), completely clearing the hold.

---

## 7. Verification Findings Resolution (Thoth Status / Round 9)

1. **[high] AI Insights pages not loading properly ("Invalid time value")**:
   - _Symptom_: Error boundary caught `RangeError: Invalid time value` on `/en/ai-insights/revenue` and subpages.
   - _Root Cause_: In `revenue/page.tsx:256,259`, code did `format(new Date(month.date + '-01'), ...)`. Backend returns `isoDate` formatted as `YYYY-MM-DD` (e.g. `2026-10-01`). Appending `'-01'` created invalid date string `2026-10-01-01`. Additionally, unvalidated `createdAt` in `page.tsx` and `[id]/page.tsx` threw when undefined or unparseable.
   - _Fix_: Added `parseMonthDate(dateStr)` in `revenue/page.tsx` (only appending `'-01'` if input matches `YYYY-MM`), and `formatDateSafe` helpers in `forecast/page.tsx`, `page.tsx`, and `[id]/page.tsx`.
   - _Regression Evidence_:
     - `revenue/page.spec.tsx`: Demonstrates failure on base (`RangeError: Invalid time value`) and passing cleanly on head.
     - `forecast/page.spec.tsx`: Demonstrates failure on base with empty/invalid dates and passing on head.
     - `page.spec.tsx`: Demonstrates failure on base with invalid dates and passing on head.
     - Ran: `pnpm --filter web exec jest "ai-insights"` -> 4 test suites, 10 tests passed (exit 0).

2. **[high] CORS errors affecting multiple pages**:
   - _Symptom_: Browser console logged: `Access to fetch at 'http://localhost:4309/en/...' (redirected from 'http://127.0.0.1:4309/...') has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource`.
   - _Root Cause_: Next.js middleware redirected RSC prefetch requests missing the locale prefix to `http://localhost:4309`, crossing origins from `http://127.0.0.1:4309` without CORS headers.
   - _Fix_:
     - `apps/web/middleware.ts`: Implemented `applyCorsAndNormalizeRedirect` to rewrite redirect `Location` host to match incoming request `host`, preserving the same origin and eliminating cross-origin redirects. Added standard CORS headers to middleware responses and handled `OPTIONS` preflight.
     - `apps/web/app/[locale]/(dashboard)/ai-insights/**`: Replaced `next/link` with locale-aware `{ Link } from '@/i18n/routing'` to prevent unnecessary 307 redirects.
     - `apps/api/src/main.ts`: In non-production, allowed local origins (`localhost` / `127.0.0.1` on any port) to communicate with API without CORS rejection.
