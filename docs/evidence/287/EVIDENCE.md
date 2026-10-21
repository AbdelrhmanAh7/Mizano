# Verification Report: Issue #287 — Manufacturing: Align producedQuantity (web) with quantityProduced (API contract)

## Overview

- **Issue**: #287 (fix: EVIDENCE.md: the cited commits and test output cannot be checked against this diff; split from #263, parent #167)
- **Base Commit (`origin/master`)**: `230e4ec320129dad77e488933ac5e7b5ff59c1e3`
- **Tested Code Head**: `f5003bd811d7eb6b5df9468962629ef71bc9d494`
- **Branch Head**: `f5003bd811d7eb6b5df9468962629ef71bc9d494` (code head tested before docs update)
- **Branch**: `ai/287`
- **Supersedes**: part of #263
- **Originating Sentry Issue**: None (contract naming discrepancy between Next.js client hook and NestJS controller DTO, not an exception reported via Sentry).

---

## Numbered Acceptance Criteria

| AC ID   | Description                                                                                                                                                                           | Verification Method                                                                                                                                                               | Status  |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| **AC1** | Web client sends `quantityProduced` instead of `producedQuantity` in `workOrderApi.complete` and `useCompleteWorkOrder`, rejects missing quantity, and removes backward compatibility | Unit test in `use-manufacturing.spec.ts` asserts `mockApiPost` called with `/manufacturing/work-orders/:id/complete` and body `{ quantityProduced: number }`, rejects missing qty | **MET** |
| **AC2** | Unit test covers work order completion payload, parameter mapping, zero quantity, and missing quantity rejection                                                                      | `pnpm --filter web exec jest "use-manufacturing.spec" --maxWorkers=2` passes 3/3 tests                                                                                            | **MET** |
| **AC3** | E2E test added first covering work order completion and Arabic RTL rendering                                                                                                          | `e2e-army/287-work-order-complete.e2e.ts` tags `feat:mz-work-orders`, seeds component stock via inventory adjustment, asserts completion and RTL layout                           | **MET** |
| **AC4** | Zero API contract changes to backend or shared packages                                                                                                                               | `git diff origin/master..HEAD -- apps/api packages/` produces 0 diff lines                                                                                                        | **MET** |
| **AC5** | Bug fix regression: demonstrate test fails on base and passes on head                                                                                                                 | Red on base (3 failed), Green on head (3 passed)                                                                                                                                  | **MET** |

---

## Verification Commands and Output

### 1. Regression Test on Base (Unpatched master)

The test file `apps/web/lib/hooks/use-manufacturing.spec.ts` (staged spec blob SHA `e79825582b6b28ec36efc3853453cd26b43507ba`) was staged onto the unpatched base commit (`origin/master` at `230e4ec320129dad77e488933ac5e7b5ff59c1e3`) to run against master's implementation:

```bash
# Staged use-manufacturing.spec.ts onto origin/master and executed:
pnpm --filter web exec jest "use-manufacturing.spec" --maxWorkers=2
```

**Observed Exit Code**: 1 (Failed)
**Observed Output**:

```text
FAIL lib/hooks/use-manufacturing.spec.ts
  useCompleteWorkOrder
    ✕ calls api.post with quantityProduced (7 ms)
    ✕ handles completion with zero quantity (2 ms)
    ✕ rejects completion when quantity is missing (6 ms)

  ● useCompleteWorkOrder › calls api.post with quantityProduced

    expect(jest.fn()).toHaveBeenCalledWith(...expected)

    - Expected
    + Received

      "/manufacturing/work-orders/wo1/complete",
      Object {
    -   "quantityProduced": 5,
    +   "producedQuantity": undefined,
      },

    Number of calls: 1

  ● useCompleteWorkOrder › handles completion with zero quantity

    expect(jest.fn()).toHaveBeenCalledWith(...expected)

    - Expected
    + Received

      "/manufacturing/work-orders/wo1/complete",
      Object {
    -   "quantityProduced": 0,
    +   "producedQuantity": undefined,
      },

  ● useCompleteWorkOrder › rejects completion when quantity is missing

    JestAssertionError: expect(received).rejects.toThrow()
    Received promise resolved instead of rejected

Test Suites: 1 failed, 1 total
Tests:       3 failed, 3 total
```

### 2. Unit Test Run on Head (`f5003bd8`)

```bash
pnpm --filter web exec jest "use-manufacturing.spec" --maxWorkers=2
```

**Observed Exit Code**: 0 (Passed)
**Observed Output**:

```text
PASS lib/hooks/use-manufacturing.spec.ts
  useCompleteWorkOrder
    ✓ calls api.post with quantityProduced (7 ms)
    ✓ handles completion with zero quantity (2 ms)
    ✓ rejects completion when quantity is missing (13 ms)

Test Suites: 1 passed, 1 total
Tests:       3 passed, 3 total
Snapshots:   0 total
Time:        0.459 s, estimated 1 s
Ran all test suites matching /use-manufacturing.spec/i.
```

### 3. TypeScript Type-Check

```bash
pnpm --filter web type-check
```

**Observed Exit Code**: 0 (Passed)
**Observed Output**:

```text
> @mizano/web@0.1.0 type-check /Users/abdelrahmanahmed/agents/work.noindex/impl/Mizano-287/apps/web
> tsc --noEmit
```

### 4. Linter Check

```bash
pnpm --filter web lint
```

**Observed Exit Code**: 0 (Passed, 0 errors)

