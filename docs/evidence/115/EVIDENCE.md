# EVIDENCE: Payslip PDF Generator (#115)

- **Issue**: #115 (Payslip PDF generator from Mizano payroll data)
- **Pull Request**: #118
- **Branch**: `ai/115`
- **Originating Sentry issue**: None (new feature)
- **Base Commit**: `origin/master` (`34da63d2`)

---

## Contract & Architecture

- **Endpoint**: `GET /api/payslips/:id/pdf?lang=ar|en`
- **Method & Semantics**: Idempotent read-only PDF document export (GET). Default `lang=ar`; rejects unsupported `lang` with 400.
- **Permission**: Protected with `@Permissions('hr.view')` so default roles (Manager, Accountant, Admin) receive authorized access.
- **Response Headers**:
  - `Content-Type: application/pdf`
  - `Content-Disposition: attachment; filename="payslip-<id>.pdf"`
  - `Cache-Control: private, no-store` (salary data never stored in shared/browser cache)
- **Frontend**: The payslip detail page (`/[locale]/hr/payslips/[id]`) renders the "Download PDF" (`تحميل PDF`) button with `data-testid="download-pdf-button"`. Supports both English and Arabic with full RTL support.

---

## Acceptance Criteria & Verification Matrix

| AC #     | Acceptance Criterion                                                                                                          | Verification Method / Spec                                                                                                                                      | Exit Code | Result |
| -------- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------ |
| **AC1**  | Authorized in-org payslip returns a valid PDF (`application/pdf`, attachment, no-store)                                       | `pnpm --filter api exec jest src/modules/hr/controllers/payslips.controller.spec.ts` ("generates a valid PDF buffer")                                           | 0         | PASSED |
| **AC2**  | Supports `lang=ar` and `lang=en`, defaults to `ar`, rejects other with 400                                                    | `pnpm --filter api exec jest src/modules/hr/services/payslip-pdf.service.spec.ts` ("throws BadRequestException for an unsupported language")                    | 0         | PASSED |
| **AC3**  | Exact decimal rendering: amounts appear exactly as stored (`123.4567`, `12345.60`) without float conversion or rounding       | `payslip-pdf.service.spec.ts` ("preserves a four-decimal stored amount")                                                                                        | 0         | PASSED |
| **AC4**  | Deterministic output: byte-identical PDF across repeated renders for identical input                                          | `payslip-pdf.service.spec.ts` ("produces byte-identical output across repeated renders")                                                                        | 0         | PASSED |
| **AC5**  | Multi-tenant isolation: other org, soft-deleted employee, or unknown ID returns 404                                           | `payroll.service.spec.ts`, `payslip-pdf.service.spec.ts` ("propagates NotFoundException ... cross-tenant"), e2e-army (`army-115-missing`)                       | 0         | PASSED |
| **AC6**  | Missing required data returns 422 with sanitized field name; valid zero-pay (`netSalary = 0`) returns 200 with PDF            | `payslip-pdf.service.spec.ts` ("throws UnprocessableEntityException ...", "renders a zero-pay payslip", "renders a net = 0 payslip")                            | 0         | PASSED |
| **AC7**  | Error logging sanitization: render exceptions log only the exception type name, never salary or employee data                 | `payslip-pdf.service.spec.ts` ("logs only the exception type name ...")                                                                                         | 0         | PASSED |
| **AC8**  | Single page constraint: long organization and employee names are constrained with ellipsis so PDF never wraps onto page 2     | `payslip-pdf.service.spec.ts` ("keeps one page for a 500-character organization name ...", `numpages === 1`)                                                    | 0         | PASSED |
| **AC9**  | Role permissions: accessible with `hr.view` (granted to default Manager, Accountant, Admin roles)                             | `payslips.controller.spec.ts` ("allows user with hr.view permission")                                                                                           | 0         | PASSED |
| **AC10** | Currency selection: uses `baseCurrency` with fallback to `currency`                                                           | `payslip-pdf.service.spec.ts` ("labels amounts with baseCurrency ...")                                                                                          | 0         | PASSED |
| **AC11** | Persisted payroll field reconciliation: allowances, deductions, taxes, and loss of pay map accurately to gross and net totals | `payslip-pdf.service.spec.ts` ("maps the fields calculatePayroll persists ...", "shows a stored total with no itemised deductions as one Other Deductions row") | 0         | PASSED |
| **AC12** | Bidirectional Arabic text layout: correct visual word and number ordering via `bidi-js`                                       | `payslip-pdf.service.spec.ts` (`visualRuns` specs, x-position specs on rendered ar/en pages)                                                                    | 0         | PASSED |
| **AC13** | Built runtime font discovery: resolves pinned fonts in both development and production (`dist/modules`, `dist/src/modules`)   | `payslip-pdf.service.spec.ts` (`getPinnedFontPath` specs)                                                                                                       | 0         | PASSED |
| **AC14** | Web document download client uses the new `/payslips/:id/pdf` route with `lang`                                               | `pnpm --filter web exec jest lib/hooks/use-documents.spec.ts`                                                                                                   | 0         | PASSED |

---

## Visual Verification (Playwright / PDF Renders)

- **Arabic (RTL) Payslip Render**: `docs/evidence/115/payslip-ar.png`
  - Reconciled right-to-left layout
  - Clean Arabic typography with Amiri font
  - Correct visual order for mixed Arabic and Latin runs (e.g., currency, dates)
- **English (LTR) Payslip Render**: `docs/evidence/115/payslip-en.png`
  - Left-to-right alignment
  - Formatted exact decimal columns for earnings and deductions

---

## Stable Seed Data for Verification & E2E

The test suite and verification environments use the following seeded entities (`apps/api/prisma/seed.ts`):

- `payslip-feb-2026-emp-001`: Standard authorized payslip in run `payroll-feb-2026`
- `test-id`: Standard authorized payslip in run `payroll-jan-2026`
- `valid-payslip-id`: Standard authorized payslip in run `payroll-jan-2026`
- `decimal-test-payslip-id`: 4-decimal precision payslip (`5500.1234` basic salary) in run `payroll-jan-2026`
- `zero-pay-id`: Zero-pay payslip (`0.00` net pay) in run `payroll-dec-2025`
- `army-115-missing`: Non-existent payslip ID used to assert 404 / "not found" behavior

---

## Test Commands and Observed Exit Codes

| Command                                                                      | Exit Code | Result Summary                                      |
| ---------------------------------------------------------------------------- | --------- | --------------------------------------------------- |
| `pnpm --filter api exec jest src/modules/hr --maxWorkers=2`                  | 0         | 3 test suites passed, 52 tests passed, 0 failed     |
| `pnpm --filter web exec jest lib/hooks/use-documents.spec.ts --maxWorkers=2` | 0         | 1 test suite passed, 2 tests passed, 0 failed       |
| `pnpm --filter api exec jest src/test/seed.guard.spec.ts`                    | 0         | 1 test suite passed, 12 tests passed, 0 failed      |
| `python3 scripts/test_no_conflict_markers.py`                                | 0         | 10 tests passed, 0 failed                           |
| `pnpm --filter api lint`                                                     | 0         | ESLint clean, 0 errors                              |
| `pnpm --filter api exec tsc --noEmit`                                        | 0         | TypeScript clean in all `hr/` and `payslip` modules |
| `pnpm --filter web exec tsc --noEmit`                                        | 0         | TypeScript clean across all web payslip pages       |
