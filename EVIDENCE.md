# EVIDENCE.md — Payslip PDF Generator (#115)

## Overview

- **Issue**: #115 (Payslip PDF generator from Mizano payroll data)
- **Branch**: `ai/115`
- **Tested Commit SHA**: `7a044ad`
- **Date**: 2026-10-17
- **Architecture & Protocol Note**:
  The core payslip PDF generator is an authenticated backend API endpoint (`GET /api/payslips/:id/pdf?lang=ar|en`), registered under `PayslipsController` (`@Controller('payslips')`).
  The frontend client (`apps/web/lib/hooks/use-documents.ts`) routes downloads directly to this endpoint via `documentsApi.getPayslipPdf`, and the payslip detail page (`apps/web/app/[locale]/(dashboard)/hr/payslips/[id]/page.tsx`) provides an interactive "Download PDF" action supporting Arabic and English RTL/LTR.

---

## Pinned Assets & Dependencies

| Asset / Package     | Version / Checksum                                                          | License / Source                      | Rationale                                                                    |
| ------------------- | --------------------------------------------------------------------------- | ------------------------------------- | ---------------------------------------------------------------------------- |
| `pdfkit`            | `0.15.0` (pinned)                                                           | MIT                                   | Pure JS, arm64 (Raspberry Pi 5) compatible, CPU-only, no native C++ bindings |
| `Amiri-Regular.ttf` | SHA-256: `ab391c4147d054c48976e98322ad0eefe1427aa0e0502a12a4c75d80a70cfcd7` | SIL Open Font License 1.1 (`OFL.txt`) | Embedded OpenType font with Arabic glyph shaping and Latin coverage          |
| `OFL.txt`           | SHA-256: `72de68e5954f4fdd24702292ef5a32f003ca960ec9330dc86e5eefb5dffb9b22` | SIL Open Font License 1.1             | Font license bundled in `apps/api/assets/fonts/`                             |

---

## Acceptance Criteria Verification Matrix

| REQ / AC | Requirement                                                                                                                                                                                                                       | Verification Method                                                                                              | Status     |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------- |
| **AC1**  | `GET /api/payslips/:id/pdf` returns valid PDF with `Content-Type: application/pdf`, `Content-Disposition: attachment; filename="payslip-<id>.pdf"`, and `Cache-Control: private, no-store` for authorized in-organization payslip | `test/payslip-pdf.e2e-spec.ts` (AC1) & `payslips.controller.spec.ts`                                             | **PASSED** |
| **AC2**  | `lang=ar` and `lang=en` both supported, default documented as `ar`, unsupported `lang` returns 400                                                                                                                                | `test/payslip-pdf.e2e-spec.ts` (AC2), `payslip-pdf.service.spec.ts`, and `e2e-army/115-payslip-pdf.e2e.ts` (AC2) | **PASSED** |
| **AC3**  | Decimal amounts appear exactly as stored decimal strings (up to 4 places, no float conversion, no unwanted re-rounding: e.g. `123.4567` stays, `12345.60` stays)                                                                  | `test/payslip-pdf.e2e-spec.ts` (AC3) & `payslip-pdf.service.spec.ts` (`formatDecimal`)                           | **PASSED** |
| **AC4**  | Output is byte-identical across repeated renders of identical input (deterministic PDF)                                                                                                                                           | `test/payslip-pdf.e2e-spec.ts` (AC4) & `payslip-pdf.service.spec.ts`                                             | **PASSED** |
| **AC5**  | Cross-organization, soft-deleted employee and invalid IDs return 404; unauthenticated returns 401                                                                                                                                 | `test/payslip-pdf.e2e-spec.ts` (AC5) & `e2e-army/115-payslip-pdf.e2e.ts` (AC1 & AC5)                             | **PASSED** |
| **AC6**  | Missing required data returns 422 with sanitized reason containing no secret values                                                                                                                                               | `test/payslip-pdf.e2e-spec.ts` (AC6) & `payslip-pdf.service.spec.ts`                                             | **PASSED** |
| **AC6b** | Valid zero-pay payslip (e.g., contractual basic salary equals loss of pay) or net=0 returns 200 with PDF                                                                                                                          | `test/payslip-pdf.e2e-spec.ts` (AC6b) & `payslip-pdf.service.spec.ts`                                            | **PASSED** |
| **AC7**  | Thrown render errors log only the exception type name and no raw message or secret salary data                                                                                                                                    | `test/payslip-pdf.e2e-spec.ts` (AC7) & `payslip-pdf.service.spec.ts`                                             | **PASSED** |
| **AC8**  | Synchronous, CPU-only execution capped strictly at 1 page for arm64 / Pi 5                                                                                                                                                        | `payslip-pdf.service.spec.ts` (asserts `numpages === 1` for 500-char org name and 40 items)                      | **PASSED** |
| **AC9**  | Uses `hr.view` permission so default roles (Manager, Accountant) can generate payslips                                                                                                                                            | `payslips.controller.spec.ts` (guards tested with default role permissions)                                      | **PASSED** |
| **AC10** | Uses canonical `baseCurrency` with fallback to legacy `currency` if null                                                                                                                                                          | `payslip-pdf.service.spec.ts`                                                                                    | **PASSED** |
| **AC11** | Interactive "Download PDF" action provided in web payslip page with Arabic/English RTL support                                                                                                                                    | `apps/web/app/[locale]/(dashboard)/hr/payslips/[id]/page.tsx` & `use-documents.spec.ts`                          | **PASSED** |

