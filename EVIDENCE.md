# EVIDENCE.md — PR Merge Sprint Audit (#95)

## Overview

- **Issue**: #95 (MZ · PR merge sprint until queue ≤ 5)
- **Base Commit (`master`)**: `b83d72b5a1900350d7575dfa39396e95b058a5c4`
- **Audit Date**: 2026-10-07
- **Reviewed Scope**: 6 oldest open pull requests (#58, #60, #65, #66, #67, #68)

---

## Requirements Verification Matrix

| REQ ID | Requirement                                         | Verification Method                                | Status |
| ------ | --------------------------------------------------- | -------------------------------------------------- | ------ |
| REQ-1  | Retrieve 6 oldest open PRs                          | `gh pr list --search "sort:created-asc" --limit 6` | PASSED |
| REQ-2  | Record exact tested commit SHAs                     | Git ref inspection (`headRefOid` per PR)           | PASSED |
| REQ-3  | Execute local test suites per PR                    | Run unit/web suites with output captured           | PASSED |
| REQ-4  | Domain risk audit (money, tenant, idempotency, RTL) | Diff inspection against AGENTS.md rules            | PASSED |
| REQ-5  | Commit audit table & gh commands                    | Committed to `docs/planning/MERGE-QUEUE.md`        | PASSED |
| REQ-6  | Non-destructive execution (<300 doc lines)          | No PRs merged; doc-only additions                  | PASSED |

---

## Detailed Test Logs & Commit Evidence

### PR #58

- **Commit SHA**: `2b3f01c3d7e9fe4877bb29b8af903437b3eee92a`
- **Branch**: `demo/20-telegram-intake`
- **Commands**:
  ```bash
  git checkout --detach 2b3f01c3d7e9fe4877bb29b8af903437b3eee92a
  pnpm --filter ./apps/api exec prisma generate
  pnpm --filter ./apps/api test telegram
  pnpm lint
  ```
- **Output**:
  ```text
  PASS src/modules/telegram/telegram.client.spec.ts
  PASS src/modules/telegram/telegram-link.service.spec.ts
  PASS src/modules/telegram/telegram-intake.service.spec.ts
  Test Suites: 3 passed, 3 total
  Tests:       74 passed, 74 total
  Lint: 4 packages successful
  ```

### PR #60

- **Commit SHA**: `d01e25239b4a3a62c1034a0258c53e614655ed69`
- **Branch**: `demo/38-arm64-images`
- **Commands**:
  ```bash
  git checkout --detach d01e25239b4a3a62c1034a0258c53e614655ed69
  pnpm --filter ./apps/api test intake
  pnpm lint
  ```
- **Output**:
  ```text
  Test Suites: 1 skipped, 17 passed, 17 of 18 total
  Tests:       9 skipped, 284 passed, 293 total
  Lint: 4 packages successful
  ```

### PR #65

- **Commit SHA**: `5eb0340b0e002730f52709d3a7ad8a6097203f77`
- **Branch**: `demo/followup-vat`
- **Commands**:
  ```bash
  git checkout --detach 5eb0340b0e002730f52709d3a7ad8a6097203f77
  pnpm --filter ./apps/api test vat
  pnpm --filter ./apps/api test default-roles
  pnpm lint
  ```
- **Output**:
  ```text
  PASS src/modules/tax/controllers/vat-returns.controller.spec.ts
  PASS src/modules/tax/interceptors/vat-decimal.interceptor.spec.ts
  PASS src/modules/tax/services/vat-returns.service.spec.ts
  Test Suites: 3 passed, 3 total | Tests: 74 passed, 74 total
  PASS src/modules/roles/constants/default-roles.constant.spec.ts (1 passed)
  Lint: 4 packages successful
  ```

### PR #66

- **Commit SHA**: `310ac2b1aa7129b4c51403f46eb6ee36f4d1e778`
- **Branch**: `demo/followup-reports-ledger`
- **Commands**:
  ```bash
  git checkout --detach 310ac2b1aa7129b4c51403f46eb6ee36f4d1e778
  pnpm --filter ./apps/api test aging-reports
  pnpm --filter ./apps/api test depreciation
  pnpm --filter ./apps/api test work-orders
  pnpm lint
  ```
- **Output**:
  ```text
  PASS src/modules/reports/services/aging-reports.receivables.spec.ts (28 passed)
  PASS src/modules/assets/services/depreciation.service.spec.ts (22 passed)
  PASS src/modules/manufacturing/services/work-orders.service.spec.ts (29 passed)
  Test Suites: 6 passed, 6 total | Tests: 79 passed, 79 total
  Lint: 4 packages successful
  ```

### PR #67

- **Commit SHA**: `be7478f715f1e0f0efb8447e922db9d79d37fbc1`
- **Branch**: `demo/followup-sales-banking`
- **Commands**:
  ```bash
  git checkout --detach be7478f715f1e0f0efb8447e922db9d79d37fbc1
  pnpm --filter ./apps/api test recurring-profiles credit-notes
  pnpm --filter ./apps/web test payments bill-form invoices
  pnpm lint
  ```
- **Output**:
  ```text
  PASS src/modules/accounting/services/recurring-profiles.service.spec.ts (41 passed)
  PASS src/modules/sales/services/credit-notes.service.spec.ts (47 passed)
  PASS @mizano/web (payments, bill-form, invoices): 4 passed, 16 passed
  Total: 8 suites passed, 104 tests passed
  Lint: 4 packages successful
  ```

### PR #68

- **Commit SHA**: `7c632bdf74832cfc94f97cb49c196d168e99127f`
- **Branch**: `demo/followup-org-currency`
- **Commands**:
  ```bash
  git checkout --detach 7c632bdf74832cfc94f97cb49c196d168e99127f
  pnpm --filter ./apps/api test organizations
  pnpm --filter ./apps/web test report-currency report-labels purchases-currency
  pnpm lint
  ```
- **Output**:
  ```text
  PASS src/modules/organizations/organizations.service.spec.ts (26 passed)
  PASS @mizano/web (report-currency, report-labels, purchases-currency): 3 passed, 78 passed
  Total: 4 suites passed, 104 tests passed
  Lint: 4 packages successful
  ```

---

# Evidence for Issue #42: [Pi] CPU extraction runtime on the Pi 5 with pinned Arabic/English assets

Part of the tiny live deployment on a Raspberry Pi 5 (Cortex-A76, 8GB). Complements #16 and #24.

## Acceptance status

| Acceptance item (issue #42)                                                           | Status                                                                                                               |
| ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Pinned `ara`+`eng` OCR assets in the worker image, no runtime downloads, no GPU/cloud | Implemented; offline initialization verified on the dev host (REQ-42-1). Image build verified in Dockerfile          |
| Worker concurrency and memory capped; backlog never starves the API                   | Implemented (REQ-42-2, REQ-42-3). Linux `prlimit` suite skipped on macOS                                             |
| Documents above the latency budget go to exceptions                                   | Implemented (REQ-42-4). Retries scheduled, non-retriable exceptions move to DEAD_LETTER                              |
| p50/p95 latency and peak RAM per document type **on the Pi**, held-out corpus (#24)   | **Unknown — not measured.** No Pi and no held-out corpus connected; see `docs/strategy/pi-cpu-extraction-runtime.md` |
| API p95 under an agreed threshold while the worker processes a batch                  | **Unknown on the Pi; threshold not agreed.** Queue decoupling implemented and verified                               |

Issue #42 stays partial until the Pi protocol in
[`docs/strategy/pi-cpu-extraction-runtime.md`](docs/strategy/pi-cpu-extraction-runtime.md#pi-acceptance-protocol-not-yet-executed)
is executed. The PR should reference the issue (`Refs #42`), not close it.

---

## Requirements and verification

### REQ-42-1: Pinned offline OCR assets

- **Implementation**: `apps/api/ocr-assets.sha256` pins `eng.traineddata` and `ara.traineddata`;
  `apps/api/src/modules/ai/extraction/offline-tesseract.ts` verifies the hashes and passes local
  `langPath`/`cachePath`; `apps/api/Dockerfile` unpacks `@tesseract.js-data/{eng,ara}@1.0.0` on the
  build host, checks `sha256sum -c` and copies the files to `/app/tessdata`.
- **Verification**: `ocr-assets.spec.ts` and `cpu-extraction.ocr.spec.ts` pass.

### REQ-42-2: Dedicated CPU extraction worker and process isolation

- **Implementation**: `apps/api/src/intake-worker.ts` boots `IntakeWorkerModule` (no controllers,
  schedulers or LLM providers); `intake-child.ts` runs rules/OCR in a child process;
  `intake-executor.service.ts` supervises it (RSS polling, Linux `prlimit`, signal mapping);
  `deploy/pi/docker-compose.pi.yml` adds an `intake-worker` service with `mem_limit: 2048m`.
- **Verification**: `intake-child.spec.ts` and `intake-executor.service.spec.ts` pass.

### REQ-42-3: Worker concurrency and queue backlog isolation

- **Implementation**: `intake-queue.service.ts` is producer-only in the API; the BullMQ consumer
  starts only in the worker. `INTAKE_CONCURRENCY` defaults to 1 and is capped at 2.
- **Verification**: `intake-queue.service.spec.ts` passes (API never creates a Worker;
  invalid concurrency falls back to 1; values above 2 are capped).

### REQ-42-4: Latency budget and deadline exception routing

- **Implementation**: `INTAKE_JOB_DEADLINE_MS` (default 120 s) is enforced by the executor's
  wall-clock timer; `intake-runtime.ts` classifies `INTAKE_TIMEOUT`, `INTAKE_RESOURCE_LIMIT` and
  `INTAKE_WORKER_FAILED`; `intake-processor.service.ts` records `FAILED`, schedules retries, and moves non-retriable exceptions to `DEAD_LETTER`.
- **Verification**: `intake-runtime.spec.ts`, `intake-executor.service.spec.ts` and
  `intake-processor.service.spec.ts` pass.

### REQ-42-5: Benchmark harness and latency measurement

- **Implementation**: `apps/api/src/modules/ai/extraction/benchmark/run-benchmark.ts` and
  `scoring.ts` report per-field precision/recall/exact match, review share, latency percentiles and
  peak RSS, with file names only.
- **Verification**: `scoring.spec.ts` and `run-benchmark.spec.ts` pass (14/14 tests).

### REQ-42-6: API responsiveness during worker batch processing

- **Implementation**: Architecture decoupling: API process only enqueues to Redis queue;
  worker processes in dedicated child processes with concurrency capped at 1–2.
- **Verification**: `intake-queue.service.spec.ts` passes. Real HTTP p95 on the Pi during batch processing remains **Unknown on the Pi; threshold not agreed**.

### REQ-42-7: Worker healthcheck and Pi deployment topology

- **Implementation**: `apps/api/src/intake-worker-healthcheck.ts` checks the heartbeat file without
  booting NestJS; `deploy/pi/docker-compose.pi.yml` uses it as the `intake-worker` healthcheck.
- **Verification**: `intake-worker-healthcheck.spec.ts` and `health/healthcheck.spec.ts` pass;
  `bash deploy/pi/scripts/worker-health.test.sh` → `8 worker health checks passed`.

---

## Test execution summary

| Command                                                                     | Result                                                                                       |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `pnpm ci:full`                                                              | Exit 0; 12 tasks successful, 0 errors, 0 warnings                                            |
| ↳ API Jest (inside `ci:full`)                                               | 151 suites passed, 1 skipped; 2,469 tests passed, 9 skipped (the Linux-only `prlimit` suite) |
| ↳ Web Jest (inside `ci:full`)                                               | 48 suites passed, 458 tests passed                                                           |
| `bash deploy/pi/scripts/worker-health.test.sh`                              | 8 checks passed                                                                              |
| Pi p50/p95 and peak RAM per document type; API p95 on the Pi during a batch | Unknown — not measured                                                                       |

### Review-round additions (PR #93)

- **Unresolved vendor goes to review**: `needsReview` treats `matchedVendor === null` (no match, or a tie) as an exception; `undefined` (matching not run, e.g. the benchmark) is not. Verified in `intake-processor.service.spec.ts`.
- **Extractor version**: every worker result carries `extractorVersion` (`cpu-rules/<n>+ocr:<12 hex of the pinned asset manifest>`), and `rawText` kept in the job row is bounded to 200,000 characters (`RAW_TEXT_TRUNCATED` warning; the original stays in private storage). Verified in `cpu-structured.spec.ts`.
- **Scan mode selector removed** from the bill scan page: the worker runs one deterministic CPU extraction, so Fast/Accurate were indistinguishable.
