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

# Issue #130 — Payroll, depreciation and COGM post through JournalsService

- **Tested code SHA**: `2ae0cabc660aa4efb7cb272b8fb47169f4930662` (branch `ai/130`; master `fcaed26` merged in `fa7fa07`). The commit that adds this record only touches `EVIDENCE.md`.
- **Environment**: macOS (UTC+3), Node 26, my own PostgreSQL 16 cluster on `127.0.0.1:55130` (fresh databases, `prisma migrate deploy`), `REDIS_URL=` blank.
- **Round**: review round 2 (CTO "changes needed" and CodeRabbit review on PR #195, 2026-10-10/11). The round 1 record for `9bae74c` is kept below.

## Review round 2: findings and fixes

| Finding (source)                                                                                                         | Fix                                                                                                                                        | Verified by                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| PR conflicted with master (CTO 1)                                                                                        | merge `fa7fa07`; EVIDENCE.md keeps master's #95 and #127 records byte for byte                                                             | `prisma migrate deploy` on a fresh database applies `20261008000000_payslip_soft_delete` after master's latest `20261003000000_intake_jobs`     |
| Fully depreciated assets could not be disposed (CodeRabbit, CTO 2)                                                       | `3ae774e`: ACTIVE and FULLY_DEPRECIATED in the pre-check and the guarded update                                                            | unit "disposes a fully depreciated asset" and "rejects an asset in a non-disposable status"; e2e AC-Dispose; e2e-army disposal flow             |
| Gain/loss account chosen without the sign, 6100 Rent Expense possible (CodeRabbit, CTO 3)                                | `3ae774e`: gain to an active income account (7100 first, else the highest-coded INCOME/REVENUE), loss to the highest-coded active EXPENSE  | unit gain to 7100, gain fallback, loss never 6100, each balanced; e2e AC-GainLoss and the loss account type; e2e-army disposal flow             |
| Depreciation posted or reversed out of order, register drifted from the ledger (CodeRabbit, CTO 4)                       | `f465a47`: order guards under the ledger lock, latest-only reversal, register = sum of posted periods, monthly run catches up oldest first | unit "period order" (the three rejection tests fail with the guards removed); e2e AC-Order, AC-Register, AC-CatchUp; e2e-army depreciation flow |
| Depreciation spec did not assert the asset update (CodeRabbit, CTO 5)                                                    | `f465a47`: one mock resolver per lookup                                                                                                    | register payload asserted after a posting, at salvage, after a reversal and with nothing posted                                                 |
| bulk-complete skipped the COGM command (CodeRabbit outside-diff, CTO 6)                                                  | `e2f0dbe`: `runBulk` over `completeWorkOrder`, `@InvalidatesLedger` on the route                                                           | unit bulk tests (one journal per order, completed meanwhile, locked period); e2e bulk AC1; e2e-army COGM flow                                   |
| A deleted processed run blocked its period (CodeRabbit)                                                                  | `2a9a0a8`: guarded restore as a fresh draft                                                                                                | unit lifecycle tests; e2e AC-SoftDelete recreate; e2e-army payroll flow                                                                         |
| `softDeleteRuns` checked before it wrote (CodeRabbit)                                                                    | `2a9a0a8`: claim first, payslips of the runs with this exact `deletedAt`                                                                   | unit "soft-deletes the payslips of exactly the runs it claimed"                                                                                 |
| `markAsPaid` read accounts before the ledger lock (CodeRabbit)                                                           | `f72b450` (round 1 progress commit)                                                                                                        | unit "takes the ledger lock before reading the posting accounts"                                                                                |
| e2e-army: fixed-seed organization breaks a re-run, lock date without `finally`, account 1100 missing (CodeRabbit, CTO 7) | `5f057fe`, `ae54861`                                                                                                                       | e2e-army 4/4 on a fresh database and 4/4 again on the same stack                                                                                |
| E-mail/PDF/employee changes widen the scope (CTO 8)                                                                      | kept and explained in `f995f7f`                                                                                                            | see Scope below; e-mail spec fixed (14/14 with the PDF spec)                                                                                    |
| Found by the e2e-army run: no ledger cache was cleared after these postings                                              | `2a57e99`: `CacheInvalidationInterceptor` on the assets, payroll and work-order controllers                                                | wiring spec (fails with the interceptor removed); e2e-army reads its journals through the API                                                   |
| Found by hub test mz-payroll.2: UTC month bounds dropped the 1st of the month                                            | `2ae0cab`: local-time month bounds, as attendance is stored                                                                                | unit bounds test (fails with UTC bounds on this UTC+3 machine); e2e records attendance through the API on the 1st; mz-payroll.2 passes          |

## Acceptance criteria

| REQ                                                                                         | Verified by                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC1 a double run of each posting yields one journal                                         | e2e: concurrent pay x2, manual + monthly depreciation, concurrent dispose x2, concurrent complete x2 and bulk complete (twice) each leave one journal per `PAYROLL`, `DEPRECIATION`, `ASSET_DISPOSAL`, `COGM` source id; e2e-army: the same through the HTTP API |
| AC2 reversing depreciation keeps the original `isPosted=true` and creates a linked reversal | e2e AC2 and e2e-army (original still posted, `reversedBy` set, reversal posted and balanced); unit (no `journal.update`, `reversalOfId` set, latest period only)                                                                                                 |
| AC3 unit tests assert debits = credits and that a lock date rejects the post                | payroll, depreciation, disposal and COGM specs run the real `JournalsService` over the mocked client (balance and lock date); e2e and e2e-army lock-date tests                                                                                                   |
| Decimal amounts, per-line rounding, remainder absorption                                    | e2e AC-Decimal (payslip, schedule) and COGM `0.3333` / `1.11`; unit payslip and schedule rounding                                                                                                                                                                |
| Payslips soft-deleted                                                                       | e2e AC-SoftDelete; migration `20261008000000_payslip_soft_delete`                                                                                                                                                                                                |

## Commands and results (round 2, `2ae0cab`)

```bash
cd apps/api && npx jest src/modules/hr/services/payroll.service.spec.ts src/modules/assets/services \
  src/modules/manufacturing/services/work-orders.service.spec.ts src/modules/manufacturing/controllers/work-orders.controller.spec.ts \
  src/modules/documents/services/email.service.spec.ts src/modules/documents/services/pdf.service.spec.ts \
  src/modules/accounting/services/journals.service.spec.ts src/common/interceptors/cache-invalidation.interceptor.spec.ts
```

```text
Test Suites: 9 passed, 9 total
Tests:       132 passed, 132 total
```

```bash
cd apps/api && DATABASE_URL=<fresh database> REDIS_URL= npx jest --config ./test/jest-e2e.json --runInBand test/system-postings.e2e-spec.ts
pnpm --filter api type-check   # tsc --noEmit && tsc --noEmit -p test/tsconfig.e2e.json
pnpm --filter api lint         # eslint "{src,apps,libs,test}/**/*.ts"
```

```text
Tests:       19 passed, 19 total
type-check: exit 0
lint: exit 0, no problems
```

e2e-army (`e2e-army/130-postings.e2e.ts`, e2e v0.18.0 with the hub's `e2e.config.ts`) against this branch's API: `nest build`, then `node dist/main.js` with the verify stack's environment from `ops/verify/Mizano.sh` (production mode, random JWT secrets, no Redis/SMTP/AI services, relaxed rate limits) on a fresh migrated and seeded database:

```text
fresh run:  Tests  4 passed (4)   Duration  1.74s
re-run:     Tests  4 passed (4)   Duration  61.39s   (includes one 60 s wait for the auth rate limit)
```

Hub feature API tests for the touched features (`tests-dev/Mizano/banking.e2e.ts` and `people.e2e.ts`, `--grep` on the five ids), each run on a fresh database:

| Test                    | master `fcaed26`                                        | `ai/130` `2ae0cab`     |
| ----------------------- | ------------------------------------------------------- | ---------------------- |
| mz-asset-depreciation.1 | failed (an unscheduled period answers 500)              | passed                 |
| mz-payroll.2            | passed                                                  | passed                 |
| mz-fixed-assets.2       | failed (an asset accepts another tenant's account: 201) | failed, same assertion |
| mz-bom.2                | failed (a second active BOM for the item: 201)          | failed, same assertion |
| mz-work-orders.2        | failed (component level 10, expected 4)                 | failed, same assertion |

The three failures are identical on master and come from code this PR does not change (asset creation, BOM creation, inventory levels).

Not run locally, per the owner's directive (2026-10-08: the full suites and the build run on CI after the push): the full API unit suite, the web unit suite, the full API e2e suite and the builds. The UI e2e-army smoke (`tests/Mizano.e2e.ts`) needs the web build and a model; the verify job runs it.

## Scope

- Kept: the payslip read filters in `email.service.ts`, `pdf.service.ts` and `employees.service.ts` (from `f72b450`). The soft delete leaves rows that used to be hard-deleted, so every reader must skip `deletedAt` rows (review lessons: soft-deleted parents return 404). Without the filters a deleted payslip could still be e-mailed, rendered as a PDF or listed on the employee.
- Depreciation order: the first posting of an asset may start at any period, so a backdated asset starts depreciating in the month it is first run (the hub test mz-asset-depreciation.1 expects exactly that). From then on periods post and reverse strictly in order, and the asset register is the sum of the posted periods, so it equals the ledger whatever the order.
- Size: this round changes about 1,150 lines, most of them tests (unit, e2e, e2e-army). That is above the ~300-line guideline; the reviewers asked for all of these fixes in this PR.

## Remaining limitations

- Backdated assets: the periods before an asset's first posting stay open and are not posted (there is no opening accumulated depreciation input), so its book value stays above salvage; the register still equals the ledger.
- `GET /employees?limit=...` answers "Database validation error", and `PATCH /organization/lock-date` hands a date-only string straight to Prisma (400). Both are pre-existing and outside #130; the e2e-army test avoids them.
- `checkMaterialAvailability` and the asset summary still use float arithmetic for display figures (not postings).
- The CodeRabbit threads are answered by the commits above. Replying on GitHub is left to the harness (this session does not push).
- Reviewer: none yet. This record is the author's own run.

## Round 1 (`9bae74c`, before the review)

The acceptance tests were committed failing first (`5bb0a38`): 12 of 12 failed on master behaviour (float totals `569.6891`, no source-linked journal, lock date ignored, two concurrent disposals/completions both returning 2xx). `4bb3a60` changed the expected rounding scale from 4 dp to the codebase's `CURRENCY_SCALE` (2 dp); the assertions stay exact.

### Commands and results (round 1)

```bash
cd apps/api && npx jest --config ./test/jest-e2e.json --runInBand   # fresh DB
```

```text
Test Suites: 12 passed, 12 total
Tests:       269 passed, 269 total
```

```bash
cd apps/api && node _run_tests.js
```

```text
Test Suites: 1 failed, 136 passed, 137 total
Tests:       4 failed, 2213 passed, 2217 total
```

The one failing suite is `import.service.hardening.spec.ts`, which this branch does not touch. It passes on its own (`npx jest src/modules/import-export/services/import.service.hardening.spec.ts`: 9 passed) and fails only inside the full run after the offline install.

```bash
cd apps/web && npx jest
cd apps/api && npx tsc --noEmit -p . && npx tsc --noEmit -p test/tsconfig.e2e.json
cd apps/api && npx eslint "{src,test}/**/*.ts" --max-warnings 0
```

```text
Test Suites: 48 passed, 48 total
Tests:       458 passed, 458 total
tsc: exit 0 (both projects)
eslint: exit 0, no warnings
```
