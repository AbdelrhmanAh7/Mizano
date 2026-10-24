# Evidence for issue #167 (web sends `quantityProduced`)

Sentry issue: none found.

## Acceptance criteria

1. AC1: the web sends `quantityProduced` when completing a work order.
2. AC2: a web test covers completion.
3. AC3: no API contract change for other clients.

## Verification

| AC  | Check                                                                                                                                                                             | Result                                         |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| AC1 | `grep -n "quantityProduced\|producedQuantity" apps/web/lib/hooks/use-manufacturing.ts` shows `complete` posts `{ quantityProduced }` (line 152) and no `producedQuantity` remains | exit 0                                         |
| AC2 | `cd apps/web && npx jest lib/hooks/use-manufacturing.spec.ts --maxWorkers=2`                                                                                                      | base exit 1 (2 failed), head exit 0 (2 passed) |
| AC3 | `git diff 451cc181 HEAD --stat -- apps/api packages` (451cc181 = `git merge-base HEAD origin/master`) prints nothing: zero diff                                                   | exit 0                                         |
| all | `pnpm --filter web type-check`                                                                                                                                                    | exit 0                                         |
| all | `cd apps/web && npx eslint lib/hooks/use-manufacturing.ts lib/hooks/use-manufacturing.spec.ts`                                                                                    | exit 0                                         |

## Regression proof

Base = the hook and page as on `origin/master` (they send `producedQuantity`), with the new spec applied. Real output:

```
FAIL lib/hooks/use-manufacturing.spec.ts
  useCompleteWorkOrder
    ✕ calls api.post with quantityProduced (not producedQuantity) (7 ms)
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

    Number of calls: 1

      52 |
      53 |     // The API should be called with quantityProduced, not producedQuantity
    > 54 |     expect(mockApiPost).toHaveBeenCalledWith('/manufacturing/work-orders/wo1/complete', {
         |                         ^
      55 |       quantityProduced: 5,
      56 |     });
      57 |     expect(mockApiPost).toHaveBeenCalledTimes(1);

      at Object.toHaveBeenCalledWith (lib/hooks/use-manufacturing.spec.ts:54:25)

  ● useCompleteWorkOrder › handles completion with zero quantity

    expect(jest.fn()).toHaveBeenCalledWith(...expected)

    - Expected
    + Received

      "/manufacturing/work-orders/wo1/complete",
      Object {
    -   "quantityProduced": 0,
    +   "producedQuantity": undefined,
      },

    Number of calls: 1

      65 |     });
      66 |
    > 67 |     expect(mockApiPost).toHaveBeenCalledWith('/manufacturing/work-orders/wo1/complete', {
         |                         ^
      68 |       quantityProduced: 0,
      69 |     });
      70 |     expect(mockApiPost).toHaveBeenCalledTimes(1);

      at Object.toHaveBeenCalledWith (lib/hooks/use-manufacturing.spec.ts:67:25)

Test Suites: 1 failed, 1 total
Tests:       2 failed, 2 total
Snapshots:   0 total
Time:        0.424 s, estimated 1 s
Ran all test suites matching /lib\/hooks\/use-manufacturing.spec.ts/i.
```

Head = this branch, same spec. Real output:

```
PASS lib/hooks/use-manufacturing.spec.ts
  useCompleteWorkOrder
    ✓ calls api.post with quantityProduced (not producedQuantity) (5 ms)
    ✓ handles completion with zero quantity (1 ms)

Test Suites: 1 passed, 1 total
Tests:       2 passed, 2 total
Snapshots:   0 total
Time:        0.227 s, estimated 1 s
Ran all test suites matching /lib\/hooks\/use-manufacturing.spec.ts/i.
```

The e2e-army scenario (`e2e-army/167-work-order-complete.e2e.ts`) was not run locally: it needs the hub's throwaway stack (`ops/verify/e2e-army/run-local.sh`). Its API setup calls and UI selectors (including the final right-to-left `agent.assert`) are therefore unverified until the `e2e-army` gate runs.
