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
401 (AC4). The CTO answered on the issue: "Do not change message casing to Title Case. Maintain 'Validation
failed' and existing 'Unauthorized' 401 behavior matching the hub contract and existing callers." So this PR
changes no product code. It locks the contract with regression tests, so a later change to the filter, the
guard or `RegisterDto` cannot break `mz-auth` again without a red unit test first.

The acceptance criteria as decided:

1. AC1: a weak registration password returns 400 `VALIDATION_ERROR`, and `details` names the uppercase rule.
2. AC2: a missing, forged or invalid bearer token returns 401.
3. AC3: the validation `message` stays `'Validation failed'` (sentence case, per the CTO decision).
4. AC4: the 401 body's `error` is `'Unauthorized'`.

## Verification report (branch `ai/219`)

| AC       | Covering test                                                                                                                                                               | Command                                                                                                                            | Observed                                                                                                                                         |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| AC1, AC3 | `http-exception.filter.spec.ts` "renders a weak password as VALIDATION_ERROR…", "names the email rule…"                                                                     | `cd apps/api && npx jest --maxWorkers=2 src/common/filters/http-exception.filter.spec.ts src/common/guards/jwt-auth.guard.spec.ts` | 2 suites, 11 tests passed, exit 0                                                                                                                |
| AC2, AC4 | `jwt-auth.guard.spec.ts` "should reject with a 401 whose error is \"Unauthorized\"", `http-exception.filter.spec.ts` "renders a missing or invalid JWT as 401 Unauthorized" | same command                                                                                                                       | passed, exit 0                                                                                                                                   |
| AC1–AC4  | `apps/api/test/auth.e2e-spec.ts` (weak-password `details`, invalid token `error`)                                                                                           | `pnpm --filter api test:e2e`                                                                                                       | not run: needs Postgres and Redis, which the agent sandbox cannot reach, and `ci.yml` skips API e2e specs (its `nightly.yml` does not exist yet) |
| AC1–AC4  | `e2e-army/219-auth-error-contract.e2e.ts` (`feat:mz-auth`, `lvl:api`)                                                                                                       | type-checked with `tsc --strict` against the runner's `e2e` / `@e2e-dev/web` types                                                 | exit 0; the run itself happens in the hub `e2e-army` verify job                                                                                  |

Base vs head: no product file changes, so the new tests pass on base and head alike. They lock the
existing behaviour. The original failure was in the hub test, not in this repo.

## Follow-up (not in this PR, per the CTO)

`RegisterDto.password` has three `@Matches` rules (uppercase, lowercase, digit). class-validator keys
constraints by type, so a field reports at most one `matches` message. A password like `alllowercase`
reports only the uppercase rule, and the user finds the next rule only after fixing the first. This needs a
separate issue.
