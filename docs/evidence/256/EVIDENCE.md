# EVIDENCE.md — Payslip PDF Generator (#256 / #115)

## Overview

- **Issue**: #256 (Fresh restart of #115: Payslip PDF generator from Mizano payroll data, replaces #118)
- **Supersedes**: PR #118
- **Closes**: #115
- **Tested Commit SHA**: `e0f45959dc02f8b53a3d844810371086b60eac62`
- **Branch**: `ai/256`
- **Date**: 2026-10-20

---

## Pinned Assets & Dependencies

| Asset / Package     | Version / Checksum                                                          | License / Source                      | Rationale                                                                     |
| ------------------- | --------------------------------------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------- |
| `pdfkit`            | `0.15.0` (pinned)                                                           | MIT                                   | Pure JS, arm64 (Raspberry Pi 5) compatible, CPU-only, no native C++ bindings  |
| `bidi-js`           | `1.1.0` (pinned)                                                            | MIT                                   | Unicode bidirectional algorithm (Rule L2) for exact Arabic/Latin run ordering |
| `Amiri-Regular.ttf` | SHA-256: `ab391c4147d054c48976e98322ad0eefe1427aa0e0502a12a4c75d80a70cfcd7` | SIL Open Font License 1.1 (`OFL.txt`) | Embedded OpenType font with Arabic glyph shaping and Latin coverage           |
| `OFL.txt`           | SHA-256: `72de68e5954f4fdd24702292ef5a32f003ca960ec9330dc86e5eefb5dffb9b22` | SIL Open Font License 1.1             | Font license bundled in `apps/api/assets/fonts/`                              |

---

## Acceptance Criteria Verification Matrix

| REQ / AC | Requirement                                                                                                                              | Verification Method                                                   | Status     |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ---------- |
| **AC1**  | `GET /payslips/:id/pdf` returns valid PDF with `Content-Type: application/pdf` for authorized in-organization payslip                    | `test/payslip-pdf.e2e-spec.ts` AC1                                    | **PASSED** |
| **AC2**  | `lang=ar` and `lang=en` both work, default documented as `ar`, unsupported `lang` returns 400                                            | `test/payslip-pdf.e2e-spec.ts` AC2 & `payslip-pdf.service.spec.ts`    | **PASSED** |
| **AC3**  | Amounts appear exactly as stored decimal strings (`12345.60` not `12345.6`, no float conversion, no re-rounding)                         | `test/payslip-pdf.e2e-spec.ts` AC3 & `payslip-pdf.service.spec.ts`    | **PASSED** |
| **AC4**  | Output is byte-identical across repeated renders of identical input (deterministic PDF)                                                  | `test/payslip-pdf.e2e-spec.ts` AC4 & `payslip-pdf.service.spec.ts`    | **PASSED** |
| **AC5**  | Cross-organization, soft-deleted employee and invalid IDs return 404; unauthenticated returns 401                                        | `test/payslip-pdf.e2e-spec.ts` AC5                                    | **PASSED** |
| **AC6**  | Missing required data returns 422 with sanitized reason containing no values; zero-pay is valid                                          | `test/payslip-pdf.e2e-spec.ts` AC6 & `payslip-pdf.service.spec.ts`    | **PASSED** |
| **AC7**  | Error logging uses Nest `Logger` with `describeError(error, { includeMessage: false })`, no `console.error`, no payslip contents in logs | `payslip-pdf.service.spec.ts` & `payslip-pdf.e2e-spec.ts` AC7         | **PASSED** |
| **AC8**  | Synchronous, CPU-only execution capped strictly at 1 page for arm64 / Pi 5                                                               | `payslip-pdf.service.spec.ts` (caps page count at 1)                  | **PASSED** |
| **AC9**  | Web UI provides Download PDF button with RTL/LTR localization and `data-testid="download-pdf-button"`                                    | `apps/web/lib/hooks/use-documents.spec.ts` & `256-payslip-pdf.e2e.ts` | **PASSED** |

---

