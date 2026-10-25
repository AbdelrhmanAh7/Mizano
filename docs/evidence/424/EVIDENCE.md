# Evidence for #424 (Supersedes part of #346)

Base: a2af2ce4. Scope: the three auth.spec.ts findings only (slices 2-4 are in AI_QUESTIONS.md).

| AC                                            | Verification                                                                                                                                                                                                                                                                                                                | Result   |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| AC1 new tests fail on base, pass on head      | `cd apps/web && npx jest lib/auth.spec.ts -t "session callback"` before the fix: 2 failed, 1 passed (own key `refreshToken` present). After: 18 passed.                                                                                                                                                                     | observed |
| AC2 no own/inherited `refreshToken` key       | test "omits refreshToken as an own, inherited and nested key or value" (unit); e2e-army test "@issue-424 AC2: session endpoint does not expose refreshToken" (ui, browser login + session fetch)                                                                                                                            | passes   |
| AC3 no key/value at any depth holds the token | same unit test, recursive `Reflect.ownKeys` scan; e2e test deep `leaks()` scan                                                                                                                                                                                                                                              | passes   |
| AC4 allowed fields unchanged                  | test "keeps the allowed session fields" (unit); e2e test verifies `user`, `accessToken` present                                                                                                                                                                                                                             | passes   |
| AC5 jest / lint / type-check                  | `npx jest lib/auth.spec.ts` exit 0 (18/18); `npx eslint lib/auth.ts lib/auth.spec.ts` exit 0; `pnpm type-check` (apps/web) exits 2 on pre-existing errors (unbuilt `@mizano/shared-types`, `@mizano/validators`, `customer-form.spec.ts`), none in auth files. Full web suite not run locally (CI runs it, per task rules). | partial  |
| AC6 small diff                                | no workflow/CI/e2e/dashboard files touched; only `apps/web/lib/auth.ts`, `apps/web/lib/auth.spec.ts`, `e2e-army/280-auth-error-contract.e2e.ts`, `docs/evidence/424/EVIDENCE.md` changed                                                                                                                                    | ok       |

## Commands run (2026-10-25)

```bash
# Unit tests
cd /Users/abdelrahmanahmed/agents/work.noindex/impl/Mizano-424
pnpm --filter ./apps/web exec jest lib/auth.spec.ts --maxWorkers=2
# PASS 18/18

# Lint on changed files
pnpm --filter ./apps/web exec eslint lib/auth.ts lib/auth.spec.ts
# exit 0 (no errors)

# Type-check (apps/web)
pnpm --filter ./apps/web type-check
# exit 2 (pre-existing errors only, see above)
```

Fix: `session` callback no longer copies `token.refreshToken` into the client-visible session; the unused `Session.refreshToken` type was removed (no other web code read it). Added e2e-army test `feat:mz-auth` (lvl:ui) verifying the `/api/auth/session` endpoint does not expose `refreshToken` after browser-based login.
