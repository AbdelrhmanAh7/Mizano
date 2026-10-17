# EVIDENCE.md — Issue #142 Verification

## Overview

- **Issue**: #142 (Add an e2e that the API process has no tesseract.js or pdf-parse in the require cache, and that intake passes through the worker container)
- **Branch**: `ai/142`
- **PR**: #146
- **Audit Date**: 2026-10-08

---

## Requirements Verification Matrix

| REQ ID       | Requirement                                                                                                          | Verification Method                                                                                                                                            | Status |
| ------------ | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| REQ-MZ-142-1 | The e2e test must confirm that `tesseract.js` is not in the require cache of the API process.                        | `apps/api/test/intake-worker-isolation.e2e-spec.ts` (AC1: recording mock + ModulesContainer check)                                                             | PASSED |
| REQ-MZ-142-2 | The e2e test must confirm that `pdf-parse` is not in the require cache of the API process.                           | `apps/api/test/intake-worker-isolation.e2e-spec.ts` (AC1: recording mock + ModulesContainer check)                                                             | PASSED |
| REQ-MZ-142-3 | The e2e test must ensure that the intake process successfully routes through the worker container.                   | `apps/api/test/intake-worker-isolation.e2e-spec.ts` (AC2: unhandled before worker boot, processed to EXTRACTED after worker boots, compose service entrypoint) | PASSED |
| REQ-MZ-142-4 | The test must be implemented using the existing e2e test framework and must not introduce new external dependencies. | Executed via existing NestJS testing module + Jest E2E (`jest-e2e.json`)                                                                                       | PASSED |

---

## Detailed Test Logs & Verification Evidence

### 1. Worker Isolation E2E Spec (`intake-worker-isolation.e2e-spec.ts`)

**Command:**

```bash
DATABASE_URL="postgresql://abdelrahmanahmed@localhost:5432/mizano_142_e2e" REDIS_URL="" pnpm --filter api exec jest --runInBand --config test/jest-e2e.json test/intake-worker-isolation.e2e-spec.ts
```

**Output:**

```text
PASS test/intake-worker-isolation.e2e-spec.ts (7.131 s)
  Intake worker isolation (e2e) @issue-142
    ✓ @e2e @flow:intake @issue-142 AC1: API app graph never loads tesseract.js or pdf-parse, even after an upload (37 ms)
    ✓ @e2e @flow:intake @issue-142 AC2: without AiWorkerModule the enqueued job is never processed (311 ms)
    ✓ @e2e @flow:intake @issue-142 AC2: once AiWorkerModule is booted the same job is processed (875 ms)
    ✓ @e2e @flow:intake @issue-142 AC2: compose runs the worker from the API image with the worker entrypoint (2 ms)

Test Suites: 1 passed, 1 total
Tests:       4 passed, 4 total
Snapshots:   0 total
Time:        7.323 s
```

### 2. Full Intake E2E Suite (`intake.e2e-spec.ts`)

**Command:**

```bash
DATABASE_URL="postgresql://abdelrahmanahmed@localhost:5432/mizano_142_e2e" REDIS_URL="" pnpm --filter api exec jest --runInBand --config test/jest-e2e.json test/intake.e2e-spec.ts
```

**Output:**

```text
PASS test/intake.e2e-spec.ts (11.916 s)
  Document intake (e2e)
    ✓ upload stores the original, creates a durable job and extracts it (349 ms)
    ✓ serves the preserved original with its content type, byte for byte (11 ms)
    ✓ a duplicate upload returns the same job without a second extraction (15 ms)
    ✓ the same file in another tenant is a separate job (48 ms)
    ✓ lists only the caller organization and filters by status (28 ms)
    ✓ tenant B gets 404 for tenant A job, result, original, retry and SSE (34 ms)
    ✓ anonymous callers get 401 on every intake route (7 ms)
    ✓ the owner can read the SSE stream; it ends on the terminal state with the result (4 ms)
    ✓ job state survives an application restart and stays readable (132 ms)
    ✓ a job whose worker died mid-run is recovered after restart and finishes once (1686 ms)
    ✓ failures back off and dead-letter after maxAttempts; retry re-runs idempotently (417 ms)
    ✓ confirm with a jobId approves the job once and links the draft (58 ms)
    ✓ a confirmed scanned draft has the same totals as the equivalent manual bill (34 ms)
    ✓ confirm rejects a currency different from the organization base currency (8 ms)
    ✓ a soft-deleted job does not block re-uploading the same file (partial unique index) (202 ms)
    ✓ a FAILED job is re-enqueued by the periodic sweep and finishes (323 ms)

Test Suites: 1 passed, 1 total
Tests:       16 passed, 16 total
Snapshots:   0 total
Time:        12.134 s
```

