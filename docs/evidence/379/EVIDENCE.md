# Evidence: Issue #379 — Localize BillForm Action Buttons & Form Labels and Verify RTL Content

## Overview

- **Issue**: #379 (`fix: qa finding: (non-blocking) [p2] e2e-army/317-searchable-bill-options.e2e.ts:47: T… (split from #340)`)
- **PR**: #413 (Stack layer 3: PR #433)
- **Supersedes part of**: PR #340 (findings `725f701a4546`, `e2e-army/317-searchable-bill-options.e2e.ts:47`, `e2e-army/317-searchable-bill-options.e2e.ts:48`, and `apps/web/components/purchases/bill-form.spec.tsx:519`)
- **Base Commit**: `5a0839681b202880be79c3975cde8091b95794c5` (branch `ai/379` off `master` `e5d9b8053a25121bc6a74bbf3192f153f31741ca`)
- **Tested Commit**: `4b32693975999376114f93d4f4b90279c550811b`
- **Originating Sentry Issue**: None (split QA/CodeRabbit review findings on PR #340 and PR #413).
- **User-facing flow / E2E**: Feature E2E in `e2e-army/379-bill-rtl-content.e2e.ts` (`feat:mz-purchase-bills`, `lvl:ui`).

---

## Changed Covering Tests

- `e2e-army/379-bill-rtl-content.e2e.ts`: Natural language E2E test covering computed RTL direction (`direction: 'rtl'`), document direction (`dir="rtl"`), canonical Arabic terminology, and isolated shared login helper with fail-fast skip when credentials are unset.
- `apps/web/components/purchases/bill-form.spec.tsx`: React component unit test suite verifying localized buttons in EN and AR, editing states, and saving states (4/4 passing).
- `apps/web/components/purchases/bill-form.rtl.spec.tsx`: Unit tests verifying English and Arabic action buttons ('Create Bill' / 'Update Bill' / 'Cancel' vs 'إنشاء فاتورة' / 'تحديث الفاتورة' / 'إلغاء') and form labels ('Vendor' / 'Bill Date' / 'Due Date' vs 'المورد' / 'تاريخ الفاتورة' / 'تاريخ الاستحقاق').
- `apps/web/components/purchases/bill-form.scan.spec.tsx`: Existing scan review unit tests verifying zero regressions on totals, discrepancies, and multi-decimal inputs (5/5 tests passing).
- `docs/agents/review-lessons.md`: Added Web UI review lesson documenting requirement to verify computed RTL direction/styles and localized form action buttons.
- `scripts/test_e2e_army_hygiene.py`: Automated hygiene regression tests ensuring `379-bill-rtl-content.e2e.ts` contains no hardcoded credentials or string-splitting fallbacks (12/12 passing).
- `scripts/test_evidence_freshness.py`: Contract test `test_issue_379_evidence_contract` verifying AC1-AC5, exit codes, and tested head binding.

---

## Numbered Acceptance Criteria

1. **AC1 (RTL Direction and Alignment)**: The bill-form page (`/ar/purchases/bills/new`) renders in RTL mode with document-level `dir="rtl"` and form-level computed styles (`direction: 'rtl'`), and renders localized action buttons ('إنشاء فاتورة' and 'إلغاء') instead of hardcoded English buttons.
2. **AC2 (Canonical Arabic Terminology)**: Canonical Arabic labels from `purchases.json` ('المورد' for Vendor, 'تاريخ الفاتورة' for Bill Date, and 'تاريخ الاستحقاق' for Due Date) are rendered with accessible asterisk markers, matching the localized terminology without hardcoded English fallbacks.
3. **AC3 (Edit Mode & Cancel Button Localization)**: In edit mode, the submit button is localized to 'Update Bill' in English and 'تحديث الفاتورة' in Arabic (`updateBill`), and the cancel button is localized to 'Cancel' in English and 'إلغاء' in Arabic (`cancel`).
4. **AC4 (E2E Test Auth Guard & Hygiene)**: `e2e-army/379-bill-rtl-content.e2e.ts` uses a shared authenticated login helper for all test scenarios, safely skips execution when credentials are not configured rather than failing silently, and avoids hardcoded or split-string plaintext credentials.
5. **AC5 (Automated Hygiene & Verification)**: `scripts/test_e2e_army_hygiene.py` includes `test_379_e2e_no_hardcoded_credentials` ensuring no hardcoded passwords or evasive string-splitting fallbacks exist in `e2e-army/379-bill-rtl-content.e2e.ts`.

---

## Verification Matrix

| AC ID   | Requirement Description                                         | Test / Command                                                                                                     | Observed Result                                                                    | Exit Code | Status     |
| ------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- | --------- | ---------- |
| **AC1** | RTL computed styles and localized create/cancel buttons         | `pnpm --filter web test apps/web/components/purchases/bill-form.rtl.spec.tsx -t "renders localized Arabic action"` | 1 test PASS (`'إنشاء فاتورة'` and `'إلغاء'` rendered)                              | 0         | **PASSED** |
| **AC1** | RTL and English action buttons & form headers in bill-form.spec | `pnpm --filter web test apps/web/components/purchases/bill-form.spec.tsx`                                          | 4/4 tests PASS (Create/Update/Cancel/Saving in EN & AR)                            | 0         | **PASSED** |
| **AC2** | Canonical Arabic labels match purchases.json                    | `pnpm --filter web test apps/web/components/purchases/bill-form.rtl.spec.tsx -t "canonical form labels in ar"`     | 1 test PASS (`'المورد'`, `'تاريخ الفاتورة'`, `'تاريخ الاستحقاق'` found)            | 0         | **PASSED** |
| **AC3** | Edit mode submit button localization (EN & AR)                  | `pnpm --filter web test apps/web/components/purchases/bill-form.rtl.spec.tsx -t "renders localized update button"` | 1 test PASS (`'Update Bill'` in EN, `'تحديث الفاتورة'` in AR)                      | 0         | **PASSED** |
| **AC3** | English locale renders English labels and buttons               | `pnpm --filter web test apps/web/components/purchases/bill-form.rtl.spec.tsx -t "renders English action buttons"`  | 1 test PASS (`'Create Bill'`, `'Cancel'`, `'Vendor'`, `'Bill Date'`, `'Due Date'`) | 0         | **PASSED** |
| **AC4** | E2E test hygiene and shared login without hardcoded credentials | `python3 -m unittest discover -s scripts -p 'test_e2e_army_hygiene.py' -k 'test_379_e2e_no_hardcoded_credentials'` | 1 test PASS (no plaintext `password123` or `.join()` splitting)                    | 0         | **PASSED** |
| **AC5** | Full e2e-army hygiene test suite                                | `python3 -m unittest discover -s scripts -p 'test_e2e_army_hygiene.py'`                                            | 12/12 unit tests PASS                                                              | 0         | **PASSED** |
| **AC1** | No regressions on existing BillForm scan unit tests             | `pnpm --filter web test apps/web/components/purchases/bill-form.scan.spec.tsx`                                     | 5/5 unit tests PASS                                                                | 0         | **PASSED** |
| **ALL** | TypeScript type-check across web package                        | `pnpm --filter web type-check`                                                                                     | Clean (0 errors across `tsc --noEmit`)                                             | 0         | **PASSED** |
| **ALL** | Next.js lint across web package                                 | `pnpm --filter web lint`                                                                                           | Clean (0 errors across `next lint`)                                                | 0         | **PASSED** |

---

## Bug Fix / Regression Demonstration

- **Base behaviour on master / `bf3f67a` / `5a08396`**:
  - `apps/web/components/purchases/bill-form.tsx` had hardcoded English submit and cancel buttons (`'Cancel'`, `'Create Bill'`, `'Update Bill'`) and hardcoded English form labels (`'Vendor *'`, `'Bill Date *'`, `'Due Date *'`).
  - Running `apps/web/components/purchases/bill-form.rtl.spec.tsx` or `bill-form.spec.tsx` against base failed:
    ```
    TestingLibraryElementError: Unable to find an accessible element with the role "button" and name "إنشاء فاتورة"
    TestingLibraryElementError: Unable to find an accessible element with the role "button" and name "تحديث الفاتورة"
    TestingLibraryElementError: Unable to find an element with the text: Vendor
    Exit status 1
    ```
- **Head behaviour**:
  - `apps/web/messages/en/purchases.json` and `apps/web/messages/ar/purchases.json` contain the canonical translations under `purchases.bills.form` (`billInfo`, `vendor`, `date`, `dueDate`, `reference`, `currency`, `notes`, `lineItems`, `addLine`, `subtotal`, `tax`, `total`, `cancel`, `createBill`, `updateBill`, `saving`).
  - `BillForm` consumes `useTranslations('purchases.bills.form')` for labels and actions.
  - All tests in `apps/web/components/purchases/bill-form.rtl.spec.tsx` and `bill-form.spec.tsx` pass cleanly with exit code 0.

---

## UI Verification (Screenshots / RTL & LTR)

- **RTL and LTR Support**:
  - Form layout supports both LTR (`en`) and RTL (`ar`) locales seamlessly.
  - In `apps/web/components/purchases/bill-form.rtl.spec.tsx` and `bill-form.spec.tsx`, both `mockLocale = 'en'` and `mockLocale = 'ar'` are exercised.
  - In `e2e-army/379-bill-rtl-content.e2e.ts`, Playwright browser evaluations check `document.documentElement.dir === 'rtl'` and `window.getComputedStyle(form).direction === 'rtl'`.
  - Action buttons (`Button variant="outline"` for Cancel and `Button type="submit"` for Create/Update) render with localized copy.

---

## Skills Used

- `systematic-debugging`: Traced CodeRabbit review findings on PR #413 and isolated hardcoded English text in `BillForm`.
- `tdd`: Added regression tests in `bill-form.rtl.spec.tsx` and `bill-form.spec.tsx` reproducing the exact failure before updating implementation.
- `verification-before-completion`: Executed all local test runners, TypeScript typecheckers, and linters, verifying exit code 0 and recording exact outputs.
