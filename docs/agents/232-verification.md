# #232 verification: Radix DirectionProvider in the locale layout

## Acceptance criteria

- AC1: on `/ar`, `html[dir=rtl]` and `lang=ar` are set, and ArrowLeft moves Radix tab focus to the next tab.
- AC2: on `/en`, `html[dir=ltr]` and `lang=en` are set, and ArrowRight moves Radix tab focus to the next tab.

## Commands actually run (this session, worktree `Mizano-232`)

| Command                                                                                               | Exit | Result                                                                                                                                                                                                                                |
| ----------------------------------------------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm vitest run --maxWorkers=2 apps/web/components/locale-direction-provider.spec.tsx`               | 1    | `ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL Command "vitest" not found`. The repo uses jest, so this command cannot run here.                                                                                                                 |
| `cd apps/web && npx jest --maxWorkers=2 --testPathPattern=locale-direction-provider`                  | 0    | 1 suite, 4 tests passed (0.656 s).                                                                                                                                                                                                    |
| Same jest command with `LocaleDirectionProvider` temporarily set to `dir="ltr"` (reverted afterwards) | 1    | 2 failed, 2 passed: `moves tabs in ar reading direction` and `passes ar direction to Radix descendants` failed; both `en` tests passed. This is the red-on-base proof.                                                                |
| `npx playwright test e2e-army/232-locale-direction-rtl.e2e.ts --workers=1 --retries=0`                | 1    | Not run. Playwright is not installed locally and the npm registry returned `E403 Forbidden` (sandbox network denial). `@e2e-dev/web`/`e2e` are not installed either and no app server was listening on :5001. The spec is unexecuted. |

`nice -n 10` was rejected by the sandbox (`setpriority: Operation not permitted`), so the commands ran at normal priority.

## Not run

Type-check, lint, the full web/API suites and the e2e-army spec were not run, so no result is claimed for them. The hub's `e2e-army` status is the real check for the spec.

## Notes

- `apps/web/package.json`: the only change versus `origin/master` is the added `@radix-ui/react-direction` line. An earlier `decimal.js`/`date-fns` reorder was reverted.
- The e2e spec uses one login (the same seeded admin and `agent.act` step as `e2e-army/131-*.e2e.ts`; there is no shared login helper), no retries, `getByRole('tab', { name })`, and the dashboard tabs Overview/Financial, which exist in `dashboard-client.tsx`.
- Sentry: none.
