# EVIDENCE.md — Issue #127 Verification

## Overview

- **Issue**: #127 (Cap Node heap for api and worker from env with validated config)
- **Base Commit (`master`)**: `615060ed6294e16375a1f1ea9385cb7e812cd24f`
- **Branch**: `ai/127`
- **Implementation Date**: 2026-10-08

---

## Requirements Verification Matrix

| REQ ID | Acceptance Criterion                                                                     | Verification Method                                                                                              | Status |
| ------ | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------ |
| REQ-1  | AC1: Unset `MIZANO_NODE_HEAP_MB` adds no flag; behavior is unchanged                     | Automated test in `apps/api/test/node-heap.e2e-spec.ts` & unit test of `buildNodeArgs`                           | PASSED |
| REQ-2  | AC2: Valid values (128..4096) produce `--max-old-space-size=<n>`                         | Automated test for 128, 512, 4096 in `apps/api/test/node-heap.e2e-spec.ts` & unit tests                          | PASSED |
| REQ-3  | AC3: Values < 128, > 4096, non-numeric fail fast with error naming `MIZANO_NODE_HEAP_MB` | Automated test in `apps/api/test/node-heap.e2e-spec.ts` with values `127`, `4097`, `abc`, `1.5`, `""`, `0`, `-1` | PASSED |
| REQ-4  | AC4: Documented in `.env.example` and `README.md` (suggested Pi value: 1024)             | Automated file checks in test suite & inspection of `.env.example` and `README.md`                               | PASSED |
| REQ-5  | Scope: Change is <= ~150 lines and touches no `.github/` files                           | `git diff master..HEAD --stat` verification (106 non-test lines changed, 0 `.github/` files)                     | PASSED |
| REQ-6  | Test Plan: Manual verification of `v8.getHeapStatistics().heap_size_limit`               | Executed inline probe comparing unset vs 1024MB vs 512MB heap sizes                                              | PASSED |

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
      ✓ @e2e @flow:node-heap @issue-127 AC1: launches node without --max-old-space-size when unset (203 ms)
      ✓ @unit @flow:node-heap @issue-127 AC1: parseHeapMb returns undefined and buildNodeArgs adds no flag when unset (2 ms)
    @issue-127 AC2: Valid heap cap configurations
      ✓ @e2e @flow:node-heap @issue-127 AC2: launches node with --max-old-space-size=128 and caps heap (181 ms)
      ✓ @e2e @flow:node-heap @issue-127 AC2: launches node with --max-old-space-size=512 and caps heap (195 ms)
      ✓ @e2e @flow:node-heap @issue-127 AC2: launches node with --max-old-space-size=4096 and caps heap (199 ms)
      ✓ @unit @flow:node-heap @issue-127 AC2: parseHeapMb parses { input: '128', expected: 128 } and buildNodeArgs prepends argument
      ✓ @unit @flow:node-heap @issue-127 AC2: parseHeapMb parses { input: '512', expected: 512 } and buildNodeArgs prepends argument
      ✓ @unit @flow:node-heap @issue-127 AC2: parseHeapMb parses { input: '4096', expected: 4096 } and buildNodeArgs prepends argument
    @issue-127 AC3: Invalid heap cap values fail fast
      ✓ @e2e @flow:node-heap @issue-127 AC3: fails fast with non-zero exit and names MIZANO_NODE_HEAP_MB when value is 127 (100 ms)
      ✓ @e2e @flow:node-heap @issue-127 AC3: fails fast with non-zero exit and names MIZANO_NODE_HEAP_MB when value is 4097 (95 ms)
      ✓ @e2e @flow:node-heap @issue-127 AC3: fails fast with non-zero exit and names MIZANO_NODE_HEAP_MB when value is abc (96 ms)
      ✓ @e2e @flow:node-heap @issue-127 AC3: fails fast with non-zero exit and names MIZANO_NODE_HEAP_MB when value is 1.5 (97 ms)
      ✓ @e2e @flow:node-heap @issue-127 AC3: fails fast with non-zero exit and names MIZANO_NODE_HEAP_MB when value is  (100 ms)
      ✓ @e2e @flow:node-heap @issue-127 AC3: fails fast with non-zero exit and names MIZANO_NODE_HEAP_MB when value is 0 (107 ms)
      ✓ @e2e @flow:node-heap @issue-127 AC3: fails fast with non-zero exit and names MIZANO_NODE_HEAP_MB when value is -1 (110 ms)
      ✓ @unit @flow:node-heap @issue-127 AC3: parseHeapMb throws error naming MIZANO_NODE_HEAP_MB for 127 (5 ms)
      ✓ @unit @flow:node-heap @issue-127 AC3: parseHeapMb throws error naming MIZANO_NODE_HEAP_MB for 4097 (1 ms)
      ✓ @unit @flow:node-heap @issue-127 AC3: parseHeapMb throws error naming MIZANO_NODE_HEAP_MB for abc
      ✓ @unit @flow:node-heap @issue-127 AC3: parseHeapMb throws error naming MIZANO_NODE_HEAP_MB for 1.5
      ✓ @unit @flow:node-heap @issue-127 AC3: parseHeapMb throws error naming MIZANO_NODE_HEAP_MB for
      ✓ @unit @flow:node-heap @issue-127 AC3: parseHeapMb throws error naming MIZANO_NODE_HEAP_MB for 0
      ✓ @unit @flow:node-heap @issue-127 AC3: parseHeapMb throws error naming MIZANO_NODE_HEAP_MB for -1 (1 ms)
    @issue-127 AC4: Documentation
      ✓ @flow:node-heap @issue-127 AC4: documents MIZANO_NODE_HEAP_MB in .env.example
      ✓ @flow:node-heap @issue-127 AC4: documents MIZANO_NODE_HEAP_MB in README.md

