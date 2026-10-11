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

# Issue #127 Verification — Cap Node heap for api and worker from env with validated config

## Overview

- **Issue**: #127 (Cap Node heap for api and worker from env with validated config)
- **Base Commit (`origin/master`)**: `cc1443b`
- **Tested Commit (`ai/127`)**: `bb4df51b04befb3071095109ba489cfd002664b0`
- **Evidence refreshed**: 2026-10-10 (all commands re-run at the tested commit; the commit carrying this refresh changes no code)

---

## Requirements Verification Matrix

| REQ ID | Acceptance Criterion                                                                     | Verification Method                                                                                | Status |
| ------ | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------ |
| REQ-1  | AC1: Unset `MIZANO_NODE_HEAP_MB` adds no flag; behavior is unchanged                     | Automated e2e and unit tests in `apps/api/test/node-heap.e2e-spec.ts`                              | PASSED |
| REQ-2  | AC2: Valid values (128..4096) produce `--max-old-space-size=<n>`                         | Automated e2e and unit tests for 128, 512, 4096 and hex `0x80`                                     | PASSED |
| REQ-3  | AC3: Values below 128, above 4096 and non-numeric fail fast naming `MIZANO_NODE_HEAP_MB` | Automated e2e and unit tests with 127, 4097, abc, 1.5, 128.5, empty string, 0, -1, 0x7f, 0x1001    | PASSED |
| REQ-4  | AC4: Documented in `.env.example` (suggested Pi 5 value: 1024)                           | File-content assertions and excerpt below; README config section                                   | PASSED |
| REQ-5  | AC5: Launcher forwards signals to the child and exits non-zero or by signal              | E2E tests for SIGTERM→exit 42 and a second, later signal while the child is still running          | PASSED |
| REQ-6  | Scope: no `.github/` files touched                                                       | `git diff origin/master...HEAD --stat` (12 files, 806 insertions, 8 deletions, 0 `.github/` files) | PASSED |

---

## Test Execution Evidence

### 1. Acceptance & Unit Test Suite (`node-heap.e2e-spec.ts`)

Command:

```bash
pnpm --filter api exec jest --config ./test/jest-e2e.json node-heap
```

Output:

