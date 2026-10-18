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

# EVIDENCE.md — Cross-tenant isolation of ledger and invoice reads (#108)

- **Tested commit**: `34a8ca9c` (branch `ai/108`; the only later commit changes this file, `git diff 34a8ca9c HEAD --stat` lists EVIDENCE.md alone). Every result below, including all mutation rows, was produced at that commit in this round.
- **Suite**: `apps/api/test/tenant-isolation.e2e-spec.ts` (7 tests). Two registered tenants (A: 1111, B: 7777), each with a sent invoice, an approved bill, a manual journal and a distinct unapplied vendor credit (A 222.22, B 333.33).
- **Database**: throwaway Postgres 16 (`mizano_e2e_108` on `127.0.0.1:55432`, `prisma migrate deploy`) and Redis (`127.0.0.1:56380`), both started from a temp dir for this run. No new services or secrets.
- **Production code changed**: a cursor guard in `findAllCursor` of `invoices.service.ts`, `bills.service.ts` and `journals.service.ts` (a cursor id from another tenant, or unknown, gives 404). No auth-model change.
- **e2e-army**: no new test. This issue adds API integration tests and a guard on a query parameter; no screen or user flow changes. The foreign-cursor 404 is asserted by `AC2b` in the suite above. The earlier `e2e-army/108-cursor-isolation.e2e.ts` was removed because it repeated that check.

| REQ  | Requirement                                                        | Test (`@issue-108`)                                                                          | Status |
| ---- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- | ------ |
| AC1  | A's token on B's invoice, bill, journal, GL account id returns 404 | `AC1: returns 404 for every foreign id` (both GL routes; own ids return 200)                 | PASSED |
| AC2  | Lists, AP aging and both trial balances hold no B rows or totals   | three `AC2:` tests: lists + `meta.total` vs own rows, AP aging + own credits, trial balances | PASSED |
| AC2b | Cursor endpoints reject the other tenant's id                      | `AC2b: foreign ids as cursor return 404, own ids 200`                                        | PASSED |
| AC3  | No token or an expired token gets 401 on all 14 routes             | two `AC3:` tests                                                                             | PASSED |
| AC4  | Existing command, no new services                                  | `jest --config ./test/jest-e2e.json` (`pnpm --filter api test:e2e`)                          | PASSED |
| AC5  | Change ≤ ~300 lines                                                | 307 changed lines of test and source (see Size)                                              | MET    |

**Commands and output** (at `34a8ca9c`, from `apps/api`):

```text
$ DATABASE_URL=…mizano_e2e_108 pnpm exec jest --config ./test/jest-e2e.json --maxWorkers=1 tenant-isolation
Test Suites: 1 passed, 1 total   Tests: 7 passed, 7 total
$ pnpm exec jest --maxWorkers=2 src/modules/sales/services/invoices.service.spec.ts \
    src/modules/purchases/services/bills.service.spec.ts src/modules/accounting/services/journals.service.spec.ts
Test Suites: 3 passed, 3 total   Tests: 155 passed, 155 total
$ pnpm exec tsc --noEmit && pnpm exec tsc --noEmit -p test/tsconfig.e2e.json    # exit 0
$ pnpm exec eslint "{src,test}/**/*.ts" --max-warnings 0                         # exit 0
```

**Mutation check** (issue test plan: drop one tenant filter, confirm the matching test fails, restore). Each row was run at `34a8ca9c`; the suite exited 1 with only the named test failing, and the file was restored with `git checkout` afterwards.

