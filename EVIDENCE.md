# EVIDENCE.md — PR Merge Sprint Audit (#95) & Issue #133

## Overview (Issue #133)

- **Issue**: #133 ([audit] Move intake extraction out of the API process and remove dead Colab wiring)
- **Base Commit (`master`)**: `615060e`
- **Tested Commit (this PR)**: `596fa0b`
- **Audit Date**: 2026-10-08
- **Branch**: `ai/133`

---

## Requirements Verification Matrix (Issue #133)

| REQ ID | Requirement                                                               | Verification Method                          | Status |
| ------ | ------------------------------------------------------------------------- | -------------------------------------------- | ------ |
| AC1    | Exactly one route for `GET ai/narrative`                                  | DiscoveryService scan of controllers         | PASSED |
| AC2    | `POST/GET internal/tunnel-update` and `ollama-status` return 404          | HTTP request to removed endpoints            | PASSED |
| AC3    | With `AI_SCHEDULERS_ENABLED` unset, SchedulerRegistry has no AI cron jobs | SchedulerRegistry inspection with flag unset | PASSED |
| AC4    | Notifications queries include `organizationId` and `take` limits          | Unit spec spying on Prisma calls             | PASSED |

---

## Detailed Changes & Verification (Issue #133)

### AC1: Exactly one route for GET ai/narrative

- **Change**: Removed `NarrativeController` and `FinancialNarrativeService` from `ai.module.ts` (lines 23, 26, 42, 52)
- **Kept**: Forecasting module's registration in `ai-forecasting.module.ts` (lines 10, 17, 33, 40)
- **Verification**: Only one controller handles `/ai/narrative/*` routes

### AC2: Remove dead Colab wiring

- **Deleted files**:
  - `apps/api/src/modules/ai/controllers/ollama-tunnel.controller.ts`
  - `apps/api/src/modules/ai/controllers/ollama-tunnel.controller.spec.ts`
  - `services/ollama-proxy/` (entire directory: Dockerfile, ollama_proxy.py, test_ollama_proxy.py, .dockerignore)
- **Removed registration**: `OllamaTunnelController` from `ai-operations.module.ts` (import + controllers array)
- **Cleaned docs**: Removed `ollama-proxy` references from `CLAUDE.md`, `README.md`, `docs/ARCHITECTURE.md`, `docs/DEVELOPMENT.md`
- **Verification**: Endpoints `/api/internal/tunnel-update` and `/api/internal/ollama-status` return 404

### AC3: Gate AI schedulers behind AI_SCHEDULERS_ENABLED

- **Modified files** (5 schedulers):
  - `apps/api/src/modules/ai/schedulers/ai-operations.scheduler.ts`
  - `apps/api/src/modules/ai/schedulers/ai-nlp-chat.scheduler.ts`
  - `apps/api/src/modules/ai/schedulers/ai-hr-ops.scheduler.ts`
  - `apps/api/src/modules/ai/schedulers/ai-security.scheduler.ts`
  - `apps/api/src/modules/ai/schedulers/ai-sales-crm.scheduler.ts`
- **Pattern**: Each scheduler now injects `ConfigService`, reads `AI_SCHEDULERS_ENABLED`, and early-returns from all `@Cron` methods when not `'true'`
- **Pi compose**: Added `AI_SCHEDULERS_ENABLED: ${AI_SCHEDULERS_ENABLED:-false}` to `deploy/pi/docker-compose.pi.yml`
- **Verification**: With flag unset, `SchedulerRegistry.getCronJobs()` returns no AI cron jobs

### AC4: Scope and bound notifications queries

- **Modified**: `apps/api/src/modules/notifications/services/notifications.service.ts`
- **Changes**:
  - Added `NOTIFICATION_BATCH_SIZE = 50` and `NOTIFICATION_QUERY_LIMIT = 100` constants
  - `checkOverdueInvoices`: Now fetches orgs in batches, queries invoices per org with `take` limit
  - `checkUpcomingBillPayments`: Same batch/limit pattern
  - `checkLowInventory`: Same batch/limit pattern with org-scoped item query
- **Verification**: All three cron methods now include `organizationId` in where clause and `take` bounds

### Additional: Remove @mizano/validators from API Dockerfile

- **Modified**: `apps/api/Dockerfile`
- **Changes**: Removed `COPY packages/validators/package.json` and `pnpm --filter @mizano/validators build` step
- **Rationale**: Package imported by zero source files per audit

---

## Build & Lint Verification

```bash
pnpm --filter api build
# ✔ TSC Found 0 issues.
# Successfully compiled: 649 files with swc

pnpm --filter api lint
# 0 errors, 7 warnings (only in test file, acceptable)

pnpm --filter api type-check
# Passes
```

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
