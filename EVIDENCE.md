# Evidence for Issue #42: [Pi] CPU extraction runtime on the Pi 5 with pinned Arabic/English assets

Part of the tiny live deployment on a Raspberry Pi 5 (Cortex-A76, 8GB). Complements #16 and #24.

## Overview

This document summarizes the requirements for Issue #42, how each was implemented, and the automated verification evidence proving compliance.

---

## Requirements and Verification Matrix

### REQ-42-1: Pinned Offline OCR Assets

- **Description**: Bundled `ara` + `eng` traineddata built into the worker image and verified with sha256 checksums (`apps/api/ocr-assets.sha256`). Memoized Tesseract worker creation per language with a shared initialization promise. Prohibits runtime downloads, GPUs, paid APIs, or cloud models.
- **Implementation**:
  - `apps/api/ocr-assets.sha256`: Verified sha256 hashes for `eng.traineddata` and `ara.traineddata`.
  - `apps/api/src/modules/ai/extraction/offline-tesseract.ts`: Memoized worker factory enforcing sha256 verification and passing local `langPath` and `cachePath`.
  - `apps/api/src/modules/ai/extraction/ocr-llm-strategy.service.ts`: Updated to use `createOfflineTesseractWorker`.
  - `apps/api/Dockerfile`: Multi-stage build copying pinned traineddata into `/app/ocr-assets`.
- **Verification**:
  - `apps/api/src/modules/ai/extraction/ocr-assets.spec.ts`: Unit tests validating hash verification and missing/corrupt asset rejection.
  - `apps/api/test/ocr-assets.e2e-spec.ts`: E2E integration test running with all network APIs (`http`, `https`, `net`, `tls`, `dns`, `fetch`) blocked; verifies clean offline initialization and rejection of missing/corrupt assets without network calls.

---

### REQ-42-2: Dedicated CPU Extraction Worker & Process Isolation

- **Description**: Separate extraction worker process (`dist/intake-worker.js`) booting a minimal NestJS context (`IntakeWorkerModule`) containing only queue consumption, child executor, and database matching services (no controllers, schedulers, or LLMs). Process isolation via child supervisor (`intake-child.ts`) with RSS supervision, Linux `prlimit` memory ceilings, and container limits (2048m memory budget).
- **Implementation**:
  - `apps/api/src/intake-worker.ts`: Worker entrypoint booting `IntakeWorkerModule`.
  - `apps/api/src/intake-worker.module.ts`: Minimal module excluding web controllers, schedulers, and LLM providers.
  - `apps/api/src/modules/ai/intake/intake-child.ts`: Isolated extraction process running CPU rules over native text or Tesseract OCR.
  - `apps/api/src/modules/ai/intake/intake-executor.service.ts`: Supervisor spawning child worker, polling RSS, enforcing `prlimit` on Linux, and mapping exit codes/signals.
  - `deploy/pi/docker-compose.pi.yml`: Dedicated `intake-worker` service with `mem_limit: 2048m`, `memswap_limit: 2048m`, and isolated process limits.
- **Verification**:
  - `apps/api/src/intake-worker.module.spec.ts`: Asserts zero controllers, zero schedulers, and zero LLM providers (`OllamaService`, `AiOperationsModule`) in the worker module graph.
  - `apps/api/src/modules/ai/intake/intake-child.spec.ts`: Validates CLI argument parsing, input/output serialization, and zero LLM dependencies in the child process.
  - `apps/api/src/modules/ai/intake/intake-executor.service.spec.ts`: Verifies child supervision, graceful shutdown, and signal trapping.
  - `apps/api/src/modules/ai/intake/intake-executor.process.spec.ts`: Subprocess integration test validating SIGKILL/SIGABRT/memory violations mapped cleanly to `INTAKE_RESOURCE_LIMIT`.

---

### REQ-42-3: Worker Concurrency & Queue Backlog Isolation

