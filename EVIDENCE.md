# Evidence for Issue #42: [Pi] CPU extraction runtime on the Pi 5 with pinned Arabic/English assets

Part of the tiny live deployment on a Raspberry Pi 5 (Cortex-A76, 8GB). Complements #16 and #24.

## Tested commit

| Field             | Value                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------ |
| Tested commit     | `6c99f75e73179335cfc5bf95ad52243506fbbbd4` (`ai/42` after merging master)                        |
| Baseline (master) | `615060e` — docs(planning): audit 6 oldest open prs for merge sprint (#95) (#98)                 |
| Commits after it  | Only `EVIDENCE.md` and `AI_QUESTIONS.md` change; check with `git diff --stat 6c99f75 HEAD`       |
| Host              | Apple M4, macOS (Darwin 27.0.0), arm64, Node v26.10.0, pnpm `install --frozen-lockfile`          |
| Not the target    | **Not a Pi, not Alpine/musl, not Node 20, no Docker.** Nothing in this file was measured on a Pi |
| Run date          | 2026-10-07                                                                                       |

Every result below was run first-hand on the tested commit, on the host above.

## Acceptance status

| Acceptance item (issue #42)                                                           | Status                                                                                    |
| ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Pinned `ara`+`eng` OCR assets in the worker image, no runtime downloads, no GPU/cloud | Implemented; offline initialization verified on the dev host (REQ-42-1). Image not built  |
| Worker concurrency and memory capped; backlog never starves the API                   | Implemented (REQ-42-2, REQ-42-3). Linux `prlimit` suite skipped on macOS                  |
| Documents above the latency budget go to exceptions                                   | Implemented (REQ-42-4)                                                                    |
| p50/p95 latency and peak RAM per document type **on the Pi**, held-out corpus (#24)   | **Unknown — not measured.** No Pi and no held-out corpus here; see `AI_QUESTIONS.md`      |
| API p95 under an agreed threshold while the worker processes a batch                  | **Unknown on the Pi; threshold not agreed.** Only a simulated unit test exists (REQ-42-6) |

Issue #42 stays partial until the Pi protocol in
[`docs/strategy/pi-cpu-extraction-runtime.md`](docs/strategy/pi-cpu-extraction-runtime.md#pi-acceptance-protocol-not-yet-executed)
is executed. The PR should reference the issue (`Refs #42`), not close it.

---

## Requirements and verification

### REQ-42-1: Pinned offline OCR assets

- **Implementation**: `apps/api/ocr-assets.sha256` pins `eng.traineddata` and `ara.traineddata`;
  `apps/api/src/modules/ai/extraction/offline-tesseract.ts` verifies the hashes and passes a local
  `langPath`/`cachePath`; `apps/api/Dockerfile` unpacks `@tesseract.js-data/{eng,ara}@1.0.0` on the
  build host, checks `sha256sum -c` and copies the files to `/app/tessdata`.
- **Verification (first-hand)**:
  - `shasum -a 256 -c apps/api/ocr-assets.sha256` → `eng.traineddata: OK`, `ara.traineddata: OK`.
  - `pnpm --filter api build` then `npx jest --config ./test/jest-e2e.json --testPathPattern=ocr-assets`
    → 4/4 passed: both languages initialize with `http`, `https`, `net`, `tls`, `dns` and `fetch`
    blocked; missing assets and corrupt `ara`/`eng` data fail with code 2 and no download attempt.
  - `ocr-assets.spec.ts` and `cpu-extraction.ocr.spec.ts` (real pinned Tesseract on a rendered
    image) pass in the targeted run below.
- **Not run**: the Docker image build (no Docker on this host), the arm64/offline CI image jobs.

### REQ-42-2: Dedicated CPU extraction worker and process isolation

- **Implementation**: `apps/api/src/intake-worker.ts` boots `IntakeWorkerModule` (no controllers,
  schedulers or LLM providers); `intake-child.ts` runs rules/OCR in a child process;
  `intake-executor.service.ts` supervises it (RSS polling, Linux `prlimit`, signal mapping);
  `deploy/pi/docker-compose.pi.yml` adds an `intake-worker` service with `mem_limit: 2048m`.
- **Verification (first-hand)**: `intake-worker.module.spec.ts`, `intake-child.spec.ts` and
  `intake-executor.service.spec.ts` pass.
- **Skipped**: `intake-executor.process.spec.ts` (9 tests, real `prlimit` and process groups) is
  `describe.skip` unless `process.platform === 'linux'` and `/usr/bin/prlimit` exist, so it did
  not run on macOS. The earlier Linux-container run is recorded in the strategy doc, not here.

### REQ-42-3: Worker concurrency and queue backlog isolation

- **Implementation**: `intake-queue.service.ts` is producer-only in the API; the BullMQ consumer
  starts only in the worker. `INTAKE_CONCURRENCY` defaults to 1 and is capped at 2.
- **Verification (first-hand)**: `intake-queue.service.spec.ts` passes (API never creates a Worker;
  invalid concurrency falls back to 1; values above 2 are capped).
- **Not run**: `apps/api/test/intake.e2e-spec.ts` needs PostgreSQL and Redis; there is no Docker on
  this host.

### REQ-42-4: Latency budget and deadline exception routing

- **Implementation**: `INTAKE_JOB_DEADLINE_MS` (default 120 s) is enforced by the executor's
  wall-clock timer; `intake-runtime.ts` classifies `INTAKE_TIMEOUT`, `INTAKE_RESOURCE_LIMIT` and
  `INTAKE_EXECUTION_FAILED`; `intake-processor.service.ts` moves those jobs to `NEEDS_REVIEW` with a
  sanitized note.
- **Verification (first-hand)**: `intake-runtime.spec.ts`, `intake-executor.service.spec.ts` and
  `intake-processor.service.spec.ts` pass.

### REQ-42-5: Benchmark harness and latency measurement

- **Implementation**: `apps/api/src/modules/ai/extraction/benchmark/run-benchmark.ts` and
  `scoring.ts` report per-field precision/recall/exact match, review share, latency percentiles and
  peak RSS, with file names only. `docs/benchmark/benchmark.{md,json}` store a run on the synthetic
  fixtures.
- **Verification (first-hand)**: `scoring.spec.ts` and `run-benchmark.spec.ts` pass. A rerun on the
  tested commit (output written to a temp dir, committed files untouched):

  ```text
  pnpm exec ts-node --transpile-only -r tsconfig-paths/register \
    src/modules/ai/extraction/benchmark/run-benchmark.ts \
    --corpus src/modules/ai/extraction/benchmark/corpus/synthetic --out $TMPDIR/bench42
  Documents: 8 | all fields exact: 87.5% | NEEDS_REVIEW: 37.5%
  Latency p50 0.2 ms | p95 39.2 ms | max 39.2 ms | peak RSS 328 MB
  ```

- **Limits**: 8 hand-written synthetic fixtures on an Apple M4, not the held-out #24 corpus and not
  a Pi. The committed `docs/benchmark/benchmark.md` (p95 30.8 ms, peak RSS 323 MB) is an earlier run
  on a development host. Neither number is a Pi latency or RAM measurement, and neither says anything
  about accuracy on real invoices.

### REQ-42-6: API responsiveness during worker batch processing

- **Implementation**: the API only enqueues; extraction runs in the separate worker process with
  concurrency 1–2.
- **Verification (first-hand)**: `npx jest --verbose intake-backlog-responsiveness` → 2/2 passed
  ("maintains low p95 latency (< 50ms) while worker processes a batch with concurrency cap";
  "queue backlog does not starve concurrent API status requests").
- **Limits**: this spec simulates the worker and API calls with in-process timers. It shows the
  producer path does not block on the queue; it is not an HTTP measurement and not a Pi measurement.
  The 50 ms figure is the test's own bound, not an agreed acceptance threshold. The seeded HTTP E2E in
  `test/intake.e2e-spec.ts` was not run here (no PostgreSQL/Redis).

### REQ-42-7: Worker healthcheck and Pi deployment topology

- **Implementation**: `apps/api/src/intake-worker-healthcheck.ts` checks the heartbeat file without
  booting NestJS; `deploy/pi/docker-compose.pi.yml` uses it as the `intake-worker` healthcheck.
- **Verification (first-hand)**: `intake-worker-healthcheck.spec.ts` and `health/healthcheck.spec.ts`
  pass; `bash deploy/pi/scripts/worker-health.test.sh` → `8 worker health checks passed`.

---

## Test execution summary (tested commit `6c99f75`)

| Command                                                                                                   | Result                                                                                       |
| --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `pnpm ci:full --force` (lint, type-check, test; Turbo cache bypassed)                                     | Exit 0; 12 tasks successful, 0 cached                                                        |
| ↳ API Jest (inside `ci:full`)                                                                             | 152 suites passed, 1 skipped; 2,471 tests passed, 9 skipped (the Linux-only `prlimit` suite) |
| ↳ Web Jest (inside `ci:full`)                                                                             | 48 suites, 458 tests passed                                                                  |
| `npx jest --runInBand src/modules/ai/intake src/modules/ai/extraction src/intake-worker src/health` (API) | 23 suites passed, 1 skipped; 372 tests passed, 9 skipped (same Linux-only suite)             |
| `npx jest --config ./test/jest-e2e.json --testPathPattern=ocr-assets` (after `pnpm --filter api build`)   | 4/4 passed                                                                                   |
| `bash deploy/pi/scripts/worker-health.test.sh`                                                            | 8 checks passed                                                                              |
| `run-benchmark.ts` on the synthetic corpus                                                                | 8 docs; p50 0.2 ms, p95 39.2 ms, peak RSS 328 MB (Apple M4, not a Pi)                        |
| `apps/api/test/intake.e2e-spec.ts` (seeded HTTP E2E)                                                      | Not run: needs PostgreSQL and Redis, no Docker on this host                                  |
| `intake-executor.process.spec.ts` (real `prlimit`)                                                        | Skipped on macOS                                                                             |
| Pi p50/p95 and peak RAM per document type; API p95 on the Pi during a batch                               | Unknown — not measured                                                                       |

The worktree had no `node_modules`; `pnpm install --frozen-lockfile` and `pnpm db:generate` ran
first.
