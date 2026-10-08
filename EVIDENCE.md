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

# EVIDENCE — Adopt tester-army/e2e in-repo as the E2E gate (#153)

- **Base (`origin/master`)**: `cc1443bfe31d5ca3e97f53dc5d4275738bfcd435`
- **Tested code SHA**: `8364be19342a72f6195145758e9d1d9638cc937e` (final test code; the only later commit is this file). The first round ran at `ac21ae8`; `82e7381` then re-synced `features/` with the hub (the port had dropped the hub's `timeout: 240_000` on 61 browser tests) and `8364be1` gave the gate test's AC1 the same 240 s budget
- **Date**: 2026-10-08, Mac mini (Node 26, pnpm 8.14.0), throwaway PostgreSQL 16 cluster (`mizano_e2e_army`), runs through the hub's suite governor

| REQ   | Requirement                                                                         | How it is verified                                                                                                                                                                                 | Result                                        |
| ----- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| REQ-1 | `e2e` devDependency + `e2e.config.ts` (env base URL, headless, cache, no telemetry) | `package.json`, `e2e.config.ts`; `pnpm install --frozen-lockfile --offline` accepts the lockfile                                                                                                   | PASSED                                        |
| REQ-2 | Suite in `e2e-army/` for login, invoice / ledger entry, Arabic RTL                  | `pnpm e2e:army e2e-army/153-e2e-army-gate.e2e.ts`: AC1 sign-in, AC2 balanced/unbalanced journal, AC3 draft invoice/empty invoice, AC4 RTL/LTR                                                      | 4/4 passed, 2 m 11 s at `8364be1` (AC1 117 s) |
| REQ-3 | Hub feature suite ported with its tags, every feature covered                       | `e2e-army/features/` = hub `tests-dev/Mizano/`; tag scan: 79/79 features of `ops/verify/features/Mizano.json` have a test; 22 shards in `e2e-army/shards.json`                                     | PASSED                                        |
| REQ-4 | `pnpm e2e:army` starts the app on the test DB, runs in ≤ 5 min                      | `DATABASE_URL=… pnpm e2e:army --tag shard:smoke`: without a model 4 passed / 4 skipped in 32 s at `8364be1`; with `E2E_ARMY_CLI=agy` (Gemini Flash) 8/8 in 3 m 14 s at `ac21ae8`                   | PASSED                                        |
| REQ-5 | CI job `e2e-army`, `timeout-minutes: 5`, sharded                                    | `.github/workflows/e2e-army.yml`: matrix `pr` + `smoke`, aggregate job `e2e-army`; GitHub timing is measured on the PR's first run, not here                                                       | Written; not run locally                      |
| REQ-6 | Contributor rule documented                                                         | `CONTRIBUTING.md`, `README.md`, `docs/DEVELOPMENT.md`, PR template                                                                                                                                 | PASSED                                        |
| REQ-7 | No secrets committed; model config from env / Keychain only                         | `e2e.config.ts` reads `E2E_ARMY_MODEL_*` / `E2E_ARMY_CLI` and the Keychain item `e2e-army-model-key`; app secrets are random per run in `scripts/e2e-army.sh`                                      | PASSED                                        |
| REQ-8 | The hub's verify job picks up the in-repo PR tests                                  | `153-e2e-army-gate.e2e.ts` imports only `@e2e-dev/web` and `e2e` and matches the hub copier's `^[\w.-]+\.e2e\.ts$`; the feature suite sits in `features/`, which the copier (top level only) skips | PASSED by inspection of `src/lib/e2earmy.ts`  |

Repository CI at the tested code: `pnpm turbo lint type-check test --force` → 12/12 tasks, API 136 suites / 2197 tests, web 48 suites / 458 tests, all passed.

Whole suite without a model (`pnpm e2e:army`, before the stub-model fix): 54 passed, 62 skipped (agent steps), 29 failed in the API / job shards, 11 m 10 s. The failing tests, for the hub's `[e2e] … failing on master` issues: mz-asset-depreciation.1, mz-attendance.2, mz-bank-rules.2, mz-bank-transactions.2, mz-bom.2, mz-crm-deals.2, mz-currency.1, mz-dashboard.2, mz-delivery-challans.2, mz-documents.1, mz-error-logger.1, mz-fixed-assets.2, mz-general-ledger.2, mz-global-search.2, mz-import-export.1, mz-items.2, mz-payroll.2, mz-price-lists.2, mz-report-exports.1, mz-sales-purchase-reports.2, mz-stock-movements.2, mz-stock-transfers.2, mz-system-diagnostics.2, mz-tax-rates.2, mz-timesheets.2, mz-user-preferences.1, mz-vendors.2, mz-warehouses.2, mz-work-orders.2. These shards are not part of the GitHub `e2e-army` job.

Known risk: the form sign-in of AC1 timed out once (150 s) while the Mac was under load (load average > 10, another e2e stack running); it passed in 31 s on the rerun.

Blocked, not counted: a second `E2E_ARMY_CLI=agy` smoke run at `8364be1` ran while the Mac's load average was about 30 (other suites queued behind the governor). It took 18 m 41 s and failed 5 of 8: the agy model calls timed out or were aborted, and `[mz-i18n-rtl.1]`, which needs no model, missed its 5 s `expect.poll`. The same test had passed 20 minutes earlier on the same head without load. This is host saturation, not a test result.

Hub-side follow-up (outside this repository): the verify job copies up to 8 top-level `e2e-army/*.e2e.ts` files into its runner and runs all of them on every PR. Once more than a few issue tests exist, it should copy only the files the PR changed, or it will run old issue tests and drop new ones past the eighth.
