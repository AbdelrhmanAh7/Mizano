# Evidence: issue #232, Radix DirectionProvider in the locale layout

## Acceptance criteria

- **AC1 (Arabic document, indicator & Radix RTL context)**: On `/ar`, `document.documentElement[dir=rtl]` and `lang=ar` are set, `LocaleDirectionProvider` exposes a machine-readable direction indicator attribute (`data-testid="direction-indicator"`, `data-direction="rtl"`, `data-locale="ar"` with `aria-hidden="true"` and empty text to prevent screen-reader noise), and Radix descendants receive `rtl` context.
- **AC2 (English document, indicator & Radix LTR context)**: On `/en`, `document.documentElement[dir=ltr]` and `lang=en` are set, `LocaleDirectionProvider` exposes a machine-readable direction indicator attribute (`data-testid="direction-indicator"`, `data-direction="ltr"`, `data-locale="en"` with `aria-hidden="true"` and empty text to prevent screen-reader noise), and Radix descendants receive `ltr` context.
- **AC3 (Radix keyboard navigation follows reading direction)**: Radix tab keyboard navigation moves focus in reading direction: ArrowLeft moves focus to the next tab in RTL (`/ar`), ArrowRight moves focus to the next tab in LTR (`/en`).
- **AC4 (Client-side locale switch synchronization)**: Switching locales without a full page reload (e.g. from `/ar` to `/en` via the header language menu or client navigation) updates `document.documentElement.dir`, `document.documentElement.lang`, and the direction indicator attribute dynamically.

## AC to evidence mapping

| AC  | Covering test(s) & commands                                                                                                                                                                                                                        | Observed exit                            | Screenshots / Evidence                                                                                                                                                                                                                                     |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC1 | `locale-direction-provider.spec.tsx` (`passes ar direction to Radix descendants`, `renders ar direction indicator with machine-readable attributes and aria-hidden`). `e2e-army/232-locale-direction-rtl.e2e.ts` (AC1 block: `not run / blocked`). | Unit: 0. E2E: blocked / not run locally. | Jest asserts `dir="rtl"`, `lang="ar"`, `data-direction="rtl"`, `aria-hidden="true"`, and empty text content. E2E spec specifies Playwright screenshot `232-ar-dashboard` (`/ar/dashboard` at 375 px and 1366 px with RTL layout and sidebar on the right). |
| AC2 | `locale-direction-provider.spec.tsx` (`passes en direction to Radix descendants`, `renders en direction indicator with machine-readable attributes and aria-hidden`). `e2e-army/232-locale-direction-rtl.e2e.ts` (AC2 block: `not run / blocked`). | Unit: 0. E2E: blocked / not run locally. | Jest asserts `dir="ltr"`, `lang="en"`, `data-direction="ltr"`, `aria-hidden="true"`, and empty text content. E2E spec specifies Playwright screenshot `232-en-dashboard` (`/en/dashboard` at 375 px and 1366 px with LTR layout and sidebar on the left).  |
| AC3 | `locale-direction-provider.spec.tsx` (`moves tabs in ar reading direction`, `moves tabs in en reading direction`). `e2e-army/232-locale-direction-rtl.e2e.ts` (tab navigation steps: `not run / blocked`).                                         | Unit: 0. E2E: blocked / not run locally. | Jest unit tests verify ArrowLeft in RTL and ArrowRight in LTR focus the next tab (`Overview` / `نظرة عامة` -> `Financial` / `مالي`).                                                                                                                       |
| AC4 | `locale-direction-provider.spec.tsx` (`keeps <html> dir, lang and direction indicator in sync when the locale changes without a full page load`). `e2e-army/232-locale-direction-rtl.e2e.ts` (language switcher block: `not run / blocked`).       | Unit: 0. E2E: blocked / not run locally. | `LocaleDirectionProvider` `useEffect` hook synchronizes `document.documentElement.dir`, `lang`, and the direction indicator `data-direction` attribute. E2E spec specifies Playwright screenshot `232-switched-to-en`.                                     |

## Changed covering tests

- `apps/web/components/locale-direction-provider.spec.tsx` (7 unit tests covering Radix direction context, RTL/LTR tab navigation, direction indicator machine-readable attributes with `aria-hidden`, and client-side locale synchronization).
- `e2e-army/232-locale-direction-rtl.e2e.ts` (tagged `feat:mz-i18n-rtl`, covering AC1-AC4 with Playwright screenshot targets, direction indicator attributes, tab arrow navigation, and header language switcher).

## Bug fix demonstration: base vs head

- **Base (`origin/master`)**:
  - `LocaleDirectionProvider` does not exist.
  - `apps/web/app/[locale]/layout.tsx` does not wrap providers in Radix `DirectionProvider`; descendants default to LTR context regardless of locale.
  - Tab navigation regression test fails in Arabic because Radix uses LTR keyboard navigation.
  - Client-side navigation from `/ar` to `/en` leaves `<html dir="rtl" lang="ar">` desynchronized because the layout inline `<script>` only runs on full document load.
  - No direction indicator is available in the DOM for verification or accessibility tools.
  - Jest command `npx jest --findRelatedTests components/locale-direction-provider.spec.tsx`: failed (exit code 1, `Expected dir="rtl", Received null`).
