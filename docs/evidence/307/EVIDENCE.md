# Evidence: Issue #307 — Fix Unit Tests TS2349 Supertest Import and Disambiguate CI Group Failures

## Overview

- **Issue**: #307 (`[blocker] check "Unit Tests" is red on 3 PRs (one shared cause?)`)
- **Base Commit**: `bf3f67a80b7d8b5c986c757f4955c3c0ca65ddcb` (`master`)
- **Tested Head**: `d9fff63e`
- **Originating Sentry Issue**: None (CI build/test compilation error and blocker-breaker group detection, not a runtime Sentry issue).
- **User-facing flow / E2E**: Not user-facing. E2E: not needed — internal unit test import fix (`supertest` callable require import) and failure classification. No UI or routing changes.

---

## Changed Covering Tests

- `apps/api/src/throttler-ip.guard.spec.ts` (25 passing unit tests: `getTracker` IP extraction, trusted proxy CIDR parsing, trust proxy application, burst login throttling 401/429 isolation, and spoofing resistance).

---

## Numbered Acceptance Criteria

1. **AC1 (Callable Supertest Import)**: `throttler-ip.guard.spec.ts` uses callable CommonJS import syntax `import request = require('supertest')`, eliminating TS2349 compilation failure while executing all 25 unit test cases (HTTP requests, proxy trust chains, and login throttling).
2. **AC2 (Failure Disambiguation across CI Group)**: Evidence and classification demonstrates that CI check "Unit Tests" failures across PRs #81, #146, and #229 were distinct root causes (PR #81: supertest TS2349 compilation error in `throttler-ip.guard.spec.ts`; PR #146: intake worker deploy config assertion in `worker-deploy-config.spec.ts`; PR #229: deploy workflow triggers assertion in `deploy-workflow.spec.ts`), proving that the blocker breaker group heuristic falsely clustered 3 separate issues.
3. **AC3 (Gate & Workflow Preservation)**: No CI workflows (`.github/workflows/*`), package manifests, build scripts, or merge/review gates are modified, deleted, or weakened.
4. **AC4 (Review Lesson Recorded)**: Review lesson documenting the CommonJS/TypeScript callable import requirement for `supertest` is recorded in `docs/agents/review-lessons.md`.
5. **AC5 (Clean Local Verification & Pre-push Gates)**: Local verification suite passes cleanly: `throttler-ip.guard.spec.ts` 25/25 pass, `pnpm --filter api run type-check` exits 0, `pnpm --filter api run lint` exits 0.

---

## Verification Matrix

| AC ID   | Requirement Description                       | Test / Command                                                                  | Observed Result                                                                                                              | Exit Code | Status     |
| ------- | --------------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------- | ---------- |
| **AC1** | Throttler IP guard unit tests execution       | `pnpm --filter api exec jest src/throttler-ip.guard.spec.ts`                    | 25/25 tests PASS (all IP extraction, trusted proxy, and HTTP assertions pass)                                                | 0         | **PASSED** |
| **AC1** | TypeScript compilation without TS2349         | `tsc --noEmit` across `throttler-ip.guard.spec.ts` with `esModuleInterop: true` | Zero diagnostics (clean compilation, no TS2349)                                                                              | 0         | **PASSED** |
| **AC2** | Disambiguate PR #81 failure signature         | `gh run view 39063056020 --job 117484834797`                                    | Log confirms TS2349 in `throttler-ip.guard.spec.ts:234,259` due to `import * as request from 'supertest'`                    | 0         | **PASSED** |
| **AC2** | Disambiguate PR #146 failure signature        | `gh run view 39039462614 --job 117415804951`                                    | Log confirms failure in `worker-deploy-config.spec.ts:98:22` (intake worker deploy config assertion)                         | 0         | **PASSED** |
| **AC2** | Disambiguate PR #229 failure signature        | `gh run view 39491266427 --job 118864749554`                                    | Log confirms failure in `deploy-workflow.spec.ts:35:51` (deploy workflow triggers assertion)                                 | 0         | **PASSED** |
| **AC3** | Verify no workflow or CI config modifications | `git status --porcelain`                                                        | Only `apps/api/src/throttler-ip.guard.spec.ts`, `docs/agents/review-lessons.md`, and `docs/evidence/307/EVIDENCE.md` touched | 0         | **PASSED** |
| **AC4** | Review lesson documented                      | `git diff docs/agents/review-lessons.md`                                        | CommonJS callable import rule added to section 12                                                                            | 0         | **PASSED** |
| **AC5** | API TypeScript type-check                     | `pnpm --filter api run type-check`                                              | Clean (0 errors across `tsc --noEmit` and `test/tsconfig.e2e.json`)                                                          | 0         | **PASSED** |
| **AC5** | API ESLint check                              | `pnpm --filter api run lint`                                                    | Clean (0 errors, 0 warnings across all api source/test files)                                                                | 0         | **PASSED** |

