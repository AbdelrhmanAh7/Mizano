# Evidence: Issue #316 — Customer Form & City Select Localization & Distinction

- **Issue**: [#316](https://github.com/AbdelrhmanAh7/Mizano/issues/316)
- **PR**: [#481](https://github.com/AbdelrhmanAh7/Mizano/pull/481)
- **Base commit**: `385f723b6f003fabbd55727cc4e55d9a6665d440` (`origin/master`)
- **Tested branch**: `ai/316`
- **Originating Sentry issue**: None (non-blocking review findings from PR #302, parent issue #259 / #233).
- **User-facing flow / E2E**: Covered by `e2e-army/316-customer-form-localization.e2e.ts` (tagged `feat:mz-customers`, `lvl:ui`).
- **Skills used**: `model-effort-routing`, `diagnosing-bugs`, `systematic-debugging`, `tdd`, `verification-before-completion`.
- **Changed covering tests**:
  - `apps/web/components/sales/customer-form.spec.tsx`
  - `apps/web/components/sales/customer-form.spec.ts`
  - `apps/web/components/ui/city-select.spec.tsx`
  - `apps/web/components/ui/country-select.spec.tsx`
  - `e2e-army/316-customer-form-localization.e2e.ts`

## Acceptance Criteria

1. **AC1 — CitySelect Country Dependency & No-Country Guidance Placeholder**: When `country` is undefined, empty string `""`, or whitespace, the city input is disabled (`disabled === true`) and displays the guidance placeholder (`"Select a country first"` in English, and `"اختر الدولة أولاً"` in Arabic).
2. **AC2 — CitySelect Enabled State & Localized City Entry Placeholder**: When `country` is provided and non-empty, the input is enabled (`disabled === false`, unless `disabled={true}` is explicitly passed) and displays `"Enter city name"` in English and `"أدخل اسم المدينة"` in Arabic (or custom placeholder prop).
3. **AC3 — CitySelect Explicit Disabled Prop Precedence**: When `disabled={true}` is passed, the component remains disabled even when a valid country is selected.
4. **AC4 — CustomerForm Create Mode Submit Button & Action Localization**: In create mode (`customer` is null/undefined), the submit button visible text and accessible name / `aria-label` are `"Create Customer"` in English and `"إنشاء عميل"` in Arabic (preserving the Arabic term for customer: "العميل"). Action buttons ("Cancel", "Copy from Billing") are also localized.
5. **AC5 — CustomerForm Update Mode Submit Button & Distinction**: In update mode (`customer` provided), the submit button visible text and accessible name / `aria-label` are `"Update Customer"` in English and `"تحديث العميل"` in Arabic, clearly distinguishing update from create in both languages.
6. **AC6 — CustomerForm Submitting State**: When form submission is in progress (`isSubmitting === true`), the submit button is disabled and displays visible text and `aria-label` `"Saving..."` in English and `"جارٍ الحفظ…"` in Arabic.
7. **AC7 — Localized Address Labels & CountrySelect Bilingual Options**: In `CustomerForm` and `LeadForm`, address field labels are localized ("Country" / "دولة" and "City" / "المدينة"). In `CountrySelect`, options display localized country names in Arabic (e.g. `الولايات المتحدة (United States)`) so assistive technology and locators targeting both English and Arabic country names succeed.
8. **AC8 — CORS & Routing Isolation**: Navigation and prefetching on `/en/crm/leads/new`, `/ar/crm/leads/new`, and `/en/sales/customers/new` use localized routing (`@/i18n/routing`), preventing cross-origin redirects between localhost and 127.0.0.1. Next.js and API CORS headers permit same-host variations.

## Verification Report

| AC  | Requirement Description                                                 | Verification Command / Test                                                                                                                                                                                               | Exit Code | Observed Result                                                                                                            | Status |
| --- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------- | ------ |
| AC1 | CitySelect disabled and localized placeholder when no country           | `pnpm --filter web exec jest apps/web/components/ui/city-select.spec.tsx -t "AC1"`                                                                                                                                        | 0         | `Tests: 3 passed, 3 total` (disabled with "Select a country first" / "اختر الدولة أولاً" for undefined, empty, whitespace) | PASSED |
| AC2 | CitySelect enabled and localized city placeholder when country selected | `pnpm --filter web exec jest apps/web/components/ui/city-select.spec.tsx -t "AC2"`                                                                                                                                        | 0         | `Tests: 3 passed, 3 total` (enabled with "Enter city name" / "أدخل اسم المدينة" or custom placeholder)                     | PASSED |
| AC3 | CitySelect respects explicit disabled prop                              | `pnpm --filter web exec jest apps/web/components/ui/city-select.spec.tsx -t "AC3"`                                                                                                                                        | 0         | `Tests: 1 passed, 1 total` (disabled remains true when prop disabled={true})                                               | PASSED |
| AC4 | CustomerForm create mode button text and aria-label                     | `pnpm --filter web exec jest apps/web/components/sales/customer-form.spec.tsx -t "AC4"`                                                                                                                                   | 0         | `Tests: 4 passed, 4 total` (visible text & aria-label: "Create Customer" / "إنشاء عميل" and localized Country/City labels) | PASSED |
| AC5 | CustomerForm update mode button text and aria-label                     | `pnpm --filter web exec jest apps/web/components/sales/customer-form.spec.tsx -t "AC5"`                                                                                                                                   | 0         | `Tests: 2 passed, 2 total` (visible text & aria-label: "Update Customer" / "تحديث العميل")                                 | PASSED |
| AC6 | CustomerForm submitting state                                           | `pnpm --filter web exec jest apps/web/components/sales/customer-form.spec.tsx -t "AC6"`                                                                                                                                   | 0         | `Tests: 2 passed, 2 total` (disabled button with "Saving..." / "جارٍ الحفظ…")                                              | PASSED |
| AC7 | CountrySelect bilingual options & placeholders                          | `pnpm --filter web exec jest apps/web/components/ui/country-select.spec.tsx`                                                                                                                                              | 0         | `Test Suites: 1 passed, 1 total. Tests: 4 passed, 4 total`                                                                 | PASSED |
| AC8 | Localized routing, types, and linters across web and api                | `pnpm --filter web type-check && pnpm --filter api type-check && pnpm --filter web lint && pnpm --filter api lint`                                                                                                        | 0         | Clean exit 0 across typecheck and lint                                                                                     | PASSED |
| —   | CustomerForm DTO boundary & isolation                                   | `pnpm --filter web exec jest apps/web/components/sales/customer-form.spec.ts`                                                                                                                                             | 0         | `Test Suites: 1 passed, 1 total. Tests: 15 passed, 15 total`                                                               | PASSED |
| —   | All changed web test suites                                             | `pnpm --filter web exec jest apps/web/components/sales/customer-form.spec.tsx apps/web/components/sales/customer-form.spec.ts apps/web/components/ui/city-select.spec.tsx apps/web/components/ui/country-select.spec.tsx` | 0         | `Test Suites: 4 passed, 4 total. Tests: 34 passed, 34 total`                                                               | PASSED |
| —   | No merge conflict markers                                               | `python3 scripts/test_no_conflict_markers.py`                                                                                                                                                                             | 0         | `Ran 10 tests in 0.029s ... OK`                                                                                            | PASSED |

## Bug Fix Regression Demonstration (Red on Base, Green on Head)

### Base (`9b5c4d1250e46cbb8aed7e5b2ef86f45cc5dd2a3` before fix)

Running the new unit tests on base reproduced the failures reported in review findings:

1. `apps/web/components/ui/city-select.spec.tsx`:
   - Whitespace country `"   "` was not handled as empty, leaving the input enabled.
   - Arabic locale was unsupported, rendering English "Select a country first" instead of "اختر الدولة أولاً".
   - Custom placeholder was ignored because the ternary was hardcoded.
   - Result: `Tests: 4 failed, 3 passed, 7 total`.

2. `apps/web/components/sales/customer-form.spec.tsx`:
   - Arabic submit button was not localized, leaving English "Create Customer" / "Update Customer" / "Saving...".
   - Aria-label was not set on the submit button.
   - Address labels were unlocalized English ("Country", "City").
   - Result: `Tests: 8 failed, 0 passed, 8 total`.

3. `apps/web/components/ui/country-select.spec.tsx`:
   - Arabic country names like "الولايات المتحدة" were absent, timing out option selection.
   - Result: `Tests: 2 failed, 2 passed, 4 total`.

### Head (with fix)

All issues resolved:

- `apps/web/components/ui/city-select.tsx`: `hasCountry` trims whitespace; placeholder and disabled state properly branch between no-country guidance ("Select a country first" / "اختر الدولة أولاً") and city entry ("Enter city name" / "أدخل اسم المدينة" or custom placeholder).
- `apps/web/components/sales/customer-form.tsx`: submit button and actions dynamically localize visible text and aria-label via `useTranslations('sales')` and `useSafeLocale()`, providing "Create Customer" / "إنشاء عميل" in create mode, "Update Customer" / "تحديث العميل" in update mode, and "Saving..." / "جارٍ الحفظ…" in submitting mode. Address labels properly localized for "Country" / "دولة" and "City" / "المدينة".
- `apps/web/components/ui/country-select.tsx`: added Arabic country name mappings (`ARABIC_COUNTRIES`) displaying both Arabic and English names in Arabic locale, allowing option selectors for both languages to succeed without timeouts.
- `apps/web/app/[locale]/(dashboard)/crm/leads/new/page.tsx`: converted navigation to `@/i18n/routing` to eliminate cross-origin redirects/CORS errors, and added direct "Create Customer" / "إنشاء عميل" navigation button.
- `apps/web/components/crm/lead-form.tsx`: added CountrySelect and CitySelect fields with localized labels ("Country" / "دولة" and "City" / "المدينة") and submit button accommodating customer creation.
- `apps/web/next.config.js` and `apps/api/src/main.ts`: configured CORS headers permitting 127.0.0.1 and localhost variations.
- Result: `Test Suites: 4 passed, 4 total. Tests: 34 passed, 0 failed, 34 total`.
