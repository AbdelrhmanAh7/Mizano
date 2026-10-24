# Evidence for Issue #483: Bill Form RTL Table Alignment Fix

## Issue Summary

Fixed RTL layout issue in `apps/web/components/purchases/bill-form.tsx` where table cells used physical `text-right` property instead of logical `text-end` property, causing misalignment in Arabic RTL mode. Split from PR #432 (finding at line 391).

## Acceptance Criteria

### AC1: Table headers use logical text alignment (text-end) in Arabic RTL

- **Verification**: E2E test `@issue-483 AC1` in `e2e-army/483-bill-form-rtl-table.e2e.ts`
- **Test**: Navigate to `/ar/purchases/bills/new`, verify `document.documentElement.dir === 'rtl'`, check that Amount and Total column headers have computed `text-align: end`
- **Expected**: Both headers return `text-align: end` (logical property)
- **Files changed**: `apps/web/components/purchases/bill-form.tsx` lines 385, 389-390

### AC2: Table cells use logical text alignment (text-end) in Arabic RTL

- **Verification**: E2E test `@issue-483 AC1` in `e2e-army/483-bill-form-rtl-table.e2e.ts`
- **Test**: Add a line item, verify Amount and Total cells in the row have computed `text-align: end`
- **Expected**: Both cells return `text-align: end` (logical property). Test now uses mandatory `await expect().toBeVisible()` assertions (fixed per QA finding)
- **Files changed**: `apps/web/components/purchases/bill-form.tsx` lines 442, 455-457

### AC3: Table headers and cells use logical text alignment in English LTR (for comparison)

- **Verification**: E2E test `@issue-483 AC2` in `e2e-army/483-bill-form-rtl-table.e2e.ts`
- **Test**: Navigate to `/en/purchases/bills/new`, verify `document.documentElement.dir === 'ltr'`, check that Amount and Total column headers and cells have computed `text-align: end`
- **Expected**: All return `text-align: end` (logical property, computes to left in LTR)
- **Files changed**: Same as AC1/AC2

### AC4: Translation keys added for line items table headers

- **Verification**: Visual inspection of translation files
- **Files changed**:
  - `apps/web/messages/en/purchases.json` - added `rate: "Unit Price"`, `tax: "Tax %"`, `total: "Total"`
  - `apps/web/messages/ar/purchases.json` - added `rate: "سعر الوحدة"`, `tax: "% الضريبة"`, `total: "الإجمالي"`

### AC5: Accessibility - column headers have scope="col"

- **Verification**: Code inspection
- **Files changed**: `apps/web/components/purchases/bill-form.tsx` lines 385, 389-390

## Changed Files

1. `apps/web/components/purchases/bill-form.tsx` - Main fix: text-right → text-end, added translations, test IDs, scope attributes
2. `apps/web/messages/en/purchases.json` - Added lineItems translation keys
3. `apps/web/messages/ar/purchases.json` - Added lineItems translation keys
4. `e2e-army/483-bill-form-rtl-table.e2e.ts` - New E2E test for RTL/LTR table alignment verification (fixed per QA finding to use mandatory visibility assertions)

## Test Results

- Lint: PASS (no new warnings/errors introduced)
- Type-check: PASS (no new errors in bill-form.tsx)
- Unit tests: PASS (existing tests unaffected, pre-existing failures in unrelated modules)

## Screenshots

- RTL screenshot: `test-results/483-bill-form-ar-rtl-table.png` (captured by E2E test)
- LTR screenshot: `test-results/483-bill-form-en-ltr-table.png` (captured by E2E test)

## Commits

- `ab16c8f5` - fix(purchases): bill-form rtl table alignment - use text-end logical property
- `ce5902af` - docs(evidence): add evidence for issue 483 rtl table alignment fix
- `4482043` - test(purchases): fix e2e test for rtl table alignment - make cell assertions mandatory

## Notes

This fix supersedes part of PR #432 which reached the fix-round cap (6/6) without going green. The original issue was split from #432 finding at line 391 of bill-form.tsx.

QA Finding Resolution:

- The e2e test was fixed to replace conditional `if (await rowAmountCell.isVisible())` checks with mandatory `await expect(rowAmountCell).toBeVisible()` assertions, ensuring the test cannot pass without exercising the changed cells.
