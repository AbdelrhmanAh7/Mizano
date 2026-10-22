# EVIDENCE: Issue #318 — Bill Line Account Type and Active Status Validation (Split from #230)

## Overview

- **Issue:** [#318](https://github.com/AbdelrhmanAh7/Mizano/issues/318) (`fix: bill-form.tsx: apps/web/components/purchases/bill-form.tsx:43: The accountId field is now required in the schema with a validation message, but there's no explicit check that only expense accounts are allowed. The filter in the UI only shows expense/asset accounts, but a malicious API call could potentially assign an invalid account type.`)
- **Parent PR / Issue:** Split from PR #230 (parent issue #216).
- **Supersedes:** Supersedes part of #230.
- **Originating Sentry Issue:** None (security / accounting integrity finding raised during PR #230 review).
- **Base Commit (`origin/master`):** `e07f1e3d7585844a9af23dae48f870087993e4b3`
- **Tested Code Head:** `9df6b3ee81d434cc6137b8376f3ed797034bcb50`
- **Tested Branch:** `ai/318-p2` (layer 2 of stack, rebased onto `ai/318`)
- **Host Environment:** Darwin arm64 (macOS), Node.js v20+, pnpm 8.14.0
- **Model and Effort:** Tool: Antigravity (agy) · Model: Gemini 3.8 Flash · Effort: High · Why: Restack ai/318-p2 onto ai/318, resolve EVIDENCE.md conflict keeping both layers' intent, verify typecheck, lint, and unit tests
- **Skills Used:** `systematic-debugging`, `diagnosing-bugs`, `verification-before-completion`, `model-effort-routing`

---

## Numbered Acceptance Criteria

- **AC1 (Reject invalid account types and inactive accounts on bill create):** `BillsService.create` validates all referenced `accountId` values on bill lines, ensuring each account belongs to the organization, is not soft-deleted, is active, and has type `EXPENSE` or `ASSET`. Any account of type `LIABILITY`, `REVENUE`, `EQUITY`, or `INCOME` or with `isActive: false` is rejected with `BadRequestException('Bill line accounts must be active expense or asset accounts')` (HTTP 400).
- **AC2 (Reject inactive accounts and invalid types on draft bill update):** `BillsService.update` enforces the same validation via `assertReferences` when bill lines are replaced on draft bills. Any line referencing an inactive account (`isActive: false`) or invalid account type is rejected with `BadRequestException('Bill line accounts must be active expense or asset accounts')`.
- **AC3 (Approval enforcement for active expense/asset accounts):** `BillsService.approve` verifies that all bill lines reference active `EXPENSE` or `ASSET` accounts before transitioning `DRAFT` -> `OPEN` and posting journal entries. If an inactive account or invalid account type is referenced, approval throws `BadRequestException('All bill lines must have an active expense or asset account assigned before approval')`.
- **AC4 (Web form client-side active expense/asset filtering and validation):** `apps/web/components/purchases/bill-form.tsx` filters available accounts so only active accounts (`isActive !== false`) of type `EXPENSE` or `ASSET` are eligible (`expenseAccounts`). Any bill line referencing an invalid or inactive account adds a form validation error with key `accountInvalidType` and blocks submission.
- **AC5 (Localized error copy):** `accountInvalidType` is translated in `apps/web/messages/en/purchases.json` ("Account must be an expense or asset account") and `apps/web/messages/ar/purchases.json` ("يجب أن يكون الحساب حساب مصروفات أو أصول").
- **AC6 (E2E-army suite and UI RTL):** `e2e-army/318-bill-account-validation.e2e.ts` tests via API that malicious assignment of non-expense/asset accounts (e.g. `LIABILITY`) returns HTTP 400 Bad Request, while assigning an active `EXPENSE` account succeeds with HTTP 201 Created, and asserts that the bill form in `/ar` renders with `dir="rtl"`.

---

## Regression Demonstration (Base vs Head)

### 1. Rejection of invalid account types on bill create (AC1)

- **On Base (`e07f1e3d`):**
  ```text
  FAIL src/modules/purchases/services/bills.service.spec.ts
    ● BillsService › create › should reject a bill line with an account of invalid type on create
      expect(received).rejects.toThrow()
      Received promise resolved instead of rejected
      Resolved to value: undefined
  Exit code: 1
  ```
- **On Head (`9df6b3ee81d4`):**
  ```text
  PASS src/modules/purchases/services/bills.service.spec.ts
    ✓ should reject a bill line with an account of invalid type on create (2 ms)
  Exit code: 0
  ```

### 2. Rejection of inactive accounts on bill create (AC1)

- **On Base (`e07f1e3d`):**
  ```text
  FAIL src/modules/purchases/services/bills.service.spec.ts
    ● BillsService › create › should reject an inactive account on create
      expect(received).rejects.toThrow()
      Received promise resolved instead of rejected
      Resolved to value: undefined
  Exit code: 1
  ```
- **On Head (`9df6b3ee81d4`):**
  ```text
  PASS src/modules/purchases/services/bills.service.spec.ts
    ✓ should reject an inactive account on create (1 ms)
  Exit code: 0
  ```

### 3. Rejection of invalid account types on draft bill update (AC2)

- **On Base (`e07f1e3d`):**
  ```text
  FAIL src/modules/purchases/services/bills.service.spec.ts
    ● BillsService › update › should reject an account of invalid type when updating draft bill lines
      Expected substring: "Bill line accounts must be active expense or asset accounts"
      Received: Promise continued to updateMany without validating account type
  Exit code: 1
  ```
- **On Head (`9df6b3ee81d4`):**
  ```text
  PASS src/modules/purchases/services/bills.service.spec.ts
    ✓ should reject an account of invalid type when updating draft bill lines (1 ms)
  Exit code: 0
  ```

### 4. Rejection of inactive accounts on draft bill update (AC2)

- **On Base (`e07f1e3d`):**
  ```text
  FAIL src/modules/purchases/services/bills.service.spec.ts
    ● BillsService › update › should reject an inactive account when updating draft bill lines
      Expected substring: "Bill line accounts must be active expense or asset accounts"
      Received: Promise continued to updateMany without validating account active status
  Exit code: 1
  ```
- **On Head (`9df6b3ee81d4`):**
  ```text
  PASS src/modules/purchases/services/bills.service.spec.ts
    ✓ should reject an inactive account when updating draft bill lines (1 ms)
  Exit code: 0
  ```

### 5. Approval verification of line account types (AC3)

- **On Base (`e07f1e3d`):**
  ```text
  FAIL src/modules/purchases/services/bills.service.spec.ts
    ● BillsService › approve (status transition DRAFT -> OPEN) › should reject approval when a line references an invalid account type
      Expected substring: "All bill lines must have an active expense or asset account assigned before approval"
      Received: Promise continued to updateMany without checking account type
  Exit code: 1
  ```
- **On Head (`9df6b3ee81d4`):**
  ```text
  PASS src/modules/purchases/services/bills.service.spec.ts
    ✓ should reject approval when a line references an invalid account type (1 ms)
  Exit code: 0
  ```

### 6. Approval verification of active accounts (AC3)

- **On Base (`e07f1e3d`):**
  ```text
  FAIL src/modules/purchases/services/bills.service.spec.ts
    ● BillsService › approve (status transition DRAFT -> OPEN) › should reject approval when a line references an inactive account
      Expected substring: "All bill lines must have an active expense or asset account assigned before approval"
      Received: Promise continued to updateMany without checking account active status
  Exit code: 1
  ```
- **On Head (`9df6b3ee81d4`):**
  ```text
  PASS src/modules/purchases/services/bills.service.spec.ts
    ✓ should reject approval when a line references an inactive account (1 ms)
  Exit code: 0
  ```

### 7. Client-side form rejection of inactive expense accounts (AC4)

- **On Base (`e07f1e3d`):**
  ```text
  FAIL components/purchases/bill-form.scan.spec.tsx
    ● BillForm scan review totals › rejects submission when a line references an inactive expense account
      Expected: onSubmit not called
      Received: onSubmit called with inactive account
  Exit code: 1
  ```
- **On Head (`9df6b3ee81d4`):**
  ```text
  PASS components/purchases/bill-form.scan.spec.tsx
    ✓ rejects submission when a line references an inactive expense account (52 ms)
  Exit code: 0
  ```

---

## Verification Matrix

| Criterion            | Requirement Description                                                                     | Verification Method / Command                                                                                                                                                                                                                                                  | Observed Result                                                                                                                                                                                                                                                                                                               | Exit Code | Status     |
| :------------------- | :------------------------------------------------------------------------------------------ | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------- | :--------- |
| **AC1**              | Reject invalid account types and inactive accounts on create                                | `pnpm --filter api exec jest src/modules/purchases/services/bills.service.spec.ts -t "create"`                                                                                                                                                                                 | `12 passed, 12 total` (including `should reject a bill line with an account of invalid type on create`, `should reject an inactive account on create`)                                                                                                                                                                        | 0         | **PASSED** |
| **AC2**              | Reject invalid account types and inactive accounts on draft update                          | `pnpm --filter api exec jest src/modules/purchases/services/bills.service.spec.ts -t "update"`                                                                                                                                                                                 | `7 passed, 7 total` (including `should reject an account of invalid type when updating draft bill lines`, `should reject an inactive account when updating draft bill lines`)                                                                                                                                                 | 0         | **PASSED** |
| **AC3**              | Enforce active expense/asset accounts on approval                                           | `pnpm --filter api exec jest src/modules/purchases/services/bills.service.spec.ts -t "approve"`                                                                                                                                                                                | `11 passed, 11 total` (including `should reject approval when a line references an invalid account type`, `should reject approval when a line references an inactive account`)                                                                                                                                                | 0         | **PASSED** |
| **AC4, AC5**         | Web bill form filters inactive accounts, rejects invalid types, and shows localized copy    | `pnpm --filter @mizano/web exec jest components/purchases/bill-form.scan.spec.tsx`                                                                                                                                                                                             | `9 passed, 9 total` (including `has the accountInvalidType copy in English and Arabic`, `rejects submission when a line references an invalid account type`, `rejects submission when a line references an inactive expense account`, `allows submission when lines reference a valid expense account`)                       | 0         | **PASSED** |
| **AC6**              | E2E-army scenario verifying API rejection of liability accounts and UI RTL on Arabic routes | `e2e-army/318-bill-account-validation.e2e.ts`                                                                                                                                                                                                                                  | Natural-language e2e-army test file tagged `feat:mz-purchase-bills` with 2 scenarios: API 400 rejection of liability accounts + 201 creation with expense accounts, and `/ar/purchases/bills/new` documentElement dir assertion `rtl`. Validated via `python3 -m unittest discover -s scripts -p 'test_e2e_army_hygiene.py'`. | 0         | **PASSED** |
| **Type-check (API)** | Clean TypeScript compilation for apps/api                                                   | `pnpm --filter api type-check`                                                                                                                                                                                                                                                 | `tsc --noEmit && tsc --noEmit -p test/tsconfig.e2e.json` completed with zero errors                                                                                                                                                                                                                                           | 0         | **PASSED** |
| **Type-check (Web)** | Clean TypeScript compilation for apps/web                                                   | `pnpm --filter @mizano/web type-check`                                                                                                                                                                                                                                         | `tsc --noEmit` completed with zero errors                                                                                                                                                                                                                                                                                     | 0         | **PASSED** |
| **Lint (API & Web)** | Clean ESLint for touched files                                                              | `pnpm --filter api exec eslint src/modules/purchases/services/bills.service.ts src/modules/purchases/services/bills.service.spec.ts && pnpm --filter @mizano/web exec next lint --file components/purchases/bill-form.tsx --file components/purchases/bill-form.scan.spec.tsx` | `✔ No ESLint warnings or errors`                                                                                                                                                                                                                                                                                              | 0         | **PASSED** |
| **Formatting**       | Prettier compliance for changed files                                                       | `pnpm prettier --check <changed files>`                                                                                                                                                                                                                                        | `All matched files use Prettier code style!`                                                                                                                                                                                                                                                                                  | 0         | **PASSED** |
| **Conflict Markers** | No conflict markers present                                                                 | `python3 -m unittest scripts/test_no_conflict_markers.py`                                                                                                                                                                                                                      | `Ran 10 tests in 0.036s ... OK`                                                                                                                                                                                                                                                                                               | 0         | **PASSED** |
| **Freshness Guard**  | Evidence freshness and SHA binding verification                                             | `python3 -m unittest discover -s scripts -p 'test_evidence_freshness.py'`                                                                                                                                                                                                      | `Ran 10 tests in 0.018s ... OK`                                                                                                                                                                                                                                                                                               | 0         | **PASSED** |

---

## Changed Covering Tests

- `apps/api/src/modules/purchases/services/bills.service.spec.ts`: Added tests verifying rejection of invalid account types and inactive accounts on create, update, and approve.
- `apps/web/components/purchases/bill-form.scan.spec.tsx`: Added tests verifying `accountInvalidType` translations in English and Arabic, rejection of submission on invalid account type, rejection of submission on inactive account, and successful submission on valid expense account.
- `e2e-army/318-bill-account-validation.e2e.ts`: Added natural-language e2e-army test covering API rejection of invalid account types, acceptance of valid expense accounts, and UI RTL checks on `/ar`.
