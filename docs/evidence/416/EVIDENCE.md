# Evidence for Issue #416: Bill Form RTL Content Verification and Exact Localization String Alignment

This document provides verification evidence for GitHub issue #416 in `AbdelrhmanAh7/Mizano` (Follow-up from #413: non-blocking review findings, PR #496).

- **Issue**: [#416](https://github.com/AbdelrhmanAh7/Mizano/issues/416)
- **PR**: #496 (Follow-up from #413, split from #340 / #379)
- **Base Commit (`origin/master`)**: `f230535d6c3383854db7013e2f33c2bd4cdf7a0c`
- **Tested Head Commit**: `20b6eee0084e39ffc525968dda4a6bb15bbba82d`
- **Tested Branch**: `ai/416`
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

- **Catalog loading and silent fallback**: `arPurchases.expenses?.form?.account ?? 'حساب المصروفات'` used an expense form key with a silent fallback. Resolved by sourcing bill form keys (`bills.newBill`, `bills.form.vendor`, `bills.form.date`, `bills.form.dueDate`, and `lineItems.account`) directly from `apps/web/messages/ar/purchases.json`, and failing loudly if any key is missing (no silent fallbacks).
- **Hardcoded obfuscated credentials**: `['pass', 'word', '123'].join('')` was flagged for bypassing secret scanning. Resolved by sourcing credentials dynamically from environment variables (`E2E_USER_EMAIL` / `E2E_LOGIN_EMAIL` and `E2E_USER_PASSWORD` / `E2E_LOGIN_PASSWORD`) and failing loudly when unset.
- **Form locator without accessible name**: `getByRole('form', { name: /فاتورة|bill/i })` failed because `<form>` lacks an accessible name role. Resolved by locating the form directly with `screen.page().locator('form').first()`.
- **Conditional assertions on input styles**: Assertions inside `if (...)` guards allowed tests to pass silently if inputs were not found. Resolved by asserting `firstInput` visibility and computed `direction: rtl` and non-left `text-align` unconditionally.
- **Fragile bounding box geometry check**: `rightGap < leftGap` was fragile on multi-column grids. Resolved by replacing with logical CSS direction (`direction: rtl`), non-left text-align assertions on controls and labels, and cross-locale alignment verification.
- **Conditional listbox check**: `if (await accountPicker.isVisible())` silently skipped listbox verification when picker was not visible. Resolved by locating the combobox trigger unconditionally, clicking it, and asserting that the opened listbox computes `direction: rtl`.

---

## Changed Covering Tests

- `e2e-army/416-bill-rtl-content.e2e.ts`: Primary natural-language E2E test suite covering AC1 through AC4.
- `scripts/test_e2e_army_hygiene.py`: Added `test_416_e2e_no_hardcoded_credentials` enforcing absence of hardcoded passwords and requiring environment variable credentials.
- `scripts/test_evidence_freshness.py`: Added `test_issue_416_evidence_contract` verifying evidence document structure, AC1-AC5, and tested head commit binding.

---

## Numbered Acceptance Criteria

1. **AC1 (Computed RTL Direction & Form Control Alignment)**: In Arabic locale (`/ar`), the bill form container computes CSS `direction: rtl`. Form inputs exist and unconditionally compute CSS `direction: rtl` and non-left `text-align` (`'right'` or `'start'`).
2. **AC2 (Exact Canonical Arabic Terminology Alignment)**: Sourced bill form strings strictly match canonical Arabic application message catalog entries (`purchases.json`) without silent fallbacks. The test fails loudly if keys are missing and asserts exact normalized matches for bill title, vendor label, and bill date label.
3. **AC3 (Unconditional Listbox RTL & Logical Layout Properties)**: Form labels compute `direction: rtl` and non-left text-align. Select combobox trigger is located and clicked unconditionally, and the opened dropdown listbox is asserted to compute `direction: rtl`.
4. **AC4 (English LTR Baseline Comparison & Visual Screenshots)**: In English locale (`/en`), document and bill form compute `direction: ltr`. Playwright screenshots are captured for Arabic RTL full page, Arabic RTL with listbox open, and English LTR full page for visual verification.
5. **AC5 (Quality, Hygiene & Credentials Safety)**: Credentials are required via environment variables without hardcoded or obfuscated passwords; `scripts/test_e2e_army_hygiene.py` passes (15 tests); `scripts/test_evidence_freshness.py` passes (21 tests); TypeScript type check (`pnpm --filter api type-check`) exits 0; ESLint checks (`pnpm --filter api lint` and `pnpm --filter @mizano/web lint`) exit 0.

---

## Verification Matrix

| AC ID   | Requirement Description                                    | Test / Verification Command                               | Observed Result                                                                                 | Exit Code | Status     |
| :------ | :--------------------------------------------------------- | :-------------------------------------------------------- | :---------------------------------------------------------------------------------------------- | :-------- | :--------- |
| **AC1** | Computed RTL direction and text alignment on form controls | `e2e-army/416-bill-rtl-content.e2e.ts` (`@issue-416 AC1`) | Form container and input compute `direction: rtl`, input `text-align` is right/start (not left) | 0         | **PASSED** |
| **AC2** | Exact Arabic catalog terminology matching without drift    | `e2e-army/416-bill-rtl-content.e2e.ts` (`@issue-416 AC2`) | Bill title, vendor label, date label match `purchases.json` canonical strings without fallbacks | 0         | **PASSED** |
| **AC3** | Unconditional combobox listbox RTL direction verification  | `e2e-army/416-bill-rtl-content.e2e.ts` (`@issue-416 AC3`) | Combobox opened unconditionally; listbox portal computes `direction: rtl`                       | 0         | **PASSED** |
| **AC4** | English LTR comparison and full-page screenshots           | `e2e-army/416-bill-rtl-content.e2e.ts` (`@issue-416 AC4`) | English document and form compute `direction: ltr`; full screenshots captured                   | 0         | **PASSED** |
| **AC5** | E2E test hygiene and credentials safety check              | `python3 scripts/test_e2e_army_hygiene.py`                | 15 passed, 0 failed (including `test_416_e2e_no_hardcoded_credentials`)                         | 0         | **PASSED** |
| **AC5** | Evidence document freshness and contract test              | `python3 scripts/test_evidence_freshness.py`              | 21 passed, 0 failed (including `test_issue_416_evidence_contract`)                              | 0         | **PASSED** |
| **AC5** | TypeScript type check across api package                   | `pnpm --filter api type-check`                            | Clean (0 errors across `tsc --noEmit && tsc --noEmit -p test/tsconfig.e2e.json`)                | 0         | **PASSED** |
| **AC5** | ESLint check across api package                            | `pnpm --filter api lint`                                  | Clean (0 errors, 0 warnings across `src,apps,libs,test`)                                        | 0         | **PASSED** |
| **AC5** | ESLint check across web package                            | `pnpm --filter @mizano/web lint`                          | Clean (0 errors)                                                                                | 0         | **PASSED** |
| **AC5** | Unit tests for session expectations helper                 | `npx jest -c e2e-army/jest.config.js`                     | 24 passed, 24 total (0 failed)                                                                  | 0         | **PASSED** |

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

### Hardened Behaviour on Head (`20b6eee`)

1. **Loud Failures on Missing Catalog Keys**: All catalog lookups throw an explicit `Error` immediately if a key is missing. No silent fallbacks exist.
2. **Dynamic Environment Variable Credentials**: Sourced via `getLoginCredentials()` requiring environment variables, with explicit hygiene tests in `test_e2e_army_hygiene.py`.
3. **Direct Form Locator**: Located via `screen.page().locator('form').first()`, functioning reliably across all browsers and locales.
4. **Unconditional Assertions**: Input visibility, computed RTL direction, non-left text alignment, and dropdown listbox RTL direction are asserted unconditionally without `if` guards.
5. **Logical Property Checks**: Bounding box edge checks are replaced with computed `direction: rtl`, non-left `text-align`, and cross-locale direction verification.
