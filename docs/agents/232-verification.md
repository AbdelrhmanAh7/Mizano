# #232 verification: Radix DirectionProvider in the locale layout

## Acceptance criteria

- AC1: on `/ar`, `html[dir=rtl]` and `lang=ar` are set, and ArrowLeft moves Radix tab focus to the next tab.
- AC2: on `/en`, `html[dir=ltr]` and `lang=en` are set, and ArrowRight moves Radix tab focus to the next tab.
- AC3: switching Arabic to English with the header language menu (client-side `router.push`, no full load) leaves `html[dir=ltr]` and `lang=en`.

## AC to evidence

| AC  | Evidence                                                                                                                                                                                                                                                                                                                                                                       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| AC1 | jest `passes ar direction to Radix descendants`, `moves tabs in ar reading direction` (pass). e2e-army `e2e-army/232-locale-direction-rtl.e2e.ts` (not run locally, see below). Verify run `ea1dea2` screenshot `rtl-layout-check/02-expect-RTL-direction-should-be-applied.jpg`: `/ar/dashboard` at 1366 px with the sidebar on the right and the tabs starting at the right. |
| AC2 | jest `passes en direction to Radix descendants`, `moves tabs in en reading direction` (pass). Same e2e-army spec. Verify run `ea1dea2` screenshot `rtl-layout-check/06-expect-LTR-direction-should-be-applied.jpg`: `/en/dashboard` at 375 px, LTR.                                                                                                                            |
| AC3 | jest `keeps <html> dir and lang in sync when the locale changes without a full page load`: fails without the fix, passes with it (below). Same e2e-army spec, last block.                                                                                                                                                                                                      |

## Commands actually run (worktree `Mizano-232`)

| Command                                                                                                     | Exit | Result                                                                                                                                       |
| ----------------------------------------------------------------------------------------------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `cd apps/web && npx jest --maxWorkers=2 --testPathPattern=locale-direction-provider` (new test, before fix) | 1    | 1 failed, 4 passed. The html sync test failed: `Expected the element to have attribute: dir="rtl"`, `Received: null`. This is the red run.   |
| Same jest command after the fix in `components/locale-direction-provider.tsx`                               | 0    | 1 suite, 5 tests passed.                                                                                                                     |
| `cd apps/web && npx tsc --noEmit -p .` (after `pnpm --filter @mizano/shared-types build`)                   | 0    | No errors. Before the shared-types build, tsc failed only on the missing `@mizano/shared-types` dist in this worktree, not on changed files. |
| `cd apps/web && npx eslint --max-warnings=0` on the three changed web files                                 | 0    | Clean.                                                                                                                                       |
| `tsc -p` on the e2e spec against the hub's `e2e`/`@e2e-dev/web` types (strict, temp tsconfig)               | 0    | New spec type-checks. The previous spec failed (exit 2): `TS2339 Property 'getByRole' does not exist on type 'Browser'`.                     |

The e2e-army spec was not run locally: the hub's `run-local.sh` needs the pushed ref and reads DB credentials from the Keychain.

## Seeded E2E (hub) result per head

Read from the GitHub commit statuses API (`GET /repos/AbdelrhmanAh7/Mizano/commits/<sha>/statuses`) at 2026-10-18T15:39Z.

| Head SHA                                   | `e2e-army` status                                                   | `verify` status                                                                                |
| ------------------------------------------ | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `2c4cf0671e1fa247cd6fb2c172a4803eefc06f7d` | `error` at 10:40:17Z: "tester-army/e2e over the time budget · 270s" | not checked                                                                                    |
| `f15d4ff9e52884fd53652f5702ea0d8ea1016f14` | none posted                                                         | `pending` since 14:14:33Z: "starting the app from f15d4ff in a throwaway worktree (attempt 1)" |

The seeded E2E has not produced a result on `f15d4ff`, so the #232 spec has no passing run on any head yet. **The E2E gate stays blocked** until `e2e-army` reports `success` on the PR's current head.

## Verify round 2 findings

The app was not at fault in these. Each failing step in the `ea1dea2` flows (logs under `logs/verify/Mizano/ea1dea2/`) was a step that cannot pass on any build:

- `expect` steps waited for literal prose such as "RTL direction should be applied" or "Login page should load without errors". No page renders that text.
- `click tab "First Tab"`: there is no such tab.
- `click link "Accounting"` on `/ar/dashboard`: the page is Arabic (`المحاسبة`), and Accounting is a group button, not a link.
- `click link "Dashboard"` on `/en/accounting/accounts`: the viewport was 375 px, where the sidebar is collapsed behind the menu button.

One real defect sat behind the "direction should persist across navigation" finding. `<html dir/lang>` was only set by the layout's inline script, and React does not run that script after a client-side locale switch. `LocaleDirectionProvider` now syncs it (AC3).

## e2e-army round 1

The 270 s budget ran out in the hub's own `tests/Mizano.e2e.ts` model steps (`2 model calls failed`, 90 s each) before the #232 spec started. The spec now makes no model call. It was also fixed to use `screen` queries and the feature id `feat:mz-i18n-rtl`, and to dismiss the auto-started dashboard tour, which overlays the page and handles arrow keys.

## Notes

- `apps/web/package.json`: the only change versus `origin/master` is the added `@radix-ui/react-direction` line.
- Sentry: none.
