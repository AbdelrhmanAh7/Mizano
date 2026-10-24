# EVIDENCE.md — Issue #185: Remove Refresh Token Leakage from Session (PR #242)

## Overview

- **Issue**: #185 (Mizano #132-3: Remove Refresh Token Leakage from Session)
- **PR**: #242
- **Branch**: `ai/185`
- **Local test head**: `c3423272` (current HEAD; the code-changing commits are `6cc59bc5` fix, `ba3b5b09` route spec, `bc66db6d` compile-time probe)
- **Base**: `origin/master`
- **Originating Sentry Issue**: None — this is a proactive security hardening identified in #132 slice 3/4; no user-reported production incident.
- **E2E**: `e2e-army/185-session-no-refresh-token.e2e.ts` — request-level API test (no browser, no model call), tagged `feat:mz-auth lvl:api`.

---

## Acceptance Criteria (Explicit & Numbered)

| AC # | Criterion                                                                                                                                                    | Verification Method                                                                                                                                                                                                                                                                                                  | Status      |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| AC1  | `GET /api/auth/session` on an authenticated session returns a JSON body with no `refreshToken` key (`Object.keys(parsed)` does not include `'refreshToken'`) | `route.spec.ts` "returns the signed-in session without the refresh token" — asserts `Object.keys(session)` does not include `'refreshToken'` and `body` does not contain the string. e2e-army `@issue-185 AC1` (runs in the hub verify job).                                                                         | **PASSED**  |
| AC2  | The `Session` type in `apps/web/lib/auth.ts` has no `refreshToken` member, so TypeScript compilation fails if any code accesses `session.refreshToken`       | `lib/auth.spec.ts` › "has no refreshToken member on the Session type (compile-time)" — uses `@ts-expect-error`; `pnpm --filter @mizano/web type-check` exits 0, proving the error directive is exercised. Mutation test: adding `refreshToken: string` to `interface Session` changes exit to error TS2578.          | **PASSED**  |
| AC3  | `grep for 'refreshToken' in apps/web/lib/auth.ts` returns zero matches                                                                                       | **Amended by CTO** — see §AC3 Amendment below. The client-visible `Session` and its type have no `refreshToken` member (proven by AC1, AC2, AC4). The 13 server-side occurrences in JWT/refresh/signOut paths are out of scope per the CTO decision on PR #242 (comment `nql-cto decision=answer`, head `0b6389fe`). | **AMENDED** |
| AC4  | Unit test asserting `callbacks.session` output omits `refreshToken` passes in `apps/web/lib/auth.spec.ts`                                                    | `lib/auth.spec.ts` › "session callback (client-visible session)" › "never copies the refresh token into the session" — asserts `Object.keys(session)` does not include `'refreshToken'` and `JSON.stringify(session)` does not contain `'secret-refresh-token'`.                                                     | **PASSED**  |
| AC5  | `pnpm --filter @mizano/web test` passes with all existing tests green                                                                                        | Full suite run at `c3423272`: 49 test suites, 464 tests, 0 failures. See §AC5 below.                                                                                                                                                                                                                                 | **PASSED**  |

---

## §AC3 Amendment — CTO Decision

**Spec literal**: "grep for `refreshToken` in `apps/web/lib/auth.ts` returns zero matches."

**Why the literal cannot hold without breaking token refresh**:  
`apps/web/lib/auth.ts` contains 13 occurrences of `refreshToken` in server-side paths:

