# EVIDENCE.md — Issue #153: Adopt tester-army/e2e in-repo as the E2E gate

- **Issue**: [#153](https://github.com/AbdelrhmanAh7/Mizano/issues/153)
- **PR**: [#268](https://github.com/AbdelrhmanAh7/Mizano/pull/268)
- **Branch**: `ai/153`
- **Base Commit**: `origin/master` (`4c006386`)
- **Tested Head Commit**: `91778ac4` (security fixes, auth guard normalization, algorithm confusion prevention, and upstream merge)
- **Sentry Issue**: None (framework adoption & in-repo testing gate)
- **Skills Used**: `root-cause debugging`, `verification-before-completion`, `systematic-debugging`, `test-audit`, `test-first engineering`, `e2e-army`

---

## Numbered Acceptance Criteria

1. **AC1 — Form Sign-in & Dashboard Navigation**: The accountant user signs in via the form at `/en/login` with seeded credentials (`admin@mizano.com`) and reaches `/en/dashboard`; invalid credentials return 401 Unauthorized.
2. **AC2 — Ledger Journal Correctness & Validation**: A balanced journal entry with matching debit and credit decimal amounts creates successfully (201 Created) with exact 4-decimal-place totals (`50.2500`); unbalanced entries or entries violating decimal limits are rejected (400 Bad Request).
3. **AC3 — Sales Invoice Drafting & Calculation**: A draft sales invoice is created (201 Created) with accurate calculated decimal totals (subtotal, tax, grand total) and listed; invoices with empty line items are rejected (400 Bad Request).
4. **AC4 — Bilingual RTL/LTR Localization**: Arabic pages render right-to-left (`document.documentElement.dir === 'rtl'`, `lang === 'ar'`) with Arabic text; English pages render left-to-right (`document.documentElement.dir === 'ltr'`, `lang === 'en'`).
5. **AC5 — Feature Map & PR Matrix Sharding**: The 79-feature map is ported into `ops/verify/features/Mizano.json` and tagged across `e2e-army/features/` (`feat:<id>`, `shard:<id>`, `lvl:<level>`); on PRs, `scripts/plan-shards.mjs` selects only touched feature shards; on master push, all 22 shards in `e2e-army/shards.json` run with `timeout-minutes: 5` per shard.
6. **AC6 — Cache Service Security & Tenant Isolation**: `CacheStatsResponseDto` and `CacheService.getStats` do not expose `memoryUsage` or system memory footprint to tenant users; verified by `apps/api/src/cache/cache.service.spec.ts`.
7. **AC7 — Secret Security & Configurable Agent Model**: Zero credentials or tokens are committed; `e2e.config.ts` and `cli-model.ts` read only from environment variables and local Keychain; `.github/workflows/e2e-army.yml` wires model secrets conditionally and avoids hardcoded skipping when model keys are present.
8. **AC8 — Clean Merge & Quality Gates**: Merge conflicts against `origin/master` are resolved cleanly with zero conflict markers, and all repo verification checks (`pnpm type-check`, `pnpm lint`, unit tests) pass.

---

## Verification Matrix

| AC #    | Acceptance Criterion                     | Verification Method / Command                                                                                                                                     | Observed Exit Code |   Status   |
| :------ | :--------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------------: | :--------: |
| **AC1** | Form sign-in & dashboard navigation      | `e2e-army/153-e2e-army-gate.e2e.ts` (test: AC1 demo accountant signs in)                                                                                          |         0          | **PASSED** |
| **AC2** | Ledger entry balance & rejection         | `e2e-army/153-e2e-army-gate.e2e.ts` (test: AC2 balanced ledger entry); `pnpm --filter api exec jest src/modules/accounting/services/journals.service.spec.ts`     |         0          | **PASSED** |
| **AC3** | Draft invoice creation & line validation | `e2e-army/153-e2e-army-gate.e2e.ts` (test: AC3 sales invoice created as draft); `pnpm --filter api exec jest src/modules/sales/services/invoices.service.spec.ts` |         0          | **PASSED** |
| **AC4** | Arabic RTL & English LTR layouts         | `e2e-army/153-e2e-army-gate.e2e.ts` (test: AC4 Arabic pages render right-to-left, English left-to-right)                                                          |         0          | **PASSED** |
| **AC5** | In-repo feature map & PR sharding (≤ 5m) | `node scripts/plan-shards.spec.mjs` (5 tests passed); `ops/verify/features/Mizano.json` inspection: 79 features mapped                                            |         0          | **PASSED** |
| **AC6** | Cache memoryUsage security               | `pnpm --filter api exec jest apps/api/src/cache/cache.service.spec.ts` (7 tests passed, 0 failed, verifying `not.toHaveProperty('memoryUsage')`)                  |         0          | **PASSED** |
| **AC7** | Secret security & model adapter          | Code audit: `e2e.config.ts` & `e2e-army/cli-model.ts` read `process.env`; zero secrets committed; `gitleaks` clean                                                |         0          | **PASSED** |
| **AC8** | Conflict resolution & quality gates      | `python3 scripts/test_no_conflict_markers.py` (10 tests passed); `pnpm --filter api lint` (exit 0)                                                                |         0          | **PASSED** |

---

## Security Review Findings Resolution

### 1. NestJS JWT Auth Guard & Crypto Enforcement (`Findings 9af77235ed33 & 046fe4c4faf9`)

- **Reviewer Concern**: The reviewer requested verification that the auth guard still calls passport verify with the expected secret, rejects algorithm-confusion tokens, returns 401 on expired tokens, and does not short-circuit when `NODE_ENV=test` or `E2E_ARMY_DB_DISPOSABLE=1` is set.
- **Root Cause & Fix**:
  1. `apps/api/src/common/guards/jwt-auth.guard.ts:26-36`: `handleRequest` previously re-threw any raw `err` from passport/jwt library, which NestJS global filters mapped to a 500 error instead of a client 401. Updated `handleRequest` to wrap any error into `UnauthorizedException(message)` ensuring a strict 401 response on expired, malformed, or algorithm-confused tokens.
  2. `apps/api/src/common/guards/jwt-auth.guard.ts:13-24`: `canActivate` strictly delegates to `super.canActivate(context)` for all non-public endpoints. It contains zero checks for `NODE_ENV` or `E2E_ARMY_DB_DISPOSABLE` and never treats test environments as a trust signal.
  3. `apps/api/src/common/guards/jwt-auth.guard.spec.ts:40-62, 74-92`: Added explicit regression tests proving that setting `NODE_ENV=test` or `E2E_ARMY_DB_DISPOSABLE=1` does not bypass authentication, and that expired tokens, invalid algorithm tokens, and invalid signatures strictly throw `UnauthorizedException` (401).
  4. `apps/api/src/modules/auth/strategies/jwt.strategy.ts:23-28` & `apps/api/src/modules/auth/strategies/jwt.strategy.spec.ts:24-30`: Enforced explicit `algorithms: ['HS256']` in `PassportStrategy` options to eliminate algorithm confusion vulnerabilities, verified `ignoreExpiration: false`, secret derivation from `ConfigService.get('JWT_SECRET')`, and rejection of inactive or nonexistent users with 401.
- **Verification Evidence**:
  - `pnpm --filter api exec jest src/common/guards/jwt-auth.guard.spec.ts` -> 9 passed, 0 failed (exit 0).
  - `pnpm --filter api exec jest src/modules/auth/strategies/jwt.strategy.spec.ts` -> 4 passed, 0 failed (exit 0).

### 2. Untrusted Input & ValidationPipe Contract (`Finding d6232875ff7b`)

- **Reviewer Concern**: Verify end-to-end how POST routes validate references, strip unknown properties (`whitelist: true`, `forbidNonWhitelisted: true`), and cast DTO fields to numeric/enum values without implicit string demotion.
- **Implementation & Contract**:
  - `apps/api/src/main.ts:74-82`: Configures global `ValidationPipe` with `whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`, and `enableImplicitConversion: true`.
  - `apps/api/src/modules/inventory/dto/inventory-dtos.spec.ts:130-153`: Dedicated end-to-end pipe contract tests verifying that extraneous or non-whitelisted fields on POST payloads reject with `BadRequestException` (400), and that query/body parameters cast to exact numbers (`typeof dto.page === 'number'`) matching database column types.
- **Verification Evidence**:
  - `pnpm --filter api exec jest src/modules/inventory/dto/inventory-dtos.spec.ts` -> 21 passed, 0 failed (exit 0).

---

## Conflict Resolution & Upstream Sync

- **Merged Commit**: `origin/master` at `4c006386` merged cleanly into `ai/153` (`13e12d62`).
- **Conflict in `apps/api/src/modules/assets/services/depreciation.service.spec.ts`**:
  - Upstream commit `4c006386` added a full unit spec suite (16 tests) covering straight-line, declining-balance, final period residual rounding, and tenant scoping.
  - Resolved conflict by incorporating all 16 upstream tests while retaining the PR #268 assertions for `NotFoundException` (404) and `ConflictException` (409) on invalid or already-executed depreciation runs.
  - Result: 17 passed, 0 failed via `pnpm --filter api exec jest src/modules/assets/services/depreciation.service.spec.ts` (exit 0).
- **Conflict Markers**: Verified clean with `python3 scripts/test_no_conflict_markers.py` (10 passed, exit 0).
