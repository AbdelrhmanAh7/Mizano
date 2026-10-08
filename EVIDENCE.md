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
- **Base Commit (`master`)**: `615060ed6294e16375a1f1ea9385cb7e812cd24f`
- **Tested Commit (`ai/127`)**: `acd9181824d290baf5b82dea724e97d57f73149b`
- **Implementation Date**: 2026-10-08

---

## Requirements Verification Matrix

| REQ ID | Acceptance Criterion                                                                     | Verification Method                                                                             | Status |
| ------ | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------ |
| REQ-1  | AC1: Unset `MIZANO_NODE_HEAP_MB` adds no flag; behavior is unchanged                     | Automated e2e and unit tests in `apps/api/test/node-heap.e2e-spec.ts`                           | PASSED |
| REQ-2  | AC2: Valid values (128..4096) produce `--max-old-space-size=<n>`                         | Automated e2e and unit tests for 128, 512 and 4096                                              | PASSED |
| REQ-3  | AC3: Values below 128, above 4096 and non-numeric fail fast naming `MIZANO_NODE_HEAP_MB` | Automated e2e and unit tests with 127, 4097, abc, 1.5, empty string, 0 and -1                   | PASSED |
| REQ-4  | AC4: Documented in `.env.example` (suggested Pi 5 value: 1024)                           | File-content assertions in `apps/api/test/node-heap.e2e-spec.ts`                                | PASSED |
| REQ-5  | AC5: Launcher forwards signals to the child and exits non-zero or by signal              | Automated e2e test spawning `start-node.js` with a long-running `-e` script and sending SIGTERM | PASSED |
| REQ-6  | Scope: no `.github/` files touched                                                       | `git diff master...HEAD --stat` (13 files, 608 insertions, 1 deletion, 0 `.github/` files)      | PASSED |

---

## Test Execution Evidence

### 1. Acceptance & Unit Test Suite (`node-heap.e2e-spec.ts`)

Command:

```bash
pnpm --filter api exec jest --config ./test/jest-e2e.json node-heap
```

Output:

```text
PASS test/node-heap.e2e-spec.ts (6.468 s)
  Node Heap Launcher (@flow:node-heap @issue-127)
    @issue-127 AC1: Unset heap cap behavior
      ✓ @e2e @flow:node-heap @issue-127 AC1: launches node without --max-old-space-size when unset (310 ms)
      ✓ @unit @flow:node-heap @issue-127 AC1: parseHeapMb returns undefined and buildNodeArgs adds no flag when unset (3 ms)
    @issue-127 AC2: Valid heap cap configurations
      ✓ @e2e @flow:node-heap @issue-127 AC2: launches node with --max-old-space-size=128 and caps heap (250 ms)
      ✓ @e2e @flow:node-heap @issue-127 AC2: launches node with --max-old-space-size=512 and caps heap (237 ms)
      ✓ @e2e @flow:node-heap @issue-127 AC2: launches node with --max-old-space-size=4096 and caps heap (252 ms)
      ✓ @unit @flow:node-heap @issue-127 AC2: parseHeapMb parses { input: '128', expected: 128 } and buildNodeArgs prepends argument
      ✓ @unit @flow:node-heap @issue-127 AC2: parseHeapMb parses { input: '512', expected: 512 } and buildNodeArgs prepends argument (1 ms)
      ✓ @unit @flow:node-heap @issue-127 AC2: parseHeapMb parses { input: '4096', expected: 4096 } and buildNodeArgs prepends argument
    @issue-127 AC3: Invalid heap cap values fail fast
      ✓ @e2e @flow:node-heap @issue-127 AC3: fails fast with non-zero exit and names MIZANO_NODE_HEAP_MB when value is 127 (122 ms)
      ✓ @e2e @flow:node-heap @issue-127 AC3: fails fast with non-zero exit and names MIZANO_NODE_HEAP_MB when value is 4097 (127 ms)
      ✓ @e2e @flow:node-heap @issue-127 AC3: fails fast with non-zero exit and names MIZANO_NODE_HEAP_MB when value is abc (124 ms)
      ✓ @e2e @flow:node-heap @issue-127 AC3: fails fast with non-zero exit and names MIZANO_NODE_HEAP_MB when value is 1.5 (123 ms)
      ✓ @e2e @flow:node-heap @issue-127 AC3: fails fast with non-zero exit and names MIZANO_NODE_HEAP_MB when value is  (137 ms)
      ✓ @e2e @flow:node-heap @issue-127 AC3: fails fast with non-zero exit and names MIZANO_NODE_HEAP_MB when value is 0 (120 ms)
      ✓ @e2e @flow:node-heap @issue-127 AC3: fails fast with non-zero exit and names MIZANO_NODE_HEAP_MB when value is -1 (125 ms)
      ✓ @unit @flow:node-heap @issue-127 AC3: parseHeapMb throws error naming MIZANO_NODE_HEAP_MB for 127 (9 ms)
      ✓ @unit @flow:node-heap @issue-127 AC3: parseHeapMb throws error naming MIZANO_NODE_HEAP_MB for 4097 (1 ms)
      ✓ @unit @flow:node-heap @issue-127 AC3: parseHeapMb throws error naming MIZANO_NODE_HEAP_MB for abc
      ✓ @unit @flow:node-heap @issue-127 AC3: parseHeapMb throws error naming MIZANO_NODE_HEAP_MB for 1.5
      ✓ @unit @flow:node-heap @issue-127 AC3: parseHeapMb throws error naming MIZANO_NODE_HEAP_MB for
      ✓ @unit @flow:node-heap @issue-127 AC3: parseHeapMb throws error naming MIZANO_NODE_HEAP_MB for 0
      ✓ @unit @flow:node-heap @issue-127 AC3: parseHeapMb throws error naming MIZANO_NODE_HEAP_MB for -1 (1 ms)
    @issue-127 AC4: Documentation
      ✓ @flow:node-heap @issue-127 AC4: documents MIZANO_NODE_HEAP_MB in .env.example (1 ms)
      ✓ @flow:node-heap @issue-127 AC4: documents MIZANO_NODE_HEAP_MB in README.md
    @issue-127 AC5: Signal forwarding to child process
      ✓ @e2e @flow:node-heap @issue-127: forwards SIGTERM to the child and exits non-zero or by signal (259 ms)

Test Suites: 1 passed, 1 total
Tests:       25 passed, 25 total
Snapshots:   0 total
Time:        6.779 s
Ran all test suites matching /node-heap/i.
Force exiting Jest: Have you considered using `--detectOpenHandles` to detect async operations that kept running after all tests finished?

```

