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

---

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

## Issue #109 — Arabic-Indic/Persian digit normalization

Tested code head: `65a635172907434efa52bec650fbd54fa4f87777` (this file is committed after it; only EVIDENCE.md differs).

`normalizeDigits` (`apps/api/src/modules/ai/extraction/rules/rules-normalize.ts`) and its use in the intake rules extractor already exist on master. This PR only adds the acceptance spec `rules-normalize.spec.ts` (tagged `@issue-109`); no production code changes remain. An earlier attempt that also wired the helper into `entity-extraction.service.ts` and `ollama.service.ts` was reverted because dropped bidi marks shift entity offsets.

| REQ                                         | Verified by                                                                       |
| ------------------------------------------- | --------------------------------------------------------------------------------- |
| AC1 `١٢٣٫٤٥` → 123.45, `١٬٢٣٤٫٥٠` → 1234.50 | `normalizeDigits` + `findAmounts` cases in rules-normalize.spec.ts                |
| AC2 `٠٧/١٠/٢٠٢٦` = `07/10/2026`             | `parseDate` cases (Arabic-Indic and Persian)                                      |
| AC3 mixed script `EGP ١٢٠٠`                 | mixed-script `normalizeDigits` and `extractInvoiceFields` cases                   |
| AC4 English tests unchanged                 | `invoice-rules-extractor.spec.ts`, `rules-strategy.spec.ts` untouched and passing |
| AC5 no float math                           | `parseAmount` returns Decimal and preserves precision (asserted)                  |
| AC6 ≤ ~200 lines                            | no production code in the diff                                                    |

Commands run (sandbox off, local):

- `npx jest src/modules/ai/extraction/rules` in apps/api: 3 suites passed, 66 tests passed
- `npx tsc --noEmit -p .` in apps/api: no errors
- `prettier --check` on the spec: clean

Not run: the seeded PDF e2e (removed; see commit a5aeed0).

