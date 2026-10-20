# #219 — auth error contract behind the `mz-auth` stable gate

## Symptom

The hub stable gate `mz-auth` failed on `master` (2026-10-12 @ `4d5ba41`, 2026-10-14/15 @ `f84958f`) with
`expected "\"Validation failed\"" to match /uppercase/i` in `[mz-auth.3]`. No Sentry issue exists for it:
the failure came from the hub's stable e2e run, not from production.

## Root cause

The gate asserted on the wrong field. `[mz-auth.3]` ran `expect(JSON.stringify(weak.body.message)).toMatch(/uppercase/i)`.
`AllExceptionsFilter.handleHttpException` (`apps/api/src/common/filters/http-exception.filter.ts:218`) has
always returned a class-validator rejection like this:

```json
{
  "statusCode": 400,
  "code": "VALIDATION_ERROR",
  "message": "Validation failed",
  "details": { "Password": ["Password must contain at least one uppercase letter"] }
}
```

The rule text sits in `details`, so the gate's regex could never match `message`. The product behaved as
designed, and other callers depend on that shape: `import.service.ts:412` and `i18n/en/common.json`
(`validationFailed`). The hub fixed its assertion in hub commit `0ea3e8c`. It now checks
`code === 'VALIDATION_ERROR'` and looks for `/uppercase/i` in `details`. The 2026-10-17 stable run reports
`Authentication and sessions (mz-auth) | passed`.

## Decision on the drafted acceptance criteria (CTO, issue #219, answer to PR #234)

The spec appended by the hub swarm asked for `'Validation Failed'` in Title Case (AC3) and an `Unauthorized`
401 (AC4). The CTO answered directly on issue #219 (https://github.com/AbdelrhmanAh7/Mizano/issues/219#issuecomment-6246814448):
"Do not change message casing to Title Case. Maintain 'Validation failed' and existing 'Unauthorized' 401 behavior matching the hub contract and existing callers."
So the validation `message` and the 401 `error` keep their casing, and the PR enforces them in product code
instead of leaving them implicit:

- `http-exception.filter.ts` (`handleHttpException`): a 401 always carries `error: 'Unauthorized'` as fallback when
  the exception provides no `error` field (before, it fell back to `'Error'`).
- `jwt-auth.guard.ts:28`: the guard preserves its descriptive message `'Invalid or expired token'`, and the filter
  consistently renders `error: 'Unauthorized'`.
- `auth.controller.ts`: `@ApiResponse` entries document the 400 and 401 shapes.

Regression tests lock the contract, so a later change to the filter, the guard or `RegisterDto` cannot break
`mz-auth` again without a red unit test first.

The acceptance criteria as decided:

1. AC1: a weak registration password or invalid login returns 400 `VALIDATION_ERROR`, and `details` names the constraint rule.
2. AC2: a missing, forged or invalid bearer token returns 401 with `error: 'Unauthorized'`.
3. AC3: the validation `message` stays `'Validation failed'` (sentence case, per the CTO decision).
4. AC4: the 401 body's `error` is `'Unauthorized'`.

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

## Test Execution Evidence

- **Tested Commit (`ai/219`)**: `d4fa7e3773a445a17bd0dafb4f81227c85dfc71a`
- `nice -n 10 pnpm --filter api exec jest --maxWorkers=2 src/common/filters/http-exception.filter.spec.ts src/common/guards/jwt-auth.guard.spec.ts`: 2 suites, 13 tests passed, exit 0.
- `pnpm --filter api type-check`: exit 0.
- `pnpm --filter api lint`: exit 0.

Base vs head: the filter test "falls back to error \"Unauthorized\" for a 401 that carries no error field"
fails on the previous head (`d201f502` filter: `error` was `'Error'`) and passes now. The validation-shape tests pass on both,
because that behaviour was already correct. The original gate failure was in the hub test, not in this repo.

## Follow-up (not in this PR, per the CTO)

`RegisterDto.password` has three `@Matches` rules (uppercase, lowercase, digit). class-validator keys
constraints by type, so a field reports at most one `matches` message. A password like `alllowercase`
reports only the uppercase rule, and the user finds the next rule only after fixing the first. This needs a
separate issue.