### 2. Validators Unit Tests (`node-heap-mb.schema.spec.ts`)

Command:

```bash
pnpm --filter @mizano/validators test
```

Output:

```text

> @mizano/validators@0.1.0 test /Users/abdelrahmanahmed/agents/work/impl/Mizano-127/packages/validators
> jest

PASS test/node-heap-mb.schema.spec.ts
  nodeHeapMbSchema
    ✓ returns undefined when unset (1 ms)
    ✓ parses valid value 128
    ✓ parses valid value 4096
    ✓ rejects value below minimum (127) (1 ms)
    ✓ rejects value above maximum (4097)
    ✓ rejects non-numeric string (abc)
    ✓ rejects decimal number (1.5)
    ✓ rejects empty string

Test Suites: 1 passed, 1 total
Tests:       8 passed, 8 total
Snapshots:   0 total
Time:        0.929 s, estimated 1 s
Ran all test suites.

```

### 3. Lint

Command:

```bash
pnpm lint
```

Output:

```text

> mizano@0.1.0 lint /Users/abdelrahmanahmed/agents/work/impl/Mizano-127
> turbo lint

• turbo 2.8.12
• Packages in scope: @mizano/shared-types, @mizano/validators, @mizano/web, api
• Running lint in 4 packages
• Remote caching disabled, using shared worktree cache
@mizano/web:lint: cache hit, replaying logs 0f48b2dbb77a630a
@mizano/shared-types:lint: cache hit, replaying logs 67fa80da681187b5
@mizano/validators:lint: cache hit, replaying logs 851394bb75a7aaaa
api:lint: cache hit, replaying logs 691713db4e17a8a6
@mizano/shared-types:lint:
@mizano/shared-types:lint: > @mizano/shared-types@0.1.0 lint /Users/abdelrahmanahmed/agents/work/ci/wt.noindex/Mizano-7a33833/packages/shared-types
@mizano/shared-types:lint: > eslint "src/**/*.ts"
api:lint:
api:lint: 
api:lint: > api@0.1.0 lint /Users/abdelrahmanahmed/agents/work/impl/Mizano-127/apps/api
api:lint: > eslint "{src,apps,libs,test}/**/*.ts"
api:lint:
api:lint: =============
api:lint:
api:lint: WARNING: You are currently running a version of TypeScript which is not officially supported by @typescript-eslint/typescript-estree.
api:lint:
api:lint: You may find that it works just fine, or you may not.
api:lint:
api:lint: SUPPORTED TYPESCRIPT VERSIONS: >=4.3.5 <5.4.0
api:lint:
api:lint: YOUR TYPESCRIPT VERSION: 5.9.3
api:lint:
api:lint: Please only submit bug reports when using the officially supported version.
api:lint:
api:lint: =============
@mizano/validators:lint:
@mizano/validators:lint: > @mizano/validators@0.1.0 lint /Users/abdelrahmanahmed/agents/work/impl/Mizano-127/packages/validators
@mizano/validators:lint: > eslint "src/**/*.ts"
@mizano/validators:lint:
@mizano/shared-types:lint:
@mizano/web:lint:
@mizano/web:lint: > @mizano/web@0.1.0 lint /Users/abdelrahmanahmed/agents/work/ci/wt.noindex/Mizano-7a33833/apps/web
@mizano/web:lint: > next lint
@mizano/web:lint:
@mizano/web:lint: Attention: Next.js now collects completely anonymous telemetry regarding usage.
@mizano/web:lint: This information is used to shape Next.js' roadmap and prioritize features.
@mizano/web:lint: You can learn more, including how to opt-out if you'd not like to participate in this anonymous program, by visiting the following URL:
@mizano/web:lint: https://nextjs.org/telemetry
@mizano/web:lint:
@mizano/web:lint:
@mizano/web:lint: ./app/[locale]/(dashboard)/crm/page.tsx
@mizano/web:lint: 15:3  Warning: 'Activity' is defined but never used. Allowed unused vars must match /^_/u.  @typescript-eslint/no-unused-vars
@mizano/web:lint: 29:3  Warning: 'getLeadStatusLabel' is defined but never used. Allowed unused vars must match /^_/u.  @typescript-eslint/no-unused-vars
@mizano/web:lint: 30:3  Warning: 'getLeadStatusColor' is defined but never used. Allowed unused vars must match /^_/u.  @typescript-eslint/no-unused-vars
@mizano/web:lint:
@mizano/web:lint: ./app/[locale]/(dashboard)/manufacturing/page.tsx
@mizano/web:lint: 5:38  Warning: 'Factory' is defined but never used. Allowed unused vars must match /^_/u.  @typescript-eslint/no-unused-vars
@mizano/web:lint:
@mizano/web:lint: ./app/[locale]/(dashboard)/projects/my-tasks/page.tsx
@mizano/web:lint: 17:3  Warning: 'getTaskStatusLabel' is defined but never used. Allowed unused vars must match /^_/u.  @typescript-eslint/no-unused-vars
@mizano/web:lint:
@mizano/web:lint: ./app/[locale]/(dashboard)/purchases/credits/page.tsx
@mizano/web:lint: 6:10  Warning: 'Badge' is defined but never used. Allowed unused vars must match /^_/u.  @typescript-eslint/no-unused-vars
@mizano/web:lint:
@mizano/web:lint: ./app/[locale]/(dashboard)/tax/page.tsx
@mizano/web:lint: 9:3  Warning: 'DollarSign' is defined but never used. Allowed unused vars must match /^_/u.  @typescript-eslint/no-unused-vars
@mizano/web:lint:
@mizano/web:lint: ./app/[locale]/(dashboard)/tax/payments/page.tsx
@mizano/web:lint: 37:9  Warning: The 'rawReturns' logical expression could make the dependencies of useMemo Hook (at line 38) change on every render. Move it inside the useMemo callback. Alternatively, wrap the initialization of 'rawReturns' in its own useMemo() Hook.  react-hooks/exhaustive-deps
@mizano/web:lint:
@mizano/web:lint: ./app/[locale]/(dashboard)/tax/rates/page.tsx
@mizano/web:lint: 74:9  Warning: The 'allRates' logical expression could make the dependencies of useMemo Hook (at line 104) change on every render. Move it inside the useMemo callback. Alternatively, wrap the initialization of 'allRates' in its own useMemo() Hook.  react-hooks/exhaustive-deps
@mizano/web:lint:
@mizano/web:lint: ./lib/hooks/use-ai-chatbot.ts
@mizano/web:lint: 157:24  Warning: The ref value 'eventSourceRef.current' will likely have changed by the time this effect cleanup function runs. If this ref points to a node rendered by React, copy 'eventSourceRef.current' to a variable inside the effect, and use that variable in the cleanup function.  react-hooks/exhaustive-deps
@mizano/web:lint:
@mizano/web:lint: ./lib/hooks/use-all-settings.spec.ts
@mizano/web:lint: 60:13  Warning: 'result' is assigned a value but never used. Allowed unused vars must match /^_/u.  @typescript-eslint/no-unused-vars
@mizano/web:lint: 112:13  Warning: 'result' is assigned a value but never used. Allowed unused vars must match /^_/u.  @typescript-eslint/no-unused-vars
@mizano/web:lint:
@mizano/web:lint: ./lib/hooks/use-organization-settings.spec.ts
@mizano/web:lint: 51:13  Warning: 'result' is assigned a value but never used. Allowed unused vars must match /^_/u.  @typescript-eslint/no-unused-vars
@mizano/web:lint:
@mizano/web:lint: info  - Need to disable some ESLint rules? Learn more here: https://nextjs.org/docs/basic-features/eslint#disabling-rules

 Tasks:    4 successful, 4 total
Cached:    4 cached, 4 total
  Time:    314ms >>> FULL TURBO


```