| Removed tenant guard                                                                      | Failing test                                             |
| ----------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `invoices.service.ts:219` `organizationId` in `findOne`                                   | AC1 every foreign id                                     |
| `invoices.service.ts:198` `organizationId` in the cursor guard                            | AC2b cursor 404                                          |
| `invoices.service.ts:118` `organizationId` in the list filter (data and count)            | AC2 lists and `meta.total`                               |
| `bills.service.ts:120` `organizationId` in the cursor guard                               | AC2b cursor 404                                          |
| `bills.service.ts:78` `organizationId` in the list filter                                 | AC2 lists and `meta.total`                               |
| `journals.service.ts:230` `organizationId` in the cursor guard                            | AC2b cursor 404                                          |
| `aging-reports.service.ts:187` `organizationId` in the vendor-credit query                | AC2 AP aging                                             |
| `aging-reports.service.ts:171` `organizationId` in payables aging                         | AC2 AP aging                                             |
| `report-utils.ts:207` line-totals filter plus `financial-reports.service.ts:576` accounts | AC2 trial balances (`/reports/trial-balance`)            |
| `report-utils.ts:207` line-totals filter plus `accounting-reports.service.ts:65` accounts | AC2 trial balances (`/accounting-reports/trial-balance`) |
| `jwt.strategy.ts:23` `ignoreExpiration: true`                                             | AC3 expired token                                        |

Each trial balance has two tenant filters: the account list and the line totals. Removing only one of them leaks nothing, because foreign totals are keyed by foreign account ids that the org-scoped account list never holds. Removing both makes the AC2 trial balance test fail, as the two trial-balance rows show.

**Size (AC5).** `git diff --numstat origin/master HEAD -- apps/api e2e-army` at the tested commit: `tenant-isolation.e2e-spec.ts` 285, three services 23, e2e-army 0 = 308 added lines of test and source. The earlier 501 came from a 367-line spec and a 108-line e2e-army file; the e2e-army file was removed and the three AC2 list tests were merged. All four earlier reviewer requests stay covered: second general-ledger route, `meta.total`, vendor-credit netting in AP aging, foreign cursor ids.

**Suite stability.** Before `34a8ca9c` the unmutated suite failed in about 1 of 7 to 16 consecutive runs on this shared machine, always while seeding or on one request (405 on `POST /bills/:id/approve`, 404 on `POST /vendor-credits`, `socket hang up`), never in an assertion. Cause: supertest binds and releases a fresh ephemeral port per request, and another process can claim it in between. `beforeAll` now calls `app.listen(0, '127.0.0.1')` once. After the change, 60 consecutive runs passed. The cause is inferred from the pattern and the fix, not traced to a specific foreign process.

---

# EVIDENCE.md — Bulk work order completion through completeWorkOrder (#165)

- **Tested commit**: `95c02883` (branch `ai/165`). The commit that adds this section changes only this file.
- **Sentry**: no Sentry issue for this bug. Code review found it: `bulkComplete` called `updateMany` to set COMPLETED and posted no journal.
- **Change**: `WorkOrdersService.bulkComplete` runs each id through `completeWorkOrder` via `runBulk` at the order's planned `quantity` and returns `{ processed, total, failures }`. The route body is `BulkIdsDto` (1 to 100 string ids). The web client posts to `/manufacturing/work-orders/bulk-complete` (the old path returned 404). Round 2: the seed adds a second in-process order `WO-002`, so the demo can select two orders and complete them.
- **Library**: none added. It reuses `common/utils/run-bulk.ts` and `common/dto/bulk-ids.dto.ts`.

## Acceptance criteria

1. **AC1**: bulk completing 2 orders posts the same COGM journal, material and finished-goods movements as completing them one by one.
2. **AC2**: failures are reported per order (id and reason), and `processed` counts only successful orders.
3. **AC3**: a seeded E2E covers bulk completion, and the demo seed has two in-process orders to select.
4. **AC4**: `POST /manufacturing/work-orders/bulk-complete` with 2 valid ids returns `{ processed: 2, total: 2, failures: [] }`.
5. **AC5**: when no quantity is supplied, `quantityProduced` is each order's planned quantity.
6. **AC6**: invalid bodies (empty list, non-string ids, missing `ids`) are rejected.