Test Suites: 1 passed, 1 total
Tests:       24 passed, 24 total
Snapshots:   0 total
Time:        4.598 s
```

---

### 2. Manual Verification of V8 Heap Size Limit

Commands:

```bash
# Node default heap limit (unset)
node -e "console.log('Unset default heap_size_limit:', require('v8').getHeapStatistics().heap_size_limit)"

# Start-node launcher with unset variable
node apps/api/scripts/start-node.js -e "console.log('Unset launcher heap_size_limit:', require('v8').getHeapStatistics().heap_size_limit)"

# Start-node launcher with MIZANO_NODE_HEAP_MB=1024 (Pi 5 recommendation)
MIZANO_NODE_HEAP_MB=1024 node apps/api/scripts/start-node.js -e "console.log('1024MB launcher heap_size_limit:', require('v8').getHeapStatistics().heap_size_limit)"

# Start-node launcher with MIZANO_NODE_HEAP_MB=512
MIZANO_NODE_HEAP_MB=512 node apps/api/scripts/start-node.js -e "console.log('512MB launcher heap_size_limit:', require('v8').getHeapStatistics().heap_size_limit)"
```

Output:

```text
Unset default heap_size_limit: 4395630592
Unset launcher heap_size_limit: 4395630592
1024MB launcher heap_size_limit: 1174405120
512MB launcher heap_size_limit: 637534208
```

---

### 3. Fast-Fail Error Output on Invalid Configuration

Command:

```bash
MIZANO_NODE_HEAP_MB=100 node apps/api/scripts/start-node.js dist/main
```

Output:

```text
[mizano] Failed to start node: MIZANO_NODE_HEAP_MB must be an integer between 128 and 4096, received "100"
(Exit code: 1)
```

Command:

```bash
MIZANO_NODE_HEAP_MB=invalid node apps/api/scripts/start-node.js dist/main
```

Output:

```text
[mizano] Failed to start node: MIZANO_NODE_HEAP_MB must be an integer between 128 and 4096, received "invalid"
(Exit code: 1)
```