```text
PASS test/node-heap.e2e-spec.ts
  Node Heap Launcher (@flow:node-heap @issue-127)
    @issue-127 AC1: Unset heap cap behavior
      ✓ @e2e @flow:node-heap @issue-127 AC1: launches node without --max-old-space-size when unset (156 ms)
      ✓ @unit @flow:node-heap @issue-127 AC1: parseHeapMb returns undefined and buildNodeArgs adds no flag when unset (2 ms)
    @issue-127 AC2: Valid heap cap configurations
      ✓ @e2e @flow:node-heap @issue-127 AC2: launches node with --max-old-space-size=128 for input 128 and caps heap (156 ms)
      ✓ @e2e @flow:node-heap @issue-127 AC2: launches node with --max-old-space-size=512 for input 512 and caps heap (163 ms)
      ✓ @e2e @flow:node-heap @issue-127 AC2: launches node with --max-old-space-size=4096 for input 4096 and caps heap (151 ms)
      ✓ @e2e @flow:node-heap @issue-127 AC2: launches node with --max-old-space-size=128 for input 0x80 and caps heap (155 ms)
      ✓ @unit @flow:node-heap @issue-127 AC2: parseHeapMb parses 128 as 128 and buildNodeArgs prepends argument
      ✓ @unit @flow:node-heap @issue-127 AC2: parseHeapMb parses 512 as 512 and buildNodeArgs prepends argument
      ✓ @unit @flow:node-heap @issue-127 AC2: parseHeapMb parses 4096 as 4096 and buildNodeArgs prepends argument (1 ms)
      ✓ @unit @flow:node-heap @issue-127 AC2: parseHeapMb parses 0x80 as 128 and buildNodeArgs prepends argument
    @issue-127 AC3: Invalid heap cap values fail fast
      ✓ @e2e @flow:node-heap @issue-127 AC3: fails fast with non-zero exit and names MIZANO_NODE_HEAP_MB when value is 127 (77 ms)
      ✓ @e2e @flow:node-heap @issue-127 AC3: fails fast with non-zero exit and names MIZANO_NODE_HEAP_MB when value is 4097 (76 ms)
      ✓ @e2e @flow:node-heap @issue-127 AC3: fails fast with non-zero exit and names MIZANO_NODE_HEAP_MB when value is abc (78 ms)
      ✓ @e2e @flow:node-heap @issue-127 AC3: fails fast with non-zero exit and names MIZANO_NODE_HEAP_MB when value is 1.5 (81 ms)
      ✓ @e2e @flow:node-heap @issue-127 AC3: fails fast with non-zero exit and names MIZANO_NODE_HEAP_MB when value is 128.5 (82 ms)
      ✓ @e2e @flow:node-heap @issue-127 AC3: fails fast with non-zero exit and names MIZANO_NODE_HEAP_MB when value is  (82 ms)
      ✓ @e2e @flow:node-heap @issue-127 AC3: fails fast with non-zero exit and names MIZANO_NODE_HEAP_MB when value is 0 (81 ms)
      ✓ @e2e @flow:node-heap @issue-127 AC3: fails fast with non-zero exit and names MIZANO_NODE_HEAP_MB when value is -1 (81 ms)
      ✓ @e2e @flow:node-heap @issue-127 AC3: fails fast with non-zero exit and names MIZANO_NODE_HEAP_MB when value is 0x7f (77 ms)
      ✓ @e2e @flow:node-heap @issue-127 AC3: fails fast with non-zero exit and names MIZANO_NODE_HEAP_MB when value is 0x1001 (76 ms)
      ✓ @unit @flow:node-heap @issue-127 AC3: parseHeapMb throws error naming MIZANO_NODE_HEAP_MB for 127 (4 ms)
      ✓ @unit @flow:node-heap @issue-127 AC3: parseHeapMb throws error naming MIZANO_NODE_HEAP_MB for 4097 (1 ms)
      ✓ @unit @flow:node-heap @issue-127 AC3: parseHeapMb throws error naming MIZANO_NODE_HEAP_MB for abc
      ✓ @unit @flow:node-heap @issue-127 AC3: parseHeapMb throws error naming MIZANO_NODE_HEAP_MB for 1.5
      ✓ @unit @flow:node-heap @issue-127 AC3: parseHeapMb throws error naming MIZANO_NODE_HEAP_MB for 128.5
      ✓ @unit @flow:node-heap @issue-127 AC3: parseHeapMb throws error naming MIZANO_NODE_HEAP_MB for
      ✓ @unit @flow:node-heap @issue-127 AC3: parseHeapMb throws error naming MIZANO_NODE_HEAP_MB for 0
      ✓ @unit @flow:node-heap @issue-127 AC3: parseHeapMb throws error naming MIZANO_NODE_HEAP_MB for -1
      ✓ @unit @flow:node-heap @issue-127 AC3: parseHeapMb throws error naming MIZANO_NODE_HEAP_MB for 0x7f (1 ms)
      ✓ @unit @flow:node-heap @issue-127 AC3: parseHeapMb throws error naming MIZANO_NODE_HEAP_MB for 0x1001
      ✓ @flow:node-heap @issue-127: does not interpolate raw value into error message (76 ms)
    @issue-127 AC4: Documentation
      ✓ @flow:node-heap @issue-127 AC4: documents MIZANO_NODE_HEAP_MB in .env.example
      ✓ @flow:node-heap @issue-127 AC4: documents MIZANO_NODE_HEAP_MB in README.md
    @issue-127 AC5: Signal forwarding to child process
      ✓ @e2e @flow:node-heap @issue-127: forwards SIGTERM to the child and exits non-zero or by signal (152 ms)
      ✓ @e2e @flow:node-heap @issue-127: forwards subsequent signals while child is still running (179 ms)

Test Suites: 1 passed, 1 total
Tests:       35 passed, 35 total
Snapshots:   0 total
Time:        3.386 s
Ran all test suites matching /node-heap/i.
```

### 2. Validators Unit Tests (`node-heap-mb.schema.spec.ts`)

Command:

```bash
pnpm --filter @mizano/validators test
```

Output:

```text
PASS test/node-heap-mb.schema.spec.ts
  nodeHeapMbSchema
    ✓ returns undefined when unset (1 ms)
    ✓ parses valid value 128 (1 ms)
    ✓ parses valid value 4096
    ✓ rejects value below minimum (127)
    ✓ rejects value above maximum (4097)
    ✓ rejects non-numeric string (abc)
    ✓ parses valid hex representation 0x80 as 128 (1 ms)
    ✓ rejects decimal number (1.5)
    ✓ rejects fractional number within range (128.5)
    ✓ rejects hex value below minimum (0x7f)
    ✓ rejects hex value above maximum (0x1001)
    ✓ rejects empty string

Test Suites: 1 passed, 1 total
Tests:       12 passed, 12 total
Snapshots:   0 total
Time:        0.81 s
Ran all test suites.
```

### 3. Lint

Command:

```bash
pnpm lint
```

