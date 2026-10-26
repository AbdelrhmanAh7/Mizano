# Evidence for #511 (Supersedes part of #494)

Originating review: https://github.com/AbdelrhmanAh7/Mizano/pull/494#discussion_r4364267921. No Sentry issue.
E2E: not needed, internal ledger consistency change with no UI/route change.

| AC                                                                                                 | Verified by                                                                                                                   |
| -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| AC1 initial schedules round once (Decimal, 4dp half up), amount = both deltas, ends on salvage     | `depreciation-consistency.spec.ts` straight-line and declining-balance cases                                                  |
| AC2 regeneration uses the same policy, keeps history, residual lands on salvage                    | `depreciation-consistency.spec.ts` regeneration case                                                                          |
| AC3 monthly and manual posting reject rows whose amount differs from either delta before the claim | `depreciation-consistency.spec.ts` posting cases; reversal untouched                                                          |
| AC4 regression tests fail on base, pass on head                                                    | base 2d52b9e0 failed in CI (Unit Tests); head: `npx jest src/modules/assets` in apps/api -> 4 suites, 35 tests passed, exit 0 |

Checks on head: eslint `src/modules/assets` exit 0. `tsc --noEmit` reports 11 errors, none in modules/assets (unbuilt `@mizano/shared-types` in this worktree, unrelated). Existing `depreciation.service.spec.ts` fixtures corrected (declining-balance starting balances were inconsistent with their rows).