- **Head (`HEAD`)**:
  - `LocaleDirectionProvider` wraps all descendants in Radix `DirectionProvider dir={dir}`.
  - `useEffect` synchronizes `document.documentElement.dir` and `lang` on client-side route changes.
  - Clean machine-readable indicator `<span data-testid="direction-indicator" data-direction={dir} data-locale={lang} aria-hidden="true" className="sr-only" />` provides verifiable DOM attributes without a11y text noise.
  - Jest command `npx jest --findRelatedTests components/locale-direction-provider.spec.tsx`: passes (exit code 0, 7 passed, 0 failed).

## Commands actually run (worktree `Mizano-232`)

| Command                                                                                                                                                                | Exit | Result                                     |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ------------------------------------------ |
| `cd apps/web && nice -n 10 npx jest --maxWorkers=2 --findRelatedTests components/locale-direction-provider.spec.tsx`                                                   | 0    | 1 suite, 7 tests passed (0 failed).        |
| `pnpm --filter @mizano/shared-types build`                                                                                                                             | 0    | Built `@mizano/shared-types` dist cleanly. |
| `cd apps/web && nice -n 10 npx tsc --noEmit -p .`                                                                                                                      | 0    | No TypeScript errors across `@mizano/web`. |
| `cd apps/web && nice -n 10 npx eslint --max-warnings=0 components/locale-direction-provider.tsx components/locale-direction-provider.spec.tsx app/[locale]/layout.tsx` | 0    | Clean lint on all changed web files.       |

## Seeded E2E (hub) result per head

Read from GitHub commit statuses / verify logs:

| Head SHA                                   | `e2e-army` status                                        | `verify` status                     | Notes                                                                                                    |
| ------------------------------------------ | -------------------------------------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `2c4cf0671e1fa247cd6fb2c172a4803eefc06f7d` | `error` (budget 270s exceeded)                           | not checked                         | Initial implementation commit                                                                            |
| `f15d4ff9e52884fd53652f5702ea0d8ea1016f14` | none posted                                              | `pending` (started throwaway stack) | Tested HTML sync fix; seeded E2E did not report on hub                                                   |
| `f9b9ca84f51ca75f75a111f19cafb0047b0084bf` | `error` exit 2 (`MODEL_UNAVAILABLE` in hub runner setup) | `fail` (health 83/100)              | QA round 4 reported direction provider indicator missing                                                 |
| `a0dae36cfbc629cd18ba1f675c3a8be4f86ba64b` | not run locally                                          | not checked                         | Added text indicator, but review requested changes for a11y noise                                        |
| `9915657cd4e575ed92ee9ab27abbe8e684678187` | not run locally                                          | not checked                         | Merged origin/master                                                                                     |
| Current HEAD                               | blocked / not run locally                                | pending push & CI                   | Dropped text node, added `aria-hidden="true"`, fixed password input locator in E2E spec, updated reports |

The seeded E2E (`e2e-army`) has not yet produced a passing run on any head due to runner budget and hub model configuration errors. **The E2E gate stays blocked** until `e2e-army` reports `success` on the PR's current head.

## QA round 4 & review resolution

- **QA round 4 finding**: `Direction provider implementation not verified — Tests were looking for text 'RTL' which doesn't exist in the UI.` and `Tests were looking for text 'LTR' which doesn't exist in the UI.`
- **Review finding (`apps/web/components/locale-direction-provider.tsx:33`)**: The `sr-only` span with literal text `'RTL'`/`'LTR'` introduced in commit `a0dae36c` created screen-reader noise on all pages. Reviewer instructed: "Drop the text node and have tests assert `document.documentElement.dir` or the `data-direction` attribute, or make it `aria-hidden="true"` and keep it empty. The verify flows should check `html[dir]` instead of the literal text."
- **Resolution**:
  - Dropped text child `{dir === 'rtl' ? 'RTL' : 'LTR'}` from the indicator span.
  - Added `aria-hidden="true"` so that screen readers completely ignore the indicator element.
  - Retained `data-testid="direction-indicator"`, `data-direction={dir}`, and `data-locale={lang}` for machine and test inspection.
  - Updated `locale-direction-provider.spec.tsx` to assert `data-direction`, `data-locale`, `aria-hidden="true"`, and `toBeEmptyDOMElement()`.
  - Updated `e2e-army/232-locale-direction-rtl.e2e.ts` to assert `data-direction` and `html[dir]`.
- **E2E password input locator finding**: `getByRole('textbox', 'Password')` in `e2e-army/232-locale-direction-rtl.e2e.ts` was replaced with `browser.locator('#password')` and `browser.locator('#email')`, resolving the ARIA mismatch where password inputs do not have the `textbox` role.

## Originating Sentry issue

- **Sentry**: None (this is a UI direction provider enhancement and layout sync bug fix, not originating from an unhandled exception or crash report).
