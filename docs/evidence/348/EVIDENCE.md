# Evidence: Issue #348 — Fix: E2E tests for VAT return draft endpoint & VAT Return UI navigation

## Overview

- **Issue**: #348 (`fix: reports.e2e-spec.ts: apps/api/test/reports.e2e-spec.ts: No E2E tests for VAT return draft … (split from #117)`)
- **Parent Issue**: #114
- **Supersedes part of**: PR #117 (finding `05a58c8ae2f6`)
- **Base Commit**: `e5d9b8053fa282d02c81ea64861e6878b7b25208` (`master`)
- **Tested Commit SHA**: `c82888f0f1b61e9f9c0b4f48a13da4d4268bf273`
- **Originating Sentry Issue**: None (split finding from PR #117 test coverage audit).
- **User-facing flow / E2E**: User-facing report navigation and VAT return draft generation. Covered by `e2e-army/348-vat-return-draft.e2e.ts`.

---

## Changed Covering Tests

- `apps/api/test/reports.e2e-spec.ts`: E2E integration test covering VAT return draft endpoint reconciliation, parameter validation, tenant isolation, and 401 unauthorized rejection.
- `e2e-army/348-vat-return-draft.e2e.ts`: Acceptance E2E tests covering API draft calculation, 400 validations, UI navigation to 'VAT Return' from `/en/reports`, and Arabic RTL layout verification on `/ar/reports`.
- `apps/web/app/[locale]/(dashboard)/reports/page.spec.tsx`: Frontend unit spec verifying the 'Tax Reports' category and 'VAT Return' link pointing to `/tax/returns/generate`.
- `apps/api/src/modules/tax/controllers/vat-return-draft.controller.spec.ts`: Controller unit spec verifying draft delegation and query handling.

---

## Numbered Acceptance Criteria

1. **AC1 (VAT Return Draft Endpoint Contract)**: Authenticated `GET /tax/vat-returns/draft?periodStart=YYYY-MM-DD&periodEnd=YYYY-MM-DD` returns HTTP 200 with `label: 'DRAFT, not for filing'`, org base currency, draft status (`complete` / `incomplete`), decimal string totals formatted to 4 decimal places (`outputVat`, `inputVat`, `netVat`, `totalSales`, `totalPurchases`), and mismatch/exception/etaMismatch arrays. Anonymous requests return HTTP 401.
2. **AC2 (Query Parameter Validation)**: Missing `periodStart` or `periodEnd`, periodStart after periodEnd, or date ranges longer than 366 days return HTTP 400 with descriptive validation errors.
3. **AC3 (Reports Page VAT Return Navigation & Generation Form)**: User navigating to `/en/reports` locates the 'VAT Return' link under 'Tax Reports'. Clicking the link navigates to the VAT return draft generation form (`/tax/returns/generate`) containing `startDate` and `endDate` controls, period presets, and the 'Generate Return' action.
4. **AC4 (Arabic & RTL Layout Support)**: Navigating to `/ar/reports` renders in RTL layout (`dir="rtl"`), presents localized Arabic labels (`إقرار ضريبة القيمة المضافة`), and clicking the link opens the localized VAT return form in RTL layout.
5. **AC5 (Ledger Reconciliation & Tenant Isolation)**: In `reports.e2e-spec.ts`, tenant A's draft reconciles with posted transactions (14% VAT on invoices and bills); tenant B's draft is strictly isolated and returns zero values; anonymous callers are rejected with HTTP 401.

---

## Verification Matrix

| AC ID   | Requirement Description                       | Test / Command                                                                                                                                               | Observed Result                                            | Exit Code | Status     |
| ------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- | --------- | ---------- |
| **AC1** | Draft endpoint authentication & figures       | `e2e-army/348-vat-return-draft.e2e.ts` (AC1)                                                                                                                 | 401 on anon; 200 with totals, label, currency, and arrays  | 0         | **PASSED** |
| **AC2** | Query parameter 400 validations               | `e2e-army/348-vat-return-draft.e2e.ts` (AC2)                                                                                                                 | 400 on missing params, inverted dates, and >366 day range  | 0         | **PASSED** |
| **AC3** | Reports page 'VAT Return' link & form         | `pnpm --filter @mizano/web test reports/page.spec.tsx`                                                                                                       | Renders 'Tax Reports' with link to `/tax/returns/generate` | 0         | **PASSED** |
| **AC4** | Arabic localization and RTL direction         | `e2e-army/348-vat-return-draft.e2e.ts` (AC4)                                                                                                                 | `document.documentElement.dir === 'rtl'` on `/ar`          | 0         | **PASSED** |
| **AC5** | Ledger reconciliation & isolation in E2E spec | `apps/api/test/reports.e2e-spec.ts`                                                                                                                          | Reconciles tenant A VAT; tenant B zeros; anon 401          | 0         | **PASSED** |
| —       | API Type-check                                | `pnpm --filter api type-check`                                                                                                                               | Clean (0 errors across tsc and e2e tsconfig)               | 0         | **PASSED** |
| —       | Web Type-check                                | `pnpm --filter @mizano/web type-check`                                                                                                                       | Clean (0 errors across web tsc)                            | 0         | **PASSED** |
| —       | API Lint                                      | `pnpm --filter api exec eslint src/modules/tax/controllers/vat-returns.controller.ts src/modules/tax/utils/vat-draft-calculator.ts test/reports.e2e-spec.ts` | Clean (0 errors, 0 warnings)                               | 0         | **PASSED** |
| —       | Web Lint                                      | `pnpm --filter @mizano/web lint`                                                                                                                             | Clean (0 errors)                                           | 0         | **PASSED** |
| —       | E2E Army Hygiene Script                       | `python3 scripts/test_e2e_army_hygiene.py`                                                                                                                   | 11/11 tests pass                                           | 0         | **PASSED** |
| —       | Evidence Freshness Script                     | `python3 scripts/test_evidence_freshness.py`                                                                                                                 | 10/10 tests pass                                           | 0         | **PASSED** |

---

## Bug Fix / Regression Demonstration

- **Base failure (PR #117 / finding `05a58c8ae2f6` and PR #350 verify finding)**:
  1. `apps/api/test/reports.e2e-spec.ts` had no E2E tests asserting reconciliation, validation, or tenant isolation for the VAT return draft endpoint.
  2. The web application reports dashboard (`/en/reports`) had no link or navigation for 'VAT Return', causing headless browser acceptance tests to fail with `locator.click: Timeout 15000ms exceeded` when attempting to click on 'VAT Return'.
- **Head resolution**:
  1. `apps/api/test/reports.e2e-spec.ts` now contains explicit E2E tests validating draft figures against tenant A's posted ledger (14% VAT invoices, bills, expenses), validating query parameter guards (400), verifying cross-tenant isolation (tenant B sees 0s), and ensuring anonymous callers are rejected (401).
  2. `apps/web/app/[locale]/(dashboard)/reports/page.tsx` now renders the 'Tax Reports' category containing the 'VAT Return' link pointing to `/tax/returns/generate`, complete with English and Arabic translations.
  3. Added `apps/web/app/[locale]/(dashboard)/reports/page.spec.tsx` verifying this navigation structure.
  4. Added `e2e-army/348-vat-return-draft.e2e.ts` AC3 and AC4 covering English navigation and Arabic RTL layout verification.

---

## Skills Used

- `systematic-debugging`: Identified root causes of PR #350 headless browser verification failure (missing 'VAT Return' link on `/reports`) and missing E2E test in `reports.e2e-spec.ts`.
- `test-first engineering`: Defined numbered acceptance criteria (AC1-AC5), constructed unit and e2e-army tests first, and implemented the minimal targeted solution.
- `verification-before-completion`: Ran typechecking across packages, ESLint on modified paths, unit tests, and hygiene test scripts, verifying 0 exit codes on all checks.
