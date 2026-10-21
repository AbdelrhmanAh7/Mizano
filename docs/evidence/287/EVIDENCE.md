# Verification Report: Issue #287 — Manufacturing: Align producedQuantity (web) with quantityProduced (API contract)

## Overview

- **Issue**: #287 (fix: EVIDENCE.md: the cited commits and test output cannot be checked against this diff; split from #263, parent #167)
- **Base Commit (`origin/master`)**: `113500142827dd660b4be01d51bf14073d74549f`
- **Tested Code Head**: `97651ac92d1c6ade4fd91fffb157c3907f9c6516`
- **Branch Head**: `97651ac92d1c6ade4fd91fffb157c3907f9c6516` (code head tested before docs update)
- **Branch**: `ai/287`
- **Supersedes**: part of #263
- **Originating Sentry Issue**: None (contract naming discrepancy between Next.js client hook and NestJS controller DTO, not an exception reported via Sentry).

---

## Numbered Acceptance Criteria

| AC ID   | Description                                                                                                                                           | Verification Method                                                                                                                                                                   | Status  |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| **AC1** | Web client sends `quantityProduced` instead of `producedQuantity` in `workOrderApi.complete` and `useCompleteWorkOrder`, and rejects missing quantity | Unit test in `use-manufacturing.spec.ts` asserts `mockApiPost` called with `/manufacturing/work-orders/:id/complete` and body `{ quantityProduced: number }`, and rejects missing qty | **MET** |
| **AC2** | Unit test covers work order completion payload, parameter mapping, missing quantity rejection, and backward compatibility                             | `pnpm --filter web exec jest "use-manufacturing.spec" --maxWorkers=2` passes 4/4 tests                                                                                                | **MET** |
| **AC3** | E2E test added first covering work order completion and Arabic RTL rendering                                                                          | `e2e-army/287-work-order-complete.e2e.ts` tags `feat:mz-work-orders`, seeds component stock via inventory adjustment, asserts completion and RTL layout                               | **MET** |
| **AC4** | Zero API contract changes to backend or shared packages                                                                                               | `git diff origin/master..HEAD -- apps/api packages/` produces 0 diff lines                                                                                                            | **MET** |
| **AC5** | Bug fix regression: demonstrate test fails on base and passes on head                                                                                 | Red on base (4 failed), Green on head (4 passed)                                                                                                                                      | **MET** |

---

## Verification Commands and Output

### 1. Regression Test on Base (Unpatched master)

The test file `apps/web/lib/hooks/use-manufacturing.spec.ts` (staged spec blob SHA `f23cf0c85011514d99544714a22f9755f956b1a9`) was staged onto the unpatched base commit (`origin/master` at `113500142827dd660b4be01d51bf14073d74549f`) to run against master's implementation:

```bash
# Staged use-manufacturing.spec.ts onto origin/master and executed:
pnpm --filter web exec jest "use-manufacturing.spec" --maxWorkers=2
```

**Observed Exit Code**: 1 (Failed)
**Observed Output**:

```text
FAIL lib/hooks/use-manufacturing.spec.ts
  useCompleteWorkOrder
    ✕ calls api.post with quantityProduced (not producedQuantity) (7 ms)
    ✕ maintains backward compatibility when called with producedQuantity parameter (3 ms)
    ✕ handles completion with zero quantity (1 ms)
    ✕ rejects completion when quantity is missing (5 ms)

  ● useCompleteWorkOrder › calls api.post with quantityProduced (not producedQuantity)

    expect(jest.fn()).toHaveBeenCalledWith(...expected)

    - Expected
    + Received

      "/manufacturing/work-orders/wo1/complete",
      Object {
    -   "quantityProduced": 5,
    +   "producedQuantity": undefined,
      },

    Number of calls: 1

  ● useCompleteWorkOrder › maintains backward compatibility when called with producedQuantity parameter

    expect(received).toEqual(expected) // deep equality

    - Expected  - 1
    + Received  + 1

      Object {
    -   "quantityProduced": 10,
    +   "producedQuantity": 10,
      }

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
Tests:       4 failed, 4 total
```

### 2. Unit Test Run on Head (`97651ac9`)

```bash
pnpm --filter web exec jest "use-manufacturing.spec" --maxWorkers=2
```

**Observed Exit Code**: 0 (Passed)
**Observed Output**:

