# Evidence: Issue #280 — Standardize Validation Error Messages to 'Validation Failed' and Normalize 401 Errors

## Overview

- **Issue**: #280 (`fix: qa finding: AC3 requires validation error message to be 'Validation Failed' (Titl… (split from #271)`)
- **Parent Issue**: #258
- **PR**: #304
- **Supersedes part of**: PR #271 (finding `c799b6dfb588`)
- **Base Commit**: `e5d9b8053a25121bc6a74bbf3192f153f31741ca` (`master`)
- **Originating Sentry Issue**: None (split finding from PR #271 QA review).
- **User-facing flow / E2E**: Feature E2E covered in `e2e-army/280-auth-error-contract.e2e.ts` (`feat:mz-auth`, `lvl:api`).

---

## Changed Covering Tests

- `apps/api/src/common/filters/http-exception.filter.spec.ts` (8 unit tests verifying class-validator validation, direct non-class-validator validation, Prisma validation, unrelated 400 message preservation, and 401 Unauthorized normalization)
- `apps/api/test/auth.e2e-spec.ts` (E2E assertions aligning validation error messages to Title Case `'Validation Failed'` and 401 responses to `error: 'Unauthorized'`)
- `e2e-army/280-auth-error-contract.e2e.ts` (Natural-language E2E test covering registration validation rules, 401 token authentication, and 401 credential rejections with strict `AbortSignal.timeout` timeouts)

---

## Numbered Acceptance Criteria

1. **AC1 (Class-Validator Validation Errors)**: Every 400 response generated from class-validator DTO input validation returns `statusCode: 400`, `code: 'VALIDATION_ERROR'`, `message: 'Validation Failed'` (Title Case), `error: 'Bad Request'`, and formatted field-level constraints in `details`.
2. **AC2 (Direct & Custom Validation Errors)**: Direct validation exceptions (e.g. `BadRequestException('Validation failed')`, `BadRequestException('Validation error')`, or object payloads with `code: 'VALIDATION_ERROR'` or `message: 'Validation failed'`) return `statusCode: 400`, `code: 'VALIDATION_ERROR'`, `message: 'Validation Failed'` (Title Case), `error: 'Bad Request'`, and correctly map structured error mappings into `details`.
3. **AC3 (Prisma Validation Errors)**: `Prisma.PrismaClientValidationError` exceptions handled by `AllExceptionsFilter` return `statusCode: 400`, `code: 'VALIDATION_ERROR'`, `message: 'Validation Failed'` (Title Case), and `error: 'Bad Request'`.
4. **AC4 (Non-Validation 400 Preservation & Non-Leakage)**: Non-validation 400 Bad Request exceptions retain their application-specific error messages without being overwritten to `'Validation Failed'`, and non-validation errors do not leak internal structures into `details`.
5. **AC5 (Consistent 401 Unauthorized Normalization)**: All 401 responses consistently return `error: 'Unauthorized'`, even if the thrown exception specified a different custom error property or omitted the error field.
6. **AC6 (Clean Verification & Lint)**: `http-exception.filter.spec.ts` passes (8/8), `pnpm --filter api type-check` exits 0, `pnpm --filter api lint` exits 0, and all fetch calls in `e2e-army/280-auth-error-contract.e2e.ts` include `signal: AbortSignal.timeout(15_000)` with a `120_000ms` test timeout.

---

## Verification Matrix

| AC ID   | Requirement Description                                 | Test / Command                                                                                                                     | Observed Result                                                                                       | Exit Code | Status     |
| ------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------- | ---------- |
| **AC1** | Class-validator DTO produces 'Validation Failed'        | `pnpm --filter api exec jest apps/api/src/common/filters/http-exception.filter.spec.ts -t "renders a weak password"`               | 1 test PASS (`code: 'VALIDATION_ERROR'`, `message: 'Validation Failed'`, normalized details)          | 0         | **PASSED** |
| **AC1** | Malformed email rule normalized                         | `pnpm --filter api exec jest apps/api/src/common/filters/http-exception.filter.spec.ts -t "names the email rule"`                  | 1 test PASS (`details.email` populated, `message: 'Validation Failed'`)                               | 0         | **PASSED** |
| **AC2** | Direct non-class-validator validation errors normalized | `pnpm --filter api exec jest apps/api/src/common/filters/http-exception.filter.spec.ts -t "normalizes direct non-class-validator"` | 1 test PASS (string & object forms return `code: 'VALIDATION_ERROR'`, `message: 'Validation Failed'`) | 0         | **PASSED** |
| **AC3** | Prisma validation errors return Validation Failed       | `pnpm --filter api exec jest apps/api/src/common/filters/http-exception.filter.spec.ts -t "normalizes Prisma validation errors"`   | 1 test PASS (`code: 'VALIDATION_ERROR'`, `message: 'Validation Failed'`)                              | 0         | **PASSED** |
| **AC4** | Unrelated 400 messages preserved & no leaks             | `pnpm --filter api exec jest apps/api/src/common/filters/http-exception.filter.spec.ts -t "preserves unrelated 400 messages"`      | 1 test PASS (custom messages kept, details undefined)                                                 | 0         | **PASSED** |
| **AC5** | 401 responses consistently return error: 'Unauthorized' | `pnpm --filter api exec jest apps/api/src/common/filters/http-exception.filter.spec.ts -t "normalizes any 401 response"`           | 1 test PASS (custom error overwritten to 'Unauthorized', fallbacks handled)                           | 0         | **PASSED** |
| **AC5** | JWT guard failure returns 401 Unauthorized              | `pnpm --filter api exec jest apps/api/src/common/filters/http-exception.filter.spec.ts -t "renders a missing or invalid JWT"`      | 1 test PASS (`status: 401`, `error: 'Unauthorized'`)                                                  | 0         | **PASSED** |
| **AC6** | Full unit spec execution                                | `pnpm --filter api exec jest apps/api/src/common/filters/http-exception.filter.spec.ts`                                            | 8/8 unit tests PASS                                                                                   | 0         | **PASSED** |
| **AC6** | TypeScript type-check across api package                | `pnpm --filter api type-check`                                                                                                     | Clean (0 errors across tsc and test/tsconfig.e2e.json)                                                | 0         | **PASSED** |
| **AC6** | ESLint check across api package                         | `pnpm --filter api lint`                                                                                                           | Clean (0 errors, 0 warnings)                                                                          | 0         | **PASSED** |

---

## Bug Fix / Regression Demonstration

- **Base behaviour on master (`e5d9b805`)**:
  - Class-validator errors in `http-exception.filter.ts:218` returned sentence-case `message: 'Validation failed'` (with lowercase `'failed'`).
  - Direct validation exceptions (`new BadRequestException('Validation failed')`, `new BadRequestException({ message: 'Validation failed', errors: ... })`) did not match `Array.isArray(responseObj.message)`, leaving the error unnormalized and omitting `code: 'VALIDATION_ERROR'`.
  - `PrismaClientValidationError` returned `code: 'PRISMA_VALIDATION_ERROR'` and `message: 'Database validation error'` rather than standardizing to `'Validation Failed'`.
  - 401 responses carrying an existing `error` property in `responseObj.error` retained that value instead of guaranteeing `error: 'Unauthorized'`.
- **Head behaviour**:
  - All validation errors (class-validator DTOs, direct validation exceptions, and Prisma validation errors) return Title Case `message: 'Validation Failed'` with `code: 'VALIDATION_ERROR'` and `error: 'Bad Request'`.
  - Non-validation 400s retain their exact domain messages and do not leak internal metadata.
  - All 401 responses normalize `error: 'Unauthorized'`.
- **Covering test**: `apps/api/src/common/filters/http-exception.filter.spec.ts` (8 passing unit tests).

---

## UI Verification (Screenshots / RTL & LTR)

**UI is EXEMPT**:

- This issue modifies API exception filter responses (`apps/api/src/common/filters/http-exception.filter.ts`) and auth error contract tests.
- No frontend files in `apps/web` are modified.
- No Playwright screenshots or RTL/LTR web tests are required for backend error filter normalization.

---

## Skills Used

- `systematic-debugging`: Identified the root causes of the QA rejection on PR #271 and PR #304 (missing product code changes in `http-exception.filter.ts`, sentence-case `'Validation failed'`, lack of non-class-validator normalization, and 401 error normalization).
- `test-first engineering`: Defined explicit numbered ACs, added comprehensive unit specs covering class-validator, direct validation exceptions, Prisma validation, and 401 normalization, and updated E2E assertions.
- `verification-before-completion`: Executed all local test runners, TypeScript typecheckers, and linters, verifying exit code 0 and recording exact outputs.
