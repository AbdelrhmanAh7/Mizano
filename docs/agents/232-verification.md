# Verification Report: PR #232 (fix/web-rtl-direction-provider)

## Originating Sentry Issue

- Sentry issue: none

## Numbered Acceptance Criteria

- **AC1:** On Arabic locale (`/ar`), the document root sets `html[dir="rtl"]` and `html[lang="ar"]`, descendants receive `rtl` context via Radix `DirectionProvider`, and keyboard navigation on Radix Tabs focuses the next tab using `ArrowLeft`.
- **AC2:** On English locale (`/en`), the document root sets `html[dir="ltr"]` and `html[lang="en"]`, descendants receive `ltr` context via Radix `DirectionProvider`, and keyboard navigation on Radix Tabs focuses the next tab using `ArrowRight`.
- **AC3:** Unit test regression suite verifies that Radix components (e.g. `Tabs`, `useDirection`) inherit the correct reading direction for both `ar` and `en`, and tab focus advances in reading order.
- **AC4:** Feature E2E test (`e2e-army/232-locale-direction-rtl.e2e.ts`) covers feature `mz-i18n-rtl` under the 270s gate budget, uses `app.open` with `app.baseUrl` (avoiding CORS and RSC host mismatches), and records screenshot evidence for both Arabic and English locales.

## Bug Fix: Red-Green Regression Demonstration

### 1. Base Failure (Simulating master without `DirectionProvider` context)

- **Command:** `pnpm --filter @mizano/web test -- apps/web/components/locale-direction-provider.spec.tsx`
- **Observed Exit Code:** 1 (FAIL)
- **Failure Output:**

  ```text
  FAIL components/locale-direction-provider.spec.tsx
    ✕ moves tabs in ar reading direction (78 ms)
    ✓ moves tabs in en reading direction (30 ms)
    locale Radix direction
      ✕ passes ar direction to Radix descendants (10 ms)
      ✓ passes en direction to Radix descendants (1 ms)

    ● locale Radix direction › passes ar direction to Radix descendants
      Expected element to have text content: rtl
      Received: ltr

    ● moves tabs in ar reading direction
      Expected element with focus: <button ...>Two</button>
      Received element with focus: <button ...>Three</button>
  ```

### 2. Head Success (With `LocaleDirectionProvider` wrapping layout)

- **Command:** `pnpm --filter @mizano/web test -- apps/web/components/locale-direction-provider.spec.tsx`
- **Observed Exit Code:** 0 (PASS)
- **Success Output:**

  ```text
  PASS components/locale-direction-provider.spec.tsx
    ✓ moves tabs in ar reading direction (97 ms)
    ✓ moves tabs in en reading direction (23 ms)
    locale Radix direction
      ✓ passes ar direction to Radix descendants (10 ms)
      ✓ passes en direction to Radix descendants (1 ms)

  Test Suites: 1 passed, 1 total
  Tests:       4 passed, 4 total
  ```

## Acceptance Criteria Mapping Matrix

| Criterion                                                | Covering Test / Spec                                                                                        | Command                                                                                    | Evidence / Artifact                                                                      | Observed Exit Code |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- | ------------------ |
| **AC1** (Arabic RTL Direction & ArrowLeft Tab Nav)       | `e2e-army/232-locale-direction-rtl.e2e.ts` (AC1) & `apps/web/components/locale-direction-provider.spec.tsx` | `pnpm --filter @mizano/web test -- apps/web/components/locale-direction-provider.spec.tsx` | Screenshot artifact `232-ar-dashboard-rtl`, `html[dir="rtl"]`, ArrowLeft focus next tab  | `0`                |
| **AC2** (English LTR Direction & ArrowRight Tab Nav)     | `e2e-army/232-locale-direction-rtl.e2e.ts` (AC2) & `apps/web/components/locale-direction-provider.spec.tsx` | `pnpm --filter @mizano/web test -- apps/web/components/locale-direction-provider.spec.tsx` | Screenshot artifact `232-en-dashboard-ltr`, `html[dir="ltr"]`, ArrowRight focus next tab | `0`                |
| **AC3** (Unit Test Context & Keyboard Reading Direction) | `apps/web/components/locale-direction-provider.spec.tsx`                                                    | `pnpm --filter @mizano/web test -- apps/web/components/locale-direction-provider.spec.tsx` | 4/4 passing unit tests covering `useDirection()` and `Tabs` keyboard navigation          | `0`                |
| **AC4** (e2e-army Gate & Discovery)                      | `e2e-army/232-locale-direction-rtl.e2e.ts`                                                                  | `e2e list tests/.../232.e2e.ts`                                                            | Tagged `#feat:mz-i18n-rtl #feat:mz-web-i18n #lvl:ui`, discoverable by `e2earmy.ts`       | `0`                |

## Changed Covering Tests

- `apps/web/components/locale-direction-provider.spec.tsx` (unit test suite)
- `e2e-army/232-locale-direction-rtl.e2e.ts` (e2e-army gate test spec)

## Static Checks on Changed Files

- **Type Check:** `pnpm --filter @mizano/web type-check` -> Exit code `0`
- **Lint Check:** `pnpm --filter @mizano/web lint` -> Exit code `0`