```
apps/web/lib/auth.ts:28  — requestTokenRefresh(refreshToken: string)
apps/web/lib/auth.ts:32  — body: { refreshToken }
apps/web/lib/auth.ts:35  — Authorization: `Bearer ${refreshToken}`
apps/web/lib/auth.ts:42  — !tokens.refreshToken
apps/web/lib/auth.ts:46  — return { …, refreshToken: tokens.refreshToken }
apps/web/lib/auth.ts:63  — tokenRefresher.refresh(token.refreshToken)
apps/web/lib/auth.ts:68  — refreshToken: result.refreshToken
apps/web/lib/auth.ts:109 — refreshToken: tokens.refreshToken   (jwt callback)
apps/web/lib/auth.ts:132 — refreshToken: user.refreshToken    (jwt callback)
apps/web/lib/auth.ts:175 — tokenRefresher.refresh(token.refreshToken)  (signOut)
apps/web/lib/auth.ts:188 — tokenRefresher.forget(token?.refreshToken)  (signOut)
apps/web/lib/auth.ts:226 — refreshToken: string  (interface User augmentation)
apps/web/lib/auth.ts:238 — refreshToken: string  (interface JWT augmentation)
```

None of these appear in the `session` callback, and none are in the client-visible `Session` interface augmentation. Removing them all would break token rotation (the jwt callback stores the refresh token in the **encrypted** JWT cookie server-side so the session callback can rotate it; the browser never sees the cookie's plaintext).

**CTO decision** (PR #242, issue comment `nql-cto decision=answer`, head `0b6389fe74dc62f9f2dd8285740e7a78b99426a3`):

> "The current implementation already achieves the goal by making refreshToken not client-visible. The grep requirement can be satisfied in a follow-up by moving refresh token logic to auth-refresh.ts if needed, but it's not required for this task."

**Amended criterion (AC3)**: `refreshToken` is absent from the client-visible `Session` type and from the `session` callback body. This is proved by AC1 (route test + e2e-army), AC2 (type-check), and AC4 (unit test on the session callback). Moving server-side token rotation to `auth-refresh.ts` is tracked as a follow-up.

---

## Verification Report

### AC1 — `/api/auth/session` JSON has no `refreshToken` key

**Test**: `apps/web/app/api/auth/[...nextauth]/route.spec.ts` "returns the signed-in session without the refresh token kept in the JWT cookie"

```
Command: cd apps/web && npx jest --maxWorkers=2 "app/api/auth"
```

```text
PASS app/api/auth/[...nextauth]/route.spec.ts
  GET /api/auth/session (NextAuth route)
    ✓ returns the signed-in session without the refresh token kept in the JWT cookie (155 ms)
    ✓ returns an empty object when signed out (1 ms)

Test Suites: 1 passed, 1 total
Tests:       2 passed, 2 total
Time:        0.475 s
```

Exit code: **0**

The test asserts:

- `expect(status).toBe(200)`
- `expect(session).toEqual({ user: { name, email, id, firstName, lastName, organizationId, role }, accessToken: '...', expires: expect.any(String) })` — full shape, no extra fields
- `expect(Object.keys(session)).not.toContain('refreshToken')`
- `expect(body).not.toContain('refreshToken')`
- `expect(body).not.toContain('secret-refresh-token')`

**e2e-army**: `e2e-army/185-session-no-refresh-token.e2e.ts` (not run locally — CI/hub verify job runs against the deployed stack per owner speed rule for Mizano).

### AC2 — `Session` type has no `refreshToken` member

**Test**: `apps/web/lib/auth.spec.ts` › `session callback (client-visible session)` › "has no refreshToken member on the Session type (compile-time)"

```typescript
it('has no refreshToken member on the Session type (compile-time)', () => {
  const session = {} as Session;
  // @ts-expect-error the client-visible Session must not expose refreshToken
  expect(session.refreshToken).toBeUndefined();
});
```

**Type-check**:

```
Command: pnpm --filter @mizano/web type-check
Exit code: 0
```

**Mutation test** (performed manually at head `bc66db6d`): Adding `refreshToken: string` to `interface Session` in `lib/auth.ts` changes the exit code to error:

```
lib/auth.spec.ts(405,5): error TS2578: Unused '@ts-expect-error' directive.
```

The file was restored afterwards.

### AC3 — See §AC3 Amendment above

`grep -n "refreshToken" apps/web/lib/auth.ts` returns 13 matches, all in server-side JWT/refresh/signOut paths, none in the `session` callback, none in `interface Session`. The client-visible session has no `refreshToken`.

**Regression demo (fails on base `master`, passes on `ai/185` HEAD)**:

- **Base**: `session callback` in `auth.ts` at line 156 contained `session.refreshToken = token.refreshToken as string` AND `interface Session` included `refreshToken: string`. A test invoking the session callback and asserting `Object.keys(session)` does not contain `'refreshToken'` would **fail** on base.
- **Head**: Line 156 is replaced by a comment. `interface Session` has no `refreshToken` member. The same test **passes**.

```
Command: cd apps/web && npx jest --maxWorkers=2 lib/auth.spec.ts
```

```text
PASS lib/auth.spec.ts
  session callback (client-visible session)
    ✓ never copies the refresh token into the session
    ✓ keeps the user fields, access token and expiry
    ✓ passes a refresh error through without the refresh token
    ✓ has no refreshToken member on the Session type (compile-time)

Tests: 19 passed, 19 total   Exit code: 0
```

### AC4 — Unit test: `callbacks.session` output omits `refreshToken`

Same run as AC2/AC3 above. Tests under `session callback (client-visible session)`:

- `never copies the refresh token into the session` — asserts `Object.keys(session)` does not include `'refreshToken'` and full JSON does not contain the secret value
- `keeps the user fields, access token and expiry` — asserts the full shape `{ user: {...}, accessToken, expires }` with `toEqual`, no extra fields
- `passes a refresh error through without the refresh token` — asserts `session.error === 'RefreshAccessTokenError'` and `!session.refreshToken`

### AC5 — `pnpm --filter @mizano/web test` all existing tests green

```
Command: cd apps/web && npx jest --maxWorkers=2
Head: c3423272
```

```text
Test Suites: 49 passed, 49 total
Tests:       464 passed, 464 total
Snapshots:   0 total
Time:        9.85 s
```

Exit code: **0**

Both changed spec files (`lib/auth.spec.ts`, `app/api/auth/[...nextauth]/route.spec.ts`) are collected by the default jest config (`testMatch: ['**/*.spec.tsx', '**/*.spec.ts', ...]`) and pass.

---

## Changed Files & Test Coverage

| File                                                | Change                                                                                                                            | Tests covering it                                                                   |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `apps/web/lib/auth.ts`                              | Removed `session.refreshToken = token.refreshToken as string` (line 156); removed `refreshToken: string` from `interface Session` | `lib/auth.spec.ts` (19 tests), `app/api/auth/[...nextauth]/route.spec.ts` (2 tests) |
| `apps/web/lib/auth.spec.ts`                         | Added `session callback (client-visible session)` test group (4 tests)                                                            | Self-covering                                                                       |
| `apps/web/app/api/auth/[...nextauth]/route.spec.ts` | Added full NextAuth route integration tests (2 tests), asserting complete session shape and no `refreshToken`                     | Self-covering                                                                       |
| `e2e-army/185-session-no-refresh-token.e2e.ts`      | Added e2e-army API-level test tagged `feat:mz-auth lvl:api`                                                                       | Runs in hub verify job                                                              |

## Type-check & Lint

```
Command: pnpm --filter @mizano/web type-check   Exit code: 0
Command: pnpm --filter @mizano/web lint          Exit code: 0 (pre-existing warnings only, no new errors)
```

## Notes on Test Credentials

`e2e-army/185-session-no-refresh-token.e2e.ts` signs in as the seeded demo admin (`admin@mizano.com` / `password123`). Per the e2e-army skill, this is the prescribed account for Mizano's throwaway DB. Per the issue comments, commit `fd19dc16` (ancestor of this branch, verified: `git merge-base --is-ancestor fd19dc16 HEAD` exits 0) makes the production seed abort unless explicitly allowed, so this account is not created in any deployed environment by default.
