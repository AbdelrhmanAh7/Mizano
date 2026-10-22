# Evidence for Issue #370: Fix Employee Type Definition and JobTitle / Position Support in Payslip Template

This document provides verification evidence for GitHub issue #370 in `AbdelrhmanAh7/Mizano` (split from PR #305, item `finding:1dd672bf5a3d`, parent issue #256).

- **Issue**: [#370](https://github.com/AbdelrhmanAh7/Mizano/issues/370)
- **PR**: Supersedes part of #305
- **Parent Issue**: #256
- **Base Commit (`origin/master`)**: `e5d9b805563c04df3300f00442fd18f7d82ce560`
- **Tested Head Commit**: `e16aaae52c2feb6487a3d876b6bf6c2bff25b898`
- **Tested Branch**: `ai/370`
- **Originating Sentry Issue**: None (originates from review discussion `r4332462811` on PR #305 / parent issue #256).
- **Host Environment**: Darwin arm64 (macOS), Node.js v20.18.0, pnpm 8.14.0, Python 3.14.8.
- **User-facing flow / E2E**: Not user-facing (`E2E: not needed — internal payslip template employee type definition and jobTitle/position mapping; no user-facing flows modified.`).
- **Skills Used**: `model-effort-routing`, `systematic-debugging`, `test-first`, `verification-before-completion`.
- **Model and Effort**: `Tool: Antigravity (agy) · Model: Gemini 3.8 Flash · Effort: High · Why: Fix employee type definition for payslip data, unit and hygiene tests, and verification report for issue #370`.

---

## Context & Finding Summary

In PR #305 (split from parent issue #256: Payslip PDF generator from Mizano payroll data), code review finding `1dd672bf5a3d` (discussion `r4332462811`) flagged:

> **major** (glm): The code uses `payslip.employee.position ?? payslip.employee.jobTitle` but the employee type definition doesn't show `jobTitle` as a valid property.

### Investigation & Root Cause

Per repository review guidelines, review findings and paths are treated as untrusted data until verified against the repository code.

1. The file `payslip-pdf.service.ts` was introduced on the parent branch `ai/256` (PR #305) and never merged to `master`.
2. Inspecting `master`, the canonical payslip PDF rendering types and services are located in:
   - `apps/api/src/modules/documents/templates/payslip.template.ts`
   - `apps/api/src/modules/documents/services/pdf.service.ts`
3. In `apps/api/src/modules/documents/templates/payslip.template.ts`, the `PayslipData.employee` interface only declared `position?: string;` and was missing `jobTitle?: string;`.
4. Furthermore, `generatePayslipHtml` only evaluated `if (payslip.employee.position)`, omitting the position row when an employee record provided `jobTitle` (the canonical field in Prisma schema `model Employee`) rather than `position`.
5. In `apps/api/src/modules/documents/services/pdf.service.ts`, line 298 mapped `position: payslip.employee.position || payslip.employee.jobTitle || undefined`, but did not supply `jobTitle` to `PayslipData.employee` because the type definition lacked the property.

### Resolution

1. Added `jobTitle?: string;` to `PayslipData['employee']` in `apps/api/src/modules/documents/templates/payslip.template.ts`.
2. Updated `generatePayslipHtml` in `payslip.template.ts` to evaluate `payslip.employee.position || payslip.employee.jobTitle`, rendering whichever title property is populated with safe HTML escaping.
3. Updated `PdfService.generatePayslipPdf` in `apps/api/src/modules/documents/services/pdf.service.ts` to map both `position` and `jobTitle` cleanly.
4. Added comprehensive unit tests in `apps/api/src/modules/documents/templates/payslip.template.spec.ts` covering:
   - Rendering Position when only `jobTitle` is provided.
   - Rendering Position when only `position` is provided.
   - Preferring `position` when both are provided.
   - Safely omitting the row when neither is provided.
   - HTML escaping of malicious inputs in `jobTitle`.
5. Added unit tests in `apps/api/src/modules/documents/services/pdf.service.spec.ts` covering `generatePayslipPdf` employee `jobTitle` fallback and precedence.
6. Created `scripts/test_employee_jobtitle_position.py` ensuring type consistency across payslip templates, shared-types, frontend hooks, and Prisma schema.
7. Added contract test `test_issue_370_evidence_contract` in `scripts/test_evidence_freshness.py`.

---

## Numbered Acceptance Criteria

- **AC1 (PayslipData Employee Type Definition)**: `PayslipData.employee` in `apps/api/src/modules/documents/templates/payslip.template.ts` explicitly declares `jobTitle?: string;` as a valid property alongside `position?: string;`.
- **AC2 (HTML Template Fallback Rendering)**: `generatePayslipHtml` displays the employee's title when either `position` or `jobTitle` is provided, preferring `position` if both exist and escaping HTML entities safely.
- **AC3 (PdfService Mapping)**: `PdfService.generatePayslipPdf` passes both `position` and `jobTitle` to the payslip template data so downstream consumers can access both properties.
- **AC4 (Cross-Codebase Type Hygiene Guard)**: `scripts/test_employee_jobtitle_position.py` validates that employee types across `payslip.template.ts`, `packages/shared-types/src/entities/hr.ts`, `apps/web/lib/hooks/use-hr.ts`, and `prisma/schema.prisma` consistently include `jobTitle` and `position`.
- **AC5 (Automated Evidence & Contract Verification)**: All unit tests, freshness tests, and type-checks pass cleanly with exit code 0.

---

## Verification Report

| AC ID   | Requirement                                        | Command                                                                                         | Observed Result | Exit Code | Status     |
| :------ | :------------------------------------------------- | :---------------------------------------------------------------------------------------------- | :-------------- | :-------- | :--------- |
| **AC1** | PayslipData employee interface includes `jobTitle` | `pnpm --filter api exec jest apps/api/src/modules/documents/templates/payslip.template.spec.ts` | 5 passed        | 0         | **PASSED** |
| **AC2** | Template HTML fallback and XSS safety              | `pnpm --filter api exec jest apps/api/src/modules/documents/templates/payslip.template.spec.ts` | 5 passed        | 0         | **PASSED** |
| **AC3** | PdfService mapping and payslip PDF generation      | `pnpm --filter api exec jest apps/api/src/modules/documents/services/pdf.service.spec.ts`       | 7 passed        | 0         | **PASSED** |
| **AC4** | Employee jobTitle/position type hygiene tests      | `python3 scripts/test_employee_jobtitle_position.py`                                            | 5 passed        | 0         | **PASSED** |
| **AC5** | Evidence contract and freshness test suite         | `python3 scripts/test_evidence_freshness.py`                                                    | 11 passed       | 0         | **PASSED** |

---

## Changed Covering Tests

- `apps/api/src/modules/documents/templates/payslip.template.spec.ts` (5 tests):
  - `renders Position when only jobTitle is provided on employee`
  - `renders Position when only position is provided on employee`
  - `prefers position over jobTitle when both are provided`
  - `omits Position row when neither position nor jobTitle is provided`
  - `escapes jobTitle HTML characters safely`
- `apps/api/src/modules/documents/services/pdf.service.spec.ts` (2 new tests added):
  - `payslip PDF generator includes employee jobTitle when position is not set`
  - `payslip PDF generator prefers position over jobTitle when both are set`
- `scripts/test_employee_jobtitle_position.py` (5 tests):
  - `test_payslip_template_employee_has_jobtitle_and_position`
  - `test_packages_shared_types_employee_has_jobtitle_and_position`
  - `test_web_hr_hooks_employee_has_jobtitle_and_position`
  - `test_prisma_schema_employee_has_jobtitle_and_position`
  - `test_regression_planted_missing_jobtitle_detected`
- `scripts/test_evidence_freshness.py` (1 new contract test):
  - `test_issue_370_evidence_contract`

---

## Bug Fix / Regression Demonstration

### Base Behaviour (`e5d9b805563c04df3300f00442fd18f7d82ce560`)

On base before this change:

1. `PayslipData.employee` lacked `jobTitle`. Running `payslip.template.spec.ts` resulted in:
   ```text
   error TS2339: Property 'jobTitle' does not exist on type '{ name: string; employeeId: string; department?: string | undefined; position?: string | undefined; email?: string | undefined; bankAccount?: string | undefined; }'.
   ```
2. `generatePayslipHtml` failed to display an employee's title if only `jobTitle` was provided.
3. `test_issue_370_evidence_contract` failed because `docs/evidence/370/EVIDENCE.md` was absent.

### Head Behaviour (this branch)

1. `PayslipData.employee` defines `jobTitle?: string;` alongside `position?: string;`.
2. `generatePayslipHtml` seamlessly falls back from `position` to `jobTitle`.
3. `PdfService.generatePayslipPdf` provides both properties to the template data.
4. All unit and hygiene tests pass cleanly with 0 failures:
   ```text
   PASS src/modules/documents/templates/payslip.template.spec.ts (5 passed)
   PASS src/modules/documents/services/pdf.service.spec.ts (7 passed)
   python3 scripts/test_employee_jobtitle_position.py (5 passed)
   python3 scripts/test_evidence_freshness.py (11 passed)
   ```

---

## UI Verification (Screenshots / RTL & LTR)

**UI is EXEMPT**:

- This issue modifies backend document template types (`apps/api/src/modules/documents/templates/payslip.template.ts`), PDF mapping (`apps/api/src/modules/documents/services/pdf.service.ts`), unit tests, hygiene scripts, and evidence documentation.
- No frontend React UI components, CSS styling, or routes are altered.