### 5. Backend Contract Immutability Verification (AC4)

```bash
git diff origin/master..HEAD -- apps/api packages/
```

**Observed Exit Code**: 0
**Observed Output**: _(empty — zero diff)_

### 6. E2E-Army Specification Verification (AC3)

The E2E test file `e2e-army/287-work-order-complete.e2e.ts` was added to specify and guard the complete user journey:

- Tags: `['feat:mz-work-orders', 'lvl:ui']`
- Precondition setup: Authenticates as demo admin, creates output and component items, provisions 10 component units in warehouse via `POST /inventory-adjustments` (so the BOM material availability check on `POST /manufacturing/work-orders/:id/start` passes), creates work order, and starts it.
- UI completion: Opens `/en/manufacturing/work-orders/:id`, interacts with the completion dialog, sets quantity produced, submits, and asserts work order completion without error toast.
- Internationalization / RTL: Opens `/ar/manufacturing/work-orders/:id` and asserts right-to-left layout.

_Note on Execution_: The test specification has been added and verified for syntax/types locally. Full browser E2E execution runs against the ephemeral application deployment within the `e2e-army` gate on GitHub Actions CI.

---

## Changed Files Summary

| File                                                                        | Type | Changes         | Purpose                                                                    |
| --------------------------------------------------------------------------- | ---- | --------------- | -------------------------------------------------------------------------- |
| `e2e-army/287-work-order-complete.e2e.ts`                                   | Test | +128 / -0 lines | Natural-language e2e-army test covering work order completion and RTL      |
| `apps/web/lib/hooks/use-manufacturing.ts`                                   | Code | +8 / -4 lines   | Align `workOrderApi.complete` and `useCompleteWorkOrder` with API contract |
| `apps/web/app/[locale]/(dashboard)/manufacturing/work-orders/[id]/page.tsx` | Code | +14 / -14 lines | Pass `quantityProduced` and align form state/inputs with API contract      |
| `apps/web/lib/hooks/use-manufacturing.spec.ts`                              | Test | +87 / -0 lines  | Regression and unit tests covering completion payload                      |
| `docs/evidence/287/EVIDENCE.md`                                             | Docs | +189 / -0 lines | Per-issue verification report                                              |

Total diff: 444 changed lines across 5 files (426 insertions, 18 deletions).

---

## Review Findings Addressed

### Round 2 Review Findings (Head `bfdf1c1`)

1. **`apps/web/lib/hooks/use-manufacturing.ts:355` (Remove backward compatibility)**:
   - _Finding_: QA noted that accepting both `quantityProduced` and `producedQuantity` contradicts the acceptance criteria requiring the web client to send `quantityProduced` instead of `producedQuantity`.
   - _Root Cause_: Previous commit attempted to retain `producedQuantity` as an optional fallback parameter in `useCompleteWorkOrder`.
   - _Fix_: Removed `producedQuantity` parameter completely (`apps/web/lib/hooks/use-manufacturing.ts:345-358`). The hook now exclusively accepts `{ id: string; quantityProduced: number }` and throws `A completion quantity is required` if omitted or nullish.
   - _Test Evidence_: `apps/web/lib/hooks/use-manufacturing.spec.ts:43-90` asserts `quantityProduced` payload and rejects missing quantity without backward compatibility.

2. **`apps/web/app/[locale]/(dashboard)/manufacturing/work-orders/[id]/page.tsx:119` (Rename state variable to `quantityProduced`)**:
   - _Finding_: QA noted that passing `quantityProduced: producedQuantity` causes confusion and should be renamed for clarity and consistency with the API contract.
   - _Root Cause_: The component state was previously initialized as `producedQuantity` / `setProducedQuantity`.
   - _Fix_: Renamed state to `quantityProduced` / `setQuantityProduced` across declaration (line 80), mutation call (line 116), record production handler (line 133), dialog inputs and disabled conditions (lines 279-289, 516-520, 558, 578-585, 598).
   - _Test Evidence_: Web typecheck (`pnpm --filter web type-check`) and lint (`pnpm --filter web lint`) pass cleanly.

### Round 1 CodeRabbit Review Findings (Head `bd254dc`)

1. **`apps/web/lib/hooks/use-manufacturing.ts:355` (Reject missing completion quantity)**: `useCompleteWorkOrder` requires an explicit quantity, throwing `new Error('A completion quantity is required')` when absent, rather than defaulting to 0.
2. **`docs/evidence/287/EVIDENCE.md:8` (Tested Code Head and Branch Head)**: Re-ran checks on the exact tested code head `f5003bd811d7eb6b5df9468962629ef71bc9d494`.
3. **`docs/evidence/287/EVIDENCE.md:21` (Distinguish E2E test added vs browser run)**: Updated AC3 and Section 6 to distinguish test file addition/structure from runtime CI execution.
4. **`docs/evidence/287/EVIDENCE.md:35` (Document staged spec on unpatched base)**: Documented the exact staging step and blob SHA (`e79825582b6b28ec36efc3853453cd26b43507ba`) used to execute the regression test against unpatched master.
5. **`docs/evidence/287/EVIDENCE.md:157` (Correct changed-file totals)**: Calculated exact line counts and totals from the git diff against `origin/master`.
6. **`e2e-army/287-work-order-complete.e2e.ts:60` (Add stock before starting work order)**: Updated `createStartedWorkOrder` to record a 10-unit `INCREASE` adjustment via `POST /inventory-adjustments` using dynamic warehouse and account options, allowing the work order start check to pass.
