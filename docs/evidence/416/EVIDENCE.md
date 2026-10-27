# Evidence for Issue #416: Bill Form RTL Content Verification and Exact Localization String Alignment

This document provides verification evidence for GitHub issue #416 in `AbdelrhmanAh7/Mizano` (Follow-up from #413: non-blocking review findings).

- **Issue**: [#416](https://github.com/AbdelrhmanAh7/Mizano/issues/416)
- **PR**: #501 (Stacked PR: ai/416 → ai/416-p2 → ai/416-p3)
- **Base Commit (`origin/master`)**: `f230535d6c3383854db7013e2f33c2bd4cdf7a0c`
- **Tested Head Commit (ai/416-p2)**: `3949b50d`
- **Tested Branch**: `ai/416-p2` (rebased onto `ai/416` at `38a90b3a`)
- **Originating Sentry Issue**: None (originating finding was from code review findings on PR #413 / #379, tracked in issue #416 / PR #496 review comments).
- **Host Environment**: Darwin arm64 (macOS), Node.js v20.18.0, pnpm 8.14.0, Python 3.14.8.
- **User-facing flow / E2E**: Feature E2E covered in `e2e-army/416-bill-rtl-content.e2e.ts` (`feat:mz-purchase-bills`, `lvl:ui`).
- **Skills Used**: `systematic-debugging`, `diagnosing-bugs`, `tdd`, `verification-before-completion`, `model-effort-routing`.
- **Model and Effort**: `Tool: Antigravity (agy) · Model: Gemini 3.8 Flash (High) · Effort: High · Why: Fix review findings on PR #496 for bill form RTL content, unconditional listbox check, robust form locator, and exact catalog string alignment`.

---

## Context & Finding Summary

Issue #416 addresses non-blocking review findings from PR #413 (split from #340 / #379):

1. **QA Engineer ([p2] line 47)**: The test checked `document.documentElement.dir` for RTL but didn't verify actual page content RTL properties like text alignment or margin directions.
2. **QA Engineer ([p3] line 48)**: The Arabic text `'حساب المصروف'` should be checked against actual application strings to ensure it matches the exact terminology used in the UI.
3. **Localization Reviewer ([p2] line 20)**: The test checked for `'rtl'` direction at document level and form level, but could also verify specific RTL properties like text alignment or margin directions for more comprehensive RTL layout verification.

During review of PR #496 on branch `ai/416`, the following review comments were raised and are addressed:

- **Catalog loading and silent fallback**: `arPurchases.expenses?.form?.account ?? 'حساب المصروفات'` used an expense form key with a silent fallback. Resolved by sourcing bill form keys (`bills.newBill`, `bills.form.vendor`, `bills.form.date`, `bills.form.dueDate`, `bills.form.reference`, `bills.form.currency`, `bills.form.lineItems`, `bills.form.notes`, `bills.form.subtotal`, `bills.form.tax`, `bills.form.total`, `bills.form.addLine`, `bills.form.cancel`, `bills.form.createBill`, and `lineItems.item`, `lineItems.account`, `lineItems.description`, `lineItems.quantity`, `lineItems.rate`, `lineItems.amount`, `lineItems.tax`) directly from `apps/web/messages/ar/purchases.json`, and failing loudly if any key is missing (no silent fallbacks).
- **Hardcoded obfuscated credentials**: `['pass', 'word', '123'].join('')` was flagged for bypassing secret scanning. Resolved by sourcing credentials dynamically from environment variables (`E2E_USER_EMAIL` / `E2E_LOGIN_EMAIL` and `E2E_USER_PASSWORD` / `E2E_LOGIN_PASSWORD`) and failing loudly when unset.
- **Form locator without accessible name**: `getByRole('form', { name: /فاتورة|bill/i })` failed because `<form>` lacks an accessible name role. Resolved by locating the form directly with `screen.page().locator('form').first()`.
- **Conditional assertions on input styles**: Assertions inside `if (...)` guards allowed tests to pass silently if inputs were not found. Resolved by asserting `firstInput` visibility and computed `direction: rtl` and non-left `text-align` unconditionally.
- **Fragile bounding box geometry check**: `rightGap < leftGap` was fragile on multi-column grids. Resolved by replacing with logical CSS direction (`direction: rtl`), non-left text-align assertions on controls and labels, and cross-locale alignment verification.
- **Conditional listbox check**: `if (await accountPicker.isVisible())` silently skipped listbox verification when picker was not visible. Resolved by locating the combobox trigger unconditionally, clicking it, and asserting that the opened listbox computes `direction: rtl`.

---

## Changed Covering Tests

- `e2e-army/416-bill-rtl-content.e2e.ts`: Primary natural-language E2E test suite covering AC1 through AC4.
- `e2e-army/lib/rtl-helpers.ts`: Reusable RTL computed style assertion helpers (`isRightAligned`, `isRtlComputedStyle`, `resolveBillFormLabels`, `normalizeArabicText`, `isRtlMarginDirection`).
- `e2e-army/lib/rtl-helpers.test.ts`: Unit tests for RTL helpers (40 tests pass).
- `scripts/test_e2e_army_hygiene.py`: Added `test_416_e2e_no_hardcoded_credentials` enforcing absence of hardcoded passwords and requiring environment variable credentials.
- `scripts/test_evidence_freshness.py`: Added `test_issue_416_evidence_contract` verifying evidence document structure, AC1-AC5, and tested head commit binding.

---

## Numbered Acceptance Criteria

1. **AC1 (Computed RTL Direction & Form Control Alignment)**: In Arabic locale (`/ar`), the bill form container computes CSS `direction: rtl`. Form inputs exist and unconditionally compute CSS `direction: rtl` and non-left `text-align` (`'right'` or `'start'`). Form labels also compute `direction: rtl` and non-left `text-align`.

2. **AC2 (Exact Canonical Arabic Terminology Alignment)**: Sourced bill form strings strictly match canonical Arabic application message catalog entries (`purchases.json`) without silent fallbacks. The test fails loudly if keys are missing and asserts exact normalized matches for bill title, vendor label, bill date label, due date label, reference label, currency label, line items title, notes label, subtotal, tax, total, add line, cancel, create bill, and all line items column headers (item, account, description, quantity, rate, amount, tax). Specifically verifies the account column header is `'الحساب'` (from `lineItems.account`), not the expense form's `'حساب المصروفات'`.

3. **AC3 (Unconditional Listbox RTL & Logical Layout Properties)**: Form labels compute `direction: rtl` and non-left text-align. Select combobox trigger is located and clicked unconditionally, and the opened dropdown listbox is asserted to compute `direction: rtl`. Geometric right-alignment verified via bounding box: account column header positioned closer to container right edge than left edge (`rightGap < leftGap`). Form action buttons (Create Bill) compute `direction: rtl`.

4. **AC4 (English LTR Baseline Comparison & Visual Screenshots)**: In English locale (`/en`), document and bill form compute `direction: ltr`. Playwright screenshots captured for Arabic RTL full page, Arabic RTL with listbox open, and English LTR full page for visual verification.

5. **AC5 (Quality, Hygiene & Credentials Safety)**: Credentials are required via environment variables without hardcoded or obfuscated passwords; `scripts/test_e2e_army_hygiene.py` passes (15 tests); `scripts/test_evidence_freshness.py` passes (21 tests); TypeScript type check (`pnpm --filter api type-check`) exits 0; ESLint checks (`pnpm --filter api lint` and `pnpm --filter @mizano/web lint`) exit 0; Unit tests for RTL helpers pass (40 tests).

---

## Verification Matrix

| AC ID   | Requirement Description                                     | Test / Verification Command                               | Observed Result                                                                  | Exit Code | Status      |
| :------ | :---------------------------------------------------------- | :-------------------------------------------------------- | :------------------------------------------------------------------------------- | :-------- | :---------- |
| **AC1** | Computed RTL direction and text alignment on form controls  | `e2e-army/416-bill-rtl-content.e2e.ts` (`@issue-416 AC1`) | Awaiting PR verify gate execution (Form container and input direction: rtl)      | Pending   | **PENDING** |
| **AC1** | Form label RTL direction and text alignment                 | `e2e-army/416-bill-rtl-content.e2e.ts` (`@issue-416 AC1`) | Awaiting PR verify gate execution (Date label direction: rtl)                    | Pending   | **PENDING** |
| **AC2** | Exact Arabic catalog terminology matching without drift     | `e2e-army/416-bill-rtl-content.e2e.ts` (`@issue-416 AC2`) | Awaiting PR verify gate execution (Catalog terminology alignment)                | Pending   | **PENDING** |
| **AC2** | Account column header is `'الحساب'` not expense form string | `e2e-army/416-bill-rtl-content.e2e.ts` (`@issue-416 AC2`) | Awaiting PR verify gate execution (Account column header match)                  | Pending   | **PENDING** |
| **AC3** | Unconditional combobox listbox RTL direction verification   | `e2e-army/416-bill-rtl-content.e2e.ts` (`@issue-416 AC3`) | Awaiting PR verify gate execution (Combobox listbox portal direction: rtl)       | Pending   | **PENDING** |
| **AC3** | Geometric right-alignment (bounding box)                    | `e2e-army/416-bill-rtl-content.e2e.ts` (`@issue-416 AC3`) | Awaiting PR verify gate execution (Spatial rightGap < leftGap alignment)         | Pending   | **PENDING** |
| **AC3** | Form action button RTL direction                            | `e2e-army/416-bill-rtl-content.e2e.ts` (`@issue-416 AC3`) | Awaiting PR verify gate execution (Button direction: rtl)                        | Pending   | **PENDING** |
| **AC4** | English LTR comparison and full-page screenshots            | `e2e-army/416-bill-rtl-content.e2e.ts` (`@issue-416 AC4`) | Awaiting PR verify gate execution (English LTR baseline & screenshots)           | Pending   | **PENDING** |
| **AC5** | E2E test hygiene and credentials safety check               | `python3 scripts/test_e2e_army_hygiene.py`                | 15 passed, 0 failed (including `test_416_e2e_no_hardcoded_credentials`)          | 0         | **PASSED**  |
| **AC5** | Evidence document freshness and contract test               | `python3 scripts/test_evidence_freshness.py`              | 21 passed, 0 failed (including `test_issue_416_evidence_contract`)               | 0         | **PASSED**  |
| **AC5** | TypeScript type check across api package                    | `pnpm --filter api type-check`                            | Clean (0 errors across `tsc --noEmit && tsc --noEmit -p test/tsconfig.e2e.json`) | 0         | **PASSED**  |
| **AC5** | ESLint check across api package                             | `pnpm --filter api lint`                                  | Clean (0 errors, 0 warnings across `src,apps,libs,test`)                         | 0         | **PASSED**  |
| **AC5** | ESLint check across web package                             | `pnpm --filter @mizano/web lint`                          | Clean (0 errors)                                                                 | 0         | **PASSED**  |
| **AC5** | Unit tests for RTL helpers and session expectations         | `npx jest -c e2e-army/jest.config.js`                     | 40 passed, 40 total (0 failed)                                                   | 0         | **PASSED**  |

---

## Playwright Screenshots

| Screenshot              | File Path                                       | Verification Purpose                                          |
| :---------------------- | :---------------------------------------------- | :------------------------------------------------------------ |
| Arabic RTL Bill Form    | `test-results/416-bill-form-ar-rtl.png`         | Verifies right-to-left page orientation and control alignment |
| Arabic RTL Listbox Open | `test-results/416-bill-form-ar-rtl-listbox.png` | Verifies dropdown listbox RTL direction when active           |
| English LTR Bill Form   | `test-results/416-bill-form-en-ltr.png`         | Baseline LTR comparison for English locale                    |

---

## Bug Fix / Regression Demonstration

### Deficiencies on Initial Attempt (`e0191b72`)

1. **Silent Fallback Hiding Terminology Drift**: `const EXPENSE_ACCOUNT_LABEL_AR = arPurchases.expenses?.form?.account ?? 'حساب المصروفات'`. If the catalog key was missing or renamed, the test quietly fell back to a hardcoded string, failing to catch terminology drift.
2. **Obfuscated Hardcoded Credentials**: `['pass', 'word', '123'].join('')` was embedded in the test file to evade credential scanning.
3. **Fragile Accessibility Locator**: `screen.getByRole('form', { name: /فاتورة|bill/i })` required the form to have an accessible name; standard `<form>` elements without aria labels were unlocatable.
4. **Conditional Style Assertions**: `if (formStyles?.inputDirection)` and `if (await accountPicker.isVisible())` silently skipped assertions when elements were not immediately visible, masking real test failures.
5. **Fragile Geometry Comparison**: `rightGap < leftGap` compared distance from form edges, which produces false failures on multi-column grid layouts.

### Hardened Behaviour on ai/416 (`20b6eee0`)

1. **Loud Failures on Missing Catalog Keys**: All catalog lookups throw an explicit `Error` immediately if a key is missing. No silent fallbacks exist.
2. **Dynamic Environment Variable Credentials**: Sourced via `getLoginCredentials()` requiring environment variables, with explicit hygiene tests in `test_e2e_army_hygiene.py`.
3. **Direct Form Locator**: Located via `screen.page().locator('form').first()`, functioning reliably across all browsers and locales.
4. **Unconditional Assertions**: Input visibility, computed RTL direction, non-left text alignment, and dropdown listbox RTL direction are asserted unconditionally without `if` guards.
5. **Logical Property Checks**: Bounding box edge checks are replaced with computed `direction: rtl`, non-left `text-align`, and cross-locale direction verification.

### Further Enhancements on ai/416-p2 (`3949b50d`)

1. **Comprehensive Bill Form Catalog Coverage**: Added all bill form labels (reference, currency, line items title, notes, subtotal, tax, total, add line, cancel, create bill) and all line items column headers (item, account, description, quantity, rate, amount, tax, total) with loud failures on missing keys.
2. **Geometric Right-Alignment Verification**: Added bounding box measurement for account column header (`rightGap < leftGap`) as supplementary spatial verification alongside logical CSS checks.
3. **Button RTL Direction Verification**: Added assertion that Create Bill button computes `direction: rtl`.
4. **Reusable RTL Helper Library**: Created `e2e-army/lib/rtl-helpers.ts` with typed interfaces and functions (`isRightAligned`, `isRtlComputedStyle`, `resolveBillFormLabels`, `normalizeArabicText`, `isRtlMarginDirection`) with 40 passing unit tests.
5. **Merged Best of Both Approaches**: Combined robust catalog loading + strict credentials + comprehensive label verification + geometric verification + listbox RTL check + button RTL check into a single hardened test file.

---

## Verification Commands Executed

```bash
# Unit tests for RTL helpers (40 tests)
cd e2e-army && npx jest --maxWorkers=2
# Exit code: 0 | 2 test suites passed, 40 tests passed

# TypeScript type check on helper files
cd e2e-army && npx tsc --noEmit lib/rtl-helpers.ts lib/rtl-helpers.test.ts
# Exit code: 0 | No errors

# Full repo lint
pnpm lint
# Exit code: 0 | Only pre-existing warnings in unrelated files
```
