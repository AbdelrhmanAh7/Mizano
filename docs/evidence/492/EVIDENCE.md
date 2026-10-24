# Evidence for Issue #492

## Issue Summary

Fix the submit button aria-label in customer-form.tsx to use correct Arabic translations for create vs update modes.

## Acceptance Criteria

### AC1: Customer form submit button shows "Create Customer" in English create mode

- **Test**: `e2e-army/492-customer-form-submit-aria.e2e.ts` - Test `@issue-492 AC1`
- **Verification**: Navigate to `/en/sales/customers/new`, verify submit button has text "Create Customer" and `aria-label="Create Customer"`

### AC2: Customer form submit button shows "Update Customer" in English update mode

- **Test**: `e2e-army/492-customer-form-submit-aria.e2e.ts` - Test `@issue-492 AC2`
- **Verification**: Create a customer, navigate to edit page, verify submit button has text "Update Customer" and `aria-label="Update Customer"`

### AC3: Customer form submit button shows correct Arabic label "إنشاء عميل" in RTL create mode

- **Test**: `e2e-army/492-customer-form-submit-aria.e2e.ts` - Test `@issue-492 AC3`
- **Verification**: Navigate to `/ar/sales/customers/new`, verify `document.documentElement.dir === 'rtl'`, submit button has text "إنشاء عميل" and `aria-label="إنشاء عميل"`

### AC4: Customer form submit button shows correct Arabic label "تحديث العميل" in RTL update mode

- **Test**: `e2e-army/492-customer-form-submit-aria.e2e.ts` - Test `@issue-492 AC4`
- **Verification**: Create a customer in Arabic, navigate to edit page, verify `document.documentElement.dir === 'rtl'`, submit button has text "تحديث العميل" and `aria-label="تحديث العميل"`

### AC5: Visual comparison - English LTR mode renders correctly

- **Test**: `e2e-army/492-customer-form-submit-aria.e2e.ts` - Test `@issue-492 AC5`
- **Verification**: Navigate to `/en/sales/customers/new`, verify `document.documentElement.dir === 'ltr'`, capture screenshot `test-results/492-customer-form-en-ltr-create.png`

## Changes Made

### 1. Translation Keys Added

- **apps/web/messages/en/sales.json**: Added `submitCreate: "Create Customer"` and `submitUpdate: "Update Customer"` under `sales.customers.form`
- **apps/web/messages/ar/sales.json**: Added `submitCreate: "إنشاء عميل"` and `submitUpdate: "تحديث العميل"` under `sales.customers.form`

### 2. Component Updated

- **apps/web/components/sales/customer-form.tsx**:
  - Imported `useTranslations` from `next-intl`
  - Added `const t = useTranslations('sales.customers.form')` for form-specific translations
  - Added `const tc = useTranslations('common')` for common translations (Cancel, Saving...)
  - Updated submit button to use translated text and aria-label:
    - Create mode: `t('submitCreate')` / `aria-label={t('submitCreate')}`
    - Update mode: `t('submitUpdate')` / `aria-label={t('submitUpdate')}`
    - Submitting: `tc('loading.saving')` / `aria-label={tc('loading.saving')}`
  - Updated Cancel button to use `tc('buttons.cancel')`

### 3. Test Infrastructure

- **apps/web/components/sales/customer-form.spec.ts**: Added `jest.mock('next-intl', ...)` to mock translations for unit test isolation
- **e2e-army/492-customer-form-submit-aria.e2e.ts**: Added comprehensive e2e tests covering all acceptance criteria with RTL/LTR verification and screenshots

## Commands Run and Results

### Unit Tests

```bash
pnpm --filter web exec jest apps/web/components/sales/customer-form.spec.ts --maxWorkers=2
```

**Result**: PASS - 15 tests passed

### Lint Check

```bash
pnpm --filter web lint
```

**Result**: PASS - No new warnings/errors introduced (only pre-existing warnings)

### Type Check (pre-existing issues only)

```bash
pnpm --filter web type-check
```

**Result**: Pre-existing errors in unrelated files (logger-dashboard, shared-types, validators). No new errors from changed files.

## Commit

- **SHA**: `cab0d60d`
- **Message**: `fix: customer-form submit button aria-label uses correct arabic translations`
- **Branch**: `ai/492`

## Screenshots (to be captured during e2e-army run)

- `test-results/492-customer-form-ar-rtl-create.png` - Arabic RTL create mode
- `test-results/492-customer-form-ar-rtl-update.png` - Arabic RTL update mode
- `test-results/492-customer-form-en-ltr-create.png` - English LTR create mode

## Regression Test

The e2e-army test serves as a regression test. If the Arabic translations revert to using "حفظ" for both modes, the tests AC3 and AC4 will fail because they explicitly check for "إنشاء عميل" and "تحديث العميل" respectively.

## Related Issues

- Supersedes part of #481 (PR #481 finding cc952b3482a8)
- Parent issue: #316
