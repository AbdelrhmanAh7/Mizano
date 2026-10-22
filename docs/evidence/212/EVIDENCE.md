# Evidence: Issue #212 — Delivery Challan Org Scoping (#162 Slice 1)

## Overview

- **Issue**: #212 (`Follow-up: findings merged under an open CHANGES_REQUESTED (#162, #143, #107) - audit 2026-10-11`)
- **PR**: #288 (Slice 1 — #162 items 1–2: p0 delivery-challan org-scoping fix and test hardening)
- **Base Commit**: `e5d9b805563c04df3300f00442fd18f7d82ce560` (`origin/master`)
- **Tested Head Commit**: `e5714ade8e57cde3a658ec2981315a13a57eb2c1`
- **Tested Branch**: `ai/212`
- **Originating Sentry Issue**: None (Technical debt / security audit follow-up from CodeRabbit findings on PR #162).
- **User-facing flow / E2E**: Not user-facing (backend delivery challans service unit test suite and service-level transition handling). No user-facing UI route modified. Waiver: `E2E: not needed — API-only service-layer fix with no UI flow or screen changes`.
- **Skills Used**: `model-effort-routing`, `systematic-debugging`, `test-first engineering`, `verification-before-completion`.
- **Model and Effort**: `Tool: Antigravity (agy) · Model: Gemini 3.8 Flash · Effort: High · Why: Delivery challan org scoping p0 security fix and test hardening for issue #212 / PR #288`.

---

## Changed Covering Tests

- `apps/api/src/modules/sales/services/delivery-challans.service.spec.ts` (26 unit tests covering tenant scoping, 404 response on scoped-out update, 400 response on status mismatch, 409 response on count > 1, `expectNoWrites` assertions for foreign customer, invoice, item, and warehouse validation failures, and transactional stock updates)

---

## Numbered Acceptance Criteria

1. **AC1 (404 and zero mutations on scoped-out challan update)**: When a delivery-challan update targets a record outside the caller's organization (guarded `updateMany` returns `count: 0` and re-read finds no row in org), the service throws `NotFoundException` and executes zero mutations inside the transaction.
2. **AC2 (Scoping error when guarded update matches count > 1)**: When the guarded `updateMany` returns `count > 1`, the service throws `ConflictException` (via `rejectTransition`) rather than persisting any changes.
3. **AC3 (Validation failures stop before transaction opens)**: Each of the four validation-failure tests (foreign `customerId`, `invoiceId`, `itemId`, `warehouseId`) asserts `prisma.$transaction` was not called and `tx.deliveryChallan.updateMany` was not called.
4. **AC4 (Regression assertion that no write mocks run)**: A regression helper (`expectNoWrites`) verifies that none of `update`, `updateMany`, `create`, `createMany`, `delete`, `deleteMany`, `upsert` mocks were invoked on `deliveryChallan` or `deliveryChallanLine` when a scoped-out/invalid ID is supplied.
5. **AC5 (All tests pass with clean type-check and lint)**: `pnpm --filter api test -- delivery-challans.service.spec.ts` passes all 26 tests (exit code 0); `pnpm --filter api type-check` and `pnpm --filter api lint` both exit 0 cleanly.

---

## Verification Matrix

| AC ID   | Requirement Description                                           | Test / Command                                                                                                                                                        | Observed Result                                                                                                                                                                                                               | Exit Code | Status     |
| :------ | :---------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------- | :--------- |
| **AC1** | 404 response on scoped-out row & 400 on ISSUED status             | `nice -n 10 pnpm --filter api exec jest --maxWorkers=2 src/modules/sales/services/delivery-challans.service.spec.ts -t "answers 404\|answers 400"`                    | 2 tests PASS (`answers 404 and writes no lines when the guarded update finds no row in the org`, `answers 400 when the guarded update finds the challan already ISSUED`)                                                      | 0         | **PASSED** |
| **AC2** | Scoping error when guarded update matches >1 rows                 | `nice -n 10 pnpm --filter api exec jest --maxWorkers=2 src/modules/sales/services/delivery-challans.service.spec.ts -t "matches more than one row"`                   | 1 test PASS (`rejects and writes no lines when the guarded update matches more than one row`)                                                                                                                                 | 0         | **PASSED** |
| **AC3** | Validation failures assert $transaction and updateMany not called | `nice -n 10 pnpm --filter api exec jest --maxWorkers=2 src/modules/sales/services/delivery-challans.service.spec.ts -t "rejects a .* outside the org before writing"` | 4 tests PASS (`rejects a customer outside the org before writing`, `rejects a invoice outside the org before writing`, `rejects a item outside the org before writing`, `rejects a warehouse outside the org before writing`) | 0         | **PASSED** |
| **AC4** | Zero write mock operations executed on validation failure         | `nice -n 10 pnpm --filter api exec jest --maxWorkers=2 src/modules/sales/services/delivery-challans.service.spec.ts -t "rejects a .* outside the org before writing"` | 4 tests PASS (each invokes `expectNoWrites(prisma)` verifying update, updateMany, create, createMany, delete, deleteMany, upsert on deliveryChallan and deliveryChallanLine not called)                                       | 0         | **PASSED** |
| **AC5** | Full unit spec suite passes cleanly                               | `nice -n 10 pnpm --filter api exec jest --maxWorkers=2 src/modules/sales/services/delivery-challans.service.spec.ts`                                                  | 26/26 unit tests PASS (exit code 0)                                                                                                                                                                                           | 0         | **PASSED** |
| —       | TypeScript typecheck across api                                   | `pnpm --filter api type-check`                                                                                                                                        | Clean (tsc and tsc -p test/tsconfig.e2e.json exit 0)                                                                                                                                                                          | 0         | **PASSED** |
| —       | ESLint across api                                                 | `pnpm --filter api lint`                                                                                                                                              | Clean (0 errors, 0 warnings, exit code 0)                                                                                                                                                                                     | 0         | **PASSED** |
| —       | Evidence freshness regression tests                               | `python3 scripts/test_evidence_freshness.py`                                                                                                                          | 10/10 tests PASS (exit code 0)                                                                                                                                                                                                | 0         | **PASSED** |

---

## Bug Fix / Regression Demonstration

- **Base behaviour on master (`e5d9b805563c04df3300f00442fd18f7d82ce560`)**:
  In `apps/api/src/modules/sales/services/delivery-challans.service.ts:168`, when `res.count !== 1`, the service executed:

  ```typescript
  throw new ConflictException('Only draft challans can be updated');
  ```

  This threw a generic HTTP 409 `ConflictException` indiscriminately whenever `res.count === 0` (e.g. record belonged to a different organization or did not exist), leaking record existence and returning incorrect status codes. Furthermore, validation failure tests in `delivery-challans.service.spec.ts` asserted only `expect(prisma.deliveryChallan.update).not.toHaveBeenCalled()`, which proved nothing because the update logic uses `$transaction` and `tx.deliveryChallan.updateMany`.

  Running the new regression tests on the base service implementation failed:

  ```
  FAIL src/modules/sales/services/delivery-challans.service.spec.ts
    ● update › answers 404 and writes no lines when the guarded update finds no row in the org
      Expected constructor: NotFoundException
      Received constructor: ConflictException
      Received message: "Only draft challans can be updated"
    ● update › answers 400 when the guarded update finds the challan already ISSUED
      Expected constructor: BadRequestException
      Received constructor: ConflictException
      Received message: "Only draft challans can be updated"
  Tests: 2 failed, 24 passed, 26 total
  ```

- **Head behaviour (`e5714ade8e57cde3a658ec2981315a13a57eb2c1`)**:
  In `delivery-challans.service.ts:168-175`, `res.count !== 1` delegates to `this.rejectTransition(tx, organizationId, id, ChallanStatus.DRAFT, 'Only draft challans can be updated')`.
  - When the challan does not exist in the caller's organization (`!current`), it throws `NotFoundException('Delivery challan not found')` (HTTP 404).
  - When the challan exists in the caller's organization but has status != DRAFT (e.g. ISSUED), it throws `BadRequestException('Only draft challans can be updated')` (HTTP 400).
  - When `res.count > 1` or a race occurs, it throws `ConflictException` (HTTP 409).
  - Pre-transaction validation failure tests now call `expectNoWrites(prisma)` asserting `prisma.$transaction`, `tx.deliveryChallan.updateMany`, and all write operations (`update`, `updateMany`, `create`, `createMany`, `delete`, `deleteMany`, `upsert`) on `deliveryChallan` and `deliveryChallanLine` are not called.
    All 26 tests PASS cleanly (exit code 0).

---

## UI Verification (Screenshots / RTL & LTR)

**UI is EXEMPT**:

- This issue addresses the backend service layer and unit tests for delivery challans org scoping (`DeliveryChallansService`).
- No frontend files in `apps/web` or UI routes are modified.
- No Playwright screenshots or RTL/LTR web tests are required for this backend-only security and unit test hardening slice.

---

## Skills Used

- `systematic-debugging`: Identified root cause of status code leaking and lack of transaction/write assertion coverage in delivery-challan update.
- `test-first engineering`: Added tests expecting `NotFoundException` (404), `BadRequestException` (400), and `expectNoWrites` before verifying service behavior.
- `verification-before-completion`: Executed Jest unit test suite, TypeScript typecheck, ESLint, and Python evidence freshness test suite, verifying all checks exit 0.
- `model-effort-routing`: Explicitly recorded Tool + Model + Effort for all steps.

---

## Out of Scope Follow-ups (Tracked under Issue #212)

- **#162 item 3**: Make stock moves in `issue` / `markReturned` atomic in the same transaction as the status change (PR #291 / branch `ai/212-p2`).
- **#143**: Lower heap cap in `.env.example`, fix `.env.local` load order, route production container `CMD` through launcher, align `nodeHeapMbSchema` / `parseHeapMb` parsing rules.
- **#107**: Re-check `.husky/pre-push` CodeRabbit findings and apply valid ones; fix minor finding in `docs/DEVELOPMENT.md`.
- **CI Workflows**: QA-checklist review of out-of-band CI PRs #149, #152, #154.