---

## Test Execution Evidence

### 1. API E2E Acceptance Suite (`apps/api/test/payslip-pdf.e2e-spec.ts`)

```bash
DATABASE_URL="postgresql://abdelrahmanahmed@localhost:5432/mizano_db?schema=public" REDIS_URL="" pnpm --filter api test:e2e test/payslip-pdf.e2e-spec.ts
```

```text
PASS test/payslip-pdf.e2e-spec.ts (12.357 s)
  Payslip PDF generator (e2e)
    ✓ @e2e @flow:payslip-pdf @issue-115 AC1: returns valid PDF for an authorized in-organization payslip (138 ms)
    ✓ @e2e @flow:payslip-pdf @issue-115 AC2: supports lang=ar and lang=en query parameters with documented default and rejects unsupported lang with 400 (363 ms)
    ✓ @e2e @flow:payslip-pdf @issue-115 AC3: amounts appear exactly as the stored decimal strings without float conversion or rounding (96 ms)
    ✓ @e2e @flow:payslip-pdf @issue-115 AC4: output is byte-identical across repeated renders of the same input (222 ms)
    ✓ @e2e @flow:payslip-pdf @issue-115 AC5: cross-organization, soft-deleted and invalid IDs return 404, unauthenticated returns 401 (22 ms)
    ✓ @e2e @flow:payslip-pdf @issue-115 AC6: missing required data returns 422 with a sanitized reason that contains no values (5 ms)
    ✓ @e2e @flow:payslip-pdf @issue-115 AC6b: a zero-pay payslip is valid and returns 200 with a PDF (86 ms)
    ✓ @e2e @flow:payslip-pdf @issue-115 AC7: thrown render errors log only the exception type name and no raw message or payslip data (3 ms)

Test Suites: 1 passed, 1 total
Tests:       8 passed, 8 total
Snapshots:   0 total
Time:        12.455 s
```

### 2. Unit Test Suites (`payslip-pdf.service.spec.ts` & `payslips.controller.spec.ts`)

```bash
pnpm --filter api exec jest src/modules/hr/services/payslip-pdf.service.spec.ts src/modules/hr/controllers/payslips.controller.spec.ts
```

```text
PASS src/modules/hr/controllers/payslips.controller.spec.ts
PASS src/modules/hr/services/payslip-pdf.service.spec.ts

Test Suites: 2 passed, 2 total
Tests:       33 passed, 33 total
Snapshots:   0 total
Time:        4.374 s
```

### 3. Web Hook Unit Test (`apps/web/lib/hooks/use-documents.spec.ts`)

```bash
pnpm --filter web test apps/web/lib/hooks/use-documents.spec.ts
```

```text
PASS lib/hooks/use-documents.spec.ts
  use-documents / documentsApi.getPayslipPdf
    ✓ calls /payslips/:id/pdf with ar default language and blob responseType (1 ms)
    ✓ calls /payslips/:id/pdf with specified lang=en

Test Suites: 1 passed, 1 total
Tests:       2 passed, 2 total
Snapshots:   0 total
Time:        0.394 s
```

### 4. TypeScript Type-Check & ESLint

```bash
pnpm --filter api type-check && pnpm --filter api lint
pnpm --filter web type-check && pnpm --filter web lint
```

Output: 0 errors across both packages.
