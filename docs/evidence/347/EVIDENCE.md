# Evidence: Issue #347 — Fix: Handling Invoices with Invalid VAT Rates in VatReturnDraftService

## Overview

- **Issue**: #347 (`fix: vat-return-draft.service.spec.ts: apps/api/src/modules/reports/services/vat-return-draft.service.spec.t… (split from #117)`)
- **Parent Issue**: #114
- **Supersedes part of**: PR #117 (finding `72584f34415c`)
- **Base Commit**: `113500149241f4890ade939099e376a7a0eddbe2` (`master`)
- **Originating Sentry Issue**: None (split finding from PR #117 test coverage audit).
- **User-facing flow / E2E**: Not user-facing (backend VAT return draft computation and exception detection unit service). No user-facing UI route modified.

---

## Changed Covering Tests

- `apps/api/src/modules/reports/services/vat-return-draft.service.spec.ts` (15 unit tests covering invalid tax rates, valid rates, exceptions, ledger calculation, tenant scoping, and error handling)
- `apps/api/src/modules/tax/services/vat-returns.service.spec.ts` (38 unit tests verifying tax service invariants remain intact)

---

## Numbered Acceptance Criteria

1. **AC1 (Invoices with Invalid Tax Rates)**: `VatReturnDraftService` detects invoice lines with invalid VAT rates (rates < 0% such as `-1%`, `-14%` or rates > 100% such as `100.01%`, `250%`) and records them in `exceptions[]` with `reason: 'Invalid tax rate'` and sets status to `'incomplete'`.
2. **AC2 (Bills with Invalid Tax Rates)**: `VatReturnDraftService` detects bill lines with invalid VAT rates (rates < 0% or rates > 100%) and records them in `exceptions[]` with `reason: 'Invalid tax rate'` and sets status to `'incomplete'`.
3. **AC3 (Valid Boundary Rates Accepted)**: Tax rates of exactly `0%` and `100%` (as well as standard rates like `14%`) are recognized as valid and do not trigger an `'Invalid tax rate'` exception.
4. **AC4 (Exception Payload Integrity)**: Each exception record includes document reference metadata (`id`, `type`, `documentNumber`, `reason`). Other document anomalies (foreign currency, missing tax amount, negative header tax amount) continue to be reported in `exceptions[]` with their appropriate reasons.
5. **AC5 (Clean Verification & Lint)**: All unit tests in `vat-return-draft.service.spec.ts` pass (15/15), `pnpm --filter api type-check` exits 0, `pnpm --filter api lint` exits 0, and `@mizano/shared-types` type-check and build exit 0.

---

## Verification Matrix

| AC ID   | Requirement Description                              | Test / Command                                                                                                | Observed Result                                                                      | Exit Code | Status     |
| ------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | --------- | ---------- |
| **AC1** | Invoice with invalid VAT rates flagged in exceptions | `pnpm --filter api exec jest apps/api/src/modules/reports/services/vat-return-draft.service.spec.ts -t "AC1"` | 4 tests PASS (`-1%`, `-14%`, `100.01%`, `250%` produce `reason: 'Invalid tax rate'`) | 0         | **PASSED** |
| **AC2** | Bill with invalid/negative VAT rate flagged          | `pnpm --filter api exec jest apps/api/src/modules/reports/services/vat-return-draft.service.spec.ts -t "AC2"` | 2 tests PASS (`150%` and `-5%` produce `reason: 'Invalid tax rate'`)                 | 0         | **PASSED** |
| **AC3** | Boundary tax rates 0% and 100% valid                 | `pnpm --filter api exec jest apps/api/src/modules/reports/services/vat-return-draft.service.spec.ts -t "AC3"` | 1 test PASS (`status: 'complete'`, `exceptions: []`)                                 | 0         | **PASSED** |
| **AC4** | Document metadata and exception types preserved      | `pnpm --filter api exec jest apps/api/src/modules/reports/services/vat-return-draft.service.spec.ts -t "AC4"` | 1 test PASS (`id, type, documentNumber, reason` intact)                              | 0         | **PASSED** |
| **AC5** | Full unit spec execution                             | `pnpm --filter api exec jest apps/api/src/modules/reports/services/vat-return-draft.service.spec.ts`          | 15/15 unit tests PASS                                                                | 0         | **PASSED** |
| —       | Regression check for VAT returns service             | `pnpm --filter api exec jest apps/api/src/modules/tax/services/vat-returns.service.spec.ts`                   | 38/38 unit tests PASS                                                                | 0         | **PASSED** |
| —       | Type-check across api & shared-types                 | `pnpm --filter @mizano/shared-types type-check && pnpm --filter api type-check`                               | Clean (0 errors across tsc and e2e tsconfig)                                         | 0         | **PASSED** |
| —       | ESLint check across api                              | `pnpm --filter api lint`                                                                                      | Clean (0 errors, 0 warnings)                                                         | 0         | **PASSED** |

---

## Bug Fix / Regression Demonstration

- **Base behaviour on parent PR #117 at finding commit `4c0f8934`**: Documents with negative VAT rates or rates exceeding 100% were not validated by `exceptionReason` and lacked test assertions in `vat-return-draft.service.spec.ts`, allowing invalid tax rates to slip through into calculation without being flagged as pre-filing exceptions.
- **Head behaviour**: `VatReturnDraftService.exceptionReason` explicitly inspects line tax rates (`doc.lines.some((l) => l.taxRate.isNegative() || l.taxRate.greaterThan(100))`), returning `'Invalid tax rate'`. A document with an invalid rate is routed to `exceptions[]`, and the draft status is marked `'incomplete'`. Boundary values of 0% and 100% remain valid.
- **Covering test**: `apps/api/src/modules/reports/services/vat-return-draft.service.spec.ts` (`describe('handling invalid and valid VAT rates (@issue-347)')`).

---

## UI Verification (Screenshots / RTL & LTR)

**UI is EXEMPT**:

- This issue resolves backend service unit test and validation logic for VAT return drafts (`VatReturnDraftService`).
- No frontend files in `apps/web` are modified.
- No Playwright screenshots or RTL/LTR web tests are required for this backend-only change.

---

## Skills Used

- `systematic-debugging`: Located root cause of finding `72584f34415c` from parent PR #117 (missing tests and validation for negative and >100% tax rates).
- `test-first engineering`: Formulated explicit numbered ACs, constructed unit tests covering negative rates, out-of-range rates, boundary rates (0% and 100%), and document metadata.
- `verification-before-completion`: Executed all local test runners, TypeScript typecheckers, and linters, verifying exit code 0 and recording exact outputs.
