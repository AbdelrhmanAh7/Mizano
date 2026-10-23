# Evidence for Issue #320: AP subledger vs control-account reconciliation check with test (replaces #128)

## Overview

- **Issue**: #320 (`Fresh restart of #125: Add AP subledger vs control-account reconciliation check with test (replaces #128)`)
- **Parent / Original Issue**: #125
- **Supersedes**: PR #128
- **PR**: #450
- **Base Commit**: `9d6ff9222c15112282ad813aa5b47a9504ef5647` (`master`)
- **Originating Sentry Issue**: None (feature request / clean restart of #125).
- **User-facing flow / E2E**: Feature E2E covered in `e2e-army/320-ap-reconciliation.e2e.ts` (`feat:mz-financial-reports`, `feat:mz-dashboard`, `feat:mz-aging-reports`, `lvl:api`). Pure backend REST API endpoint (`GET /api/reports/reconciliation/ap`); no frontend UI changes in this issue.

---

## Changed Covering Tests

- `apps/api/src/modules/reports/controllers/reports.controller.spec.ts` (6 unit tests verifying controller delegation, permission guards, Swagger `@ApiResponse` 200/400/401/403 decorators, and `@ApiQuery` metadata)
- `apps/api/src/modules/reports/services/ap-reconciliation.service.spec.ts` (18 unit tests verifying AC1-AC5: decimal precision, tie logic, voided bills, temporal scoping, tenant isolation, and complete class definition)
- `e2e-army/320-ap-reconciliation.e2e.ts` (Natural-language API E2E test covering empty-tenant zero balance AC1, mathematical identity AC2, and 400/401 error contracts AC3 with 15s request timeouts)

---

## Explicit Numbered Acceptance Criteria

1. **AC1 (Zero Balance on Empty/Initial State)**: On an empty or initial tenant with no posted bills or transactions prior to `asOf`, the reconciliation endpoint returns `subledgerTotal: '0.0000'`, `controlBalance: '0.0000'`, `difference: '0.0000'`, and `ok: true`.
2. **AC2 (Subledger vs Control Formula & Equality)**: `difference` equals `subledgerTotal` minus `controlBalance` in exact 4-decimal-place string representation. When `subledgerTotal === controlBalance`, `difference === '0.0000'` and `ok === true`. When they differ, `ok === false` with the exact signed difference. The endpoint is read-only and idempotent.
3. **AC3 (Input Validation & Authentication Guard)**: An invalid `asOf` date parameter (such as `2026-02-30` or `not-a-date`) returns HTTP 400 Bad Request. An unauthenticated request without a valid bearer token returns HTTP 401 Unauthorized. Access requires `reports.view` permission (HTTP 403 otherwise).
4. **AC4 (Multi-Tenant & Temporal Scoping)**: All aggregate queries (bills, bill allocations, payments made, vendor credits, journals, and control accounts) are strictly filtered by `organizationId`, posted status, and document/cutoff date `lte: asOf` (end of UTC day). Reconstructed voids and settlements respect cutoff date boundaries.
5. **AC5 (OpenAPI / Swagger Documentation)**: The endpoint `GET /reports/reconciliation/ap` is fully documented with `@ApiOperation`, `@ApiQuery(name: 'asOf')`, and explicit `@ApiResponse` decorators for HTTP 200 (returning `ApReconciliationResponseDto`), 400 (Bad Request), 401 (Unauthorized), and 403 (Forbidden).
6. **AC6 (Service Class Definition & Structure)**: `ApReconciliationService` is an `@Injectable()` service with complete class definition, clean block scoping, explicit braces, and complete method signatures. Verified by unit test confirming instantiation, typing, and method exports.
7. **AC7 (Verification Suite Green)**: All unit tests in `ap-reconciliation.service.spec.ts` (18/18) and `reports.controller.spec.ts` (6/6) pass with exit code 0. TypeScript type-check (`pnpm --filter api type-check`) exits 0. ESLint (`pnpm --filter api lint`) exits 0. Prettier formatting checks clean.

---

## Verification Matrix

| AC ID   | Requirement Description                               | Test / Command                                                                                                                          | Observed Result                                        | Exit Code | Status     |
| ------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | --------- | ---------- |
| **AC1** | Empty/initial tenant reconciles to zero               | `pnpm --filter api exec jest src/modules/reports/services/ap-reconciliation.service.spec.ts -t "treats empty aggregates"`               | PASS (1 test)                                          | 0         | **PASSED** |
| **AC2** | Difference equals subledger minus control; ok follows | `pnpm --filter api exec jest src/modules/reports/services/ap-reconciliation.service.spec.ts -t "AC2: returns ok false"`                 | PASS (1 test)                                          | 0         | **PASSED** |
| **AC2** | Exact Decimal precision for ties                      | `pnpm --filter api exec jest src/modules/reports/services/ap-reconciliation.service.spec.ts -t "AC1: ties open balances"`               | PASS (1 test)                                          | 0         | **PASSED** |
| **AC3** | Invalid calendar date returns 400 Bad Request         | `pnpm --filter api exec jest src/modules/reports/services/ap-reconciliation.service.spec.ts -t "rejects an invalid asOf date"`          | PASS (1 test: throws BadRequestException)              | 0         | **PASSED** |
| **AC3** | Permission reports.view required                      | `pnpm --filter api exec jest src/modules/reports/controllers/reports.controller.spec.ts -t "requires reports.view permission"`          | PASS (1 test)                                          | 0         | **PASSED** |
| **AC4** | Tenant and temporal scoping to end of asOf day        | `pnpm --filter api exec jest src/modules/reports/services/ap-reconciliation.service.spec.ts -t "AC3/AC4/AC5: scopes every query"`       | PASS (1 test)                                          | 0         | **PASSED** |
| **AC5** | @ApiResponse decorators for 200, 400, 401, 403        | `pnpm --filter api exec jest src/modules/reports/controllers/reports.controller.spec.ts -t "documents HTTP responses via @ApiResponse"` | PASS (1 test: verifies Swagger metadata)               | 0         | **PASSED** |
| **AC5** | @ApiQuery decorator for asOf parameter                | `pnpm --filter api exec jest src/modules/reports/controllers/reports.controller.spec.ts -t "documents query parameter asOf"`            | PASS (1 test: verifies ApiQuery metadata)              | 0         | **PASSED** |
| **AC6** | Service class is complete and cleanly instantiated    | `pnpm --filter api exec jest src/modules/reports/services/ap-reconciliation.service.spec.ts -t "is a complete class definition"`        | PASS (1 test: instance and prototype verified)         | 0         | **PASSED** |
| **AC7** | Full unit test execution (service)                    | `pnpm --filter api exec jest src/modules/reports/services/ap-reconciliation.service.spec.ts`                                            | 18 passed, 0 failed                                    | 0         | **PASSED** |
| **AC7** | Full unit test execution (controller)                 | `pnpm --filter api exec jest src/modules/reports/controllers/reports.controller.spec.ts`                                                | 6 passed, 0 failed                                     | 0         | **PASSED** |
| **AC7** | TypeScript type-check across api package              | `pnpm --filter api type-check`                                                                                                          | Clean (0 errors across tsc and test/tsconfig.e2e.json) | 0         | **PASSED** |
| **AC7** | ESLint check across api package                       | `pnpm --filter api lint`                                                                                                                | Clean (0 errors, 0 warnings)                           | 0         | **PASSED** |
| **AC7** | Prettier formatting check across changed files        | `pnpm exec prettier --check apps/api/src/modules/reports/ e2e-army/320-ap-reconciliation.e2e.ts`                                        | All matched files use Prettier code style!             | 0         | **PASSED** |

---

## Review Findings Resolution (Round 1)

1. **`apps/api/src/modules/reports/controllers/reports.controller.ts:544-573`**:
   - **Finding**: `@ApiOperation decorator is missing the required @ApiResponse decorators to document the possible HTTP responses (200, 400, 401, etc.)`.
   - **Root Cause**: The initial implementation only provided `@ApiOperation` without OpenAPI response metadata.
   - **Fix**: Added `@ApiResponse({ status: 200, type: ApReconciliationResponseDto })`, `@ApiResponse({ status: 400 })`, `@ApiResponse({ status: 401 })`, `@ApiResponse({ status: 403 })`, and `@ApiQuery({ name: 'asOf' })`. Added `ApReconciliationResponseDto` in `apps/api/src/modules/reports/dto/ap-reconciliation.dto.ts`.
   - **Verification**: Tested in `apps/api/src/modules/reports/controllers/reports.controller.spec.ts:74-101` inspecting `Reflect.getMetadata(DECORATORS.API_RESPONSE)`.

2. **`apps/api/src/modules/reports/services/ap-reconciliation.service.ts:250-275`**:
   - **Finding**: `The service class is missing the closing brace for the class definition, which would cause a compilation error`.
   - **Root Cause**: The unbraced single-line `for` and `if` statements inside `controlBalance` caused automated diff inspection to misinterpret indentation and closing brace depth. The class actually compiled cleanly, but the formatting ambiguity triggered a false-positive finding.
   - **Fix**: Refactored `controlBalance` with explicit curly-braced control blocks for `if` and `for` loops, verified Prettier formatting, and added unit test confirming complete class exports.
   - **Verification**: Tested in `apps/api/src/modules/reports/services/ap-reconciliation.service.spec.ts:302-308` and verified with `pnpm --filter api type-check` (exit code 0).
