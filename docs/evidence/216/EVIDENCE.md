# EVIDENCE.md — Bill Form Expense-Account Picker (#216)

## Overview

- **Issue**: #216 (Bill form: add expense-account picker per line so UI-made bills can be approved)
- **PR**: #230
- **Base**: `master` (`4c006386`)
- **Tested head (code)**: `bb4a8ba4` (with locale-aware navigation across all bill pages)
- **Date**: 2026-10-21
- **Originating Sentry issue**: None (originates from 2026-10-11 demo walkthrough #175 step 2: 400 "All bill lines must have an expense account assigned before approval")

Status meanings: **PASSED (local, exit 0)** = run in this worktree with command and output below. **UNVERIFIED – pending E2E** = covered by `e2e-army/216-bill-expense-account.e2e.ts`. That test is executed in the hub's `e2e-army` gate check on PR #230.

## Acceptance criteria (numbered from the issue)

| AC      | Criterion (issue #216)                                                                            | Covering test                                                                                                                                                                                                                                                                                                                                                                                                                                | Status                                                                                 |
| :------ | :------------------------------------------------------------------------------------------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------- |
| **AC1** | UI bill with a manual line + chosen expense account saves; Approve & post → Approved, one journal | `bill-form.spec.tsx` › `submits a manual line with the chosen account`, `clears the item-derived account when switching to Manual Entry`, `keeps a manually chosen account when switching to Manual Entry`, `renders localized Add Line button and allows filling Description on newly added lines`; API: `bills.service.spec.ts` › `transition DRAFT to OPEN and post one balanced journal`; E2E: e2e-army `AC1-AC4` and `AC1 (multi-line)` | Form + service: PASSED (local, exit 0). UI E2E: UNVERIFIED – pending E2E               |
| **AC2** | Double-clicking Approve still yields one journal (#11)                                            | `bills.service.spec.ts` › `should post nothing when a concurrent approval already won`; e2e-army `AC1-AC4` ("click Approve & post twice")                                                                                                                                                                                                                                                                                                    | Service: PASSED (local, exit 0). UI E2E: UNVERIFIED – pending E2E                      |
| **AC3** | Record payment on that bill works                                                                 | `bills.service.spec.ts` › `should mark bill as PAID when fully paid`; e2e-army `AC1-AC4` ("record a full payment")                                                                                                                                                                                                                                                                                                                           | Service: PASSED (local, exit 0). UI E2E: UNVERIFIED – pending E2E                      |
| **AC4** | Trial balance stays balanced afterwards                                                           | e2e-army `AC1-AC4` (trial balance debits = credits)                                                                                                                                                                                                                                                                                                                                                                                          | UNVERIFIED – pending E2E                                                               |
| **AC5** | Playwright or component test covering create → choose account → approve                           | `bill-form.spec.tsx` (13 tests); `bill-form.scan.spec.tsx` (4 tests); `scan/page.spec.tsx` (2 tests)                                                                                                                                                                                                                                                                                                                                         | Component/page tests: PASSED (local, exit 0). Full app: UNVERIFIED – pending E2E       |
| **AC6** | Works in /ar (RTL)                                                                                | `bill-form.spec.tsx` › `labels the picker and the error in Arabic`, `labels the Add Line button and table columns in Arabic on /ar`; e2e-army `AC6` (`حساب المصروف`, `إضافة سطر`, `dir === 'rtl'`)                                                                                                                                                                                                                                           | Arabic labels/inputs: PASSED (local, exit 0). RTL in browser: UNVERIFIED – pending E2E |

## Regression demonstrations (base vs head)

### 1. Manual Entry account clearing

- **On Base (`eaefca7`)**:
  ```text
  FAIL components/purchases/bill-form.spec.tsx
    ✕ clears the item-derived account when switching to Manual Entry
      Expected: aria-selected="false"
      Received: aria-selected="true"
  Exit code: 1
  ```
- **On Head**:
  ```text
  PASS components/purchases/bill-form.spec.tsx
    ✓ clears the item-derived account when switching to Manual Entry (54 ms)
    ✓ keeps a manually chosen account when switching to Manual Entry (26 ms)
  Exit code: 0
  ```

### 2. Scan options lookup failure with Retry

- **On Base (`109e2bc`)**:
  ```text
  FAIL app/[locale]/(dashboard)/purchases/bills/scan/page.spec.tsx
    ✕ shows the lookup error with Retry, and Retry refetches the failed accounts
    ✕ shows the loading hint while accounts load
  Exit code: 1
  ```
- **On Head**:
  ```text
  PASS app/[locale]/(dashboard)/purchases/bills/scan/page.spec.tsx
    ✓ shows the lookup error with Retry, and Retry refetches the failed accounts (56 ms)
    ✓ shows the loading hint while accounts load (16 ms)
  Exit code: 0
  ```

### 3. Add Line and form fields in Arabic/RTL

- **On Base**: The "Add Line" button and table columns had hardcoded English text. On `/ar`, searching for `إضافة سطر` timed out after 15000ms.
- **On Head**:
  ```text
  PASS components/purchases/bill-form.spec.tsx
    ✓ renders localized Add Line button and allows filling Description on newly added lines (38 ms)
    ✓ labels the Add Line button and table columns in Arabic on /ar (22 ms)
  Exit code: 0
  ```

### 4. Cross-Origin CORS on Next.js page routes

- **On Base**: Cross-origin prefetch or fetch between `localhost` and `127.0.0.1` failed with CORS policy block.
- **On Head**: Next.js config and middleware return appropriate `Access-Control-Allow-Origin` and `Access-Control-Allow-Credentials` headers, and bill pages use locale-aware `@/i18n/routing` navigation.

## Changed covering tests

- `apps/web/components/purchases/bill-form.spec.tsx` (13 tests)
- `apps/web/components/purchases/bill-form.scan.spec.tsx` (4 tests)
- `apps/web/app/[locale]/(dashboard)/purchases/bills/scan/page.spec.tsx` (2 tests)
- `e2e-army/216-bill-expense-account.e2e.ts` (5 scenarios)

## Commands and observed results

```text
$ pnpm --filter @mizano/web exec jest --maxWorkers=2 components/purchases/bill-form purchases/bills/scan/page.spec
PASS components/purchases/bill-form.spec.tsx
PASS components/purchases/bill-form.scan.spec.tsx
PASS app/[locale]/(dashboard)/purchases/bills/scan/page.spec.tsx
Tests:       19 passed, 19 total
Exit code: 0

$ pnpm --filter @mizano/web type-check
> tsc --noEmit
Exit code: 0

$ pnpm --filter @mizano/web exec next lint --file components/purchases/bill-form.tsx --file components/purchases/bill-form.spec.tsx --file components/purchases/bill-form.scan.spec.tsx --file "app/[locale]/(dashboard)/purchases/bills/scan/page.tsx" --file "app/[locale]/(dashboard)/purchases/bills/scan/page.spec.tsx" --file "app/[locale]/(dashboard)/purchases/bills/new/page.tsx" --file "app/[locale]/(dashboard)/purchases/bills/page.tsx" --file "app/[locale]/(dashboard)/purchases/bills/[id]/page.tsx" --file "app/[locale]/(dashboard)/purchases/bills/[id]/edit/page.tsx" --file middleware.ts
✔ No ESLint warnings or errors
Exit code: 0

$ pnpm --filter api exec jest src/modules/purchases/services/bills.service.spec.ts
PASS src/modules/purchases/services/bills.service.spec.ts
Tests:       43 passed, 43 total
Exit code: 0
```