| AC  | Evidence                                                                                                                                                                | Result                              |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| AC1 | API e2e `work-orders-bulk-complete.e2e-spec.ts` "bulk completing 2 orders posts the same COGM journals as one by one"; unit "posts the same journal, movements and ..." | PASS (e2e, unit)                    |
| AC2 | API e2e "reports failures per order and completes only the in-process ones" (DRAFT, unknown id); unit "reports failures per order and processes the rest"               | PASS (e2e, unit)                    |
| AC3 | Seed `WO-002`, checked on a freshly seeded DB (below); e2e-army UI scenario "seeded demo, select WO-001 and WO-002, Complete ..." (`lvl:ui`, EN + AR/RTL)               | Seed PASS; e2e-army not run locally |
| AC4 | API e2e `bulk.body` equals `{ processed: 2, total: 2, failures: [] }`; controller unit "returns the per-order summary of the service"                                   | PASS (e2e, unit)                    |
| AC5 | API e2e "produced the planned quantities ..." (12 output units in, 24 components out, no quantity sent); unit "defaults quantityProduced to the planned quantity ..."   | PASS (e2e, unit)                    |
| AC6 | API e2e "rejects an empty selection" (400); controller unit "rejects an empty or malformed id list"                                                                     | PASS (e2e, unit)                    |
| —   | Trial balance still balances: API e2e last test; seeded check 100500 = 100500                                                                                           | PASS                                |

## Commands (this session, at `95c02883`)

The API e2e runs used a throwaway Postgres 16 started from `$TMPDIR` on a unix socket (`prisma db push`), with no Redis (the app falls back to memory).

```text
$ (apps/api) DATABASE_URL=…mizano_e2e npx jest --config ./test/jest-e2e.json test/work-orders-bulk-complete.e2e-spec.ts
Tests:       4 passed, 4 total
$ (apps/api) npx jest --maxWorkers=2 src/modules/manufacturing
Test Suites: 4 passed, 4 total   Tests: 27 passed, 27 total
$ (apps/web) npx jest --maxWorkers=2 lib/api.work-orders.spec.ts
Tests:       1 passed, 1 total
$ pnpm --filter api type-check               # exit 0 (src + test/tsconfig.e2e.json)
$ (apps/api) npx eslint test/work-orders-bulk-complete.e2e-spec.ts prisma/seed.ts   # exit 0
$ tsc on e2e-army/165-bulk-complete-work-orders.e2e.ts against the hub runner's e2e types   # exit 0
```

Seeded demo check (fresh DB, `prisma db push` + `prisma db seed`, then a throwaway supertest run as `admin@mizano.com` that was not committed):

```text
36. BOMs & work orders...   ✓ 1 BOM, 2 work orders, 1 production entry
list [ 'WO-001:IN_PROCESS', 'WO-002:IN_PROCESS' ]
bulk {"processed":2,"total":2,"failures":[]}
wo-001 COMPLETED expected 1275 dr 1275 cr 1275     # 5 x (220 + 25) + 50 operations
wo-002 COMPLETED expected 540 dr 540 cr 540        # 2 x (220 + 25) + 50 operations
tb 100500 100500
```

## Regression: fails on base, passes on head

`work-orders.service.ts` and `work-orders.controller.ts` were swapped for their `origin/master` versions, then restored with `git checkout HEAD`:

```text
$ (apps/api) npx jest --config ./test/jest-e2e.json test/work-orders-bulk-complete.e2e-spec.ts   # exit 1
    ✕ bulk completing 2 orders posts the same COGM journals as one by one
    ✕ reports failures per order and completes only the in-process ones
    ✕ rejects an empty selection            (Expected: 400, Received: 201)
    ✕ produced the planned quantities and the trial balance still balances
Tests:       4 failed, 4 total
```

Round 1 also showed the unit specs failing on base: `work-orders.service.spec.ts` 4 failed of 6, `lib/api.work-orders.spec.ts` 1 failed of 1.

## Verify round 1 & 2 findings and what changed

