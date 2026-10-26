# Evidence for #511 (Supersedes part of #494)

Internal financial-consistency fix, no UI change, so no e2e test. All commands ran from `apps/api`.
Exit codes below are the ones observed in this session.

| AC                | What proves it                                                                                                                                                                 | Command                                                                                                     | Exit |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- | ---- |
| AC4 (red on base) | Tests committed first (2d52b9e0), run before the implementation: 7 failed, 1 passed (the "still posts a consistent row" control)                                               | `pnpm exec jest --maxWorkers=2 src/modules/assets/services/depreciation-consistency.spec.ts`                | 1    |
| AC1               | `straight-line 1000/12`, `declining balance` tests: 4dp amounts, both deltas equal the amount, accumulated + book = price, last row on salvage                                 | same file, on head                                                                                          | 0    |
| AC2               | `regeneration rounds the same way...` test: executed rows untouched (`deleteMany` only for `executedAt: null`), residual lands on salvage                                      | same file, on head                                                                                          | 0    |
| AC3               | `monthly run skips...` / `manual run rejects...` tests: 37.5000 / 1525.0000 / 1487.5001 rejected with no `updateMany` (executedAt claim), no `journal.create`, no asset update | same file, on head                                                                                          | 0    |
| Related tests     | 4 suites, 35 tests passed                                                                                                                                                      | `pnpm exec jest --maxWorkers=2 --findRelatedTests <assets.service.ts, depreciation.service.ts, both specs>` | 0    |
| Type-check        | clean (needed `pnpm --filter @mizano/shared-types build` first in this fresh worktree)                                                                                         | `pnpm type-check`                                                                                           | 0    |
| Lint              | clean                                                                                                                                                                          | `pnpm lint`                                                                                                 | 0    |

Existing `depreciation.service.spec.ts` was edited only in the `beforeEach` asset fixtures for `db` and `last`,
whose previous balances did not match their schedule rows (AC3 would reject them).