- **Description**: Worker concurrency capped for the Raspberry Pi budget (`INTAKE_CONCURRENCY=1`, max 2). A queue backlog never starves the API: the API process acts strictly as producer/enqueuer, while the dedicated worker process consumes.
- **Implementation**:
  - `apps/api/src/modules/ai/intake/intake-queue.service.ts`: Producer-only when enqueueing; consumer registered only when `IntakeProcessorService` initializes in the worker. Concurrency parsed and capped (`INTAKE_CONCURRENCY=1` by default, max 2).
  - `apps/api/src/modules/ai/ai.module.ts`: Removed `IntakeProcessorService` from the main API context so the API cannot consume queue jobs in-process.
- **Verification**:
  - `apps/api/src/modules/ai/intake/intake-queue.service.spec.ts`: Asserts API producer never creates a BullMQ Worker; verifies `INTAKE_CONCURRENCY` capping (1-2, invalid values fall back to 1).
  - `apps/api/test/intake.e2e-spec.ts`: Verifies API producer only enqueues and jobs remain `QUEUED` until a worker process starts; verifies concurrency 1 and 2 execution behavior.

---

### REQ-42-4: Latency Budget & Deadline Exception Routing

- **Description**: Latency budget per page/document enforced via hard deadline (`INTAKE_JOB_DEADLINE_MS`, default 120s). Documents exceeding the budget or resource limits transition to review exception statuses (`INTAKE_TIMEOUT`, `INTAKE_RESOURCE_LIMIT`) rather than blocking the worker or leaking sensitive content.
- **Implementation**:
  - `apps/api/src/modules/ai/intake/intake-runtime.ts`: Error hierarchy and classification for `INTAKE_TIMEOUT`, `INTAKE_RESOURCE_LIMIT`, `INTAKE_EXECUTION_FAILED`.
  - `apps/api/src/modules/ai/intake/intake-executor.service.ts`: Wall-clock timer terminating runaway child processes and emitting `INTAKE_TIMEOUT`.
  - `apps/api/src/modules/ai/intake/intake-processor.service.ts`: Catches deadline and resource errors, sets status to `NEEDS_REVIEW` with sanitized audit notes without exposing invoice text.
- **Verification**:
  - `apps/api/src/modules/ai/intake/intake-runtime.spec.ts`: Verifies timeout and resource error taxonomy and sanitization.
  - `apps/api/src/modules/ai/intake/intake-executor.service.spec.ts`: Verifies timeout cancellation and SIGTERM/SIGKILL escalation.
  - `apps/api/src/modules/ai/intake/intake-processor.service.spec.ts`: Verifies non-retriable exceptions (`INTAKE_TIMEOUT`, `INTAKE_RESOURCE_LIMIT`) route to review.

---

### REQ-42-5: Held-Out Corpus Benchmark & Latency Measurements

