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

# EVIDENCE.md — Run the e2e suites in a CI gate and unify the API jest configs (#134)

- **Issue**: #134 (`[audit] Run the 11 e2e suites in a gate and unify the two API jest configs`)
- **Base (`master`)**: `615060ed6294e16375a1f1ea9385cb7e812cd24f`
- **Tested head**: `f1953d1fd4b14ecbcd879a78dcb2e17db193dd14` (everything below ran on it unless noted; this file is the only later change)
- **Environment**: macOS (Darwin 27), Node v26.10.0, pnpm 8.14.0, PostgreSQL 16 (own throwaway cluster on 127.0.0.1:56134, fresh database per run, stopped and deleted afterwards), no Redis (`REDIS_URL=` blank)
- **Not run**: the GitHub Actions `e2e` job itself. CI and deploy workflows are disabled on the repository, so the job was reproduced locally with the same commands (`prisma migrate deploy`, then `pnpm test:e2e`).

## Requirements

| REQ | Requirement                                                                                     | Verified by                                                                                                                                         | Status |
| --- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| AC1 | `ci.yml` has an `e2e` job that fails when `reports.e2e-spec.ts` fails                           | `test/test-gate.e2e-spec.ts` (3 AC1 tests); local run of the job's commands with a deliberately failing reports test exits 1                        | PASSED |
| AC2 | `node apps/api/_run_tests.js` and `pnpm --filter api test` load the same config file            | `test/test-gate.e2e-spec.ts` (2 AC2 tests): no inline `jest` block; both `--showConfig` outputs are equal, same project id                          | PASSED |
| R3  | `test:e2e` turbo task                                                                           | `turbo.json` `test:e2e` (`cache: false`, `DATABASE_URL`/`REDIS_URL`/`APP_ENV` passed through); root `test:e2e` = `turbo test:e2e`; AC1 test asserts | PASSED |
| R4  | Pin dates in the payment and churn prediction specs                                             | Fake timers per test; 69/69 prediction tests pass with the clock pinned to 2025-12-15 and to 2031-03-02                                             | PASSED |
| R5  | Specs for depreciation, costing, currency, bank transactions, statement import, bulk operations | Not in this PR (size limit); see AI_QUESTIONS.md                                                                                                    | OPEN   |

## Acceptance tests fail first

`a555a3177787f9f357ab445fb0fc6b9511eec501` (tests only), `cd apps/api && npx jest --config ./test/jest-e2e.json --testPathPattern test-gate`:

```text
✕ AC1: ci.yml has an e2e job that runs pnpm test:e2e on PostgreSQL      (e2eJob undefined)
✕ AC1: a failing e2e suite fails the job (nothing masks the exit code)  (root test:e2e was "pnpm --filter api test:e2e")
✓ AC1: the e2e config collects reports.e2e-spec.ts and every other suite
✕ AC2: package.json has no inline jest block and its jest scripts use _jest.config.js
✕ AC2: _run_tests.js and pnpm --filter api test load the same config    (id 3f1aa816… vs 4e6f0e4c…)
Tests: 4 failed, 1 passed, 5 total
```

## Findings while implementing

- **The two configs really diverged.** `_jest.config.js` compiled with `esModuleInterop: true`; `apps/api/tsconfig.json` (the build and the old package.json block) does not. Under `_run_tests.js`, `import.service.hardening.spec.ts` failed 4 tests with `TypeError: csv is not a function`, while CI passed. The unified config compiles with `apps/api/tsconfig.json`, loads `src/test/setup.ts`, keeps the sharp/tesseract stubs and `diagnostics: false` (spec type errors still fail `tsc --noEmit`, which includes `src/**`). The transform now matches `.ts` only, which removes a ts-jest `allowJs` warning on the two JS mocks.
- **Parallel e2e flakes.** Before `--runInBand`, `pnpm test:e2e` failed 5 `intake.e2e-spec.ts` tests (`NEEDS_REVIEW` instead of `EXTRACTED`); the same suite alone passed 16/16. Each suite boots the full app on the shared database, and another suite's intake sweep processed intake's jobs with the real extractor. In band the run passes and is faster locally (40 s instead of about 105 s).
- **One unexplained flake.** In the deliberate-break run, `accountant-journey` › `get /organization/account-settings returns 401` got 200 once. Guards, JWT strategy and interceptors show no bypass, and the next run on the same code passed. This shared Mac has other sessions listening on localhost ports (an earlier session saw HTTP 407 from the proxy), so a supertest ephemeral-port collision is the likely cause. Not reproduced; reported, not fixed.

## Commands and results (tested head)

```text
$ pnpm turbo lint type-check test --force
Tasks:    12 successful, 12 total
api:test:          Test Suites: 136 passed, 136 total / Tests: 2197 passed, 2197 total
@mizano/web:test:  Test Suites: 48 passed, 48 total / Tests: 458 passed, 458 total

$ dropdb/createdb mizano_e2e && pnpm --filter api exec prisma migrate deploy
All migrations have been successfully applied.
$ REDIS_URL= pnpm test:e2e          # turbo test:e2e -> jest --config ./test/jest-e2e.json --runInBand
Test Suites: 12 passed, 12 total
Tests:       262 passed, 262 total
Tasks:       3 successful, 3 total   (exit 0)

$ node apps/api/_run_tests.js --showConfig      -> id=4e6f0e4cdaa5b5c0606fd4ef9c9af360 setup=src/test/setup.ts
$ pnpm --filter api test -- --showConfig        -> id=4e6f0e4cdaa5b5c0606fd4ef9c9af360 setup=src/test/setup.ts
```

## A failing reports suite fails the gate

At `f5cd05221d2573f6014a12ef40805cc73151ffa0` (CI job and scripts as in the tested head), one deliberately failing test was added to `reports.e2e-spec.ts` (`expect('0.0000').toBe('1.0000')`), then reverted:

```text
$ REDIS_URL= pnpm test:e2e
api:test:e2e: FAIL test/reports.e2e-spec.ts
api:test:e2e: Test Suites: 2 failed, 10 passed, 12 total
api:test:e2e:  ELIFECYCLE  Command failed with exit code 1.
Failed:    api#test:e2e
pnpm test:e2e exit=1
```

The second failed suite in that run is the `accountant-journey` flake described above.
