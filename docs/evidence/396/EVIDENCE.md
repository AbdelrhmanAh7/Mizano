# Evidence for Issue #396: Fix Work Order Completion Quantity Validation for Null and Undefined

This document provides complete verification evidence for GitHub issue #396 in `AbdelrhmanAh7/Mizano` (split from PR #357, item `finding:d053632b57fd`, parent issue #355).

- **Issue**: [#396](https://github.com/AbdelrhmanAh7/Mizano/issues/396)
- **PR**: Supersedes part of #357
- **Parent Issue**: #355
- **Base Commit (`origin/master`)**: `e5d9b805563c04df3300f00442fd18f7d82ce560`
- **Tested Head Commit**: `b81561b63dc992bd817ba98426286bbc3a20b580`
- **Tested Branch**: `ai/396`
- **Originating Sentry Issue**: None (originates from CodeRabbit review discussion on PR #357 regarding work order completion quantity null/undefined checks).
- **Host Environment**: Darwin arm64 (macOS), Node.js v26.10.0, pnpm 8.15.4, Python 3.14.8.
- **User-facing flow / E2E**: Not user-facing (`E2E: not needed — pure client-side hook validation bug fix for useCompleteWorkOrder and unit test suite; no user-facing routes or layouts modified.`).
- **Skills Used**: `systematic-debugging`, `test-first-engineering`, `verification-before-completion`, `model-effort-routing`.
- **Model and Effort**: `Tool: Antigravity (agy) · Model: Gemini 3.8 Flash · Effort: High · Why: Parameter validation for both undefined and null, boundary zero preservation, unit tests, and verification report for issue #396`.

---

## Context & Finding Summary

In PR #357 (split from parent issue #355), review finding `d053632b57fd` noted:

> apps/web/lib/hooks/use-manufacturing.ts:356: The mutation function should check for both undefined and null values when validating the completion quantity, not just undefined.

On `master` prior to this fix:

1. `useCompleteWorkOrder` mutationFn accepted only `{ id, producedQuantity }` and called `workOrderApi.complete(id, producedQuantity)`.
2. When callers passed `{ id, quantityProduced }` (the canonical API property) or explicitly passed `null`, the value was not checked for `null` or `undefined`, leading to silent defaulting or sending `{ producedQuantity: undefined }` to the API.
3. In `apps/web/lib/hooks/use-manufacturing.ts`:
   - `workOrderApi.complete` sent `{ producedQuantity }` rather than the backend controller's expected `{ quantityProduced }`.
   - `useCompleteWorkOrder` lacked validation for `null`, `undefined`, or `NaN`.
4. This PR completely resolves the finding by:
   - Updating `useCompleteWorkOrder` to resolve `quantity = quantityProduced ?? producedQuantity`.
   - Explicitly validating that `quantity` is neither `undefined`, `null`, nor `Number.isNaN(quantity)`.
   - Allowing explicit boundary value `0` as a valid quantity.
   - Aligning `workOrderApi.complete` to send `{ quantityProduced: quantity }`.
   - Adding a unit test suite (`apps/web/lib/hooks/use-manufacturing.spec.ts`) covering all 5 acceptance criteria (9 unit tests).

---

## Numbered Acceptance Criteria

- **AC1 (Reject Undefined)**: The `useCompleteWorkOrder` mutation function must reject completion and throw `new Error('A completion quantity is required')` without calling `api.post` when the completion quantity is omitted or explicitly `undefined`.
- **AC2 (Reject Null)**: The `useCompleteWorkOrder` mutation function must reject completion and throw `new Error('A completion quantity is required')` without calling `api.post` when either `quantityProduced` or `producedQuantity` is explicitly `null`.
- **AC3 (Reject NaN)**: The `useCompleteWorkOrder` mutation function must reject completion and throw `new Error('A completion quantity is required')` without calling `api.post` when the quantity is `NaN`.
- **AC4 (Accept Canonical `quantityProduced` & Zero Boundary)**: The `useCompleteWorkOrder` mutation function must accept valid numeric quantities including explicit boundary value `0` via `quantityProduced`, calling `api.post('/manufacturing/work-orders/:id/complete', { quantityProduced })`.
- **AC5 (Backward Compatibility & Precedence)**: The `useCompleteWorkOrder` mutation function must support backward compatibility with `producedQuantity` (including boundary `0`), while prioritizing `quantityProduced` when both parameters are provided.

---

## Verification Matrix

| AC ID   | Requirement Description                                       | Verification Method / Command                                                  | Observed Result                                                                                                                 | Exit Code | Status     |
| :------ | :------------------------------------------------------------ | :----------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------ | :-------- | :--------- |
| **AC1** | Reject omitted and undefined completion quantity              | `pnpm --filter web test apps/web/lib/hooks/use-manufacturing.spec.ts -t "AC1"` | 1 passed (`rejects completion when both quantityProduced and producedQuantity are absent/undefined`)                            | 0         | **PASSED** |
| **AC2** | Reject explicitly null completion quantity                    | `pnpm --filter web test apps/web/lib/hooks/use-manufacturing.spec.ts -t "AC2"` | 2 passed (`rejects completion when quantity is explicitly null`, `rejects completion when producedQuantity is explicitly null`) | 0         | **PASSED** |
| **AC3** | Reject NaN completion quantity                                | `pnpm --filter web test apps/web/lib/hooks/use-manufacturing.spec.ts -t "AC3"` | 1 passed (`rejects completion when quantity is NaN`)                                                                            | 0         | **PASSED** |
| **AC4** | Support `quantityProduced` and boundary value `0`             | `pnpm --filter web test apps/web/lib/hooks/use-manufacturing.spec.ts -t "AC4"` | 2 passed (`calls api.post with quantityProduced`, `allows boundary zero quantity`)                                              | 0         | **PASSED** |
| **AC5** | Backward compatibility with `producedQuantity` and precedence | `pnpm --filter web test apps/web/lib/hooks/use-manufacturing.spec.ts -t "AC5"` | 3 passed (`resolves quantity from producedQuantity`, `allows boundary zero`, `prioritizes quantityProduced`)                    | 0         | **PASSED** |
| —       | Full unit spec execution for `use-manufacturing`              | `pnpm --filter web test apps/web/lib/hooks/use-manufacturing.spec.ts`          | 9/9 unit tests PASS                                                                                                             | 0         | **PASSED** |
| —       | TypeScript type-check across web workspace                    | `pnpm --filter web type-check`                                                 | Clean (0 errors across `tsc --noEmit`)                                                                                          | 0         | **PASSED** |
| —       | Next.js ESLint check across web workspace                     | `pnpm --filter web lint`                                                       | Clean (0 errors)                                                                                                                | 0         | **PASSED** |
| —       | Evidence freshness and contract test suite                    | `python3 -m unittest discover -s scripts -p 'test_evidence_freshness.py'`      | 11/11 tests PASS                                                                                                                | 0         | **PASSED** |

---

## Changed Covering Tests

- `apps/web/lib/hooks/use-manufacturing.spec.ts` (9 unit tests covering AC1-AC5):
  - `AC1: rejects completion when both quantityProduced and producedQuantity are absent/undefined`
  - `AC2: rejects completion when quantity is explicitly null`
  - `AC2: rejects completion when producedQuantity is explicitly null`
  - `AC3: rejects completion when quantity is NaN`
  - `AC4: calls api.post with quantityProduced when quantityProduced is provided`
  - `AC4: allows boundary zero quantity when explicitly provided via quantityProduced`
  - `AC5: resolves quantity from producedQuantity for backward compatibility`
  - `AC5: allows boundary zero quantity when explicitly provided via producedQuantity`
  - `AC5: prioritizes quantityProduced when both quantityProduced and producedQuantity are provided`
- `scripts/test_evidence_freshness.py` (contract test for issue #396 evidence report):
  - `test_issue_396_evidence_contract`

---

## Bug Fix / Regression Demonstration

### Base Behaviour (commit `e5d9b805563c04df3300f00442fd18f7d82ce560`)

On `master` prior to this fix:

1. `useCompleteWorkOrder` did not validate inputs for `null` or `undefined`.
2. Omitted, undefined, or null values were sent directly to `api.post` as `{ producedQuantity: undefined }` instead of throwing `'A completion quantity is required'`.
3. Executing `apps/web/lib/hooks/use-manufacturing.spec.ts` against base code failed with **6 failed tests out of 6**.

### Head Behaviour (this branch)

1. `useCompleteWorkOrder` resolves `const quantity = quantityProduced ?? producedQuantity`.
2. When `quantity === undefined || quantity === null || Number.isNaN(quantity)`, it throws `new Error('A completion quantity is required')` and does not call `api.post`.
3. Explicit `0` is preserved and accepted.
4. Executing `apps/web/lib/hooks/use-manufacturing.spec.ts` on head passes cleanly (**9 passed tests out of 9**).

---

## UI Verification (Screenshots / RTL & LTR)

**UI is EXEMPT**:

- This issue modifies client-side hook validation (`useCompleteWorkOrder`) in `apps/web/lib/hooks/use-manufacturing.ts`.
- No user-facing UI components, routes, layout, or localized translations are modified.
