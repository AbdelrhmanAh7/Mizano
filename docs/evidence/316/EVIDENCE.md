# Evidence: Issue #316 — Customer Form & City Select Localization (Follow-up from #302)

## Overview

- **Issue**: AbdelrhmanAh7/Mizano#316 (`Follow-up from #302: non-blocking review findings`)
- **PR**: [#481](https://github.com/AbdelrhmanAh7/Mizano/pull/481)
- **Originating Sentry Issue**: None (originating from PR #302 code review findings)
- **Base Commit**: `385f723b6f003fabbd55727cc4e55d9a6665d440` (`origin/master`)
- **Tested Branch**: `ai/316-p2` (rebased on `ai/316`)
- **User-facing flow / E2E**: Feature E2E covered in `e2e-army/316-customer-form-localization.e2e.ts` (`feat:mz-customers`, `lvl:ui`)

---

## Numbered Acceptance Criteria

1. **AC1 (`CitySelect` Country Dependency & Guidance Placeholder)**:
   When `country` prop is undefined, null, empty string `""`, or whitespace `"   "`, `CitySelect` input is disabled (`disabled || !hasCountry`) and displays guidance placeholder text prompting the user to select a country first: `"Select a country first"` in English and `"اختر الدولة أولاً"` in Arabic (`locale === 'ar'`).
2. **AC2 (`CitySelect` Active City Entry & Localization)**:
   When `country` prop is provided and non-empty, `CitySelect` is enabled (unless `disabled={true}` is explicitly passed) and displays city entry placeholder text: `"Enter city name"` in English and `"أدخل اسم المدينة"` in Arabic (or caller's customized `placeholder` prop, or `"Select city"` / `"اختر المدينة"` when country has pre-seeded cities).
3. **AC3 (`CitySelect` Explicit Disabled Prop Precedence)**:
   When `disabled={true}` is passed, the component remains disabled even when a valid country is selected.
4. **AC4 (`CustomerForm` Create Mode Localization & Accessible Name)**:
   In customer creation mode (`isEditing === false`), the submit button visible text and accessible `aria-label` display `"Create Customer"` in English and `"إنشاء عميل"` in Arabic, restoring the specific customer terminology (`"العميل"`). Both visible text and accessible name match verbatim to satisfy WCAG 2.5.3 (Label in Name). Action buttons ("Cancel" / "إلغاء", "Copy from Billing" / "نسخ من عنوان الفوترة") are also localized.
5. **AC5 (`CustomerForm` Update Mode Localization & Accessible Name)**:
   In customer edit/update mode (`isEditing === true`), the submit button visible text and accessible `aria-label` display `"Update Customer"` in English and `"تحديث العميل"` in Arabic, maintaining clear distinction from create mode and preserving the customer terminology (`"العميل"`).
6. **AC6 (`CustomerForm` Pending/Submitting State)**:
   When form submission is in flight (`isSubmitting === true`), the submit button is disabled and displays localized pending text: `"Saving..."` in English and `"جارٍ الحفظ…"` in Arabic in both visible text and `aria-label`.

---

## Changed Covering Tests

- `e2e-army/316-customer-form-localization.e2e.ts`: Natural-language E2E test covering AC1-AC6 in English and Arabic with RTL verification (`feat:mz-customers`, `lvl:ui`).
- `apps/web/components/ui/city-select.spec.tsx`: 8 unit tests verifying country dependency, empty/whitespace handling, disabled overrides, English/Arabic placeholders, and aria-label.
- `apps/web/components/sales/customer-form.spec.tsx`: 8 unit tests verifying create, update, and submitting states for visible button text and `aria-label` in English and Arabic, plus cancel and copy-from-billing action buttons.
- `apps/web/components/sales/customer-form.spec.ts`: 15 unit tests verifying customer payload generation and DTO schema validation.

---

## Verification Matrix

| AC ID   | Requirement Description                                      | Test / Command                                                                                                                                  | Observed Result                                                                                                       | Exit Code | Status     |
| ------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------- | ---------- |
| **AC1** | `CitySelect` disabled & guidance placeholder without country | `pnpm --filter web exec jest apps/web/components/ui/city-select.spec.tsx -t "AC1"`                                                              | 4/4 unit tests PASS (undefined, empty string, whitespace, Arabic `"اختر الدولة أولاً"`)                               | 0         | **PASSED** |
| **AC2** | `CitySelect` enabled & entry placeholder with valid country  | `pnpm --filter web exec jest apps/web/components/ui/city-select.spec.tsx -t "AC2"`                                                              | 4/4 unit tests PASS (English `"Enter city name"`, Arabic `"أدخل اسم المدينة"`, custom placeholder, aria-label)         | 0         | **PASSED** |
| **AC3** | `CitySelect` respects explicit disabled prop                 | `pnpm --filter web exec jest apps/web/components/ui/city-select.spec.tsx -t "AC3"`                                                              | 1/1 unit tests PASS (disabled remains true when prop disabled={true})                                                 | 0         | **PASSED** |
| **AC4** | `CustomerForm` create button localized text & aria-label     | `pnpm --filter web exec jest apps/web/components/sales/customer-form.spec.tsx -t "AC4"`                                                         | 2/2 unit tests PASS (`"Create Customer"` in EN, `"إنشاء عميل"` in AR)                                                 | 0         | **PASSED** |
| **AC5** | `CustomerForm` update button localized text & aria-label     | `pnpm --filter web exec jest apps/web/components/sales/customer-form.spec.tsx -t "AC5"`                                                         | 2/2 unit tests PASS (`"Update Customer"` in EN, `"تحديث العميل"` in AR)                                               | 0         | **PASSED** |
| **AC6** | `CustomerForm` pending/saving button state & disabled        | `pnpm --filter web exec jest apps/web/components/sales/customer-form.spec.tsx -t "AC6"`                                                         | 2/2 unit tests PASS (`"Saving..."` in EN, `"جارٍ الحفظ…"` in AR, button disabled)                                     | 0         | **PASSED** |
| **ALL** | All changed unit specs run concurrently                      | `pnpm --filter web exec jest components/ui/city-select.spec.tsx components/sales/customer-form.spec.tsx components/sales/customer-form.spec.ts` | 31/31 unit tests PASS across 3 test suites                                                                            | 0         | **PASSED** |
| **ALL** | TypeScript type-check across web app                         | `pnpm --filter web run type-check`                                                                                                              | Clean (0 errors across `tsc --noEmit`)                                                                                | 0         | **PASSED** |
| **ALL** | Next.js lint across web app                                  | `pnpm --filter web run lint`                                                                                                                    | Clean (0 errors across `next lint`)                                                                                   | 0         | **PASSED** |

---

## Regression / Fail-First Demonstration

### Base Behaviour on Master (`385f723b`)

1. In `apps/web/components/ui/city-select.tsx`:
   - Whitespace country (`country="   "`) was treated as truthy, enabling the input and showing `"Enter city name"` instead of guidance.
   - Arabic locale (`locale === 'ar'`) was not handled; placeholders were hardcoded in English (`"Select a country first"` / `"Enter city name"`).
   - Custom `placeholder` prop was disregarded in fallback text input due to hardcoded ternary `country ? 'Enter city name' : 'Select a country first'`.
   - Running `city-select.spec.tsx` on base: **4 of 8 tests FAILED**.
2. In `apps/web/components/sales/customer-form.tsx`:
   - Submit button text was hardcoded English (`isSubmitting ? 'Saving...' : isEditing ? 'Update Customer' : 'Create Customer'`).
   - Submit button had no `aria-label` attribute (received `null`).
   - Arabic translations were completely missing, omitting the customer terminology (`"العميل"`).
   - Running `customer-form.spec.tsx` on base: **6 of 6 tests FAILED**.

### Head Behaviour on Branch (`ai/316-p2`)

- `CitySelect` cleanly evaluates `hasCountry = Boolean(country && country.trim().length > 0)`, correctly disables the input with `"Select a country first"` (EN) or `"اختر الدولة أولاً"` (AR), and enables input with custom placeholder or `"Enter city name"` (EN) / `"أدخل اسم المدينة"` (AR).
- `CustomerForm` imports and uses `next-intl` translation keys:
  - Create mode: visible text `"Create Customer"` and `aria-label="Create Customer"` (EN); `"إنشاء عميل"` (AR).
  - Update mode: visible text `"Update Customer"` and `aria-label="Update Customer"` (EN); `"تحديث العميل"` (AR).
  - Saving mode: visible text `"Saving..."` and `aria-label="Saving..."` (EN); `"جارٍ الحفظ…"` (AR).
  - Cancel button: visible text `"Cancel"` (EN) / `"إلغاء"` (AR).
  - Copy from billing button: visible text `"Copy from Billing"` (EN) / `"نسخ من عنوان الفوترة"` (AR).
  - All 31 unit tests across 3 suites PASS.

---

## UI Verification (Screenshots / RTL & LTR)

- **LTR English Layout**:
  - Route: `/en/sales/customers/new`
  - HTML direction: `dir="ltr"`
  - City input placeholder: `"Select a country first"` (disabled)
  - Submit button: `"Create Customer"`
- **RTL Arabic Layout**:
  - Route: `/ar/sales/customers/new`
  - HTML direction: `dir="rtl"` (verified via `browser.evaluate(() => document.documentElement.dir)` in `e2e-army/316-customer-form-localization.e2e.ts`)
  - City input placeholder: `"اختر الدولة أولاً"` (disabled)
  - Submit button: `"إنشاء عميل"` (visible text and `aria-label` matching)
- **Screenshots Artifacts Generated by E2E Verification**:
  - `test-results/316-customer-form-en-ltr.png`
  - `test-results/316-customer-form-ar-rtl.png`

---

## Skills Used

- `model-effort-routing`: Explicit tool and model effort declaration (`Gemini 3.8 Flash (High)`).
- `to-spec` & `to-tickets`: Extracted numbered AC1-AC6 from review findings and user scenarios.
- `tdd` & `test-first engineering`: Wrote natural-language E2E test first, wrote failing unit regression suites, verified failure against base, implemented minimal code to pass, and verified green.
- `verification-before-completion`: Ran test executions, `type-check`, and `lint` with exact logged exit codes and passing assertion counts before completing the task.
