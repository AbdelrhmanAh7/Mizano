# EVIDENCE: Issue #318 — Bill Line Account Type Validation (Split from #230)

## Overview

- **Issue:** #318 (`fix: bill-form.tsx: apps/web/components/purchases/bill-form.tsx:43: The accountId field is now required in the schema with a validation message, but there's no explicit check that only expense accounts are allowed. The filter in the UI only shows expense/asset accounts, but a malicious API call could potentially assign an invalid account type.`)
- **Parent PR / Issue:** Split from PR #230 (parent issue #216).
- **Supersedes:** Supersedes part of #230.
- **Originating Sentry Issue:** None (security / accounting integrity finding raised during PR #230 review).
- **Base commit:** `e07f1e3d7585844a9af23dae48f870087993e4b3` (`origin/master`)
- **Host environment:** Darwin arm64 (macOS), Node.js v20+, pnpm 8.14.0

## Acceptance Criteria

- **AC1 (Reject invalid account types on bill create):** `BillsService.create` validates all referenced `accountId` values on bill lines, ensuring each account belongs to the organization, is not soft-deleted, is active, and has type `EXPENSE` or `ASSET`. Any account of type `LIABILITY`, `REVENUE`, `EQUITY`, or `INCOME` is rejected with `BadRequestException('Bill line accounts must be active expense or asset accounts')` (HTTP 400).
- **AC2 (Reject inactive accounts and invalid types on update):** `BillsService.update` enforces the same check through `assertReferences` when bill lines are replaced on draft bills. Any line referencing an inactive account (`isActive: false`) or invalid account type is rejected with `BadRequestException('Bill line accounts must be active expense or asset accounts')`.
- **AC3 (Approval enforcement):** `BillsService.approve` verifies that all bill lines reference active `EXPENSE` or `ASSET` accounts before transitioning `DRAFT` -> `OPEN` and posting journal entries. If an invalid or inactive account is referenced, approval throws `BadRequestException('All bill lines must have an active expense or asset account assigned before approval')`.
- **AC4 (Web form client-side validation):** `apps/web/components/purchases/bill-form.tsx` validates that any `accountId` assigned to a bill line matches the available active expense or asset accounts (`expenseAccountIds`). An invalid account type sets an error on the field with key `accountInvalidType` and blocks form submission.
- **AC5 (Localized error copy):** `accountInvalidType` is translated in `apps/web/messages/en/purchases.json` ("Account must be an expense or asset account") and `apps/web/messages/ar/purchases.json` ("يجب أن يكون الحساب حساب مصروفات أو أصول").
- **AC6 (E2E-army test):** `e2e-army/318-bill-account-validation.e2e.ts` tests via API that malicious assignment of non-expense/asset accounts (e.g. `LIABILITY`) returns HTTP 400 Bad Request, while assigning an active `EXPENSE` account succeeds with HTTP 201 Created.

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
- **On Head:**
  ```text
  PASS src/modules/purchases/services/bills.service.spec.ts
    ✓ should reject a bill line with an account of invalid type on create (12 ms)
  Exit code: 0
  ```

### 2. Rejection of inactive accounts on bill create (AC2)

- **On Base (`e07f1e3d`):**
  ```text
  FAIL src/modules/purchases/services/bills.service.spec.ts
    ● BillsService › create › should reject an inactive account on create
      expect(received).rejects.toThrow()
      Received promise resolved instead of rejected
      Resolved to value: undefined
  Exit code: 1
  ```
- **On Head:**
  ```text
  PASS src/modules/purchases/services/bills.service.spec.ts
    ✓ should reject an inactive account on create (3 ms)
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
- **On Head:**
  ```text
  PASS src/modules/purchases/services/bills.service.spec.ts
    ✓ should reject an account of invalid type when updating draft bill lines (1 ms)
  Exit code: 0
  ```

### 4. Approval verification of line account types (AC3)

- **On Base (`e07f1e3d`):**
  ```text
  FAIL src/modules/purchases/services/bills.service.spec.ts
    ● BillsService › approve (status transition DRAFT -> OPEN) › should reject approval when a line references an invalid account type
      Expected substring: "All bill lines must have an active expense or asset account assigned before approval"
      Received: Promise continued to updateMany without checking account type
  Exit code: 1
  ```
- **On Head:**
  ```text
  PASS src/modules/purchases/services/bills.service.spec.ts
    ✓ should reject approval when a line references an invalid account type (1 ms)
  Exit code: 0
  ```

## Verification Report

| Criterion            | Command / Test                                                                                                                                                                                                                                                                 | Observed Result                                                                                                                                                                                                                | Exit Code |
| :------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------- |
| **AC1, AC2**         | `pnpm --filter api exec jest src/modules/purchases/services/bills.service.spec.ts -t "create"`                                                                                                                                                                                 | `12 passed, 12 total` (including `should reject a bill line with an account of invalid type on create`, `should reject an inactive account on create`)                                                                         | 0         |
| **AC2**              | `pnpm --filter api exec jest src/modules/purchases/services/bills.service.spec.ts -t "update"`                                                                                                                                                                                 | `6 passed, 6 total` (including `should reject an account of invalid type when updating draft bill lines`)                                                                                                                      | 0         |
| **AC3**              | `pnpm --filter api exec jest src/modules/purchases/services/bills.service.spec.ts -t "approve"`                                                                                                                                                                                | `10 passed, 10 total` (including `should reject approval when a line references an invalid account type`)                                                                                                                      | 0         |
| **AC4, AC5**         | `pnpm --filter @mizano/web exec jest components/purchases/bill-form.scan.spec.tsx`                                                                                                                                                                                             | `8 passed, 8 total` (including `has the accountInvalidType copy in English and Arabic`, `rejects submission when a line references an invalid account type`, `allows submission when lines reference a valid expense account`) | 0         |
| **AC6**              | `e2e-army/318-bill-account-validation.e2e.ts`                                                                                                                                                                                                                                  | E2E-army suite scenario covering API rejection of liability account assignment on bill creation and successful expense account assignment                                                                                      | Gate      |
| **Type-check (API)** | `pnpm --filter api type-check`                                                                                                                                                                                                                                                 | `tsc --noEmit && tsc --noEmit -p test/tsconfig.e2e.json` completed with zero errors                                                                                                                                            | 0         |
| **Type-check (Web)** | `pnpm --filter @mizano/web type-check`                                                                                                                                                                                                                                         | `tsc --noEmit` completed with zero errors                                                                                                                                                                                      | 0         |
| **Lint (API & Web)** | `pnpm --filter api exec eslint src/modules/purchases/services/bills.service.ts src/modules/purchases/services/bills.service.spec.ts && pnpm --filter @mizano/web exec next lint --file components/purchases/bill-form.tsx --file components/purchases/bill-form.scan.spec.tsx` | `No ESLint warnings or errors`                                                                                                                                                                                                 | 0         |
| **Formatting**       | `pnpm prettier --check <changed files>`                                                                                                                                                                                                                                        | All matched files use Prettier code style                                                                                                                                                                                      | 0         |
| **Conflict markers** | `python3 -m unittest scripts/test_no_conflict_markers.py`                                                                                                                                                                                                                      | `Ran 10 tests in 0.034s ... OK`                                                                                                                                                                                                | 0         |

## Changed Covering Tests

- `apps/api/src/modules/purchases/services/bills.service.spec.ts`: Added tests verifying rejection of invalid account types and inactive accounts on create, update, and approve.
- `apps/web/components/purchases/bill-form.scan.spec.tsx`: Added tests verifying `accountInvalidType` translations in English and Arabic, rejection of submission on invalid account type, and successful submission on valid expense account.
- `e2e-army/318-bill-account-validation.e2e.ts`: Added natural-language e2e-army test covering API rejection of invalid account types and UI RTL checks on `/ar`.