## Visual Verification Artifacts

- Arabic RTL PDF Rendering: `docs/evidence/256/payslip-ar.png`
- English LTR PDF Rendering: `docs/evidence/256/payslip-en.png`

---

## Test Execution Evidence

### 1. E2E Acceptance Suite (`apps/api/test/payslip-pdf.e2e-spec.ts`)

```bash
DATABASE_URL="postgresql://abdelrahmanahmed@localhost:5432/mizano_db?schema=public" pnpm --filter api test:e2e test/payslip-pdf.e2e-spec.ts
```

```text
PASS test/payslip-pdf.e2e-spec.ts (20.926 s)
  Payslip PDF generator (e2e)
    ✓ @e2e @flow:payslip-pdf @issue-115 AC1: returns valid PDF for an authorized in-organization payslip (651 ms)
    ✓ @e2e @flow:payslip-pdf @issue-115 AC2: supports lang=ar and lang=en query parameters with documented default and rejects unsupported lang with 400 (816 ms)
    ✓ @e2e @flow:payslip-pdf @issue-115 AC3: amounts appear exactly as the stored decimal strings without float conversion or rounding (169 ms)
    ✓ @e2e @flow:payslip-pdf @issue-115 AC4: output is byte-identical across repeated renders of the same input (475 ms)
    ✓ @e2e @flow:payslip-pdf @issue-115 AC5: cross-organization, soft-deleted and invalid IDs return 404, unauthenticated returns 401 (132 ms)
    ✓ @e2e @flow:payslip-pdf @issue-115 AC6: missing required data returns 422 with a sanitized reason that contains no values (11 ms)
    ✓ @e2e @flow:payslip-pdf @issue-115 AC6b: a zero-pay payslip is valid and returns 200 with a PDF (111 ms)
    ✓ @e2e @flow:payslip-pdf @issue-115 AC7: thrown render errors log only the exception type name and no raw message or payslip data (3 ms)

Test Suites: 1 passed, 1 total
Tests:       8 passed, 8 total
Snapshots:   0 total
Time:        21.136 s
```

Exit code: 0

### 2. Service Unit Test Suite (`apps/api/src/modules/hr/services/payslip-pdf.service.spec.ts`)

```bash
pnpm --filter api exec jest src/modules/hr/services/payslip-pdf.service.spec.ts
```

