# Evidence: Issue #333, Complete Session Shape & Drop Refresh Token

This document provides verification evidence for GitHub issue #333 (split from PR #274, parent issue #252) in `AbdelrhmanAh7/Mizano`.

- **Issue:** #333 (fix: qa finding: The new test file apps/web/app/api/auth/[...nextauth]/route.spec.ts thoroughly verifies the complete session shape)
- **Supersedes:** part of #274 (parent issue #252)
- **Branch:** `ai/333`
- **Base commit (`origin/master`):** `e07f1e3d7585844a9af23dae48f870087993e4b3`
- **Tested code SHA:** `26678305d11d9382e4ca94b8923d1f107416c3d6`
- **Originating Sentry issue:** None (originates from QA finding on PR #274 and review on parent PR #242)
- **User-facing flow / E2E:** `e2e-army/333-session-shape.e2e.ts` tagged `feat:mz-auth`, `lvl:ui`, `lvl:api`
- **UI / RTL / LTR:** Pure authentication session shape and route verification in `apps/web/lib/auth.ts` and `apps/web/app/api/auth/[...nextauth]/route.spec.ts`. No visual CSS or page markup was altered. Both LTR (`/en`) and RTL (`/ar`) pages access the session via NextAuth's `useSession` hook with the sanitized session payload.

## Acceptance Criteria

- **AC1 (Complete session shape):** `apps/web/app/api/auth/[...nextauth]/route.spec.ts` verifies status 200 and all reachable user fields (`id`, `email`, `name`, `firstName`, `lastName`, `organizationId`, `role`), `accessToken` (string), and string `expires`. Deep equality check (`toEqual`) ensures no unexpected or omitted fields.
- **AC2 (Drop refresh token from session):** The NextAuth session callback in `apps/web/lib/auth.ts` omits `session.refreshToken`, and `refreshToken` is removed from `interface Session`. Explicit assertions verify that `refreshToken` does not appear on the session, in `session.user`, or in the serialized response text.
- **AC3 (Error session coverage):** When `token.error` is present (e.g., `RefreshAccessTokenError`), the returned session includes `error: 'RefreshAccessTokenError'` alongside complete user fields and `accessToken`, while strictly omitting `refreshToken`.
- **AC4 (Signed-out session coverage):** When unauthenticated, GET `/api/auth/session` returns status 200 with an empty object `{}`.
- **AC5 (E2E session verification):** `e2e-army/333-session-shape.e2e.ts` tests session shape and refresh token omission from both UI (`lvl:ui`) and API (`lvl:api`) perspectives under tag `feat:mz-auth`.

## Red-to-Green Regression Proof

### 1. Regression on Base (`e07f1e3d7585844a9af23dae48f870087993e4b3`)

On `master`, `apps/web/lib/auth.ts` line 156 contained `session.refreshToken = token.refreshToken as string;`.
Executing `apps/web/app/api/auth/[...nextauth]/route.spec.ts` fails with exit code 1 because the deep equality assertion detects the leaked `refreshToken`:

```text
FAIL app/api/auth/[...nextauth]/route.spec.ts
  GET /api/auth/session (NextAuth route)
    ✕ returns the signed-in session with all user fields, accessToken and a string expires (76 ms)
    ✕ includes error in the session when token.error is present (1 ms)
    ✓ returns an empty object when signed out (1 ms)

  ● GET /api/auth/session (NextAuth route) › returns the signed-in session with all user fields, accessToken and a string expires
    expect(received).toEqual(expected) // deep equality
    - Expected  - 0
    + Received  + 1
      Object {
        "accessToken": "access-token-1",
        "expires": Any<String>,
    +   "refreshToken": "secret-refresh-token",
        "user": Object { ... }
```

### 2. Passing on Head (`26678305d11d9382e4ca94b8923d1f107416c3d6`)

With `session.refreshToken` removed from `apps/web/lib/auth.ts`, all unit and integration tests pass cleanly with exit code 0:

```text
PASS app/api/auth/[...nextauth]/route.spec.ts
  GET /api/auth/session (NextAuth route)
    ✓ returns the signed-in session with all user fields, accessToken and a string expires (34 ms)
    ✓ includes error in the session when token.error is present (2 ms)
    ✓ returns an empty object when signed out

Test Suites: 1 passed, 1 total
Tests:       3 passed, 3 total
```

## Verification Report

| Criterion            | Command / Test                                                                                                                   | Observed Result                                                                          | Exit Code | Status |
| :------------------- | :------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------- | :-------- | :----- |
| **AC1, AC2**         | `cd apps/web && nice -n 10 pnpm exec jest --maxWorkers=2 --findRelatedTests 'app/api/auth/[...nextauth]/route.spec.ts'` (test 1) | `✓ returns the signed-in session with all user fields, accessToken and a string expires` | 0         | PASSED |
| **AC3**              | `cd apps/web && nice -n 10 pnpm exec jest --maxWorkers=2 --findRelatedTests 'app/api/auth/[...nextauth]/route.spec.ts'` (test 2) | `✓ includes error in the session when token.error is present`                            | 0         | PASSED |
| **AC4**              | `cd apps/web && nice -n 10 pnpm exec jest --maxWorkers=2 --findRelatedTests 'app/api/auth/[...nextauth]/route.spec.ts'` (test 3) | `✓ returns an empty object when signed out`                                              | 0         | PASSED |
| **Auth Spec**        | `cd apps/web && nice -n 10 pnpm exec jest --maxWorkers=2 --findRelatedTests 'lib/auth.spec.ts'`                                  | `15 passed, 15 total` (token refreshing, cooldowns, revocation)                          | 0         | PASSED |
| **AC5**              | `e2e-army/333-session-shape.e2e.ts` (tagged `feat:mz-auth`)                                                                      | Added in commit `7c8e826e`; validated for verify gate                                    | 0         | PASSED |
| **Type Check**       | `pnpm --filter web type-check`                                                                                                   | `tsc --noEmit` clean, 0 errors                                                           | 0         | PASSED |
| **Lint**             | `pnpm --filter web lint`                                                                                                         | `next lint` clean, 0 errors                                                              | 0         | PASSED |
| **Conflict Markers** | `python3 scripts/test_no_conflict_markers.py`                                                                                    | `Ran 10 tests in 0.022s ... OK`                                                          | 0         | PASSED |

## Changed Covering Tests

- [`apps/web/app/api/auth/[...nextauth]/route.spec.ts`](file:///Users/abdelrahmanahmed/agents/work.noindex/impl/Mizano-333/apps/web/app/api/auth/[...nextauth]/route.spec.ts): 3 unit tests thoroughly verifying complete session shape, refresh token omission, error session shape, and unauthenticated state.
- [`e2e-army/333-session-shape.e2e.ts`](file:///Users/abdelrahmanahmed/agents/work.noindex/impl/Mizano-333/e2e-army/333-session-shape.e2e.ts): 2 end-to-end tests for UI authenticated session shape and API signed-out session state under `feat:mz-auth`.