```text
PASS lib/hooks/use-manufacturing.spec.ts
  useCompleteWorkOrder
    ✓ calls api.post with quantityProduced (not producedQuantity) (16 ms)
    ✓ maintains backward compatibility when called with producedQuantity parameter (1 ms)
    ✓ handles completion with zero quantity (2 ms)
    ✓ rejects completion when quantity is missing (10 ms)

Test Suites: 1 passed, 1 total
Tests:       4 passed, 4 total
Snapshots:   0 total
Time:        0.661 s, estimated 1 s
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

The E2E test file `e2e-army/287-work-order-complete.e2e.ts` was added to test the complete user journey:

- Tags: `['feat:mz-work-orders', 'lvl:ui']`
- Precondition setup: Authenticates as demo admin, creates output and component items, provisions 10 component units in warehouse via `POST /inventory-adjustments` (so the BOM material availability check on `POST /manufacturing/work-orders/:id/start` passes), creates work order, and starts it.
- UI completion: Opens `/en/manufacturing/work-orders/:id`, interacts with the completion dialog, sets quantity produced, submits, and asserts work order completion.
- Internationalization / RTL: Opens `/ar/manufacturing/work-orders/:id` and asserts right-to-left layout.

Per repository directives ("Speed (owner 2026-10-08): in FlowLine_Web and Mizano the FULL suite runs on GitHub-hosted CI after the push — do NOT run the full suite or build locally there"), local execution validates syntax and types; full browser E2E execution runs on CI within the `e2e-army` gate against a throwaway stack.

---

## Changed Files Summary

| File                                                                        | Type | Changes        | Purpose                                                                    |
| --------------------------------------------------------------------------- | ---- | -------------- | -------------------------------------------------------------------------- |
| `e2e-army/287-work-order-complete.e2e.ts`                                   | Test | +128 lines     | Natural-language e2e-army test covering work order completion and RTL      |
| `apps/web/lib/hooks/use-manufacturing.ts`                                   | Code | +17 / -4 lines | Align `workOrderApi.complete` and `useCompleteWorkOrder` with API contract |
| `apps/web/app/[locale]/(dashboard)/manufacturing/work-orders/[id]/page.tsx` | Code | +1 / -1 lines  | Pass `quantityProduced` to mutation                                        |
| `apps/web/lib/hooks/use-manufacturing.spec.ts`                              | Test | +101 lines     | Regression and unit tests covering completion payload                      |
| `docs/evidence/287/EVIDENCE.md`                                             | Docs | +187 lines     | Per-issue verification report                                              |

Total diff: 439 changed lines across 5 files (434 insertions, 5 deletions).

---

## CodeRabbit Review Threads Addressed (Round 1)

1. **`apps/web/lib/hooks/use-manufacturing.ts:355` (Reject missing completion quantity)**: Updated `useCompleteWorkOrder` so it requires an explicit quantity (`quantityProduced ?? producedQuantity`), throwing `new Error('A completion quantity is required')` when absent, rather than defaulting to 0. Added covering test in `use-manufacturing.spec.ts`.
2. **`docs/evidence/287/EVIDENCE.md:8` (Tested Code Head and Branch Head)**: Re-ran checks on the exact tested code head `97651ac92d1c6ade4fd91fffb157c3907f9c6516`, binding all verification commands to this commit and removing any fabricated or mismatched head reference.
3. **`docs/evidence/287/EVIDENCE.md:21` (Distinguish E2E test added vs browser run)**: Updated AC3 and Section 6 to distinguish test file addition/structure from runtime CI execution, explaining that browser execution is handled by the `e2e-army` verify gate.
4. **`docs/evidence/287/EVIDENCE.md:35` (Document staged spec on unpatched base)**: Documented the exact staging step and blob SHA (`f23cf0c85011514d99544714a22f9755f956b1a9`) used to execute the regression test against unpatched master.
5. **`docs/evidence/287/EVIDENCE.md:157` (Correct changed-file totals)**: Recalculated file line counts and totals from the actual git diff against `origin/master`.
6. **`e2e-army/287-work-order-complete.e2e.ts:60` (Add stock before starting work order)**: Updated `createStartedWorkOrder` to record a 10-unit `INCREASE` adjustment via `POST /inventory-adjustments` using dynamic warehouse and account options, allowing the work order start check to pass.