E2E gate note (#109): this PR changes no production code and no UI or user-flow files, only the unit acceptance spec `rules-normalize.spec.ts`. The round-two `e2e-first` review still reports “E2E-first rule not met” because no E2E or acceptance tests were added or changed. Record the gate as unresolved unless an authoritative retirement decision and the `e2e-army` result are available.

Review round 3 (#109): the PDF-fixture, offset-preservation and async-path threads target code removed in a5aeed0 (no e2e PDF spec, no wiring in `entity-extraction.service.ts` / `ollama.service.ts`), so nothing remains to fix there. CodeRabbit's spec notes are fixed in `rules-normalize.spec.ts`: amount tests now pass `normalizeDigits(...)` output into `parseAmount`, the European-format case is renamed, and the Decimal(19,4) bound test covers 15/16 integer digits and 4/5 decimals. `npx jest src/modules/ai/extraction/rules` in apps/api: 3 suites, 66 tests passed.

Review round 4 (#109): the three code threads (Unicode PDF fixtures, original-text offsets, async entity-extraction path) are all OUTDATED. They target the e2e PDF spec and the `entity-extraction.service.ts` / `ollama.service.ts` wiring, which were removed in a5aeed0 and are not on this branch, so no code change is needed. The EVIDENCE.md e2e note is reworded to the `E2E: not needed — <reason>` waiver form. The spec fixes from round 3 (aed8cb7) are unchanged.

Review round 5 (#109):

- Fixed CodeRabbit finding on `rules-normalize.spec.ts:64`: AC5 test now verifies `parseAmount('10000000000000.0001')` returns a Decimal instance (`toBeInstanceOf(Decimal)`) and preserves the exact 4-decimal fraction string that JS Number conversion would lose.
- Fixed CodeRabbit finding on `EVIDENCE.md`: E2E gate note updated to report the round-two `e2e-first` review status as unresolved without an authoritative retirement decision and the `e2e-army` result.
- Confirmed the 3 outdated review threads on `intake-arabic-digits.e2e-spec.ts` and `entity-extraction.service.ts` are satisfied because the relevant code was reverted in commit a5aeed0.

# Issue #141 — intake worker entrypoint, processor out of the API, Pi compose worker

Tested commit: `57f9a0d` (branch `ai/141`; this file is committed after it). Fresh Postgres 16, `REDIS_URL=` blank, in band.

"Move out" is read as: `IntakeProcessorService` is no longer provided by `AiOperationsModule` (so `AppModule`), and the only place it is provided is `IntakeWorkerModule`. `IntakeQueueService` stays in the API as the producer (`enqueue`/`cancel`); the consumer handler is registered only when the processor exists, that is, in the worker.

| REQ                                                                              | Verified by                                                                                                                                                            |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC1 API does not resolve the processor; upload without Redis is refused with 503 | `test/intake-worker.e2e-spec.ts` AC1 (`app.get(IntakeProcessorService)` throws; 503 `INTAKE_QUEUE_UNAVAILABLE`, no row created; see the final-behaviour section below) |
| AC2 worker boots headless and processes a QUEUED job                             | AC2 (`IntakeWorkerModule` has no HTTP adapter; job reaches EXTRACTED, attempts 1)                                                                                      |
| AC3 heartbeat fails when stale or missing                                        | AC3 (missing, invalid, future, stale -> false; fresh -> true, real files)                                                                                              |
| AC4 compose defines `worker`                                                     | AC4 (mem_limit 2048m, `dist/intake-worker.js`, healthcheck, 30s grace, read-only originals)                                                                            |

Commands and results:

```
npx jest -c test/jest-e2e.json --runInBand intake   2 suites, 20 tests passed
node apps/api/_run_tests.js --testPathPattern=intake   7 suites, 99 tests passed
tsc --noEmit (src + e2e), eslint, prettier --check   clean
```

Not run: the full API suite and a real container start of the worker image (no Docker on this machine). `dist/intake-worker.js` is only compiled by `tsc`.

## Issue #141 — round 2 (CTO review T1/T2 and the IntakeModule slice)

Tested on top of `47e55211` plus the working-tree changes of the commit that adds this section. Local sandbox: no Postgres (`localhost:5435` unreachable) and no Docker, so `test/intake-worker.e2e-spec.ts` was **not** re-run here; it runs on CI.

| REQ                                                                      | Verified by                                                                                                                          |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| T1 deploy fails when the worker is unhealthy                             | `src/deploy-worker-gating.spec.ts`: real `wait_healthy` with a fake `docker`; red with `worker` removed from the loop, green with it |
| T1 periodic check reports the worker                                     | same spec, asserts `healthcheck.sh` has `check_worker`, `worker-down`, `worker-unhealthy`                                            |
| T2 `CacheService` closes its Redis client (safe when `REDIS_URL` blank)  | `src/cache/cache.service.spec.ts` `onModuleDestroy` (no-op, quit once, disconnect fallback)                                          |
| T2 worker ends the process after close (0 ok, 1 error), once only        | `src/modules/ai/intake/intake.worker.spec.ts` `registerGracefulShutdown`                                                             |
| Slice AC1 `IntakeModule` exports resolve                                 | `intake.worker.spec.ts` `IntakeModule` (processor, queue, jobs service, owner guard, storage)                                        |
| Slice AC2/AC3 `createIntakeWorker()` has no HTTP adapter or port, closes | `intake.worker.spec.ts` `createIntakeWorker` (no `getHttpServer`, TCPServerWrap count unchanged, `close()` resolves)                 |
| Slice AC4 existing intake specs unchanged                                | `intake-processor`, `intake-jobs`, `intake-storage` specs pass unmodified                                                            |

```
npx jest --detectOpenHandles src/deploy-worker-gating.spec.ts src/modules/ai/intake src/cache   7 suites, 62 tests passed, exits without --forceExit
npx jest --findRelatedTests <changed src files>                                                  6 suites, 87 tests passed
tsc --noEmit (src, test/tsconfig.e2e.json) exit 0; eslint on touched paths exit 0; prettier --check clean
shellcheck lib.sh healthcheck.sh: only the existing SC1091 info (sourced file)
```

Behaviour notes: `IntakeWorkerModule` now gets the processor from `IntakeModule`, which also provides `IntakeJobsService`, so the worker runs the startup/periodic recovery sweep too (queue job ids collapse duplicates with the API's sweep). `AiOperationsModule` is unchanged in this round.

### PR #237 Review Resolution (final behaviour, supersedes round 2)

Tested on the merge of `origin/master` into `ai/141` plus the working-tree changes of the commit that adds this section (SHA is in `git log` for this file).

Final behaviour of the queue contract: the DB row is the source of truth, so a row is never deleted to report a queue problem.

- **No Redis and no local handler** (the API process, which registers none): `IntakeQueueService.assertAvailable()` throws `IntakeQueueUnavailableException` (503) at the start of `createFromUpload` and `retry`, before the stored file, the row or any status change exist. Nothing is created, so nothing is lost or orphaned. `recoverJobs` returns 0 quietly in that process (the worker's sweep does the work).
- **Redis configured but down or erroring**: `enqueueSafely` logs and swallows the error (as before this PR); the row stays `QUEUED`, attempts 0, and the sweep re-enqueues it.
- **One provider**: `IntakeJobsService` and `IntakeJobOwnerGuard` are provided only by `AiOperationsModule` and exported; `IntakeModule` provides only `IntakeProcessorService` and re-exports `AiOperationsModule`. A worker context has one `IntakeJobsService`, hence one recovery sweep.
- `docs/DEVELOPMENT.md` documents that `REDIS_URL` is required for intake.

| REQ                                                         | Verified by                                                                                                                                                                                                        |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| No-Redis upload: 503, no file, no row                       | `intake-jobs.service.spec.ts` 'rejects the upload with 503 before storing a file or creating a row'; e2e AC1 (not run here, no Postgres)                                                                           |
| No-Redis retry leaves the row untouched                     | `intake-jobs.service.spec.ts` 'keeps a QUEUED row untouched when a retry is refused'                                                                                                                               |
| No-Redis recovery sweep is a quiet no-op                    | `intake-jobs.service.spec.ts` 'skips the recovery sweep quietly...'                                                                                                                                                |
| Redis enqueue failure keeps the row QUEUED                  | `intake-jobs.service.spec.ts` 'keeps the row QUEUED for recovery when the Redis enqueue itself fails'                                                                                                              |
| Queue availability rule                                     | `intake-queue.service.spec.ts` 'reports unavailable and asserts with 503 until a handler is registered'                                                                                                            |
| One `IntakeJobsService`, exports visible through the module | `intake.worker.spec.ts` `IntakeModule`: strict resolution from a consumer module, `recoverJobs` called once. With `IntakeJobsService` added back to `IntakeModule.providers` the test fails (2 calls instead of 1) |

---

# Issue #127 Verification — Cap Node heap for api and worker from env with validated config

## Overview

- **Issue**: #127 (Cap Node heap for api and worker from env with validated config)
- **Base Commit (`origin/master`)**: `cc1443b`
- **Tested Commit (`ai/127`)**: `bb4df51b04befb3071095109ba489cfd002664b0`
- **Evidence refreshed**: 2026-10-10 (all commands re-run at the tested commit; the commit carrying this refresh changes no code)

---

## Requirements Verification Matrix

| REQ ID | Acceptance Criterion                                                                     | Verification Method                                                                                | Status |
| ------ | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------ |
| REQ-1  | AC1: Unset `MIZANO_NODE_HEAP_MB` adds no flag; behavior is unchanged                     | Automated e2e and unit tests in `apps/api/test/node-heap.e2e-spec.ts`                              | PASSED |
| REQ-2  | AC2: Valid values (128..4096) produce `--max-old-space-size=<n>`                         | Automated e2e and unit tests for 128, 512, 4096 and hex `0x80`                                     | PASSED |
| REQ-3  | AC3: Values below 128, above 4096 and non-numeric fail fast naming `MIZANO_NODE_HEAP_MB` | Automated e2e and unit tests with 127, 4097, abc, 1.5, 128.5, empty string, 0, -1, 0x7f, 0x1001    | PASSED |
| REQ-4  | AC4: Documented in `.env.example` (suggested Pi 5 value: 1024)                           | File-content assertions and excerpt below; README config section                                   | PASSED |
| REQ-5  | AC5: Launcher forwards signals to the child and exits non-zero or by signal              | E2E tests for SIGTERM→exit 42 and a second, later signal while the child is still running          | PASSED |
| REQ-6  | Scope: no `.github/` files touched                                                       | `git diff origin/master...HEAD --stat` (12 files, 806 insertions, 8 deletions, 0 `.github/` files) | PASSED |

---

## Test Execution Evidence

### 1. Acceptance & Unit Test Suite (`node-heap.e2e-spec.ts`)

Command:

```bash
pnpm --filter api exec jest --config ./test/jest-e2e.json node-heap
```

Output:

```text
PASS test/node-heap.e2e-spec.ts
  Node Heap Launcher (@flow:node-heap @issue-127)
    @issue-127 AC1: Unset heap cap behavior
      ✓ @e2e @flow:node-heap @issue-127 AC1: launches node without --max-old-space-size when unset (156 ms)
      ✓ @unit @flow:node-heap @issue-127 AC1: parseHeapMb returns undefined and buildNodeArgs adds no flag when unset (2 ms)
    @issue-127 AC2: Valid heap cap configurations
      ✓ @e2e @flow:node-heap @issue-127 AC2: launches node with --max-old-space-size=128 for input 128 and caps heap (156 ms)
      ✓ @e2e @flow:node-heap @issue-127 AC2: launches node with --max-old-space-size=512 for input 512 and caps heap (163 ms)
      ✓ @e2e @flow:node-heap @issue-127 AC2: launches node with --max-old-space-size=4096 for input 4096 and caps heap (151 ms)
      ✓ @e2e @flow:node-heap @issue-127 AC2: launches node with --max-old-space-size=128 for input 0x80 and caps heap (155 ms)
      ✓ @unit @flow:node-heap @issue-127 AC2: parseHeapMb parses 128 as 128 and buildNodeArgs prepends argument
      ✓ @unit @flow:node-heap @issue-127 AC2: parseHeapMb parses 512 as 512 and buildNodeArgs prepends argument
      ✓ @unit @flow:node-heap @issue-127 AC2: parseHeapMb parses 4096 as 4096 and buildNodeArgs prepends argument (1 ms)
      ✓ @unit @flow:node-heap @issue-127 AC2: parseHeapMb parses 0x80 as 128 and buildNodeArgs prepends argument
    @issue-127 AC3: Invalid heap cap values fail fast
      ✓ @e2e @flow:node-heap @issue-127 AC3: fails fast with non-zero exit and names MIZANO_NODE_HEAP_MB when value is 127 (77 ms)
      ✓ @e2e @flow:node-heap @issue-127 AC3: fails fast with non-zero exit and names MIZANO_NODE_HEAP_MB when value is 4097 (76 ms)
      ✓ @e2e @flow:node-heap @issue-127 AC3: fails fast with non-zero exit and names MIZANO_NODE_HEAP_MB when value is abc (78 ms)
      ✓ @e2e @flow:node-heap @issue-127 AC3: fails fast with non-zero exit and names MIZANO_NODE_HEAP_MB when value is 1.5 (81 ms)
      ✓ @e2e @flow:node-heap @issue-127 AC3: fails fast with non-zero exit and names MIZANO_NODE_HEAP_MB when value is 128.5 (82 ms)
      ✓ @e2e @flow:node-heap @issue-127 AC3: fails fast with non-zero exit and names MIZANO_NODE_HEAP_MB when value is  (82 ms)
      ✓ @e2e @flow:node-heap @issue-127 AC3: fails fast with non-zero exit and names MIZANO_NODE_HEAP_MB when value is 0 (81 ms)
      ✓ @e2e @flow:node-heap @issue-127 AC3: fails fast with non-zero exit and names MIZANO_NODE_HEAP_MB when value is -1 (81 ms)
      ✓ @e2e @flow:node-heap @issue-127 AC3: fails fast with non-zero exit and names MIZANO_NODE_HEAP_MB when value is 0x7f (77 ms)
      ✓ @e2e @flow:node-heap @issue-127 AC3: fails fast with non-zero exit and names MIZANO_NODE_HEAP_MB when value is 0x1001 (76 ms)
      ✓ @unit @flow:node-heap @issue-127 AC3: parseHeapMb throws error naming MIZANO_NODE_HEAP_MB for 127 (4 ms)
      ✓ @unit @flow:node-heap @issue-127 AC3: parseHeapMb throws error naming MIZANO_NODE_HEAP_MB for 4097 (1 ms)
      ✓ @unit @flow:node-heap @issue-127 AC3: parseHeapMb throws error naming MIZANO_NODE_HEAP_MB for abc
      ✓ @unit @flow:node-heap @issue-127 AC3: parseHeapMb throws error naming MIZANO_NODE_HEAP_MB for 1.5
      ✓ @unit @flow:node-heap @issue-127 AC3: parseHeapMb throws error naming MIZANO_NODE_HEAP_MB for 128.5
      ✓ @unit @flow:node-heap @issue-127 AC3: parseHeapMb throws error naming MIZANO_NODE_HEAP_MB for
      ✓ @unit @flow:node-heap @issue-127 AC3: parseHeapMb throws error naming MIZANO_NODE_HEAP_MB for 0
      ✓ @unit @flow:node-heap @issue-127 AC3: parseHeapMb throws error naming MIZANO_NODE_HEAP_MB for -1
      ✓ @unit @flow:node-heap @issue-127 AC3: parseHeapMb throws error naming MIZANO_NODE_HEAP_MB for 0x7f (1 ms)
      ✓ @unit @flow:node-heap @issue-127 AC3: parseHeapMb throws error naming MIZANO_NODE_HEAP_MB for 0x1001
      ✓ @flow:node-heap @issue-127: does not interpolate raw value into error message (76 ms)
    @issue-127 AC4: Documentation
      ✓ @flow:node-heap @issue-127 AC4: documents MIZANO_NODE_HEAP_MB in .env.example
      ✓ @flow:node-heap @issue-127 AC4: documents MIZANO_NODE_HEAP_MB in README.md
    @issue-127 AC5: Signal forwarding to child process
      ✓ @e2e @flow:node-heap @issue-127: forwards SIGTERM to the child and exits non-zero or by signal (152 ms)
      ✓ @e2e @flow:node-heap @issue-127: forwards subsequent signals while child is still running (179 ms)

Test Suites: 1 passed, 1 total
Tests:       35 passed, 35 total
Snapshots:   0 total
Time:        3.386 s
Ran all test suites matching /node-heap/i.
```

### 2. Validators Unit Tests (`node-heap-mb.schema.spec.ts`)

Command:

```bash
pnpm --filter @mizano/validators test
```

Output:

```text
PASS test/node-heap-mb.schema.spec.ts
  nodeHeapMbSchema
    ✓ returns undefined when unset (1 ms)
    ✓ parses valid value 128 (1 ms)
    ✓ parses valid value 4096
    ✓ rejects value below minimum (127)
    ✓ rejects value above maximum (4097)
    ✓ rejects non-numeric string (abc)
    ✓ parses valid hex representation 0x80 as 128 (1 ms)
    ✓ rejects decimal number (1.5)
    ✓ rejects fractional number within range (128.5)
    ✓ rejects hex value below minimum (0x7f)
    ✓ rejects hex value above maximum (0x1001)
    ✓ rejects empty string

Test Suites: 1 passed, 1 total
Tests:       12 passed, 12 total
Snapshots:   0 total
Time:        0.81 s
Ran all test suites.
```

### 3. Lint

Command:

```bash
pnpm lint
```

Output:

```text
> mizano@0.1.0 lint <repo-root>
> turbo lint

• turbo 2.8.12
• Packages in scope: @mizano/shared-types, @mizano/validators, @mizano/web, api
• Running lint in 4 packages
api:lint: > eslint "src/**/*.ts" (apps/api)
@mizano/validators:lint: > eslint "src/**/*.ts" (packages/validators)
@mizano/web:lint: > next lint (apps/web) — pre-existing warnings only, no new errors

 Tasks:    4 successful, 4 total
```

(The only lint output from changed packages is the eslint invocation above; `apps/web` prints its pre-existing warnings listed earlier on the branch's first evidence commit.)

### 4. Type-Check

Command:

```bash
pnpm type-check
```

Output:

```text
> mizano@0.1.0 type-check <repo-root>
> turbo type-check

• turbo 2.8.12
• Packages in scope: @mizano/shared-types, @mizano/validators, @mizano/web, api
api:type-check: > tsc --noEmit && tsc --noEmit -p test/tsconfig.e2e.json (apps/api)
@mizano/validators:type-check: > tsc --noEmit (packages/validators)

 Tasks:    6 successful, 6 total
```

## Signal Forwarding Verification

The launcher defines named handlers (`handleSigterm`, `handleSigint`, `handleSighup`) and forwards a signal only while the child has not exited (`childExited` flag plus `child.exitCode`/`child.signalCode` still null) — so a later SIGINT/SIGTERM is still delivered even when the child catches and ignores the first signal (review finding: a `child.killed` check would drop it). On child exit with a signal it maps the signal via `os.constants.signals[signal]` and exits with `128 + signum`; unknown signals are re-raised via `process.kill(process.pid, signal)` after removing the handlers. Otherwise it exits with `code ?? 0`. The `MIZANO_NODE_HEAP_MB` fail-fast keeps exit code 1.

Command:

```bash
node apps/api/scripts/start-node.js -e 'setInterval(() => {}, 1000)' & LAUNCHER=$!; sleep 1; kill -TERM $LAUNCHER; wait $LAUNCHER; echo "launcher exit: $?"
```

Output:

```text
launcher exit: 143
```

The launcher received SIGTERM, forwarded it to the child, and exited with the conventional signal status 143 (128 + 15). The e2e suite additionally proves the full mapping: a probe that exits with `process.exit(42)` on SIGTERM yields launcher exit code 42 with null signal, and a probe that ignores SIGTERM still receives a subsequent SIGINT and exits 43.

## Fast-Fail Error Output on Invalid Configuration

Command:

```bash
MIZANO_NODE_HEAP_MB=100 node apps/api/scripts/start-node.js dist/main
```

Output:

```text
[mizano] Failed to start node: MIZANO_NODE_HEAP_MB must be an integer between 128 and 4096
```

Exit code: 1

The message names the variable and the accepted range and does not include the rejected value (the raw value must never be echoed, per repo rules on never logging raw secrets).

## Manual Verification of V8 Heap Size Limit

Commands:

```bash
node -e "console.log('Unset default heap_size_limit:', require('v8').getHeapStatistics().heap_size_limit)"
node apps/api/scripts/start-node.js -e "console.log('Unset launcher heap_size_limit:', require('v8').getHeapStatistics().heap_size_limit)"
MIZANO_NODE_HEAP_MB=1024 node apps/api/scripts/start-node.js -e "console.log('1024MB launcher heap_size_limit:', require('v8').getHeapStatistics().heap_size_limit)"
MIZANO_NODE_HEAP_MB=512 node apps/api/scripts/start-node.js -e "console.log('512MB launcher heap_size_limit:', require('v8').getHeapStatistics().heap_size_limit)"
```

Output:

```text
Unset default heap_size_limit: 4395630592
Unset launcher heap_size_limit: 4395630592
1024MB launcher heap_size_limit: 1174405120
512MB launcher heap_size_limit: 637534208
```

## `.env.example` Content (Pi 5 recommendation only)

```text
# ============================================
# MIZANO ERP - Environment Template
# ============================================
# Copy this file to .env.local for local development.

# ── Node Memory Limits ──────────────────────────────────────
# Optional: Cap Node V8 heap space in MB (integer between 128 and 4096).
# Must be exported in the service/process environment (shell, systemd, or container env)
# before the launcher starts Node. When unset, Node defaults are used.
# Suggested starting value for Raspberry Pi 5 (8GB): 1024.
# Note: In containerized setups, MIZANO_NODE_HEAP_MB must be passed in the compose profile (#39).
# MIZANO_NODE_HEAP_MB=1024
```

---

# EVIDENCE.md — Cross-tenant isolation of ledger and invoice reads (#108)

- **Tested commit**: `34a8ca9c` (branch `ai/108`; the only later commit changes this file, `git diff 34a8ca9c HEAD --stat` lists EVIDENCE.md alone). Every result below, including all mutation rows, was produced at that commit in this round.
- **Suite**: `apps/api/test/tenant-isolation.e2e-spec.ts` (7 tests). Two registered tenants (A: 1111, B: 7777), each with a sent invoice, an approved bill, a manual journal and a distinct unapplied vendor credit (A 222.22, B 333.33).
- **Database**: throwaway Postgres 16 (`mizano_e2e_108` on `127.0.0.1:55432`, `prisma migrate deploy`) and Redis (`127.0.0.1:56380`), both started from a temp dir for this run. No new services or secrets.
- **Production code changed**: a cursor guard in `findAllCursor` of `invoices.service.ts`, `bills.service.ts` and `journals.service.ts` (a cursor id from another tenant, or unknown, gives 404). No auth-model change.
- **e2e-army**: no new test. This issue adds API integration tests and a guard on a query parameter; no screen or user flow changes. The foreign-cursor 404 is asserted by `AC2b` in the suite above. The earlier `e2e-army/108-cursor-isolation.e2e.ts` was removed because it repeated that check.

| REQ  | Requirement                                                        | Test (`@issue-108`)                                                                          | Status |
| ---- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- | ------ |
| AC1  | A's token on B's invoice, bill, journal, GL account id returns 404 | `AC1: returns 404 for every foreign id` (both GL routes; own ids return 200)                 | PASSED |
| AC2  | Lists, AP aging and both trial balances hold no B rows or totals   | three `AC2:` tests: lists + `meta.total` vs own rows, AP aging + own credits, trial balances | PASSED |
| AC2b | Cursor endpoints reject the other tenant's id                      | `AC2b: foreign ids as cursor return 404, own ids 200`                                        | PASSED |
| AC3  | No token or an expired token gets 401 on all 14 routes             | two `AC3:` tests                                                                             | PASSED |
| AC4  | Existing command, no new services                                  | `jest --config ./test/jest-e2e.json` (`pnpm --filter api test:e2e`)                          | PASSED |
| AC5  | Change ≤ ~300 lines                                                | 307 changed lines of test and source (see Size)                                              | MET    |

**Commands and output** (at `34a8ca9c`, from `apps/api`):

```text
$ DATABASE_URL=…mizano_e2e_108 pnpm exec jest --config ./test/jest-e2e.json --maxWorkers=1 tenant-isolation
Test Suites: 1 passed, 1 total   Tests: 7 passed, 7 total
$ pnpm exec jest --maxWorkers=2 src/modules/sales/services/invoices.service.spec.ts \
    src/modules/purchases/services/bills.service.spec.ts src/modules/accounting/services/journals.service.spec.ts
Test Suites: 3 passed, 3 total   Tests: 155 passed, 155 total
$ pnpm exec tsc --noEmit && pnpm exec tsc --noEmit -p test/tsconfig.e2e.json    # exit 0
$ pnpm exec eslint "{src,test}/**/*.ts" --max-warnings 0                         # exit 0
```

**Mutation check** (issue test plan: drop one tenant filter, confirm the matching test fails, restore). Each row was run at `34a8ca9c`; the suite exited 1 with only the named test failing, and the file was restored with `git checkout` afterwards.

| Removed tenant guard                                                                      | Failing test                                             |
| ----------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `invoices.service.ts:219` `organizationId` in `findOne`                                   | AC1 every foreign id                                     |
| `invoices.service.ts:198` `organizationId` in the cursor guard                            | AC2b cursor 404                                          |
| `invoices.service.ts:118` `organizationId` in the list filter (data and count)            | AC2 lists and `meta.total`                               |
| `bills.service.ts:120` `organizationId` in the cursor guard                               | AC2b cursor 404                                          |
| `bills.service.ts:78` `organizationId` in the list filter                                 | AC2 lists and `meta.total`                               |
| `journals.service.ts:230` `organizationId` in the cursor guard                            | AC2b cursor 404                                          |
| `aging-reports.service.ts:187` `organizationId` in the vendor-credit query                | AC2 AP aging                                             |
| `aging-reports.service.ts:171` `organizationId` in payables aging                         | AC2 AP aging                                             |
| `report-utils.ts:207` line-totals filter plus `financial-reports.service.ts:576` accounts | AC2 trial balances (`/reports/trial-balance`)            |
| `report-utils.ts:207` line-totals filter plus `accounting-reports.service.ts:65` accounts | AC2 trial balances (`/accounting-reports/trial-balance`) |
| `jwt.strategy.ts:23` `ignoreExpiration: true`                                             | AC3 expired token                                        |

Each trial balance has two tenant filters: the account list and the line totals. Removing only one of them leaks nothing, because foreign totals are keyed by foreign account ids that the org-scoped account list never holds. Removing both makes the AC2 trial balance test fail, as the two trial-balance rows show.

**Size (AC5).** `git diff --numstat origin/master HEAD -- apps/api e2e-army` at the tested commit: `tenant-isolation.e2e-spec.ts` 285, three services 23, e2e-army 0 = 308 added lines of test and source. The earlier 501 came from a 367-line spec and a 108-line e2e-army file; the e2e-army file was removed and the three AC2 list tests were merged. All four earlier reviewer requests stay covered: second general-ledger route, `meta.total`, vendor-credit netting in AP aging, foreign cursor ids.

**Suite stability.** Before `34a8ca9c` the unmutated suite failed in about 1 of 7 to 16 consecutive runs on this shared machine, always while seeding or on one request (405 on `POST /bills/:id/approve`, 404 on `POST /vendor-credits`, `socket hang up`), never in an assertion. Cause: supertest binds and releases a fresh ephemeral port per request, and another process can claim it in between. `beforeAll` now calls `app.listen(0, '127.0.0.1')` once. After the change, 60 consecutive runs passed. The cause is inferred from the pattern and the fix, not traced to a specific foreign process.

---

## Index: other issues

- Issue #94 (decimal money math and idempotent posting): [docs/evidence/94/EVIDENCE.md](docs/evidence/94/EVIDENCE.md).
