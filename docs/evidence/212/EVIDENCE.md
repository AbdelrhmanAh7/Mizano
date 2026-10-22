# Evidence for Issue #212: Delivery Challan Org Scoping & Atomic Stock Moves

This document provides verification evidence for GitHub issue #212 in `AbdelrhmanAh7/Mizano` (PR #291, follow-up findings from PR #162).

- **Issue**: [#212](https://github.com/AbdelrhmanAh7/Mizano/issues/212)
- **PR**: #291 (branch `ai/212-p2`)
- **Scope**: Layer 2 [2/2] — #162 complete (#162 items 1–3): p0 delivery-challan org-scoping fix, test hardening, and atomic stock moves in `issue` / `markReturned`
- **Base Commit (`origin/master`)**: `e5d9b805`
- **Tested Head Commit**: `fa30739b`
- **Tested Branch**: `ai/212-p2`
- **Originating Sentry Issue**: None (findings from PR-cycle audit 2026-10-11, CodeRabbit CHANGES_REQUESTED on #162)
- **Host Environment**: Darwin arm64 (macOS), Node.js v20+, pnpm 8.14.0
- **User-facing flow / E2E**: Not user-facing (`E2E: not needed — API-only service-layer fix with no UI flow or screen changes`).
- **Skills Used**: `model-effort-routing`, `systematic-debugging`, `diagnosing-bugs`, `verification-before-completion`, `pr-conflict-resolve`
- **Model and Effort**: Tool: Antigravity (agy) · Model: Gemini 3.8 Flash · Effort: High · Why: Delivery challan org scoping and atomic stock moves in transaction (#162 / #212)

---

## Acceptance Criteria

- **AC1**: When a delivery-challan update targets a record outside the caller's organisation (guarded `updateMany` returns `count: 0` and re-read finds no row), the service throws `NotFoundException` and no mutation is executed inside the transaction.
- **AC2**: When the guarded `updateMany` returns `count > 1`, the service throws `ConflictException` (via `rejectTransition`) rather than persisting anything.
- **AC3**: Each of the four validation-failure tests (foreign `customerId`, `invoiceId`, `itemId`, `warehouseId`) asserts `prisma.$transaction` was not called and `tx.deliveryChallan.updateMany` was not called.
- **AC4**: A regression test (`expectNoWrites`) asserts that none of `update`/`updateMany`/`create`/`createMany`/`delete`/`deleteMany`/`upsert` mocks were invoked on `deliveryChallan` or `deliveryChallanLine` when a scoped-out ID is supplied.
- **AC5**: `pnpm --filter api test -- delivery-challans.service.spec.ts` passes with all 32 tests green (exit code 0).
- **AC6**: In `issue` and `markReturned`, all operations (including `trackedLineItems`, stock level lookups, movements, and item stock updates) execute through the transaction client `tx` and not `this.prisma` (verified both via comprehensive tx/prisma mock assertions and a strict throwing Proxy on root prisma), and any failure during stock movement propagates out to roll back the status transition.

---

## Verification Matrix

| AC ID   | Requirement Description                                                                   | Verification Method / Command                                                                                        | Observed Result                                                     | Exit Code | Status     |
| :------ | :---------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------ | :-------- | :--------- |
| **AC1** | Guarded update returns 404 for missing/foreign challan, 400 for wrong status              | `jest delivery-challans.service.spec.ts -t "answers 404\|answers 400"`                                               | 2 tests PASS (`NotFoundException` and `BadRequestException` thrown) | 0         | **PASSED** |
| **AC2** | Guarded update returns ConflictException when count > 1                                   | `jest delivery-challans.service.spec.ts -t "matches more than one row"`                                              | 1 test PASS (`ConflictException` thrown, writes rejected)           | 0         | **PASSED** |
| **AC3** | Validation failures assert prisma.$transaction & tx.deliveryChallan.updateMany not called | `jest delivery-challans.service.spec.ts -t "rejects a .* outside the org before writing"`                            | 4 tests PASS (customer, invoice, item, warehouse)                   | 0         | **PASSED** |
| **AC4** | No-write regression guard (`expectNoWrites`) checks update/create/delete/upsert           | `jest delivery-challans.service.spec.ts -t "outside the org before writing"`                                         | 4 tests PASS (`expectNoWrites` verified clean)                      | 0         | **PASSED** |
| **AC5** | Full delivery challans service unit test suite passes cleanly                             | `nice -n 10 pnpm --filter api exec jest --maxWorkers=2 src/modules/sales/services/delivery-challans.service.spec.ts` | 32/32 tests PASS                                                    | 0         | **PASSED** |
| **AC6** | Atomic execution via tx, proxy leak guard, and rollback on stock movement failure         | `jest delivery-challans.service.spec.ts -t "executes all queries\|throws if root prisma\|propagates stock move"`     | 6 tests PASS (3 tests across both `issue` and `markReturned`)       | 0         | **PASSED** |

---

## Changed Files & Purpose

| File                                                                    | Change                                                                                                                                                                                                                        |
| :---------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/src/modules/sales/services/delivery-challans.service.ts`      | Line 167: replaced `throw new ConflictException(...)` with `rejectTransition`; lines 255 & 340: passed `tx` to `trackedLineItems` ensuring atomic execution inside `prisma.$transaction`                                      |
| `apps/api/src/modules/sales/services/delivery-challans.service.spec.ts` | Added `expectNoWrites()` helper; replaced `prisma.deliveryChallan.update` assertions; added 404, 400, and count > 1 tests; added transaction isolation assertions, proxy guard, and rollback tests for `issue`/`markReturned` |

---

## Covering Tests

| AC  | Test name                                                                                         | File:line                                 | Command                                      | Exit Code |
| :-- | :------------------------------------------------------------------------------------------------ | :---------------------------------------- | :------------------------------------------- | :-------- |
| AC1 | `update › answers 404 and writes no lines when the guarded update finds no row in the org`        | `delivery-challans.service.spec.ts:113`   | `jest ... delivery-challans.service.spec.ts` | 0         |
| AC1 | `update › answers 400 when the guarded update finds the challan already ISSUED`                   | `delivery-challans.service.spec.ts:128`   | same                                         | 0         |
| AC2 | `update › rejects and writes no lines when the guarded update matches more than one row`          | `delivery-challans.service.spec.ts:140`   | same                                         | 0         |
| AC3 | `update › rejects a customer outside the org before writing`                                      | `delivery-challans.service.spec.ts:62`    | same                                         | 0         |
| AC3 | `update › rejects a invoice outside the org before writing`                                       | `delivery-challans.service.spec.ts:62`    | same                                         | 0         |
| AC3 | `update › rejects a item outside the org before writing`                                          | `delivery-challans.service.spec.ts:62`    | same                                         | 0         |
| AC3 | `update › rejects a warehouse outside the org before writing`                                     | `delivery-challans.service.spec.ts:70`    | same                                         | 0         |
| AC4 | Same four tests above, each calls `expectNoWrites(prisma)`                                        | `delivery-challans.service.spec.ts:20-37` | same                                         | 0         |
| AC5 | Full spec suite (32 tests)                                                                        | `delivery-challans.service.spec.ts`       | same                                         | 0         |
| AC6 | `issue › executes all queries and mutations through the transaction client tx, not prisma`        | `delivery-challans.service.spec.ts:227`   | same                                         | 0         |
| AC6 | `issue › throws if root prisma client is accessed during transaction (strict proxy guard)`        | `delivery-challans.service.spec.ts:271`   | same                                         | 0         |
| AC6 | `issue › propagates stock move failure out of the transaction so status change rolls back`        | `delivery-challans.service.spec.ts:303`   | same                                         | 0         |
| AC6 | `markReturned › executes all queries and mutations through the transaction client tx, not prisma` | `delivery-challans.service.spec.ts:227`   | same                                         | 0         |
| AC6 | `markReturned › throws if root prisma client is accessed during transaction (strict proxy guard)` | `delivery-challans.service.spec.ts:271`   | same                                         | 0         |
| AC6 | `markReturned › propagates stock move failure out of transaction so status change rolls back`     | `delivery-challans.service.spec.ts:303`   | same                                         | 0         |

---

## Bug Fix / Regression Demonstration (Fails on Base, Passes on Head)

### Base Behaviour (`origin/master` prior to fix)

- Line 168 threw a hard-coded `ConflictException` for any `count !== 1`, making no distinction between a missing record (should be 404), a status mismatch (should be 400), and a genuine race condition (409).
- In `issue` and `markReturned`, `trackedLineItems` was called without `tx`, causing it to query `this.prisma` outside the transaction client. A failure in stock movement would not atomically roll back the entire transaction.
- When run against base implementation:
  ```
  FAIL src/modules/sales/services/delivery-challans.service.spec.ts
    ● update › answers 404 and writes no lines when the guarded update finds no row in the org
      Expected constructor: NotFoundException
      Received constructor: ConflictException
    ● update › answers 400 when the guarded update finds the challan already ISSUED
      Expected constructor: BadRequestException
      Received constructor: ConflictException
    ● issue › executes all queries and mutations through the transaction client tx, not prisma
      Expected: tx.item.findFirst called
      Received: prisma.item.findFirst called (leaked outside tx)
    ● issue › throws if root prisma client is accessed during transaction (strict proxy guard)
      Leak detected: root prisma.item accessed inside transaction
    ● markReturned › executes all queries and mutations through the transaction client tx, not prisma
      Expected: tx.item.findFirst called
      Received: prisma.item.findFirst called (leaked outside tx)
    ● markReturned › throws if root prisma client is accessed during transaction (strict proxy guard)
      Leak detected: root prisma.item accessed inside transaction
  Tests: 6 failed, 26 passed, 32 total
  ```

### Head Behaviour (`ai/212-p2`)

- The guarded `updateMany` delegates to `rejectTransition` when `count !== 1`, which accurately distinguishes between 404 (challan not in org), 400 (challan in wrong status), and 409 (conflict).
- `issue` and `markReturned` pass `tx` to `trackedLineItems`, ensuring all reads and mutations execute atomically within the transaction client `tx`.
- All 32 unit tests pass:
  ```
  PASS src/modules/sales/services/delivery-challans.service.spec.ts
  Test Suites: 1 passed, 1 total
  Tests:       32 passed, 32 total
  Snapshots:   0 total
  Time:        2.596 s
  ```
- Exit Code: 0.

---

## Local Verification Checks

- **Linter**: `pnpm --filter api lint` — exit code 0, clean.
- **Typecheck**: `pnpm --filter api type-check` — exit code 0, clean.
- **Unit tests**: `nice -n 10 pnpm --filter api exec jest --maxWorkers=2 src/modules/sales/services/delivery-challans.service.spec.ts` — 32 passed, exit code 0.
- **Inventory Movement tests**: `nice -n 10 pnpm --filter api exec jest --maxWorkers=2 src/modules/inventory/services/delivery-challans-movement.spec.ts` — 2 passed, exit code 0.

---

## Out of Scope (Deferred Follow-ups for #212)

- #143: lower the heap cap, fix `.env.local` load order, route production CMD through launcher, align parsing rules, re-run EVIDENCE.
- #107: re-check `.husky/pre-push` CodeRabbit findings; fix `docs/DEVELOPMENT.md` Minor.
- QA-checklist review of #149, #152, #154.
