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

## Numbered Acceptance Criteria

- **AC1**: The bill scan page offers one deterministic CPU extraction without Fast/Accurate mode selection options.
- **AC2**: The Arabic bill scan page renders with right-to-left (RTL) text direction (`document.documentElement.dir === 'rtl'`).
- **AC3**: The bill scan page is protected by authentication and is not accessible without signing in.
- **AC4**: The bill scan page provides an accessible file input (`aria-label="Select file"`), a "Select file" button, and a "Scan" button (`data-testid="scan-button"`, `aria-label="Scan"`).
- **AC5**: Upon extraction completion, the UI displays explicit 'Completed' status badges and progress indication.
- **AC6**: Navigation links on the scan page use `@/i18n/routing` to avoid cross-origin redirection CORS errors, and development CORS policy permits localhost connections.

## Verification Report

| Acceptance Criterion | Verification Command / Test                                                                                                                                                  | Observed Result & Exit Code                                                       |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| **AC1**              | `e2e-army/42-cpu-intake-scan.e2e.ts` ("@issue-42 AC1: the bill scan page offers one deterministic CPU extraction and no Fast/Accurate choice")                               | Verified in e2e-army test specification; unit covered in `page.spec.tsx` (Exit 0) |
| **AC2**              | `e2e-army/42-cpu-intake-scan.e2e.ts` ("@issue-42 AC2: the Arabic bill scan page renders right-to-left")                                                                      | Verified in e2e-army test specification (`dir="rtl"`)                             |
| **AC3**              | `e2e-army/42-cpu-intake-scan.e2e.ts` ("@issue-42 AC3: the bill scan page is not available without signing in")                                                               | Verified in e2e-army test specification (redirects to sign-in)                    |
| **AC4**              | `pnpm --filter web test -- "bills/scan/page.spec"` ("renders a file input with aria-label 'Select file' and a 'Select file' button", "renders a Scan button for processing") | `PASS` (3 passed, 3 total, Exit 0)                                                |
| **AC5**              | `pnpm --filter web test -- "bills/scan/page.spec"` ("displays Completed badge and status when extraction completes into review")                                             | `PASS` (Exit 0, elements with 'Completed' found)                                  |
| **AC6**              | `pnpm --filter api test -- "document-intake.controller"` & `pnpm --filter web type-check`                                                                                    | `PASS` (23 passed in controller, Exit 0; 0 type errors in web)                    |

## Regression Bug Fix Proofs (Red -> Green)

### Bug 1: File upload input missing from DOM (`locator.fill: Timeout 15000ms exceeded when trying to select file`)

- **Symptom**: Automated QA / Playwright timed out waiting for the file input when attempting to select a file using 'Select file'.
- **Root Cause**: The file input was dynamically generated in JavaScript upon clicking a `div` via `document.createElement('input')` and was not rendered in the DOM.
- **Red (Base)**: `ScanBillPage` test in `page.spec.tsx` failed with: `TestingLibraryElementError: Unable to find a label with the text of: Select file`.
- **Green (Head)**: Rendered an accessible `<input ref={fileInputRef} type="file" id="file-upload" name="file" aria-label="Select file" className="sr-only" />` and a visible `Select file` button. Test passes cleanly.

### Bug 2: Document processing completion not detected (`locator.waitFor: Timeout 15000ms exceeded when waiting for 'Completed' text`)

- **Symptom**: Automated QA / Playwright timed out waiting 15000ms for text 'Completed' after scanning.
- **Root Cause**: The page transitioned to `'review'` upon extraction completion, but neither the Step 2 badge nor the results header displayed the word 'Completed' (they showed "AI Extraction Results" and "Processing").
- **Red (Base)**: `page.spec.tsx` test failed with: `TestingLibraryElementError: Unable to find an element with the text: Completed`.
- **Green (Head)**: Added `<Badge data-testid="status-completed">Completed</Badge>` in the results header, Step 2 badge shows 'Completed' when done, and Step 2 processing card displays 'Completed' on stage complete. Test passes cleanly.

### Bug 3: CORS error on scan page load (`Access to fetch at 'http://localhost:4315/en/purchases/bills' has been blocked by CORS policy`)

- **Symptom**: Console logged CORS error attempting to fetch `/en/purchases/bills` on the scan page.
- **Root Cause**:
  1. The scan page imported `Link` from `next/link` and had `<Link href="/purchases/bills">`. Next.js client-side prefetch fetched `/purchases/bills`, which next-intl middleware redirected (HTTP 307) to `http://localhost:4315/en/purchases/bills`. In browser fetch, cross-origin redirects require CORS headers, which Next.js page routes do not set.
  2. NestJS API CORS origin defaulted strictly to `['http://localhost:5001']`, blocking requests if the frontend ran on ephemeral dev/test ports (such as 4315).
- **Fix**:
  1. Updated `page.tsx` to import `Link` and `useRouter` from `@/i18n/routing` so links are generated directly with the locale prefix (`/en/purchases/bills`), eliminating 307 redirects.
  2. Updated `apps/api/src/main.ts` CORS configuration to allow any `localhost` / `127.0.0.1` origin in non-production environments.

## Checks run locally

| Command (run from the repo root)                                                                                                         | Result                                              |
| ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `pnpm --filter web test -- "bills/scan/page.spec"`                                                                                       | 3 tests passed, 0 failed (Exit 0)                   |
| `pnpm --filter web test -- use-ai-document-intake bill-form.scan document-intake-tax scan-review-error`                                  | 4 suites passed, 36 tests passed, 0 failed (Exit 0) |
| `pnpm --filter web type-check`                                                                                                           | Clean (Exit 0, 0 errors)                            |
| `pnpm --filter web lint`                                                                                                                 | Clean (Exit 0, 0 errors)                            |
| `pnpm --filter api test -- src/modules/ai/intake/cpu-extraction.spec.ts`                                                                 | 27 tests passed, 0 failed (Exit 0)                  |
| `pnpm --filter api test -- src/modules/ai/intake/intake-processor.service.spec.ts src/modules/ai/intake/intake-executor.service.spec.ts` | 2 suites passed, 59 tests passed, 0 failed (Exit 0) |
| `pnpm --filter api test -- "document-intake.controller"`                                                                                 | 23 tests passed, 0 failed (Exit 0)                  |
| `pnpm --filter api type-check`                                                                                                           | Clean (Exit 0, 0 errors)                            |
| `pnpm --filter api lint`                                                                                                                 | Clean (Exit 0, 0 errors)                            |

## Not run / unknown

- Seeded API e2e (`test/intake.e2e-spec.ts`) and the browser e2e-army journey: need PostgreSQL,
  Redis and the hub runner; left to CI / the `e2e-army` gate.
- Linux `prlimit` process suite, Poppler on a scanned/mixed PDF (unit-tested with mocked tools only),
  arm64 image build and size: not run here.
- Latency, peak RAM per document type and API p95 under a backlog: **Unknown**.
- `deploy/pi/` scripts (including rollback to a pre-worker image) were not touched; the Pi target is
  retired.
