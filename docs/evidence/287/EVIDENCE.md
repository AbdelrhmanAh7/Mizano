# Verification Report: Issue #287 — Manufacturing: Align producedQuantity (web) with quantityProduced (API contract)

## Overview

- **Issue**: #287 (fix: EVIDENCE.md: the cited commits and test output cannot be checked against this diff; split from #263, parent #167)
- **Base Commit (`origin/master`)**: `e07f1e3d9370cb8d6bd1905cf83d21c81ef40a71`
- **Tested Code Head**: `80b2a6825cba4cae4231b6443c2ea6faee7e69d7`
- **Branch Head**: `bbc66c34` (docs commit following code head)
- **Branch**: `ai/287`
- **Supersedes**: part of #263
- **Originating Sentry Issue**: None (contract naming discrepancy between Next.js client hook and NestJS controller DTO, not an exception reported via Sentry).

---

## Numbered Acceptance Criteria

| AC ID   | Description                                                                                                             | Verification Method                                                                                                                                          | Status  |
| ------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- |
| **AC1** | Web client sends `quantityProduced` instead of `producedQuantity` in `workOrderApi.complete` and `useCompleteWorkOrder` | Unit test in `use-manufacturing.spec.ts` asserts `mockApiPost` called with `/manufacturing/work-orders/:id/complete` and body `{ quantityProduced: number }` | **MET** |
| **AC2** | Unit test covers work order completion payload, parameter mapping, and backward compatibility                           | `pnpm --filter web exec jest "use-manufacturing.spec" --maxWorkers=2` passes 3/3 tests                                                                       | **MET** |
| **AC3** | E2E test added first covering work order completion and Arabic RTL rendering                                            | `e2e-army/287-work-order-complete.e2e.ts` tags `feat:mz-work-orders`, asserts successful completion and right-to-left layout                                 | **MET** |
| **AC4** | Zero API contract changes to backend or shared packages                                                                 | `git diff origin/master..HEAD -- apps/api packages/` produces 0 diff lines                                                                                   | **MET** |
| **AC5** | Bug fix regression: demonstrate test fails on base and passes on head                                                   | Red on base (3 failed), Green on head (3 passed)                                                                                                             | **MET** |

---

## Verification Commands and Output

### 1. Regression Test on Base (Unpatched master)

Ran `use-manufacturing.spec.ts` against master's implementation:

```bash
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

Test Suites: 1 failed, 1 total
Tests:       3 failed, 3 total
```

### 2. Unit Test Run on Head (`80b2a682`)

```bash
pnpm --filter web exec jest "use-manufacturing.spec" --maxWorkers=2
```

**Observed Exit Code**: 0 (Passed)
**Observed Output**:

```text
PASS lib/hooks/use-manufacturing.spec.ts
  useCompleteWorkOrder
    ✓ calls api.post with quantityProduced (not producedQuantity) (7 ms)
    ✓ maintains backward compatibility when called with producedQuantity parameter (2 ms)
    ✓ handles completion with zero quantity (1 ms)

Test Suites: 1 passed, 1 total
Tests:       3 passed, 3 total
Snapshots:   0 total
Time:        0.511 s, estimated 1 s
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

---

## Changed Files Summary

| File                                                                        | Type | Changes        | Purpose                                                                    |
| --------------------------------------------------------------------------- | ---- | -------------- | -------------------------------------------------------------------------- |
| `e2e-army/287-work-order-complete.e2e.ts`                                   | Test | +88 lines      | Natural-language e2e-army test covering work order completion and RTL      |
| `apps/web/lib/hooks/use-manufacturing.ts`                                   | Code | +12 / -2 lines | Align `workOrderApi.complete` and `useCompleteWorkOrder` with API contract |
| `apps/web/app/[locale]/(dashboard)/manufacturing/work-orders/[id]/page.tsx` | Code | +1 / -1 lines  | Pass `quantityProduced` to mutation                                        |
| `apps/web/lib/hooks/use-manufacturing.spec.ts`                              | Test | +88 lines      | Regression and unit tests covering completion payload                      |
| `docs/evidence/287/EVIDENCE.md`                                             | Docs | +140 lines     | Per-issue verification report                                              |

Total diff: ~330 lines across 5 files, well within boundaries.

---

## Findings from Parent PR #263 Addressed

1. **Missing code changes**: Unlike PR #263 which only touched documentation, PR #287 includes the actual implementation changes in `apps/web/lib/hooks/use-manufacturing.ts` and `apps/web/app/[locale]/(dashboard)/manufacturing/work-orders/[id]/page.tsx`.
2. **Missing tests**: PR #287 adds unit test suite `apps/web/lib/hooks/use-manufacturing.spec.ts` and e2e-army test `e2e-army/287-work-order-complete.e2e.ts`.
3. **Unverifiable commits in EVIDENCE.md**: All evidence in this report is produced directly from the commits on branch `ai/287` (`4fea5f9c`, `80b2a682`).
4. **Zero changes to API**: Verified via `git diff origin/master..HEAD -- apps/api packages/`.