### 4. Type-Check

Command:

```bash
pnpm type-check
```

Output:

```text

> mizano@0.1.0 type-check /Users/abdelrahmanahmed/agents/work/impl/Mizano-127
> turbo type-check

• turbo 2.8.12
• Packages in scope: @mizano/shared-types, @mizano/validators, @mizano/web, api
• Running type-check in 4 packages
• Remote caching disabled, using shared worktree cache
@mizano/shared-types:type-check: cache hit, replaying logs e26600acb9ca954a
@mizano/shared-types:type-check:
@mizano/shared-types:type-check: > @mizano/shared-types@0.1.0 type-check /Users/abdelrahmanahmed/agents/work/ci/wt.noindex/Mizano-7a33833/packages/shared-types
@mizano/shared-types:type-check: > tsc --noEmit
@mizano/shared-types:type-check:
@mizano/validators:type-check: cache hit, replaying logs 62be3bc3e2848b56
@mizano/validators:type-check:
@mizano/validators:type-check: > @mizano/validators@0.1.0 type-check /Users/abdelrahmanahmed/agents/work/impl/Mizano-127/packages/validators
@mizano/validators:type-check: > tsc --noEmit
@mizano/validators:type-check:
@mizano/validators:build: cache hit, replaying logs afa7cfa3d71ae01a
@mizano/validators:build:
@mizano/validators:build: > @mizano/validators@0.1.0 build /Users/abdelrahmanahmed/agents/work/impl/Mizano-127/packages/validators
@mizano/validators:build: > tsc
@mizano/validators:build:
@mizano/shared-types:build: cache hit, replaying logs 909af9a27f09790d
@mizano/shared-types:build:
@mizano/shared-types:build: > @mizano/shared-types@0.1.0 build /Users/abdelrahmanahmed/agents/work/ci/wt.noindex/Mizano-7a33833/packages/shared-types
@mizano/shared-types:build: > tsc
@mizano/shared-types:build:
api:type-check: cache hit, replaying logs 1dafe9d60e276705
@mizano/web:type-check: cache hit, replaying logs 062ee90525c8cae0
api:type-check:
api:type-check: > api@0.1.0 type-check /Users/abdelrahmanahmed/agents/work/impl/Mizano-127/apps/api
api:type-check: > tsc --noEmit && tsc --noEmit -p test/tsconfig.e2e.json
api:type-check:
@mizano/web:type-check:
@mizano/web:type-check: > @mizano/web@0.1.0 type-check /Users/abdelrahmanahmed/agents/work/impl/Mizano-127/apps/web
@mizano/web:type-check: > tsc --noEmit
@mizano/web:type-check:

 Tasks:    6 successful, 6 total
Cached:    6 cached, 6 total
  Time:    327ms >>> FULL TURBO


```

