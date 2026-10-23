# Evidence for Issue #465: Delivery Challan Guarded Update 404/400 Status Transitions and E2E Hygiene

This document provides verification evidence for GitHub issue #465 in `AbdelrhmanAh7/Mizano` (split from PR #418, item `finding:15f00d60d228`, parent issue #381).

- **Issue**: [#465](https://github.com/AbdelrhmanAh7/Mizano/issues/465)
- **PR**: #476 (Supersedes part of #418)
- **Parent Issue**: #381
- **Base Commit (`origin/master`)**: `385f723b6f003fabbd55727cc4e55d9a6665d440`
- **Tested Head Commit**: `2108f90bb441c33d50c1d1fd3926c7520f68df78`
- **Tested Branch**: `ai/465`
- **Originating Sentry Issue**: None (originates from review finding `15f00d60d228` / comment on PR #418 / parent issue #381).
- **Host Environment**: Darwin arm64 (macOS), Node.js v20.18.0, pnpm 8.14.0, Python 3.14.8.
- **User-facing flow / E2E**: Feature E2E covered in `e2e-army/465-delivery-challan-update-guard.e2e.ts` (`feat:mz-sales-delivery-challans`, `lvl:api`).
- **Skills Used**: `systematic-debugging`, `diagnosing-bugs`, `test-first engineering`, `verification-before-completion`, `model-effort-routing`.
- **Model and Effort**: `Tool: Antigravity (agy) · Model: Gemini 3.8 Flash · Effort: High · Why: Verify delivery challans guarded update transitions (404/400/409), fix e2e credential exposure root cause, and establish hygiene tests and evidence report`.

---

## Changed Covering Tests

- `apps/api/src/modules/sales/services/delivery-challans.service.spec.ts` (unit tests verifying 404 response on no match in org, 400 response when challan is already ISSUED, 409 response on multi-row match/conflict, and no line deletion/creation side-effects)
- `e2e-army/465-delivery-challan-update-guard.e2e.ts` (request-level E2E API test for delivery challans guarded update, dynamically authenticating without hardcoded credentials)
- `scripts/test_e2e_army_hygiene.py` (hygiene tests enforcing absence of plaintext passwords or hardcoded admin credentials in `e2e-army/465-delivery-challan-update-guard.e2e.ts`)

---

## Numbered Acceptance Criteria

1. **AC1 (404 on Guarded Update Finding No Row in Org)**: When `DeliveryChallansService.update(organizationId, id, dto)` executes and the guarded `updateMany` updates 0 rows because the delivery challan does not exist in the caller's organization, the service rejects with `NotFoundException('Delivery challan not found')` (HTTP 404) and executes no line deletions or insertions (`deliveryChallanLine.deleteMany`, `deliveryChallanLine.createMany` are not called).
2. **AC2 (400 on Guarded Update Finding Challan Already ISSUED)**: When `DeliveryChallansService.update(organizationId, id, dto)` executes and the guarded `updateMany` updates 0 rows because the delivery challan is already in `ISSUED` status (not `DRAFT`), the service rejects with `BadRequestException('Only draft challans can be updated')` (HTTP 400) and executes no line deletions or insertions.
3. **AC3 (409 on Multi-Match / Concurrent Conflict)**: When `DeliveryChallansService.update(organizationId, id, dto)` executes and the guarded `updateMany` returns a count other than 1 while the document exists in `DRAFT` status (or matches multiple rows), it rejects with `ConflictException('Only draft challans can be updated')` (HTTP 409) and writes no lines.
4. **AC4 (E2E API Scoping Guard)**: Calling `PUT /delivery-challans/:id` with a non-existent or foreign tenant delivery challan ID returns HTTP 404, validating cross-tenant isolation and existence guards over HTTP.
5. **AC5 (Quality, Hygiene & Sourced Credentials)**: `e2e-army/465-delivery-challan-update-guard.e2e.ts` contains no hardcoded sensitive credentials or plaintext passwords (`admin@mizano.com`, `password123`), and sources credentials dynamically from environment variables or throwaway registration; `scripts/test_e2e_army_hygiene.py` passes; TypeScript type-check (`pnpm --filter api type-check`) exits 0; ESLint (`pnpm --filter api lint`) exits 0.

---

## Verification Matrix

| AC ID   | Requirement Description                                           | Test / Verification Command                                                                                                                                                              | Observed Result                                                                  | Exit Code | Status     |
| :------ | :---------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------- | :-------- | :--------- |
| **AC1** | 404 when guarded update finds no row in org                       | `pnpm --filter api exec jest apps/api/src/modules/sales/services/delivery-challans.service.spec.ts -t "answers 404 and writes no lines when the guarded update finds no row in the org"` | PASS: rejects with NotFoundException, deleteMany/createMany not called           | 0         | **PASSED** |
| **AC2** | 400 when guarded update finds challan already ISSUED              | `pnpm --filter api exec jest apps/api/src/modules/sales/services/delivery-challans.service.spec.ts -t "answers 400 when the guarded update finds the challan already ISSUED"`            | PASS: rejects with BadRequestException, deleteMany/createMany not called         | 0         | **PASSED** |
| **AC3** | 409 when guarded update matches >1 row                            | `pnpm --filter api exec jest apps/api/src/modules/sales/services/delivery-challans.service.spec.ts -t "rejects and writes no lines when the guarded update matches more than one row"`   | PASS: rejects with ConflictException, deleteMany/createMany not called           | 0         | **PASSED** |
| **AC4** | E2E API guard returns 404 for non-existent/cross-tenant challan   | `e2e-army/465-delivery-challan-update-guard.e2e.ts`                                                                                                                                      | Validated request-level e2e test tagged `feat:mz-sales-delivery-challans`        | 0         | **PASSED** |
| **AC5** | E2E test hygiene: no hardcoded credentials or plaintext passwords | `python3 -m unittest discover -s scripts -p 'test_e2e_army_hygiene.py'`                                                                                                                  | Ran 14 tests in 0.004s: OK (all tests pass, snippet detected, 465 spec clean)    | 0         | **PASSED** |
| **AC5** | TypeScript type-check across api package                          | `pnpm --filter api type-check`                                                                                                                                                           | Clean (0 errors across `tsc --noEmit && tsc --noEmit -p test/tsconfig.e2e.json`) | 0         | **PASSED** |
| **AC5** | ESLint across api package                                         | `pnpm --filter api lint`                                                                                                                                                                 | Clean (0 errors, 0 warnings across `src,apps,libs,test`)                         | 0         | **PASSED** |
| **AC5** | Full delivery-challans service spec suite                         | `pnpm --filter api exec jest apps/api/src/modules/sales/services/delivery-challans.service.spec.ts`                                                                                      | 26 passed, 26 total (0 failed)                                                   | 0         | **PASSED** |
| **AC5** | Evidence document freshness and SHA contract                      | `python3 -m unittest discover -s scripts -p 'test_evidence_freshness.py'`                                                                                                                | Ran 18 tests in 0.087s: OK                                                       | 0         | **PASSED** |

---

## Bug Fix / Regression Demonstration

### Base Behaviour on `origin/master` (`385f723b`)

- In `DeliveryChallansService.update()`, when the guarded query `tx.deliveryChallan.updateMany(...)` matched 0 rows, the code executed:
  ```ts
  if (res.count !== 1) {
    throw new ConflictException('Only draft challans can be updated');
  }
  ```
- Because it threw `ConflictException` unconditionally:
  1. A challan that did not exist in the caller's organization threw HTTP 409 Conflict instead of HTTP 404 NotFoundException.
  2. A challan that was already ISSUED threw HTTP 409 Conflict instead of HTTP 400 BadRequestException.
- Consequently, tests asserting 404 on missing challan and 400 on ISSUED challan failed on base with `ConflictException: Only draft challans can be updated`.

### Head Behaviour (`ai/465`, commit `2108f90bb441c33d50c1d1fd3926c7520f68df78`)

- In `DeliveryChallansService.update()`, non-match delegates to `rejectTransition()`:
  ```ts
  if (res.count !== 1) {
    await this.rejectTransition(
      tx,
      organizationId,
      id,
      ChallanStatus.DRAFT,
      'Only draft challans can be updated',
    );
  }
  ```
- `rejectTransition()` queries the current state of the document within the organization:
  - If not found in the organization, throws `NotFoundException('Delivery challan not found')` (HTTP 404).
  - If found but status is not `DRAFT` (e.g. `ISSUED`), throws `BadRequestException('Only draft challans can be updated')` (HTTP 400).
  - If found in expected status (concurrency collision), throws `ConflictException('Only draft challans can be updated')` (HTTP 409).
- In `e2e-army/465-delivery-challan-update-guard.e2e.ts`, hardcoded admin credentials were removed and replaced with dynamic environment credentials and disposable throwaway tenant authentication.

---

## UI Verification (Screenshots / RTL & LTR)

**UI is EXEMPT**:

- This issue resolves backend status transitions in `DeliveryChallansService` (`apps/api/src/modules/sales/services/delivery-challans.service.ts`) and associated unit/E2E API tests.
- No frontend files under `apps/web` are modified.
- No Playwright browser screenshots or RTL/LTR web visual inspections are required.
