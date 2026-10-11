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

# EVIDENCE.md — Run the e2e suites in a CI gate and unify the API jest configs (#134)

- **Issue**: #134 (`[audit] Run the 11 e2e suites in a gate and unify the two API jest configs`)
- **Base (`origin/master`)**: `fcaed262cd11876a9876c921f9dc4d04a351a0ed`
- **Tested head**: the parent of the commit that carries this file (it adds the final `e2e` job to `.github/workflows/ci.yml`, restores the `prisma migrate deploy` assertion in `test-gate.e2e-spec.ts` and deletes `AI_QUESTIONS.md`; the runs below were made with exactly those files, `git log -1 --format=%H` of the PR's last commit before this one)
- **Environment**: macOS (Darwin 27), Node v26.10.0, pnpm 8.14.0, PostgreSQL 16 (own throwaway cluster on 127.0.0.1:56134, `test` user, database dropped, recreated and migrated with `prisma migrate deploy` before every run, deleted afterwards), no Redis (`REDIS_URL=` blank)
- **Not run**: the GitHub Actions `E2E Tests` job itself (it first runs after the push; its commands were reproduced locally step by step), and the full unit suite (owner rule 2026-10-08: GitHub-hosted CI runs it).

## Requirements

| REQ | Requirement                                                                                     | Verified by                                                                                                                                                                                                                                                                                                                                                                                          | Status |
| --- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| AC1 | `ci.yml` has an `e2e` job that fails when `reports.e2e-spec.ts` fails                           | `.github/workflows/ci.yml` job `e2e` (`E2E Tests`, ubuntu-latest, 5 min, `postgres:16-alpine` service, `prisma migrate deploy`, `run: pnpm test:e2e`, `REDIS_URL: ''`, no `continue-on-error`, no secrets); `test/test-gate.e2e-spec.ts` now always runs its ci.yml check (the skip is gone) and passes against the real job; a deliberately failing reports test makes `pnpm test:e2e` fail (below) | PASSED |
| AC2 | `node apps/api/_run_tests.js` and `pnpm --filter api test` load the same config file            | `test/test-gate.e2e-spec.ts` (2 AC2 tests): no inline `jest` block; both `--showConfig` outputs are equal, same project id                                                                                                                                                                                                                                                                           | PASSED |
| R3  | `test:e2e` turbo task                                                                           | `turbo.json` `test:e2e` (`cache: false`, `DATABASE_URL`/`REDIS_URL`/`APP_ENV` passed through); root `test:e2e` = `turbo test:e2e`                                                                                                                                                                                                                                                                    | PASSED |
| R4  | Pin dates in the payment and churn prediction specs                                             | Fake timers per test; 69/69 prediction tests passed with the clock pinned to 2025-12-15 and to 2031-03-02 (at `f1953d1`, files unchanged since)                                                                                                                                                                                                                                                      | PASSED |
| R5  | Specs for depreciation, costing, currency, bank transactions, statement import, bulk operations | Split out to respect the PR size limit (CTO decision on PR #139): #206 costing, #207 currency, #208 depreciation, #209 bank transactions + bulk operations, #210 statement import                                                                                                                                                                                                                    | OPEN   |

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

- **The two configs really diverged.** `_jest.config.js` compiled with `esModuleInterop: true`; `apps/api/tsconfig.json` (the build and the old package.json block) does not. Under `_run_tests.js`, `import.service.hardening.spec.ts` failed 4 tests with `TypeError: csv is not a function`, while CI passed. The unified config compiles with `apps/api/tsconfig.json`, loads `src/test/setup.ts`, keeps the sharp/tesseract stubs and `diagnostics: false` (spec type errors still fail `tsc --noEmit`, which includes `src/**`).
- **Parallel e2e flakes.** Before `--runInBand`, `pnpm test:e2e` failed 5 `intake.e2e-spec.ts` tests (`NEEDS_REVIEW` instead of `EXTRACTED`): each suite boots the full app on the shared database, and another suite's intake sweep processed intake's jobs with the real extractor. In band the run passes.
- **Foreign listener on the supertest port (root-caused and fixed).** After merging master, 2 of 3 fresh in-band runs failed in untouched suites: `reports` › `tenant B sees none of tenant A's figures` (`socket hang up`) and `ai` › `creates no journals while serving AI reads` (`Expected: 200, Received: 407`). 407 is a proxy answer. `createTestApp` never listened, so supertest bound the wildcard `::` on port 0 and dialled `127.0.0.1:<port>`. On macOS that bind succeeds even when another process already holds `127.0.0.1:<port>`; reproduced with two plain node servers: `bind :: on 60656 succeeded while 127.0.0.1 held`, `127.0.0.1 answered 407`. This also explains the earlier one-off anonymous 200 in `accountant-journey`. Fix: `createTestApp` listens on `127.0.0.1` itself (`test/helpers/app.helper.ts`), and `auth.e2e-spec.ts` asserts the address. After the fix, 4 of 4 fresh runs passed.

## Commands and results (tested head)

```text
$ dropdb/createdb mizano_e2e && pnpm --filter api exec prisma migrate deploy
All migrations have been successfully applied.
$ REDIS_URL= pnpm test:e2e          # turbo test:e2e -> jest --config ./test/jest-e2e.json --runInBand
run1: Test Suites: 14 passed, 14 total / Tests: 307 passed, 307 total (exit 0)
run2: Test Suites: 14 passed, 14 total / Tests: 307 passed, 307 total (exit 0)
run3: Test Suites: 14 passed, 14 total / Tests: 307 passed, 307 total (exit 0)
run4: Test Suites: 14 passed, 14 total / Tests: 307 passed, 307 total (exit 0)

$ pnpm --filter api type-check
> tsc --noEmit && tsc --noEmit -p test/tsconfig.e2e.json      (exit 0)
$ pnpm --filter api exec eslint test/helpers/app.helper.ts test/auth.e2e-spec.ts test/test-gate.e2e-spec.ts   (no output)
```

The 14 suites include `test-gate.e2e-spec.ts` (AC1 and AC2 checks against the committed `ci.yml` and package scripts) and the two suites master added since (`delivery-challan-isolation`, `node-heap`).

## A failing reports suite fails the gate

On the tested head, one deliberately failing test was appended to `reports.e2e-spec.ts` (`expect('0.0000').toBe('1.0000')`), run on a fresh database, then reverted:

```text
$ REDIS_URL= pnpm test:e2e
api:test:e2e: FAIL test/reports.e2e-spec.ts
api:test:e2e:   ● Reports and dashboard reconcile with the ledger (e2e) › deliberate break (#134 gate check)
api:test:e2e: Test Suites: 1 failed, 13 passed, 14 total
api:test:e2e: Tests:       1 failed, 307 passed, 308 total
Failed:    api#test:e2e
exit=1
```

The `E2E Tests` job runs the same `pnpm test:e2e` with no `continue-on-error` and no `|| true`, so the job fails the same way.

## Final head re-run (job as committed in ci.yml)

Fresh database (`createdb` + `pnpm --filter api exec prisma migrate deploy`), `REDIS_URL=` blank, same env as the job:

```text
$ pnpm test:e2e
api:test:e2e: PASS test/reports.e2e-spec.ts ... PASS test/test-gate.e2e-spec.ts (14 suites, none skipped)
api:test:e2e: Test Suites: 14 passed, 14 total
api:test:e2e: Tests:       307 passed, 307 total
```

`pnpm --filter api type-check` exit 0; `eslint test/test-gate.e2e-spec.ts` clean; `prettier --check` on `ci.yml` and the spec clean.

Fail-first for AC1 on this head (a `deliberate break` test appended to `reports.e2e-spec.ts`, then reverted):

```text
$ pnpm test:e2e -- --testPathPattern reports
api:test:e2e: FAIL test/reports.e2e-spec.ts   ✕ deliberate break (#134 gate check)
api:test:e2e: Tests: 1 failed, 15 passed, 16 total
Failed:    api#test:e2e            (turbo exits 1; the job has nothing that masks it)
```

AC2 on this head: `test-gate.e2e-spec.ts` › "\_run_tests.js and pnpm --filter api test load the same config" passes (equal `--showConfig`, same project id; sharp/tesseract.js stubs present in `_jest.config.js`).

Why `auth.e2e-spec.ts` and `helpers/app.helper.ts` changed: setup only. `createTestApp` now listens on `127.0.0.1` (see the foreign-listener finding above) so `auth.e2e-spec.ts` no longer calls `app.listen(0)` itself and reads the bound port instead; one `expect` was added (address is `127.0.0.1`), none removed or loosened.

## Remaining scope of #134 (R5), tracked separately

PR body says `Refs #134`, not `Closes`. Specs for ledger-writing services with none, each asserting exact Decimal journal lines, tenant scoping and idempotent retries: #206 costing (FIFO/COGS), #207 currency (`convertToBaseCurrency`, unrealised FX), #208 depreciation, #209 bank-transactions + bulk-operations, #210 bank-statement-import.
