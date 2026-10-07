# EVIDENCE.md — Payslip PDF Generator (#115)

## Overview

- **Issue**: #115 (Payslip PDF generator from Mizano payroll data)
- **Tested Commit SHA**: `1065a29fa5998c0afc33ca002c1c21f308a8b164`
- **Branch**: `ai/115`
- **Date**: 2026-10-08

---

## Pinned Assets & Dependencies

| Asset / Package     | Version / Checksum                                                          | License / Source                      | Rationale                                                                    |
| ------------------- | --------------------------------------------------------------------------- | ------------------------------------- | ---------------------------------------------------------------------------- |
| `pdfkit`            | `0.15.0` (pinned)                                                           | MIT                                   | Pure JS, arm64 (Raspberry Pi 5) compatible, CPU-only, no native C++ bindings |
| `Amiri-Regular.ttf` | SHA-256: `ab391c4147d054c48976e98322ad0eefe1427aa0e0502a12a4c75d80a70cfcd7` | SIL Open Font License 1.1 (`OFL.txt`) | Embedded OpenType font with Arabic glyph shaping and Latin coverage          |
| `OFL.txt`           | SHA-256: `72de68e5954f4fdd24702292ef5a32f003ca960ec9330dc86e5eefb5dffb9b22` | SIL Open Font License 1.1             | Font license bundled in `apps/api/assets/fonts/`                             |

---

## Acceptance Criteria Verification Matrix

| REQ / AC | Requirement                                                                                                                              | Verification Method                                                | Status     |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ---------- |
| **AC1**  | `GET /payslips/:id/pdf` returns valid PDF with `Content-Type: application/pdf` for authorized in-organization payslip                    | `test/payslip-pdf.e2e-spec.ts` AC1                                 | **PASSED** |
| **AC2**  | `lang=ar` and `lang=en` both work, default documented as `ar`, unsupported `lang` returns 400                                            | `test/payslip-pdf.e2e-spec.ts` AC2 & `payslip-pdf.service.spec.ts` | **PASSED** |
| **AC3**  | Amounts appear exactly as stored decimal strings (`12345.60` not `12345.6`, no float conversion, no re-rounding)                         | `test/payslip-pdf.e2e-spec.ts` AC3 & `payslip-pdf.service.spec.ts` | **PASSED** |
| **AC4**  | Output is byte-identical across repeated renders of identical input (deterministic PDF)                                                  | `test/payslip-pdf.e2e-spec.ts` AC4 & `payslip-pdf.service.spec.ts` | **PASSED** |
| **AC5**  | Cross-organization, soft-deleted employee and invalid IDs return 404; unauthenticated returns 401                                        | `test/payslip-pdf.e2e-spec.ts` AC5                                 | **PASSED** |
| **AC6**  | Missing required data returns 422 with sanitized reason containing no values                                                             | `test/payslip-pdf.e2e-spec.ts` AC6 & `payslip-pdf.service.spec.ts` | **PASSED** |
| **AC7**  | Error logging uses Nest `Logger` with `describeError(error, { includeMessage: false })`, no `console.error`, no payslip contents in logs | `payslip-pdf.service.spec.ts` & `payslip-pdf.e2e-spec.ts` AC7      | **PASSED** |
| **AC8**  | Synchronous, CPU-only execution capped strictly at 1 page for arm64 / Pi 5                                                               | `payslip-pdf.service.spec.ts` (caps page count at 1)               | **PASSED** |

---

## Test Execution Evidence

### 1. E2E Acceptance Suite (`apps/api/test/payslip-pdf.e2e-spec.ts`)

```bash
DATABASE_URL="postgresql://abdelrahmanahmed@localhost:5432/mizano_db?schema=public" REDIS_URL="" pnpm --filter api test:e2e test/payslip-pdf.e2e-spec.ts
```

