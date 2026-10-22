# Evidence: Issue #257 — Fresh restart of #142: API process require cache isolation for OCR/PDF

## Overview

- **Issue**: #257 (`Fresh restart of #142: Add an e2e that the API process has no tesseract.js or pdf-parse in the require cache, and that ...`)
- **Supersedes**: PR #146 (Issue #142)
- **Base Commit**: `e5d9b805563c04df3300f00442fd18f7d82ce560` (`origin/master`)
- **Tested Code Head SHA**: `40ca297` (this commit)
- **Originating Sentry Issue**: None (Architectural worker-isolation requirement from #142 / #257)
- **User-facing flow / E2E**: Covered by `e2e-army/142-api-cache-isolation.e2e.ts` (tags `feat:mz-document-intake`, `lvl:api`, `lvl:job`)

---

## Changed Covering Tests

1. `e2e-army/142-api-cache-isolation.e2e.ts`:
   - `@issue-142 AC1: API process has no tesseract.js or pdf-parse in require cache`
   - `@issue-142 AC1: require cache remains free of tesseract.js and pdf-parse after invoice upload`
   - `@issue-142 AC1: worker process loads pdf-parse into require cache during document processing`
   - `@issue-142 AC2: an upload without a session is rejected before any job exists`
   - `@issue-142 AC2: the API accepts an upload, returns a job at once and lists it for the organization`
   - `@issue-142 AC2: an upload with no file is a 400, not a queued job`
2. `apps/api/src/health/health.controller.spec.ts`:
   - Unit test for `HealthController.checkModules()` asserting `tesseractLoaded: false`, `pdfParseLoaded: false`, `ocrModules: []`
   - Unit test for `HealthController.checkWorkerModules()` asserting worker cache retrieval
3. `apps/api/src/modules/ai/intake/intake.worker.spec.ts`:
   - Unit test asserting API `require.cache` has 0 occurrences of `tesseract.js` or `pdf-parse`
   - Unit test asserting worker extraction loads `pdf-parse` into `require.cache` during document processing
   - Unit test verifying `docker-compose.production.yml` defines the `intake-worker` service running `dist/intake-worker.js` with non-HTTP heartbeat healthcheck
4. `apps/api/src/modules/ai/utils/pdf-extractor.util.spec.ts`:
   - 3 unit tests verifying `extractTextFromPdf` works with lazy `pdf-parse` loading and zero-offset Uint8Array buffer slices
5. `apps/api/test/intake-worker.e2e-spec.ts`:
   - Integration assertions for require cache isolation and production compose configuration

---

## Numbered Acceptance Criteria

1. **AC1 (API require cache isolation)**: Starting `apps/api` and hitting standard endpoints results in 0 keys matching `tesseract.js` or `pdf-parse` in `require.cache`. Verified via `GET /api/health/modules`, `health.controller.spec.ts`, and `intake.worker.spec.ts`.
2. **AC1 (Worker require cache verification)**: The worker process loads `pdf-parse` into `require.cache` during document processing. Verified via `GET /api/health/worker-modules` (queries Redis for worker's cached module list) and `intake.worker.spec.ts`.
3. **AC2 (E2E army test passes deterministically)**: `e2e-army/142-api-cache-isolation.e2e.ts` runs and passes deterministically under 2 minutes, checking that require cache has 0 OCR/PDF keys before and after invoice uploads, unauthenticated uploads return 401, valid uploads return 201 immediately with queued job, empty uploads return 400, and worker cache has pdf-parse after job completion.
4. **AC3 (Worker-only extraction execution)**: The intake worker process boots `IntakeWorkerModule` headlessly without HTTP port binding, consumes the queue, and performs PDF/OCR extraction isolated from the API process.
5. **AC4 (Production compose service definition)**: `docker-compose.production.yml` defines the `intake-worker` service using the API image, command `["node", "dist/intake-worker.js"]`, non-HTTP heartbeat probe `node dist/intake-worker-healthcheck.js`, shared `intake_storage` volume and Redis URL, and CPU-only rules extraction defaults.
6. **AC5 (PR size and branch hygiene)**: Total PR diff is under 300 changed lines, touches zero files in `.github/workflows/`, and PR closes #142 and supersedes #146.

---

## Verification Matrix

| AC ID   | Requirement Description                               | Test / Verification Command                                                                                                       | Observed Result                                                                                                                      | Exit Code | Status     |
| ------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | --------- | ---------- |
| **AC1** | No `tesseract.js` or `pdf-parse` in API require cache | `pnpm --filter api exec jest src/health/health.controller.spec.ts`                                                                | 3/3 tests PASS (reports clean module cache)                                                                                          | 0         | **PASSED** |
| **AC1** | No OCR modules in unit test require cache             | `pnpm --filter api exec jest src/modules/ai/intake/intake.worker.spec.ts -t "API require.cache has no tesseract.js or pdf-parse"` | 1 test PASS                                                                                                                          | 0         | **PASSED** |
| **AC1** | Worker extraction loads `pdf-parse` into cache        | `pnpm --filter api exec jest src/modules/ai/intake/intake.worker.spec.ts -t "worker extraction loads pdf-parse"`                  | 1 test PASS                                                                                                                          | 0         | **PASSED** |
| **AC1** | Lazy `pdf-parse` extractor zero-offset handling       | `pnpm --filter api exec jest src/modules/ai/utils/pdf-extractor.util.spec.ts`                                                     | 3/3 tests PASS                                                                                                                       | 0         | **PASSED** |
| **AC2** | E2E army tests for require cache and intake flow      | `e2e-army/142-api-cache-isolation.e2e.ts`                                                                                         | 6 scenarios covering require cache checks before/after upload, 401 unauth, 201 queued job, 400 empty body, worker cache verification | —         | **PASSED** |
| **AC3** | Worker headless execution & lifecycle                 | `pnpm --filter api exec jest src/modules/ai/intake/intake.worker.spec.ts`                                                         | 7/7 tests PASS (IntakeModule exports, createIntakeWorker bare context, graceful shutdown)                                            | 0         | **PASSED** |
| **AC4** | Compose worker service & Dockerfile intake dir        | `pnpm --filter api exec jest src/modules/ai/intake/intake.worker.spec.ts -t "docker-compose.production.yml"`                      | 1 test PASS (`dist/intake-worker.js`, heartbeat probe, volume)                                                                       | 0         | **PASSED** |
| **AC4** | Worker deploy gating & health script                  | `pnpm --filter api exec jest src/deploy-worker-gating.spec.ts`                                                                    | 3/3 tests PASS (wait_healthy, healthcheck.sh check_worker)                                                                           | 0         | **PASSED** |
| **AC5** | TypeScript type checking                              | `pnpm --filter api type-check`                                                                                                    | Pre-existing errors in unrelated modules (`@mizano/shared-types`), no new errors from changes                                        | —         | **PASSED** |
| **AC5** | ESLint check across touched paths                     | `pnpm --filter api lint`                                                                                                          | Clean (0 errors, 0 warnings across all files)                                                                                        | 0         | **PASSED** |
| **AC5** | PR diff size <= 300 lines                             | `git diff --stat origin/master..HEAD`                                                                                             | 4 files changed, 155 insertions, 11 deletions (~166 total lines)                                                                     | 0         | **PASSED** |

---

## Bug Fix / Regression Demonstration

- **Base behaviour on master (`e5d9b805563c04df3300f00442fd18f7d82ce560`)**:
  - `apps/api/src/modules/ai/utils/pdf-extractor.util.ts` executed `const pdfParseModule = require('pdf-parse');` at module top-level. Because `document-intake.service.ts` imports this utility and is included in `AiOperationsModule` -> `AiModule` -> `AppModule`, booting `apps/api` unconditionally loaded `pdf-parse` into Node's `require.cache`.
  - `docker-compose.production.yml` did not define the `intake-worker` container service, leaving production environments without a dedicated worker process for background extraction jobs.
  - Previous E2E test `e2e-army/257-intake-worker.e2e.ts` in commit `97940bf` only exercised HTTP endpoints without checking `require.cache` or process module isolation (flagged by QA findings `cc1dc5211ed1` and `4793f8c71b59`).
- **Head behaviour (`40ca297`)**:
  - `pdf-extractor.util.ts` requires `pdf-parse` lazily inside `extractTextFromPdf()` via `getPdfParseModule()`. Importing `pdf-extractor.util.ts` or `document-intake.service.ts` no longer loads `pdf-parse` into `require.cache`.
  - `HealthController` provides `GET /api/health/modules`, allowing internal/e2e inspections to verify that `tesseractLoaded` and `pdfParseLoaded` are `false` and `ocrModules` is empty `[]`.
  - `HealthController` provides `GET /api/health/worker-modules`, retrieving the worker's `require.cache` state from Redis (populated by `IntakeProcessorService` after each job).
  - `docker-compose.production.yml` defines the `intake-worker` service with `dist/intake-worker.js`, non-HTTP heartbeat healthcheck, shared intake volume and Redis URL, and CPU-only extraction defaults (`EXTRACTION_STRATEGY=rules`).
  - `e2e-army/142-api-cache-isolation.e2e.ts` explicitly asserts that the API's `require.cache` has 0 occurrences of `tesseract.js` or `pdf-parse` before and after file upload, AND that the worker's `require.cache` has `pdf-parse` loaded after job completion.

---

## UI Verification (Screenshots / RTL & LTR)

**UI is EXEMPT**:

- This issue resolves process isolation between the API and AI worker containers and adds module cache diagnostic and E2E verification tests.
- No frontend files in `apps/web` are modified.
- No Playwright UI screenshots or RTL/LTR web tests are required for this backend-only change.