```text
PASS src/modules/hr/services/payslip-pdf.service.spec.ts
  PayslipPdfService & renderPayslipPdf
    renderPayslipPdf (pure function)
      ✓ produces a buffer starting with %PDF (52 ms)
      ✓ produces byte-identical output across repeated renders of identical input (157 ms)
      ✓ renders exact decimal strings without float conversion or rounding (e.g. 12345.60 not 12345.6) (74 ms)
      ✓ renders English labels in en mode (37 ms)
      ✓ renders Arabic labels and shapes Arabic glyphs in ar mode with RTL alignment (44 ms)
      ✓ strictly caps the page count at 1 page for CPU efficiency on arm64/Pi 5 (78 ms)
      ✓ handles long employee names without crashing or overflowing page boundary (38 ms)
      ✓ handles zero or negative deductions without crashing or layout breaks (118 ms)
      ✓ keeps one page for a 500-character organization name and over-long line items (354 ms)
      ✓ keeps Arabic labels and Latin numbers as separate runs for a mixed 10/2026 and 123.45 EGP string (77 ms)
    bidi layout
      ✓ orders runs visually: an RTL line puts the digits left of the Arabic label
      ✓ orders mixed Arabic/Latin/digits by the Unicode bidi algorithm in an RTL line
      ✓ keeps a leading minus attached to its digits when the amount is laid out LTR
      ✓ keeps plain LTR and empty text untouched
      ✓ places values left of their Arabic labels on the rendered ar page (81 ms)
      ✓ keeps the labels left of the values on the rendered en page (52 ms)
    formatDecimal
      ✓ formats 123.4567 as 123.4567 without losing stored decimal places (1 ms)
      ✓ formats 12345.6000 as 12345.60 without losing stored decimal places
      ✓ formats 100 as 100.00 without losing stored decimal places
      ✓ formats 0 as 0.00 without losing stored decimal places
      ✓ formats -200 as -200.00 without losing stored decimal places
      ✓ formats 1500.5 as 1500.50 without losing stored decimal places
      ✓ formats 0.1250 as 0.125 without losing stored decimal places
    PayslipPdfService
      ✓ generates a valid PDF buffer for an authorized in-organization payslip (129 ms)
      ✓ throws BadRequestException for an unsupported language (17 ms)
      ✓ propagates NotFoundException when payslip does not belong to organization (cross-tenant 404) (1 ms)
      ✓ throws NotFoundException when organization is not found
      ✓ throws UnprocessableEntityException with a value-free reason when basicSalary is absent
      ✓ renders a zero-pay payslip (loss of pay equals basic salary) with 200-equivalent output (74 ms)
      ✓ renders a net = 0 payslip when deductions equal gross (59 ms)
      ✓ maps the fields calculatePayroll persists so net = gross - deductions reconciles (53 ms)
      ✓ shows a stored total with no itemised deductions as one "Other Deductions" row (51 ms)
      ✓ reconciles a payslip whose total column is 0 from gross - net (62 ms)
      ✓ does not list a figure twice when the snapshot columns and the JSON hold the same data (seed shape) (48 ms)
      ✓ shows earnings the line items do not explain as one "Other Earnings" row (51 ms)
      ✓ preserves a four-decimal stored amount (123.4567 is not rounded to 123.46) (80 ms)
      ✓ labels amounts with baseCurrency and falls back to the legacy currency only when it is null (154 ms)
      ✓ throws UnprocessableEntityException when employee name is missing (1 ms)
      ✓ logs only the exception type name and no raw message or payslip payload on render error
      getPinnedFontPath
        ✓ resolves an existing font file on disk
        ✓ finds the font copied by nest build next to a dist/modules layout (2 ms)
        ✓ finds the font copied by nest build next to a dist/src/modules layout (7 ms)
        ✓ throws when the font is in none of the candidate locations (1 ms)

Test Suites: 1 passed, 1 total
Tests:       43 passed, 43 total
Snapshots:   0 total
Time:        4.246 s
```

Exit code: 0

### 3. Controller Unit Test Suite (`apps/api/src/modules/hr/controllers/payslips.controller.spec.ts`)

```bash
pnpm --filter api exec jest src/modules/hr/controllers/payslips.controller.spec.ts
```

```text
PASS src/modules/hr/controllers/payslips.controller.spec.ts
  PayslipsController
    ✓ streams the PDF as a private, uncached attachment (2 ms)
    permission with the real PermissionsGuard
      ✓ lets a Manager/Accountant with the default hr.view permission download (no payroll module needed)
      ✓ rejects a role without hr.view with 403 (3 ms)

Test Suites: 1 passed, 1 total
Tests:       3 passed, 3 total
Snapshots:   0 total
Time:        3.01 s
```

Exit code: 0

### 4. Web Client Unit Test Suite (`apps/web/lib/hooks/use-documents.spec.ts`)

```bash
pnpm --filter web test lib/hooks/use-documents.spec.ts
```

```text
PASS lib/hooks/use-documents.spec.ts
  use-documents / documentsApi.getPayslipPdf
    ✓ calls /payslips/:id/pdf with ar default language and blob responseType (1 ms)
    ✓ calls /payslips/:id/pdf with specified lang=en (1 ms)

Test Suites: 1 passed, 1 total
Tests:       2 passed, 2 total
Snapshots:   0 total
Time:        0.41 s
```

Exit code: 0

### 5. Markdown Conflict Marker Guard Test

```bash
nice -n 10 python3 -m unittest discover -s scripts -p 'test_no_conflict_markers.py' -v
```

```text
Ran 10 tests in 0.061s

OK
```

Exit code: 0