```text
PASS test/payslip-pdf.e2e-spec.ts
  Payslip PDF generator (e2e)
    ✓ @e2e @flow:payslip-pdf @issue-115 AC1: returns valid PDF for an authorized in-organization payslip (108 ms)
    ✓ @e2e @flow:payslip-pdf @issue-115 AC2: supports lang=ar and lang=en query parameters with documented default and rejects unsupported lang with 400 (310 ms)
    ✓ @e2e @flow:payslip-pdf @issue-115 AC3: amounts appear exactly as the stored decimal strings without float conversion or rounding (88 ms)
    ✓ @e2e @flow:payslip-pdf @issue-115 AC4: output is byte-identical across repeated renders of the same input (169 ms)
    ✓ @e2e @flow:payslip-pdf @issue-115 AC5: cross-organization, soft-deleted and invalid IDs return 404, unauthenticated returns 401 (16 ms)
    ✓ @e2e @flow:payslip-pdf @issue-115 AC6: missing required data returns 422 with a sanitized reason that contains no values (5 ms)
    ✓ @e2e @flow:payslip-pdf @issue-115 AC7: thrown render errors log only the exception type name and no raw message or payslip data (3 ms)

Test Suites: 1 passed, 1 total
Tests:       7 passed, 7 total
Snapshots:   0 total
Time:        4.194 s
```

### 2. Unit Test Suite (`apps/api/src/modules/hr/services/payslip-pdf.service.spec.ts`)

```bash
pnpm --filter api test src/modules/hr/services/payslip-pdf.service.spec.ts
```

```text
PASS src/modules/hr/services/payslip-pdf.service.spec.ts
  PayslipPdfService & renderPayslipPdf
    renderPayslipPdf (pure function)
      ✓ produces a buffer starting with %PDF (64 ms)
      ✓ produces byte-identical output across repeated renders of identical input (200 ms)
      ✓ renders exact decimal strings without float conversion or rounding (e.g. 12345.60 not 12345.6) (105 ms)
      ✓ renders English labels in en mode (53 ms)
      ✓ renders Arabic labels and shapes Arabic glyphs in ar mode with RTL alignment (52 ms)
      ✓ strictly caps the page count at 1 page for CPU efficiency on arm64/Pi 5 (99 ms)
      ✓ handles long employee names without crashing or overflowing page boundary (51 ms)
      ✓ handles zero or negative deductions without crashing or layout breaks (142 ms)
    PayslipPdfService
      ✓ generates a valid PDF buffer for an authorized in-organization payslip (45 ms)
      ✓ throws BadRequestException for an unsupported language (11 ms)
      ✓ propagates NotFoundException when payslip does not belong to organization (cross-tenant 404)
      ✓ throws NotFoundException when organization is not found
      ✓ throws UnprocessableEntityException when required basicSalary is missing or zero, containing no values in error reason (1 ms)
      ✓ throws UnprocessableEntityException when employee name is missing
      ✓ logs only the exception type name and no raw message or payslip payload on render error

Test Suites: 1 passed, 1 total
Tests:       15 passed, 15 total
Snapshots:   0 total
Time:        3.319 s
```

### 3. TypeScript Type-Check & ESLint

```bash
pnpm --filter api type-check && pnpm --filter api lint
```

```text
> api@0.1.0 type-check /Users/abdelrahmanahmed/agents/work/impl/Mizano-115/apps/api
> tsc --noEmit && tsc --noEmit -p test/tsconfig.e2e.json

> api@0.1.0 lint /Users/abdelrahmanahmed/agents/work/impl/Mizano-115/apps/api
> eslint "{src,apps,libs,test}/**/*.ts"
```

Output: 0 errors, 0 warnings.

### 4. NestJS Production Build

```bash
pnpm --filter api build
```

```text
> api@0.1.0 build /Users/abdelrahmanahmed/agents/work/impl/Mizano-115/apps/api
> nest build

-  TSC  Initializing type checker...
✔  TSC  Initializing type checker...
>  TSC  Found 0 issues.
>  SWC  Running...
Successfully compiled: 654 files with swc (192.96ms)
```

Output: 0 issues, compiled 654 files.
