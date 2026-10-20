# Evidence for Issue #167 / #277: Manufacturing: align producedQuantity (web) with quantityProduced (API)

- **Issue**: #277 (fix: qa finding: EVIDENCE.md, split from #263, parent issue #167)
- **Base commit (`origin/master`)**: `4c006386`
- **Originating Sentry issue**: None found (contract naming discrepancy between frontend hook and backend controller, not an error originating from Sentry).
- **Scope & Context**:
  - In PR #263, QA finding `93d3dd86912a` noted that EVIDENCE.md claimed changes in `apps/web/lib/hooks/use-manufacturing.ts`, `apps/web/lib/hooks/use-manufacturing.spec.ts`, and `e2e-army/167-work-order-complete.e2e.ts`, but none of those files appeared in the PR diff.
  - This PR supersedes part of #263 by committing the actual functional fix (`apps/web/lib/hooks/use-manufacturing.ts` sending `quantityProduced`), updating the caller (`apps/web/app/[locale]/(dashboard)/manufacturing/work-orders/[id]/page.tsx`), adding unit tests (`apps/web/lib/hooks/use-manufacturing.spec.ts`), and providing natural-language e2e-army test tagged `@issue-277` and `@issue-167` (`e2e-army/277-work-order-complete.e2e.ts`).
  - PR #303 CodeRabbit / review finding addressed: deleted the duplicate shim `e2e-army/167-work-order-complete.e2e.ts` to prevent duplicate test registration and parallel worker collision, unified coverage into `e2e-army/277-work-order-complete.e2e.ts` with randomized seed/item codes.

## Acceptance Criteria

1. **AC1**: Web client sends `quantityProduced` instead of `producedQuantity` when completing a work order (`workOrderApi.complete` and `useCompleteWorkOrder`).
2. **AC2**: Web unit test covers completion payload and zero-quantity boundary case (`apps/web/lib/hooks/use-manufacturing.spec.ts`).
3. **AC3**: e2e-army natural-language test covers completion flow in UI and Arabic RTL (`e2e-army/277-work-order-complete.e2e.ts` tagged `feat:mz-work-orders`, `@issue-277`, `@issue-167`).
4. **AC4**: No API contract change for other clients (`git diff origin/master HEAD -- apps/api packages` shows zero diff).
5. **AC5**: The PR diff includes the actual functional fix and tests (`apps/web/lib/hooks/use-manufacturing.ts`, `apps/web/lib/hooks/use-manufacturing.spec.ts`, `e2e-army/277-work-order-complete.e2e.ts`).

## Verification Matrix

| AC  | Verification Check                               | Command / Proof                                                                                                                                                       | Exit Code / Result                               | Status |
| --- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ------ |
| AC1 | `workOrderApi.complete` sends `quantityProduced` | `git grep -n "quantityProduced" apps/web/lib/hooks/use-manufacturing.ts`                                                                                              | Lines 150, 153, 345                              | MET    |
| AC2 | Unit test passes on head                         | `pnpm --filter web exec jest "use-manufacturing.spec" --maxWorkers=2`                                                                                                 | 2 passed, 2 total (exit 0)                       | MET    |
| AC3 | e2e-army natural language test                   | `e2e-army/277-work-order-complete.e2e.ts` tagged `feat:mz-work-orders`, `lvl:ui`, `@issue-277`, `@issue-167`                                                          | Valid e2e-army format and tags                   | MET    |
| AC4 | No backend / API changes                         | `git diff origin/master HEAD -- apps/api packages`                                                                                                                    | Empty output (0 diff)                            | MET    |
| AC5 | All changed files in PR diff                     | `git diff --name-only origin/master HEAD`                                                                                                                             | Clean diff containing hook, page, test, and docs | MET    |
| all | Web Type-Check                                   | `pnpm --filter web type-check`                                                                                                                                        | Clean exit (exit 0)                              | MET    |
| all | Web ESLint                                       | `pnpm --filter web exec eslint lib/hooks/use-manufacturing.ts lib/hooks/use-manufacturing.spec.ts "app/[locale]/(dashboard)/manufacturing/work-orders/[id]/page.tsx"` | Clean exit (exit 0)                              | MET    |

## Regression Proof (Bug fix: test fails on base, passes on head)

### Base (origin/master) without the fix:

Command:

```bash
pnpm --filter web exec jest "use-manufacturing.spec" --maxWorkers=2
```

Output:

```text
FAIL lib/hooks/use-manufacturing.spec.ts
  useCompleteWorkOrder
    ✕ calls api.post with quantityProduced (not producedQuantity) (8 ms)
    ✕ handles completion with zero quantity (3 ms)

  ● useCompleteWorkOrder › calls api.post with quantityProduced (not producedQuantity)

    expect(jest.fn()).toHaveBeenCalledWith(...expected)

    - Expected
    + Received

      "/manufacturing/work-orders/wo1/complete",
      Object {
    -   "quantityProduced": 5,
    +   "producedQuantity": undefined,
      },

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
Tests:       2 failed, 2 total
```

Exit code: 1

### HEAD (after fix applied):

Command:

```bash
pnpm --filter web exec jest "use-manufacturing.spec" --maxWorkers=2
```

Output:

```text
PASS lib/hooks/use-manufacturing.spec.ts
  useCompleteWorkOrder
    ✓ calls api.post with quantityProduced (not producedQuantity) (6 ms)
    ✓ handles completion with zero quantity (3 ms)

Test Suites: 1 passed, 1 total
Tests:       2 passed, 2 total
Snapshots:   0 total
Time:        0.46 s, estimated 1 s
Ran all test suites matching /use-manufacturing.spec/i.
```

Exit code: 0

## UI & E2E Verification

- `e2e-army/277-work-order-complete.e2e.ts` tests the complete button dialog and sets Quantity Produced in the UI, asserts the work order completes without error toasts, and navigates to the Arabic route `/ar/manufacturing/work-orders/${workOrderId}` asserting the RTL layout (`the page layout is right-to-left`).
- In accordance with AGENTS.md ("Never invent evidence", "Unknown results stay unknown"), Playwright screenshots and the live e2e-army test run require the hub's throwaway verify stack (`ops/verify/e2e-army/run-local.sh`); they run in GitHub CI during the verify gate.