---

## Bug Fix / Regression Demonstration

- **Base behaviour on master (`bf3f67a8`) / PR #81 (`5a2ef424`)**:
  - `throttler-ip.guard.spec.ts:12` had `import * as request from 'supertest';`.
  - When compiled with TypeScript compiler with `esModuleInterop: true` (as on PR #81 or standard TS configs), calling `request(app.getHttpServer())` fails with:
    ```
    src/throttler-ip.guard.spec.ts:234:23 - error TS2349: This expression is not callable.
      Type '{ default: SuperTestStatic; Test: typeof Test; agent: typeof TestAgent & ((app?: App | undefined, options?: AgentOptions | undefined) => TestAgent<...>); }' has no call signatures.
      Type originates at this import. A namespace-style import cannot be called or constructed, and will cause a failure at runtime. Consider using a default import or import require here instead.
    ```
- **Head behaviour**:
  - `throttler-ip.guard.spec.ts:12` uses `import request = require('supertest');`.
  - Verified with `typescript` compiler: zero diagnostics emitted (clean callable signature).
  - All 25 unit tests pass cleanly.

---

## Multi-PR Root Cause Disambiguation Table

| PR #     | Head SHA                                   | Actions Run / Job ID                   | Primary Failure in "Unit Tests" Job                                               | Distinct Root Cause                                                  |
| -------- | ------------------------------------------ | -------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| **#81**  | `5a2ef4240b49020ac9dc500dbcf7c665ef7670e1` | Run `39063056020` / Job `117484834797` | `TS2349: This expression is not callable` in `throttler-ip.guard.spec.ts:234,259` | Supertest namespace import incompatible with `esModuleInterop: true` |
| **#146** | `687cf1aa`                                 | Run `39039462614` / Job `117415804951` | Jest assertion error at `worker-deploy-config.spec.ts:98:22`                      | Intake worker deploy configuration assertion failure                 |
| **#229** | `b051e70e`                                 | Run `39491266427` / Job `118864749554` | Jest assertion error at `deploy-workflow.spec.ts:35:51`                           | Deploy workflow triggers assertion mismatch                          |

The blocker breaker rule `ns.length >= cfg.ciGroupMinPrs` (threshold = 3) detected 3 open PRs with red "Unit Tests" jobs and assumed a single shared cause (`cigroup:AbdelrhmanAh7/Mizano:Unit Tests`). As shown by the first-hand job logs above, each PR failed for a completely independent reason.

---

## UI Verification (Screenshots / RTL & LTR)

**UI is EXEMPT**:

- This issue modifies API unit test import syntax (`apps/api/src/throttler-ip.guard.spec.ts`), review lessons (`docs/agents/review-lessons.md`), and evidence (`docs/evidence/307/EVIDENCE.md`).
- No frontend files in `apps/web` are modified.
- No Playwright screenshots or RTL/LTR web tests are applicable.

---

## Skills Used

- `model-effort-routing`: Explicitly recorded tool (`agy`), model (`Gemini 3.8 Flash`), and reasoning effort (`High`).
- `diagnosing-bugs` & `systematic-debugging`: Retrieved and diagnosed exact CI job failure logs across PRs #81, #146, and #229, isolating the distinct signatures.
- `test-first engineering`: Verified reproduction of TS2349 on base and verified head passes all 25 unit tests.
- `verification-before-completion`: Executed test, type-check, and lint commands, recording exact commands, outputs, and exit codes.
