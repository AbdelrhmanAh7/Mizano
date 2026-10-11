# EVIDENCE.md — Issue #42: CPU extraction runtime with pinned Arabic/English assets

Part of #42 (not "Closes"): the measurement acceptance has **not** been run, see the table below.
Complements #16 and #24. The Raspberry Pi was retired on 2026-10-10; the project is served from the
Mac mini, so nothing in this file claims a Pi result.

- **Tested commit**: `015d32a2e88eb6e7d656941f4ca1b07a1029cd85` (code; this file is committed afterwards and changes no code).
- **Environment of the checks below**: macOS arm64 developer machine, no PostgreSQL, Redis, Docker or
  `prlimit`. Anything that needs them (the seeded API e2e specs, the Linux `prlimit` process suite,
  the arm64 image build) was **not run locally**; GitHub-hosted CI runs them after the push.

## Acceptance status

| Acceptance item (issue #42)                                          | Status                                                                                                           |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Pinned `ara`+`eng` assets built into the image, no runtime download  | Implemented (REQ-42-1); offline initialization covered by `ocr-assets.e2e-spec.ts` (CI), hashes by unit specs    |
| No GPU, paid or cloud model                                          | Implemented: rules + Tesseract only (REQ-42-2)                                                                   |
| Worker concurrency and memory capped; backlog never starves the API  | Implemented as design (REQ-42-2, REQ-42-3); starvation **not measured**                                          |
| Documents above the latency budget go to exceptions                  | Implemented (REQ-42-4)                                                                                           |
| p50/p95 latency and peak RAM per document type, held-out corpus #24  | **Unknown / not yet measured.** The benchmark harness exists (REQ-42-5); it was only run on the small dev corpus |
| API p95 under an agreed threshold while the worker processes a batch | **Unknown / not yet measured.** No threshold is agreed and no automated test claims to measure it (REQ-42-6)     |

Issue #42 therefore stays open; the PR says `Part of #42`.

## Requirements and verification

### REQ-42-1: Pinned offline OCR assets

- `apps/api/ocr-assets.sha256` pins `eng.traineddata` and `ara.traineddata`;
  `extraction/offline-tesseract.ts` verifies the hashes and loads from local paths; the API
  Dockerfile checks `sha256sum -c` while building the image.
- Verified by `ocr-assets.spec.ts` and `cpu-extraction.ocr.spec.ts` (real Tesseract on a rendered image).

### REQ-42-2: Dedicated CPU extraction worker and process isolation

- `intake-worker.ts` boots `IntakeWorkerModule` (no controllers or LLM providers); `intake-child.ts`
  runs rules/OCR in a child; `intake-executor.service.ts` supervises it (RSS polling, `prlimit`).
- Verified by `intake-child.spec.ts`, `intake-executor.service.spec.ts`; the real `prlimit` suite
  (`intake-executor.process.spec.ts`) skips off Linux and runs in CI.

### REQ-42-3: Concurrency cap and API decoupling

- The API only enqueues (`intake-queue.service.ts`); the consumer runs in the worker.
  `INTAKE_CONCURRENCY` defaults to 1 and is capped at 2.
- Verified by `intake-queue.service.spec.ts` and the concurrency cases in `test/intake.e2e-spec.ts`
  (CI; they observe `maxInFlight` of a stubbed executor, i.e. the cap, not API latency).

### REQ-42-4: Latency budget and exception routing

- `INTAKE_JOB_DEADLINE_MS` is enforced by the executor; timeouts and resource limits become
  `FAILED`/`DEAD_LETTER` jobs instead of blocking. Verified by `intake-runtime.spec.ts`,
  `intake-executor.service.spec.ts`, `intake-processor.service.spec.ts`.

### REQ-42-5: Benchmark harness

- `extraction/benchmark/run-benchmark.ts` + `scoring.ts` report per-field accuracy, latency
  percentiles and peak RSS. The report's review share is labelled "before vendor matching (not the
  production rate)" because the corpus run has no tenant vendors. Verified by `scoring.spec.ts`,
  `run-benchmark.spec.ts`. `docs/benchmark/benchmark.md` is a dev-corpus run, not the #24 corpus.

### REQ-42-6: API responsiveness during batch processing — not measured

- Design: the API process never extracts; the worker is a separate process. That is a design
  property, not a measurement. A previous e2e check that timed requests against a timer-stubbed
  worker measured nothing about extraction load and was removed; no latency claim remains.
- Open: run the real extraction path on the #24 corpus while polling an authenticated API route,
  report probe count, errors and p95, and get a threshold agreed (protocol in
  `docs/strategy/pi-cpu-extraction-runtime.md`).

### REQ-42-7: Bounded results and mixed PDFs (review round)

- Native-PDF text kept in a job is capped at 200,000 characters with a `RAW_TEXT_TRUNCATED` warning
  (`cpu-structured.ts`); the original stays in private storage. Verified by `cpu-structured.spec.ts`
  and the oversized-text-layer case in `cpu-extraction.spec.ts`.
- A PDF with a text cover page and scanned later pages is no longer taken as text-only: pages with
  no usable text layer are rendered and recognized, in page order, with the weaker confidence.
  Verified by the "mixed PDF" cases in `cpu-extraction.spec.ts`.
- The `language` upload option was never forwarded to the worker, which always loads `ara+eng`;
  it is now documented as deprecated and ignored (OpenAPI).
- An unresolved vendor (`matchedVendor === null`) routes a job to `NEEDS_REVIEW`; the seeded e2e
  specs were corrected to expect that and decimal-string money (`"115.0000"`).

## Checks run locally

| Command (run from the repo root, at the tested commit)                                                                                            | Result                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter api exec jest --maxWorkers=2 src/modules/ai/intake src/modules/ai/extraction/benchmark src/modules/ai/controllers/document-intake` | 15 suites passed, 1 skipped (Linux-only `prlimit`); 307 tests passed, 9 skipped; 0 failed                                                                                                     |
| `pnpm --filter api exec jest src/modules/ai/intake/cpu-extraction.spec.ts`                                                                        | 27 tests passed (includes the oversized-text and three mixed-PDF cases)                                                                                                                       |
| `npx eslint` on every changed API/test `.ts` file                                                                                                 | Exit 0, no output                                                                                                                                                                             |
| `pnpm --filter api type-check` (`tsc --noEmit`, then `-p test/tsconfig.e2e.json`)                                                                 | Exit 1 from 10 `TS2307` errors: `@mizano/shared-types` has no `dist` here (package not built). None in changed files; the e2e project reports the same errors only. Not caused by this change |
| `pnpm ci:full`, `pnpm --filter api test:e2e`, web suite                                                                                           | **Not run locally** (owner rule: the full suite runs on GitHub-hosted CI; no PostgreSQL/Redis here)                                                                                           |

## Not run / unknown

- Seeded API e2e (`test/intake.e2e-spec.ts`) and the browser e2e-army journey: need PostgreSQL,
  Redis and the hub runner; left to CI / the `e2e-army` gate.
- Linux `prlimit` process suite, Poppler on a scanned/mixed PDF (unit-tested with mocked tools only),
  arm64 image build and size: not run here.
- Latency, peak RAM per document type and API p95 under a backlog: **Unknown**.
- `deploy/pi/` scripts (including rollback to a pre-worker image) were not touched; the Pi target is
  retired.