## Signal Forwarding Verification

The launcher defines named handlers (`handleSigterm`, `handleSigint`, `handleSighup`), registers and removes the same function references, and on child exit with a signal maps it via `os.constants.signals[signal]` and exits with `128 + signum`; unknown signals are re-raised via `process.kill(process.pid, signal)` after removing the handlers. Otherwise it exits with `code ?? 0`. The `MIZANO_NODE_HEAP_MB` fail-fast keeps exit code 1.

Command:

```bash
node apps/api/scripts/start-node.js -e 'setInterval(() => {}, 1000)' & LAUNCHER=$!; sleep 1; kill -TERM $LAUNCHER; wait $LAUNCHER; echo "launcher exit: $?"
```

Output:

```text
launcher exit: 143
```

The launcher received SIGTERM, forwarded it to the child, and exited with the conventional signal status 143 (128 + 15).

## Fast-Fail Error Output on Invalid Configuration

Command:

```bash
MIZANO_NODE_HEAP_MB=100 node apps/api/scripts/start-node.js dist/main
```

Output:

```text
[mizano] Failed to start node: MIZANO_NODE_HEAP_MB must be an integer between 128 and 4096, received "100"
```

Exit code: 1

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
# When unset, Node defaults are used. Suggested for Raspberry Pi 5 (8GB): 1024.
# MIZANO_NODE_HEAP_MB=1024
```