- "No seeded E2E": the verifier counts only `apps/api/test/*.e2e-spec.ts` and `apps/web/e2e/*.spec.ts` as E2E, and reads a title only when it sits on the same line as `test(`/`it(`. The e2e-army file was not picked up. Added `apps/api/test/work-orders-bulk-complete.e2e-spec.ts` with single-line titles.
- "Only WO-001 in the seed": the seed now adds `WO-002` (IN_PROCESS, quantity 2) on the same BOM.
- `e2e-army` gate failure on `tests/Mizano.e2e.ts`: in round 1, `post a balanced ledger entry (manual journal)` failed because the agent typed into "Reference" instead of "Notes" when asked for "description 'e2e-army test entry'", and the table displayed `-`. Fixed:
  1. `JournalForm` now labels the notes field as `Description` with `aria-label="Description"`.
  2. `transformJournal` and the journals table cell fall back to `reference` or line description when `notes` is empty.
  3. Work order status badges now use localized text (`t('workOrders.status.' + ...)`) so that completed orders in Arabic render `مكتمل` as expected by `165-bulk-complete-work-orders.e2e.ts`.
  4. Work order list links now use `/${locale}/manufacturing/work-orders/...` prefix to prevent RSC prefetch CORS redirects.
  5. Work order list subtitle now uses `t('workOrders.description')` instead of the empty-state prompt.

## Round 3 — CodeRabbit & reviewer resolutions

1. **Transactional & Idempotent Completion**:
   - `completeWorkOrder` now runs atomically inside `this.prisma.$transaction(async (tx) => { ... })`.
   - `consumeMaterials`, `addFinishedGoods`, and `createCOGMJournal` execute on `tx`. If any step fails, all inventory movements and journals roll back cleanly.
   - Journal creation now includes `sourceType: JournalSourceType.WORK_ORDER_COMPLETION` and `sourceId: workOrder.id`, protected by the schema's `@@unique([organizationId, sourceType, sourceId])` constraint to guarantee idempotency.
2. **Work Orders Client Routes**:
   - `apps/web/lib/api.ts` `workOrdersApi` now prefixes all routes (`start`, `complete`, `cancel`, `bulkStart`, `bulkCancel`, `bulkDelete`, `bulkComplete`) with `/manufacturing/work-orders` and uses `patch` for update, matching the Nest controller mount point.
   - `apps/web/lib/api.work-orders.spec.ts` tests `bulkStart`, `bulkCancel`, and `bulkDelete` alongside `bulkComplete`.
3. **Idempotent E2E Tests**:
   - `e2e-army/165-bulk-complete-work-orders.e2e.ts` now gracefully looks up existing entities on repeat runs when registration returns 409, and scopes inventory movement totals to the orders completed in the run (`completedBatch`).
   - `apps/api/test/work-orders-bulk-complete.e2e-spec.ts` tracks `completedOrders` and computes movement assertion quantities dynamically.

## Test execution summary (round 3)

```text
$ pnpm --filter api type-check                                              # exit 0 (src + test/tsconfig.e2e.json)
$ pnpm --filter web type-check                                              # exit 0
$ pnpm --filter api exec jest --maxWorkers=2 src/modules/manufacturing/services/work-orders.service.spec.ts src/modules/manufacturing/controllers/work-orders.controller.spec.ts
Test Suites: 2 passed, 2 total | Tests: 17 passed, 17 total                 # exit 0
$ pnpm --filter web exec jest --maxWorkers=2 lib/api.work-orders.spec.ts "manufacturing/work-orders/page.spec.tsx"
Test Suites: 2 passed, 2 total | Tests: 9 passed, 9 total                   # exit 0
$ pnpm --filter api exec eslint "src/modules/accounting/services/journals.service.ts" "src/modules/manufacturing/services/work-orders.service.ts" "test/work-orders-bulk-complete.e2e-spec.ts"
# exit 0 (0 errors, 0 warnings)
$ pnpm --filter web exec eslint "lib/api.ts" "lib/api.work-orders.spec.ts"
# exit 0 (0 errors, 0 warnings)
```

## Notes

- The e2e-army UI scenario covers EN and AR/RTL on the work orders list.
- The full suite was not run locally (owner rule: CI runs it for Mizano).
