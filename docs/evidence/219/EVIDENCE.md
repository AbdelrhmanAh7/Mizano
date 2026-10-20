# Issue #219 Verification — Authentication and Sessions Error Contract (`mz-auth`)

## Overview

- **Issue**: #219 ([e2e] Authentication and sessions failing on master)
- **Base Commit (`origin/master`)**: `4c0063868ef63447c23171f112e7529ea49d2cb7`
- **Tested Commit (`ai/219`)**: `d4fa7e3773a445a17bd0dafb4f81227c85dfc71a`
- **Originating Sentry issue**: None (gate failure on hub stable e2e run `mz-auth.3`, not production)
- **Decision reference**: CTO direction on issue #219 (https://github.com/AbdelrhmanAh7/Mizano/issues/219#issuecomment-6246814448, item `q:AbdelrhmanAh7/Mizano#234`): maintain 'Validation failed' and 'Unauthorized'

---

## Requirements Verification Matrix

| REQ ID | Acceptance Criterion                                                                                           | Unit Verification Method                                                                                                                                                                                                | Unit Status | E2E Verification Method                                       | E2E Status                                                                                               |
| ------ | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| REQ-1  | AC1: Registration validation error or invalid login returns 400 `VALIDATION_ERROR` with rule name in `details` | `http-exception.filter.spec.ts` ("renders a weak password as VALIDATION_ERROR with uppercase rule in details", "renders an invalid login body as VALIDATION_ERROR", "names the email rule when email validation fails") | PASSED      | `auth.e2e-spec.ts`, `e2e-army/219-auth-error-contract.e2e.ts` | PENDING: API e2e not run (requires Postgres & Redis); e2e-army type-checked only, pending hub verify job |
| REQ-2  | AC2: Missing, forged or invalid JWT token returns 401 with `error: 'Unauthorized'`                             | `jwt-auth.guard.spec.ts` ("should reject with a 401 whose error is 'Unauthorized'"), `http-exception.filter.spec.ts` ("renders a missing or invalid JWT as 401 Unauthorized")                                           | PASSED      | `auth.e2e-spec.ts`, `e2e-army/219-auth-error-contract.e2e.ts` | PENDING: API e2e not run (requires Postgres & Redis); e2e-army type-checked only, pending hub verify job |
| REQ-3  | AC3: Validation error message is `'Validation failed'` (sentence case, per CTO decision)                       | `http-exception.filter.spec.ts` ("renders a weak password as VALIDATION_ERROR with uppercase rule in details", "renders an invalid login body as VALIDATION_ERROR")                                                     | PASSED      | `auth.e2e-spec.ts`                                            | PENDING: API e2e not run (requires Postgres & Redis)                                                     |
| REQ-4  | AC4: 401 error response explicitly provides `error: 'Unauthorized'` fallback                                   | `http-exception.filter.spec.ts` ("falls back to error 'Unauthorized' for a 401 that carries no error field"), `jwt-auth.guard.spec.ts`                                                                                  | PASSED      | `auth.e2e-spec.ts`                                            | PENDING: API e2e not run (requires Postgres & Redis)                                                     |

### Implementation Note

- `apps/api/src/common/filters/http-exception.filter.ts`: Enforces `error: 'Unauthorized'` as fallback for 401 responses when no error field is provided, and `error: 'Bad Request'` with `message: 'Validation failed'` and `code: 'VALIDATION_ERROR'` for validation rejections.
- `apps/api/src/common/guards/jwt-auth.guard.ts`: Preserves the descriptive message `'Invalid or expired token'` while the exception filter renders `error: 'Unauthorized'`.
- `apps/api/src/modules/auth/auth.controller.ts`: Adds Swagger `@ApiResponse` annotations documenting 400 (`Validation failed`) and 401 (`Unauthorized`) response contracts.

---

## Test Execution Evidence

### 1. Jest Unit Tests (Changed Specs)

Command:

```bash
nice -n 10 pnpm --filter api exec jest --maxWorkers=2 src/common/filters/http-exception.filter.spec.ts src/common/guards/jwt-auth.guard.spec.ts
```

Output:

```text
PASS src/common/guards/jwt-auth.guard.spec.ts
PASS src/common/filters/http-exception.filter.spec.ts

Test Suites: 2 passed, 2 total
Tests:       13 passed, 13 total
Snapshots:   0 total
Time:        5.003 s
Ran all test suites matching /src\/common\/filters\/http-exception.filter.spec.ts|src\/common\/guards\/jwt-auth.guard.spec.ts/i.
```

Exit code: 0

### 2. Type-Check and Lint

Command:

```bash
pnpm --filter api type-check && pnpm --filter api lint
```

Output:

```text
> api@0.1.0 type-check /Users/abdelrahmanahmed/agents/work.noindex/impl/Mizano-219/apps/api
> tsc --noEmit && tsc --noEmit -p test/tsconfig.e2e.json

> api@0.1.0 lint /Users/abdelrahmanahmed/agents/work.noindex/impl/Mizano-219/apps/api
> eslint "{src,apps,libs,test}/**/*.ts"
```

Exit code: 0 (0 errors, 0 warnings in changed code)

### 3. Base vs Head Regression Test Demonstration

Test: `http-exception.filter.spec.ts` -> `falls back to error "Unauthorized" for a 401 that carries no error field`

- **On Base (`origin/master`)**: In `origin/master`, `handleHttpException` in `http-exception.filter.ts` defaulted unadorned 401 `HttpException` responses to `error: 'Error'`.
- **On Head (`ai/219`)**: `AllExceptionsFilter` maps status 401 to `error: 'Unauthorized'` as fallback (`const fallbackError = status === HttpStatus.UNAUTHORIZED ? 'Unauthorized' : 'Error'`), satisfying the contract.
