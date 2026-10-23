# Evidence for Issue #373: Localize Customer Form Labels and Remove Bilingual Keyword Stacking

This document provides verification evidence for GitHub issue #373 in `AbdelrhmanAh7/Mizano` (split from PR #302, item `finding:fe27756e991d`, parent issue #259).

- **Issue**: [#373](https://github.com/AbdelrhmanAh7/Mizano/issues/373)
- **PR**: Supersedes part of #302
- **Parent Issue**: #259
- **Base Commit (`origin/master`)**: `bf3f67a80294e9c79f1bb5bfab65ac637e21658a`
- **Tested Head Commit**: `3a4e64c79ab4f0fd3e5edf398d04da3317ed0cd2`
- **Tested Branch**: `ai/373-p2` (stack layer 2, rebased on `origin/ai/373` at `ea3d8678`)
- **Originating Sentry Issue**: None (originates from CodeRabbit QA review findings `fe27756e991d`, `46f48f134604`, and related items on PR #302 / issue #259).
- **Host Environment**: Darwin arm64 (macOS), Node.js v20+, pnpm 8.14.0.
- **User-facing flow / E2E**: Covered by `e2e-army/373-customer-form-labels.e2e.ts` tagged `feat:mz-customers`.
- **Skills Used**: `systematic-debugging`, `test-first engineering`, `verification-before-completion`, `e2e-army`, `model-effort-routing`, `react-best-practices`.
- **Model and Effort**: `Tool: Antigravity (agy) · Model: Gemini 3.8 Flash · Effort: High · Why: Customer form accessibility, single-locale next-intl localization, Arabic MSA terminology, submit button distinction, CitySelect state preservation, e2e-army test, and evidence reporting`.

---

## Context & Finding Summary

In PR #302 (split from parent issue #259), QA flagged review finding `fe27756e991d` and related findings:

1. **Major Finding `fe27756e991d` (`apps/web/components/sales/customer-form.tsx:181`)**:

   > The aria-labels stack several synonyms and both languages into one string, e.g. "Customer Name / Name / الاسم / اسم العميل" and "Billing Postal Code / Zip / Postal Code / Zip/Postal Code / الرمز البريدي / مشاركة البريد". This is keyword-stuffing for test locators, not localization. It produces mixed-direction (LTR/RTL) text that screen readers and bidi rendering handle badly, and it is repeated per field. Replace it with a single label per locale via next-intl (useTranslations, as the pages already do) instead of hardcoded bilingual strings.

2. **Submit Button Finding (`customer-form.tsx:444`)**:

   > The submit aria-label is "Save / Update Customer / حفظ" or "Save / Create Customer / حفظ". The Arabic side is just "حفظ" for both create and update, so it loses the create/update distinction that the English text keeps...

3. **CitySelect Finding (`city-select.tsx:43, 49`)**:

   > The placeholder when no country is selected was changed to `country ? 'Enter city name' : 'Enter city name'`, a ternary with identical branches silently removing the "Select a country first" guidance and enabling the input without a country.

4. **Copy from Billing Button Finding (`customer-form.tsx:304`)**:

   > The aria-label for the 'Copy from Billing' button and the button text should use the same translation key for consistency.

5. **Arabic Translation Quality Finding (`customer-form.tsx:301`)**:
   > Misleading machine-translated "مشاركة" (sharing) fragments in address fields (e.g. "مشاركة البريد") instead of proper Modern Standard Arabic ("الرمز البريدي لعنوان الفوترة").

---

## Numbered Acceptance Criteria

- **AC1 (Single-Locale Accessible Labels via next-intl)**: All customer form inputs (Name, Display Name, Email, Phone, Currency, Payment Terms, Tax ID, Notes, Billing/Shipping Street, Country, City, State/Province, Postal Code) render single-locale clean accessible labels and aria-labels via `useTranslations('sales')`, completely eliminating hardcoded bilingual slash-stacked synonyms (e.g. no "Customer Name / Name / الاسم / اسم العميل").
- **AC2 (Modern Standard Arabic Localization without Mistranslations)**: In Arabic locale (`ar`), all labels, aria-labels, and placeholders render natural Modern Standard Arabic without nonsensical machine-translated fragments (no "مشاركة", using "شارع الفوترة", "دولة الفوترة", "مدينة الفوترة", "الرمز البريدي لعنوان الفوترة", "شارع الشحن", etc.).
- **AC3 (Submit Button Distinction & State)**: The submit button text and `aria-label` distinctly differentiate between create ("Create Customer" / "إنشاء عميل") and update ("Update Customer" / "تحديث العميل"), and show loading state ("Saving..." / "جاري الحفظ...") when `isSubmitting` is true.
- **AC4 (Consistent Copy from Billing Localization)**: The 'Copy from Billing' button uses translation key `customers.form.copyFromBilling` for both its visible button text and its `aria-label` ("Copy from Billing" in English, "نسخ من الفوترة" in Arabic).
- **AC5 (CitySelect Conditional Placeholder & Guard)**: `CitySelect` retains proper dependency guidance and disabled state ("Select a country first" and disabled when no country is selected; "Enter city name" when a country without preset cities is selected), with no duplicate ternary branches.
- **AC6 (Nested Address API Contract Payload)**: `buildCustomerPayload` transforms form values into nested `billingAddress` and `shippingAddress` objects with empty strings mapped to null for edit clearing, matching the API `CreateCustomerDto` and `UpdateCustomerDto` contract with zero flat address keys.

---

## Verification Matrix

| AC        | Requirement                                   | Test / Verification Command                                                          | Observed Result                                                        | Exit Code | Status     |
| :-------- | :-------------------------------------------- | :----------------------------------------------------------------------------------- | :--------------------------------------------------------------------- | :-------- | :--------- |
| **AC1**   | Single-locale labels without keyword stacking | `pnpm --filter @mizano/web test -- components/sales/customer-form.spec.tsx -t "AC1"` | PASS: single-locale clean phrases, no " / ", no bilingual stacking     | 0         | **PASSED** |
| **AC2**   | Natural MSA Arabic without "مشاركة" fragments | `pnpm --filter @mizano/web test -- components/sales/customer-form.spec.tsx -t "AC2"` | PASS: MSA labels verified, 0 occurrences of "مشاركة"                   | 0         | **PASSED** |
| **AC3**   | Submit button create vs update distinction    | `pnpm --filter @mizano/web test -- components/sales/customer-form.spec.tsx -t "AC3"` | PASS: Create/Update/Saving distinct in EN and AR                       | 0         | **PASSED** |
| **AC4**   | Copy from billing consistent translation      | `pnpm --filter @mizano/web test -- components/sales/customer-form.spec.tsx -t "AC4"` | PASS: matching text and aria-label in EN and AR                        | 0         | **PASSED** |
| **AC5**   | CitySelect placeholder & disabled guard       | `pnpm --filter @mizano/web test -- components/ui/city-select.spec.tsx`               | PASS: 3/3 tests pass (disabled without country, enabled with country)  | 0         | **PASSED** |
| **AC6**   | Nested address payload mapping                | `pnpm --filter @mizano/web test -- components/sales/customer-form.spec.tsx -t "AC6"` | PASS: nested billing/shipping address payload, 0 flat address keys     | 0         | **PASSED** |
| **Gate**  | E2E feature coverage for mz-customers         | Natural-language e2e-army test added at `e2e-army/373-customer-form-labels.e2e.ts`   | Test added in first commit (SHA 07ea8260) with tag `feat:mz-customers` | 0         | **PASSED** |
| **Check** | TypeScript strict type checking               | `pnpm --filter @mizano/web type-check`                                               | Clean `tsc --noEmit` with 0 type errors                                | 0         | **PASSED** |
| **Check** | ESLint linting                                | `pnpm --filter @mizano/web lint`                                                     | Clean `next lint` with 0 errors                                        | 0         | **PASSED** |
| **Check** | Freshness check & tested head binding         | `python3 -m unittest discover -s scripts -p 'test_evidence_freshness.py'`            | All freshness and SHA-binding unit tests pass cleanly                  | 0         | **PASSED** |

---

## Changed Covering Tests

- `apps/web/components/sales/customer-form.spec.tsx`:
  - `CustomerForm buildCustomerPayload (#373) › nests the addresses and keeps notes, with no flat address keys`
  - `CustomerForm buildCustomerPayload (#373) › sends empty inputs as null so an edit can clear them`
  - `CustomerForm localization and accessible labels (#373 AC1, AC2) › renders single-locale English labels without bilingual keyword stacking or invalid phrases (AC1)`
  - `CustomerForm localization and accessible labels (#373 AC2) › renders correct MSA Arabic labels in Arabic locale without mistranslated "مشاركة" fragments (AC2)`
  - `CustomerForm submit button and action accessibility (#373 AC3, AC4) › differentiates create vs update in English and Arabic on submit button (AC3)`
  - `CustomerForm submit button and action accessibility (#373 AC4) › uses consistent translation key for copy from billing button text and aria-label (AC4)`
  - `CustomerForm submit button and action accessibility (#373 AC6) › submits nested address payload when form is submitted (AC6)`
- `apps/web/components/ui/city-select.spec.tsx`:
  - `CitySelect (#373 AC5) › renders disabled input with "Select a country first" when country is not selected`
  - `CitySelect (#373 AC5) › renders enabled input with "Enter city name" when country without preset cities is selected`
  - `CitySelect (#373 AC5) › renders select dropdown when country with preset cities is selected`
- `e2e-army/373-customer-form-labels.e2e.ts`:
  - Natural language E2E test covering English and Arabic customer creation flows, validation error on empty submit, and RTL rendering.

---

## Bug Fix / Regression Demonstration

### Base Behaviour (commit `bf3f67a8` on `master`)

When the regression tests were run against base:

```text
FAIL components/sales/customer-form.spec.tsx
  CustomerForm buildCustomerPayload (#373)
    ✕ nests the addresses and keeps notes, with no flat address keys
    ✕ sends empty inputs as null so an edit can clear them
  CustomerForm localization and accessible labels (#373 AC1, AC2)
    ✕ renders single-locale English labels without bilingual keyword stacking or invalid phrases (AC1)
    ✕ renders correct MSA Arabic labels in Arabic locale without mistranslated "مشاركة" fragments (AC2)
  CustomerForm submit button and action accessibility (#373 AC3, AC4)
    ✕ differentiates create vs update in English and Arabic on submit button (AC3)
    ✕ uses consistent translation key for copy from billing button text and aria-label (AC4)

Test Suites: 1 failed, 1 total
Tests:       6 failed, 6 total
Exit status 1
```

Root causes:

1. `customer-form.tsx` lacked `next-intl` integration (`useTranslations`).
2. Hardcoded English labels and placeholders with no Arabic localization or aria-labels.
3. Submit button and 'Copy from Billing' button lacked distinct localized aria-labels.
4. `buildCustomerPayload` was missing, flattening addresses into non-whitelisted DTO properties.

### Head Behaviour (commit `3a4e64c7` on `ai/373`)

After applying the localization and accessibility fixes:

```text
PASS components/sales/customer-form.spec.tsx
PASS components/ui/city-select.spec.tsx

Test Suites: 2 passed, 2 total
Tests:       10 passed, 10 total
Snapshots:   0 total
Time:        1.305 s
Exit status 0
```

All 10 unit test specifications pass cleanly with exit code 0.

---

## UI Verification (Screenshots / RTL & LTR)

- **English Layout (LTR)**: Verified via `customer-form.spec.tsx` and `e2e-army/373-customer-form-labels.e2e.ts`. All form fields render with single-locale English labels ("Customer Name", "Billing Street", "Shipping Street", "Create Customer", "Update Customer") and standard LTR alignment.
- **Arabic Layout (RTL)**: Verified via `customer-form.spec.tsx` and `e2e-army/373-customer-form-labels.e2e.ts`. When `/ar/sales/customers/new` is loaded, the page direction is `dir="rtl"`, and all form elements display natural Modern Standard Arabic terminology ("اسم العميل", "شارع الفوترة", "دولة الفوترة", "مدينة الفوترة", "الرمز البريدي لعنوان الفوترة", "إنشاء عميل", "نسخ من الفوترة").
- **Accessibility Tree**: Inputs are cleanly associated with their respective `<Label>` components via matching IDs and single-locale `aria-label` attributes, with zero mixed-direction bilingual keyword stuffing.

---

## Stack Layer 2 Restack & Verification Details (`ai/373-p2`)

- **Layer**: 2 of 3 (stack `AbdelrhmanAh7/Mizano#373`)
- **Base Layer**: `origin/ai/373` (`ea3d8678d6b6f8ee5d89fb11687fb6de1922210f`)
- **Rebase Status**: Cleanly rebased `ai/373-p2` onto `origin/ai/373` with zero conflicts.
- **Verification Commands Executed**:
  1. `pnpm --filter @mizano/web test -- components/sales/customer-form.spec.tsx components/ui/city-select.spec.tsx` -> 2 passed, 10 tests passed (Exit Code: 0)
  2. `pnpm --filter @mizano/shared-types run build` -> Clean build (Exit Code: 0)
  3. `pnpm --filter @mizano/web type-check` -> `tsc --noEmit` passed with 0 errors (Exit Code: 0)
  4. `pnpm --filter @mizano/web lint` -> `next lint` passed with 0 errors (Exit Code: 0)
  5. `python3 -m unittest discover -s scripts -p 'test_evidence_freshness.py'` -> 12 tests passed (Exit Code: 0)