### 3. API Unit Tests

**Command:**

```bash
pnpm --filter api test
```

**Output:**

```text
Test Suites: 136 passed, 136 total
Tests:       2200 passed, 2200 total
Snapshots:   0 total
Time:        11.468 s
```

### 4. Code Quality & Full Build Gate

**Commands:**

```bash
pnpm lint
pnpm turbo run type-check --force
pnpm build --force
```

**Output:**

- `pnpm lint`: 4 packages successful (0 errors).
- `pnpm turbo run type-check`: 6 tasks successful (0 errors).
- `pnpm build`: 4 packages built successfully in 54.1s (`@mizano/shared-types`, `@mizano/validators`, `api`, `@mizano/web`).

---

## Root-Cause Analysis: CI Round 1 Failure

- **Symptom**: Local CI failed on step `Build` (exit 1) on PR #146 (`sha=5c47baa637038db8ccfc3e67b157cab26c23a9c6`).
- **Root Cause**: During Next.js production build (`@mizano/web#build`), `next/font/google` attempts to fetch font binaries (`Inter` and `Noto Sans Arabic`) from Google Fonts CDN (`fonts.googleapis.com` / `fonts.gstatic.com`). The local runner experienced a transient network socket hang up and ETIMEDOUT during that run, causing Webpack to error out with `Failed to fetch Inter from Google Fonts`.
- **Verification**: Locally verified clean build with `pnpm build --force` where all 4 packages build without error, and subsequent localci runs completed successfully in ~77s.

---

## Round 3: review findings on PR #146 (merge of master `1df27af` at `962b028`, e2e-army at `37c2640`)

Acceptance criteria for this round:

- **AC1** The production compose worker has a non-HTTP healthcheck instead of the API's inherited probe.
- **AC2** `/data/intake` is writable by UID 1001 on a fresh named volume (pre-created and chowned before `USER nestjs`); api and worker share the volume, storage dir and `REDIS_URL`.
- **AC3** The worker defaults to the CPU-only extractor (`rules`, Ollama off, no `qwen3-vl`) with `INTAKE_TESSDATA_DIR=/app/apps/api`.
- **AC4** The Pi compose runs a real `worker` service (same entrypoint, healthcheck, originals volume); `pnpm dev` starts the worker.
- **AC5** The worker fails fast when `REDIS_URL` is unset (IntakeQueueService otherwise falls back to a private in-process queue).
- **AC6** The e2e-army file covers the upload API request-level (401 unauthenticated, 201 + listed job, 400 without file).

| AC         | Verification                                                                                                                  | Observed                                                                                                                                                                                                                                                         |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC1-AC4    | `apps/api/src/modules/ai/worker/worker-deploy-config.spec.ts` (parses both compose files + Dockerfile)                        | Base deploy files: 7 failed, 2 passed. Head: all pass.                                                                                                                                                                                                           |
| AC5        | `apps/api/src/modules/ai/worker/worker-config.spec.ts`                                                                        | 4 passed                                                                                                                                                                                                                                                         |
| AC1-AC5    | `cd apps/api && pnpm exec jest --maxWorkers=2 src/modules/ai/worker src/modules/ai/intake/intake-processor.timings.spec.ts`   | `Test Suites: 3 passed, Tests: 19 passed`                                                                                                                                                                                                                        |
| lint       | `pnpm --filter api exec eslint src/main.worker.ts src/modules/ai/worker`                                                      | exit 0                                                                                                                                                                                                                                                           |
| type-check | `node ../../node_modules/typescript/bin/tsc --noEmit` (and `-p test/tsconfig.e2e.json`) in `apps/api` after `prisma generate` | exit 2, only error: `src/common/utils/coderabbit-config.spec.ts(7,23) TS7016 js-yaml` (file from master, not changed here; `@types/js-yaml` is declared in `apps/api/package.json` but absent from this local install). No error in any file changed by this PR. |
| AC6        | `e2e-army/142-intake-worker.e2e.ts`                                                                                           | NOT run locally: needs the hub verify stack. Runs in the `e2e-army` gate.                                                                                                                                                                                        |

Not verified locally: `apps/api/test/*.e2e-spec.ts` (no PostgreSQL/Redis in the sandbox) and the deploy workflow change (left to the owner, see `AI_QUESTIONS.md`).