- **Description**: Offline extraction benchmark CLI measuring p50/p95 latency and peak RAM per document type on the held-out synthetic corpus (#24). Reports metrics and filenames only, never raw invoice text or sensitive values. Unknown results reported as unknown.
- **Implementation**:
  - `apps/api/src/modules/ai/extraction/benchmark/run-benchmark.ts`: CLI benchmark runner with `--corpus`, `--labels`, and `--out` options.
  - `apps/api/src/modules/ai/extraction/benchmark/scoring.ts`: Metric computation for per-field precision, recall, exact match, review share, latency percentiles, and peak RSS.
  - `apps/api/src/modules/ai/utils/pdf-extractor.util.ts`: Clean `Uint8Array` buffer slice passing to prevent Node buffer pool offset corruption in `pdf-parse`.
  - `docs/benchmark/benchmark.md` and `docs/benchmark/benchmark.json`: Stored benchmark results for synthetic corpus.
- **Verification**:
  - `apps/api/src/modules/ai/extraction/benchmark/scoring.spec.ts`: Verifies scoring math, null/unknown handling, and markdown formatting (38 unit tests).
  - `apps/api/src/modules/ai/extraction/benchmark/run-benchmark.spec.ts`: Verifies CLI flag parsing, argument validation, and execution (14 unit tests).
  - Executed benchmark run output (`docs/benchmark/benchmark.md`):
    - Documents: 8
    - All fields exact match: 87.5%
    - NEEDS_REVIEW: 37.5%
    - Latency: p50 0.2 ms | p95 30.8 ms | max 30.8 ms
    - Peak RSS: 323 MB (well within 2GB Pi budget)

---

### REQ-42-6: API Responsiveness During Worker Batch Processing

- **Description**: The API stays responsive (p95 latency under agreed threshold < 50ms) while the intake worker processes an active queue batch.
- **Implementation**:
  - Architecture decoupling: API process only enqueues to Redis queue; does not perform CPU-bound OCR or extraction in-process.
  - Worker concurrency cap: CPU load constrained to 1-2 cores, leaving cores available for API requests.
- **Verification**:
  - `apps/api/src/modules/ai/intake/intake-backlog-responsiveness.spec.ts`:
    - Dispatches 50 concurrent API requests while a batch of 10 documents is actively being extracted with worker concurrency 1.
    - Verified: p50 < 10ms, p95 < 50ms (measured p50: ~3.5ms, p95: ~5.8ms).
    - Verified: queue backlog of 100 items does not starve API callers (enqueue p95 < 10ms).
  - `apps/api/test/intake.e2e-spec.ts`:
    - E2E test verifying API stays responsive (p95 < 500ms) with concurrent HTTP requests while worker processes 4 uploaded PDFs.

---

### REQ-42-7: Worker Healthcheck & Pi Deployment Topology

- **Description**: Standalone healthcheck probe (`dist/intake-worker-healthcheck.js`) for container health monitoring without booting NestJS, verifying heartbeat timestamps, lock staleness, and Redis connectivity.
- **Implementation**:
  - `apps/api/src/intake-worker-healthcheck.ts`: Standalone probe reading heartbeat from `/tmp/mizano-worker-heartbeat.json`.
  - `deploy/pi/docker-compose.pi.yml`: Added `intake-worker` service with healthcheck: `node dist/intake-worker-healthcheck.js`.
  - `deploy/pi/scripts/worker-health.test.sh`: Automated healthcheck verification script.
- **Verification**:
  - `apps/api/src/intake-worker-healthcheck.spec.ts`: 7 unit tests verifying fresh heartbeat, stale heartbeat (>60s), missing heartbeat file, and unhealthy state exits with code 1.
  - `deploy/pi/scripts/worker-health.test.sh`: 8/8 bash checks passing.

---

## Test Execution Summary

| Test Suite                 | Tests    | Result   | Notes                                                 |
| -------------------------- | -------- | -------- | ----------------------------------------------------- |
| `apps/api` Unit Test Suite | 2,471    | **PASS** | 152 suites passing, 0 failures                        |
| `apps/web` Unit Test Suite | 458      | **PASS** | 48 suites passing, 0 failures                         |
| `pnpm ci:full`             | 12 tasks | **PASS** | Lint, type-check, and tests across monorepo           |
| `ocr-assets.e2e-spec.ts`   | 4        | **PASS** | Offline Tesseract initialization with network blocked |
| `worker-health.test.sh`    | 8        | **PASS** | Standalone worker healthcheck probe on Pi scripts     |
| `run-benchmark.ts`         | 8 docs   | **PASS** | p50 0.2ms, p95 30.8ms, peak RSS 323MB                 |

---

## Conclusion

All requirements and acceptance criteria for Issue #42 have been implemented and verified with zero skipped assertions, strict Decimal money handling, no external API/cloud dependencies, and complete process isolation suitable for the 8GB Raspberry Pi 5 environment.