Output:

```text
> mizano@0.1.0 lint <repo-root>
> turbo lint

• turbo 2.8.12
• Packages in scope: @mizano/shared-types, @mizano/validators, @mizano/web, api
• Running lint in 4 packages
api:lint: > eslint "src/**/*.ts" (apps/api)
@mizano/validators:lint: > eslint "src/**/*.ts" (packages/validators)
@mizano/web:lint: > next lint (apps/web) — pre-existing warnings only, no new errors

 Tasks:    4 successful, 4 total
```

(The only lint output from changed packages is the eslint invocation above; `apps/web` prints its pre-existing warnings listed earlier on the branch's first evidence commit.)

### 4. Type-Check

Command:

```bash
pnpm type-check
```

Output:

```text
> mizano@0.1.0 type-check <repo-root>
> turbo type-check

• turbo 2.8.12
• Packages in scope: @mizano/shared-types, @mizano/validators, @mizano/web, api
api:type-check: > tsc --noEmit && tsc --noEmit -p test/tsconfig.e2e.json (apps/api)
@mizano/validators:type-check: > tsc --noEmit (packages/validators)

 Tasks:    6 successful, 6 total
```

## Signal Forwarding Verification

The launcher defines named handlers (`handleSigterm`, `handleSigint`, `handleSighup`) and forwards a signal only while the child has not exited (`childExited` flag plus `child.exitCode`/`child.signalCode` still null) — so a later SIGINT/SIGTERM is still delivered even when the child catches and ignores the first signal (review finding: a `child.killed` check would drop it). On child exit with a signal it maps the signal via `os.constants.signals[signal]` and exits with `128 + signum`; unknown signals are re-raised via `process.kill(process.pid, signal)` after removing the handlers. Otherwise it exits with `code ?? 0`. The `MIZANO_NODE_HEAP_MB` fail-fast keeps exit code 1.

Command:

```bash
node apps/api/scripts/start-node.js -e 'setInterval(() => {}, 1000)' & LAUNCHER=$!; sleep 1; kill -TERM $LAUNCHER; wait $LAUNCHER; echo "launcher exit: $?"
```

Output:

```text
launcher exit: 143
```

The launcher received SIGTERM, forwarded it to the child, and exited with the conventional signal status 143 (128 + 15). The e2e suite additionally proves the full mapping: a probe that exits with `process.exit(42)` on SIGTERM yields launcher exit code 42 with null signal, and a probe that ignores SIGTERM still receives a subsequent SIGINT and exits 43.

## Fast-Fail Error Output on Invalid Configuration

Command:

```bash
MIZANO_NODE_HEAP_MB=100 node apps/api/scripts/start-node.js dist/main
```

Output:

```text
[mizano] Failed to start node: MIZANO_NODE_HEAP_MB must be an integer between 128 and 4096
```

Exit code: 1

The message names the variable and the accepted range and does not include the rejected value (the raw value must never be echoed, per repo rules on never logging raw secrets).

## Manual Verification of V8 Heap Size Limit

Commands:

```bash
node -e "console.log('Unset default heap_size_limit:', require('v8').getHeapStatistics().heap_size_limit)"
node apps/api/scripts/start-node.js -e "console.log('Unset launcher heap_size_limit:', require('v8').getHeapStatistics().heap_size_limit)"
MIZANO_NODE_HEAP_MB=1024 node apps/api/scripts/start-node.js -e "console.log('1024MB launcher heap_size_limit:', require('v8').getHeapStatistics().heap_size_limit)"
MIZANO_NODE_HEAP_MB=512 node apps/api/scripts/start-node.js -e "console.log('512MB launcher heap_size_limit:', require('v8').getHeapStatistics().heap_size_limit)"
```

Output:

```text
Unset default heap_size_limit: 4395630592
Unset launcher heap_size_limit: 4395630592
1024MB launcher heap_size_limit: 1174405120
512MB launcher heap_size_limit: 637534208
```

## `.env.example` Content (Pi 5 recommendation only)

```text
# ============================================
# MIZANO ERP - Environment Template
# ============================================
# Copy this file to .env.local for local development.

# ── Node Memory Limits ──────────────────────────────────────
# Optional: Cap Node V8 heap space in MB (integer between 128 and 4096).
# Must be exported in the service/process environment (shell, systemd, or container env)
# before the launcher starts Node. When unset, Node defaults are used.
# Suggested starting value for Raspberry Pi 5 (8GB): 1024.
# Note: In containerized setups, MIZANO_NODE_HEAP_MB must be passed in the compose profile (#39).
# MIZANO_NODE_HEAP_MB=1024
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
