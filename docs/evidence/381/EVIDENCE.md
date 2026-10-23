# Evidence for Issue #381: Fix Delivery Challan Transition Error Handling and ExpectNoWrites Assertion

This document provides verification evidence for GitHub issue #381 in `AbdelrhmanAh7/Mizano` (split from PR #288, item `finding:0b2495908c2c`, parent issue #212).

- **Issue**: [#381](https://github.com/AbdelrhmanAh7/Mizano/issues/381)
- **PR**: Supersedes part of #288
- **Parent Issue**: #212
- **Base Commit (`origin/master`)**: `bf3f67a80294e9c79f1bb5bfab65ac637e21658a`
- **Tested Code Head**: `879f1e03b4498bc3faa29d3d357622dc4b55f605`
- **Tested Branch**: `ai/381`
- **Originating Sentry Issue**: None (originates from review finding `0b2495908c2c` on PR #288 / parent issue #212).
- **Host Environment**: Darwin arm64 (macOS), Node.js v20+, pnpm 8.14.0, Python 3.14.8.
- **User-facing flow / E2E**: User-facing API endpoint covered by `e2e-army/381-delivery-challan-scoping.e2e.ts` (`@issue-381 AC1 AC2: delivery challan update outside org or non-existent returns 404 with no writes`).
- **Skills Used**: `gh-stack`, `model-effort-routing`, `systematic-debugging`, `test-driven-development`, `verification-before-completion`.
- **Model and Effort**: `Tool: Antigravity (agy) · Model: Gemini 3.8 Flash · Effort: Medium · Why: Delivery challan update transition error handling, expectNoWrites assertion, unit tests, and verification report for issue #381`.

---

## Context & Finding Summary

In PR #288 (split from parent issue #212), code review finding `0b2495908c2c` flagged:

> **major** (glm): The code now correctly throws an appropriate exception via `rejectTransition` when `count !== 1` instead of a generic `ConflictException`, which distinguishes between `NotFoundException` (404) for non-existent records and `BadRequestException` (400) for non-draft status records.
> **major** (glm): The new `expectNoWrites` helper function properly validates that no database operations are called during validation failures, addressing the previous test weakness that only checked `prisma.deliveryChallan.update`.

### Investigation & Root Cause

1. In `apps/api/src/modules/sales/services/delivery-challans.service.ts`, `update()` performs an atomic guarded update via `tx.deliveryChallan.updateMany({ where: { id, organizationId, deletedAt: null, status: ChallanStatus.DRAFT }, ... })`.
2. On `master`, when `res.count !== 1`, line 167 previously threw a generic `ConflictException('Only draft challans can be updated')` (HTTP 409).
3. Throwing a generic 409 was incorrect when:
   - A challan ID did not exist or belonged to a different organization (which must return HTTP 404 `NotFoundException`);
   - A challan existed in the organization but had already transitioned out of `DRAFT` (e.g. `ISSUED`), which must return HTTP 400 `BadRequestException`.
4. In `delivery-challans.service.spec.ts`, previous tests only checked `expect(prisma.deliveryChallan.update).not.toHaveBeenCalled()`, which was incomplete because `updateMany`, `create`, `delete`, and `$transaction` were not comprehensively asserted.

### Resolution

1. Updated line 167 in `apps/api/src/modules/sales/services/delivery-challans.service.ts` to call:
   ```ts
   await this.rejectTransition(
     tx,
     organizationId,
     id,
     ChallanStatus.DRAFT,
     'Only draft challans can be updated',
   );
   ```
   matching the existing transition rejection pattern in `issue()` and `markReturned()`.
2. Implemented `expectNoWrites(prisma)` in `apps/api/src/modules/sales/services/delivery-challans.service.spec.ts` asserting that `$transaction`, `updateMany`, and all write operations (`create`, `createMany`, `update`, `updateMany`, `delete`, `deleteMany`, `upsert`) on `deliveryChallan` and `deliveryChallanLine` were never called during validation failures.
3. Added unit tests for `update()` verifying:
   - 404 `NotFoundException` and no line writes when the guarded update finds no row in the organization;
   - 400 `BadRequestException` when the guarded update finds the challan already `ISSUED`;
   - 409 `ConflictException` when the guarded update matches more than one row.
4. Added `e2e-army/381-delivery-challan-scoping.e2e.ts` verifying that updating a cross-tenant / non-existent delivery challan returns 404.

---

## Numbered Acceptance Criteria

- **AC1 (404 and 400 Exception Handling on Guarded Update)**: `DeliveryChallansService.update` invokes `rejectTransition` when the guarded atomic update (`updateMany`) matches 0 rows, throwing `NotFoundException` (404) if the delivery challan does not exist in the caller's organization and `BadRequestException` (400) if the challan exists but is in a non-draft status (e.g. `ISSUED`).
- **AC2 (Appropriate Exception instead of Generic ConflictException)**: Line 167 in `apps/api/src/modules/sales/services/delivery-challans.service.ts` delegates to `this.rejectTransition(tx, organizationId, id, ChallanStatus.DRAFT, 'Only draft challans can be updated')` instead of throwing a generic `ConflictException`, ensuring callers receive RFC-compliant HTTP status codes (404 for missing/cross-tenant, 400 for invalid status, and 409 only on concurrent lost-race).
- **AC3 (Multi-Row Match Guard)**: If the guarded update matches more than one row (`res.count > 1`), `DeliveryChallansService.update` throws `ConflictException` (409) and performs no line writes or line deletions.
- **AC4 (expectNoWrites Mock Assertion)**: The `expectNoWrites` helper function in `delivery-challans.service.spec.ts` verifies that neither transaction writes nor any `create`, `update`, `delete`, or `upsert` operations on `deliveryChallan` or `deliveryChallanLine` are executed when input validation or reference checking fails.
- **AC5 (All 26 Unit Tests Passing & Scoping Coverage)**: All 26 unit tests in `apps/api/src/modules/sales/services/delivery-challans.service.spec.ts` pass cleanly, and `e2e-army/381-delivery-challan-scoping.e2e.ts` verifies that updating a foreign/non-existent delivery challan returns 404.

---

## Verification Matrix

| AC ID | Requirement Description | Verification Method / Command | Observed Result | Exit Code | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **AC1** | 404 on missing row and 400 on non-draft status | `pnpm --filter api exec jest -t "answers 404 and writes no lines when the guarded update finds no row in the org\|answers 400 when the guarded update finds the challan already ISSUED" apps/api/src/modules/sales/services/delivery-challans.service.spec.ts` | 2 passed, 0 failed | 0 | **PASSED** |
| **AC2** | Exception resolution via `rejectTransition` | `pnpm --filter api exec jest -t "rejects with 409 and writes no lines when the challan is no longer DRAFT\|answers 404 and writes no lines when the guarded update finds no row in the org\|answers 400 when the guarded update finds the challan already ISSUED" apps/api/src/modules/sales/services/delivery-challans.service.spec.ts` | 3 passed, 0 failed | 0 | **PASSED** |
| **AC3** | Multi-row guarded update conflict handling | `pnpm --filter api exec jest -t "rejects and writes no lines when the guarded update matches more than one row" apps/api/src/modules/sales/services/delivery-challans.service.spec.ts` | 1 passed, 0 failed | 0 | **PASSED** |
| **AC4** | `expectNoWrites` asserts no database writes | `pnpm --filter api exec jest -t "rejects a (customer\|invoice\|item\|warehouse) outside the org before writing" apps/api/src/modules/sales/services/delivery-challans.service.spec.ts` | 4 passed, 0 failed | 0 | **PASSED** |
| **AC5** | All 26 delivery challans service tests pass | `pnpm --filter api exec jest apps/api/src/modules/sales/services/delivery-challans.service.spec.ts` | 26 passed, 0 failed | 0 | **PASSED** |

---

## Changed Covering Tests

- `apps/api/src/modules/sales/services/delivery-challans.service.spec.ts` (3 new tests added; `expectNoWrites` helper added):
  - `answers 404 and writes no lines when the guarded update finds no row in the org`
  - `answers 400 when the guarded update finds the challan already ISSUED`
  - `rejects and writes no lines when the guarded update matches more than one row`
  - Updated validation tests to call `expectNoWrites(prisma)`
- `e2e-army/381-delivery-challan-scoping.e2e.ts` (new natural-language e2e-army test):
  - `@issue-381 AC1 AC2: delivery challan update outside org or non-existent returns 404 with no writes`
- `scripts/test_evidence_freshness.py`:
  - `test_issue_381_evidence_contract`

---

## Bug Fix / Regression Demonstration

### Base Behaviour (`bf3f67a80294e9c79f1bb5bfab65ac637e21658a`)

On base before this fix, `DeliveryChallansService.update` threw a generic `ConflictException('Only draft challans can be updated')`:

1. When the guarded update found no row in the organization, running:
   ```bash
   pnpm --filter api exec jest -t "answers 404 and writes no lines when the guarded update finds no row in the org" apps/api/src/modules/sales/services/delivery-challans.service.spec.ts
   ```
   failed with:
   ```text
   ● DeliveryChallansService tenant scoping (#131) › update › answers 404 and writes no lines when the guarded update finds no row in the org

     expect(received).rejects.toThrow(expected)

     Expected constructor: NotFoundException
     Received constructor: ConflictException
     Received message: "Only draft challans can be updated"

           166 |       });
           167 |       if (res.count !== 1) {
         > 168 |         throw new ConflictException('Only draft challans can be updated');
               |               ^
           169 |       }
   ```
2. When the guarded update found the challan already in `ISSUED` status, running:
   ```bash
   pnpm --filter api exec jest -t "answers 400 when the guarded update finds the challan already ISSUED" apps/api/src/modules/sales/services/delivery-challans.service.spec.ts
   ```
   failed with:
   ```text
   ● DeliveryChallansService tenant scoping (#131) › update › answers 400 when the guarded update finds the challan already ISSUED

     expect(received).rejects.toThrow(expected)

     Expected constructor: BadRequestException
     Received constructor: ConflictException
     Received message: "Only draft challans can be updated"
   ```

### Head Behaviour (`879f1e03b4498bc3faa29d3d357622dc4b55f605`)

With the fix in `delivery-challans.service.ts`:
1. `DeliveryChallansService.update` delegates to `this.rejectTransition(tx, organizationId, id, ChallanStatus.DRAFT, 'Only draft challans can be updated')`.
2. A missing challan row in the organization throws `NotFoundException` (404).
3. A non-draft challan row throws `BadRequestException` (400).
4. Running the full test suite produces 26 passed tests with 0 failures:
   ```text
   PASS src/modules/sales/services/delivery-challans.service.spec.ts
   Tests:       26 passed, 26 total
   Time:        2.664 s
   ```

---

## UI Verification (Screenshots / RTL & LTR)

**UI is EXEMPT**:

- This issue modifies backend business logic (`apps/api/src/modules/sales/services/delivery-challans.service.ts`), backend unit tests (`apps/api/src/modules/sales/services/delivery-challans.service.spec.ts`), an API-level e2e-army test (`e2e-army/381-delivery-challan-scoping.e2e.ts`), and verification evidence documentation.
- No frontend UI components, screens, styling, or localized text are altered.

---

## Skills Used

- `gh-stack`: Resolved rebase conflict cleanly preserving intent of both layers in the stack.
- `model-effort-routing`: Explicitly recorded Tool + Model + Effort for all steps.
- `systematic-debugging`: Identified root cause of status code leaking and lack of transaction/write assertion coverage in delivery-challan update.
- `test-driven-development`: Added tests expecting `NotFoundException` (404), `BadRequestException` (400), and `expectNoWrites` before verifying service behavior.
- `verification-before-completion`: Executed Jest unit test suite, TypeScript typecheck, ESLint, and Python evidence freshness test suite, verifying all checks exit 0.
