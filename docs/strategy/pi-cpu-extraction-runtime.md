# Pi CPU extraction runtime (#42)

## OCR decision

Use Tesseract.js with bundled Arabic and English assets for the CPU demo.
No Python dependency is required in the runtime image. Python in the disposable
Docker `deps` stage builds native Node modules; it is not copied into runtime.
PaddleOCR/RapidOCR is outside this baseline: its current Python adapter can
download models at runtime and has not been benchmarked against the frozen
holdout. Do not install that adapter's Python packages on the Pi or enable a
cloud/LLM fallback for the demo.

The existing OCR+LLM strategy is **not** the no-LLM baseline from #16.
Bundling Tesseract assets does not remove its Ollama dependency or add scanned
PDF rendering. Queued intake no longer uses it: the
[dedicated worker](#dedicated-worker-and-resource-budget) has its own OCR/PDF
path. Integration with #16's structured parser is still required before
claiming CPU invoice extraction.

## Reproducible language assets

`apps/api/Dockerfile` installs `@tesseract.js-data/eng@1.0.0` and
`@tesseract.js-data/ara@1.0.0` in a disposable build-host stage. It decompresses
the `4.0.0_best_int` variant and verifies the resulting bytes against
[the SHA-256 manifest](../../apps/api/ocr-assets.sha256). A changed package,
wrong variant, corrupt download or missing file fails the build. Only the two
verified traineddata files reach `/app/tessdata` in the final image; npm assets
and compressed copies stay in the build stage. The runtime also receives the
small checksum manifest. Image size is unmeasured here; CI must enforce the
existing API limit of less than 1,200,000,000 bytes.

`INTAKE_TESSDATA_DIR=/app/tessdata` selects local uncompressed files regardless
of working directory. The production adapter checks their hashes and copies
the verified buffers into a private temporary directory, which Tesseract
reads with caching disabled. The snapshot is removed after initialization.
This avoids an old cache or a changed source file overriding verified bytes.
Tesseract 7's `Lang[]` overload is not usable on this version: initialization
joins each object's data instead of its code. The real-engine E2E exercises
the local-file route rather than relying on its TypeScript declaration.
Unset configuration selects tracked local files relative to the adapter;
missing/corrupt files, URL configuration and unsupported languages fail closed.
Build-time registry access is allowed; runtime language downloads are not.
The CI Docker job already initializes `eng+ara` under
`--network none` on both architectures. Keep that check and the image-size
assertion. Asset updates require an explicit version/hash change and rerunning
the offline initialization check; never regenerate hashes automatically during
the Docker build.

The offline unit contract in
`apps/api/src/modules/ai/extraction/ocr-assets.spec.ts` checks both local asset
digests, requires the production adapter to reject missing/truncated assets
before engine creation, and verifies the build-stage pins/check and runtime
copy. It does not substitute for the existing multi-architecture CI
container journey: that journey must initialize both languages with networking
disabled and enforce the final image-size limit. No Docker build was run in
this lane continuation, as requested by the lead.

`apps/api/test/ocr-assets.e2e-spec.ts` also initializes the real Tesseract
engine through the compiled production adapter outside the API working
directory. Its preload blocks network APIs in both the child and OCR thread,
records any attempt, and checks missing and corrupt local assets fail without
downloads or cache writes. It needs no database or Redis. Build the API first,
then run from `apps/api` with
`pnpm exec jest --config test/jest-e2e.json test/ocr-assets.e2e-spec.ts --runInBand --forceExit=false`.
This host integration test does not establish arm64 compatibility or OS-level
network isolation; CI's `--network none` container check remains required.

## Readiness probes

The API's `/api/health` exists and returns HTTP 200 even when a dependency is
unhealthy. Both the Dockerfile and Pi compose now execute the same compiled
probe, which checks the response's health status, bounds response size and
enforces a five-second total deadline. The controller uses a bounded direct
Redis connection and `PING`; an in-memory cache success is no longer Redis
evidence. PostgreSQL's Pi probe uses TCP at `127.0.0.1` so the temporary Unix
socket initialization server cannot declare readiness prematurely.
The direct cache Redis connection is also disconnected on failed startup and
application shutdown, preventing handles from surviving a worker restart.
The bulk-job cleanup interval is unreferenced and cleared on shutdown too.
These probes establish dependency readiness, not authenticated API latency under
an extraction backlog.

## Dedicated worker and resource budget

The API is producer-only. `IntakeProcessorService` is registered only by
`IntakeWorkerModule`; `node dist/intake-worker.js` boots that minimal Nest
context without HTTP controllers, application schedulers or AI/LLM providers
(a unit test fails if its import graph reaches Ollama, the legacy strategy
resolver or an AI module). Redis is required: there is no inline fallback, so
an uploaded document stays `QUEUED` until a worker runs. The API keeps durable
job recovery, ownership checks, uploads, SSE and accountant confirmation.

At boot the worker refuses to start, instead of failing every document, when
the host is not Linux, `/usr/bin/prlimit` is not executable or
`INTAKE_JOB_DEADLINE_MS` is invalid. It also removes `mizano-intake-*`
temporary directories that a crashed predecessor left in the container's
writable layer (only those older than the deadline plus one minute, so a live
job is never touched).

Each tenant-scoped lease launches one disposable Linux child through
`/usr/bin/prlimit`, as its own process group. The child receives a storage
descriptor over IPC, checks that the key lies strictly inside the job's own
organization folder (no empty, `.` or `..` segment), verifies the original's
checksum, then uses only local Poppler and the pinned Arabic/English Tesseract
assets. Database, Redis and provider credentials, `NODE_OPTIONS`, original
bytes, the original file name and document text never appear in the child's
argv, environment or logs; its stdout/stderr are discarded. The worker mounts
the originals read-only. The supervisor removes the child's private temporary
directory after the process group has closed, on every outcome; a cleanup
failure is logged as metadata and never replaces the real result or failure.
The language and strategy hints stored on a job are not used by this path: it
always loads both pinned languages and never selects a model.

The CPU path extracts native PDF text, or renders scanned PDF pages
sequentially (up to 20, 2000-pixel maximum dimension) and recognizes images
with Tesseract. It deliberately does not call the legacy strategy resolver,
classifier or Ollama. **#16's structured parser is absent on this branch**:
text is retained as evidence, money/currency/dates remain null, vendor and
duplicate matching are not run, and the result is `NEEDS_REVIEW` with
`extractionMethod=cpu-ocr`. This is an extraction runtime, not a claim of
complete invoice parsing or measured accuracy. When #16 lands, its pure text
rules belong in the child; tenant-scoped matching and duplicate detection need
the database and belong in the worker process, after the child has closed.

| Limit                        | Implementation                                                                                                                                                                                                                                                                                                                     |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Whole-job concurrency        | `INTAKE_CONCURRENCY=1`; exactly `2` opts into two; any other value is one                                                                                                                                                                                                                                                          |
| Whole-document wall deadline | `INTAKE_JOB_DEADLINE_MS=120000`, 100-600000 ms, provisional until Pi measurements. This timer is the deadline                                                                                                                                                                                                                      |
| Child CPU time               | `prlimit --cpu` is the deadline rounded up **plus 2 s**: a kernel backstop that works even if the supervisor stalls, or if threads burn CPU faster than the wall clock. It is deliberately not equal to the deadline: at equality one busy thread reaches both limits at the same instant and the failure code becomes a coin toss |
| External tools               | `prlimit` address space 512 MiB and CPU `min(60, deadline in s)`, which is never above the child's own hard limit (a child cannot raise an inherited hard limit); the PDF text and render tools add a 32 MiB file-size and 64-descriptor cap; no shell, bounded output                                                             |
| Child memory                 | V8 heap 256 MiB; Linux RSS supervisor kills above 768 MiB, sampled every 100 ms                                                                                                                                                                                                                                                    |
| Worker aggregate             | compose cgroup hard limit 2048 MiB, no swap, 2 CPU cores, 128 PIDs                                                                                                                                                                                                                                                                 |

RSS sampling is not an instantaneous hard per-job RAM ceiling; native/WASM
allocations and rendered-tool memory also count against the container's hard
2 GiB limit, and the tools' address-space caps are separate from the child's
RSS. Two simultaneous jobs can hit that aggregate cap, so keep one until the
Pi holdout validates two. Run **one worker replica**; per-process BullMQ
concurrency is not a cluster-wide concurrency cap.

On expiry, lease loss or shutdown the supervisor sends SIGKILL to the entire
child process group and waits for the child's close event before releasing the
slot. Late results are ignored. Only then does the processor persist the
failure code under the current tenant/lease (a stale worker's write matches no
row) and schedule the existing bounded retry/backoff. Max attempts still
dead-letter and allow explicit retry. Every timer and listener has an owner
that clears it when the child closes.

Kernel-enforced limits arrive as signals, not exit codes, so the supervisor
maps what it observes (checked on Linux):

| Child ends by                                                                                        | Supervisor sees                     | Stable code             |
| ---------------------------------------------------------------------------------------------------- | ----------------------------------- | ----------------------- |
| Wall deadline                                                                                        | its own timer, then group SIGKILL   | `INTAKE_TIMEOUT`        |
| RSS above 768 MiB                                                                                    | its own sampler, then group SIGKILL | `INTAKE_RESOURCE_LIMIT` |
| CPU rlimit (soft equals hard)                                                                        | `SIGKILL`, not `SIGXCPU`            | `INTAKE_RESOURCE_LIMIT` |
| V8 heap limit                                                                                        | `SIGABRT`                           | `INTAKE_RESOURCE_LIMIT` |
| Container OOM killer                                                                                 | `SIGKILL`                           | `INTAKE_RESOURCE_LIMIT` |
| Lease lost, shutdown                                                                                 | its own group SIGKILL               | `INTAKE_WORKER_FAILED`  |
| Uncaught exception, exit without a result, scope or checksum failure, unsupported format, page limit | exit code                           | `INTAKE_WORKER_FAILED`  |

API views and SSE localize these codes (English/Arabic) from the request's
existing i18n language; the job view also exposes `errorCode` and `retryable`
(true for `FAILED` and `DEAD_LETTER`). The web client does not yet send an
`x-lang` header, so the language follows the browser's `Accept-Language`;
mapping `errorCode` through the web message catalogs is a follow-up.

Worker readiness requires a fresh DB-and-Redis heartbeat (written every 5 s,
stale after 20 s). Compose uses the same API image digest for API and worker,
`init: true` reaps killed descendants, and deploy/rollback health waits and the
five-minute monitoring timer include the worker, because a dead worker would
otherwise leave every document queued silently. On SIGTERM the worker stops
fetching jobs, kills the active child, lets the drain finish while Prisma is
still connected, then closes its dependencies, all inside the 30 s stop grace.
The aborted job fails with `INTAKE_WORKER_FAILED` and is retried after backoff.

Local development: the worker needs Linux (`pnpm --filter api start:worker`
after a build, in WSL or a container). The seeded intake E2E runs on any OS
because it starts the worker module in-process with a stubbed executor.

## Pi acceptance protocol (not yet executed)

Use the frozen held-out corpus from #24 without tuning on its documents.
Record corpus version/hash, exact candidate SHA/image digest, Pi model/RAM,
OS/architecture, worker limits, language asset hashes and deadline settings.
Keep document content and amounts out of logs and reports; use opaque corpus
IDs and document types. Run one cold-start separately, then the held-out batch
with a concurrent authenticated API probe scoped to the test organization.
Do not probe a nonexistent route or call an unauthenticated health check proof
of accountant API responsiveness.

For each document type, publish sample count, page count, p50/p95 elapsed time
per document and page, peak worker cgroup memory, completion/exception counts,
and cold-start time. Sample `memory.peak` on cgroup v2 in an isolated measurement
window per document (or recreate the worker per sample); a lifetime peak cannot
be attributed to later documents. Include failed and timed-out documents in
the denominators. Record probe request count, errors and p95 latency during
the batch. Agree the API p95 threshold **before** the run. Repeat the run with a
backlog larger than the concurrency cap and verify API responsiveness.

| Acceptance evidence                 | Current result                                                                          |
| ----------------------------------- | --------------------------------------------------------------------------------------- |
| Pi p50/p95 per document type        | Unknown: no Pi/corpus connected                                                         |
| Peak Pi RAM per document type       | Unknown                                                                                 |
| API p95 while processing batch      | Unknown; threshold not agreed                                                           |
| Dedicated worker resource isolation | Implemented; real-process tests pass in a Linux container; Pi, arm64 and Alpine pending |
| Per-document timeout to exceptions  | Implemented; real-process and seeded API E2E pass; Pi pending                           |
| No-LLM extraction integration (#16) | OCR evidence only; structured parser absent on this branch                              |

Issue #42 remains partial until those gates have evidence. An amd64 build or
mocked OCR unit test cannot satisfy Pi acceptance. Do not build arm64 locally.

## Historical asset/readiness review evidence (3 October 2026)

The evidence below belongs to the earlier asset/readiness changes. It is not
validation of the dedicated-worker changes described above.

Scope: [issue #42](https://github.com/AbdelrhmanAh7/Mizano/issues/42), on top of
[PR #60](https://github.com/AbdelrhmanAh7/Mizano/pull/60). Provider: Codex API
assistant; exact model snapshot unavailable. Source HEAD is
`c4523330edaba503acfc06cc49393be183508e17` plus uncommitted changes. The SHA-256
of the sorted path/hash manifest for the 22 changed runtime source/test/config
files is `79987485bd27984fcbe3c2f81ac724343ff4ca741695284f007d1d10e6a9b065`.
It excludes documentation and generated output; HEAD alone is not the tested
candidate. No commit, push, `gh`, Docker build or deployment was performed.
Local ownership ends at handoff; no globally acquired coordinator lease or
independent approval is claimed. A fresh reviewer must review these fixes.

Live GitHub issue retrieval failed and the master refresh failed with
`SEC_E_NO_CREDENTIALS`. The supplied issue text defines this review's scope.
Local master/origin-master is `1d37f28ac87ba7ce6621fd09eb76664c51635eda`, not
confirmed current on GitHub. Its import service, legacy Jest config and API
tsconfig have the exact same Git blob IDs as this branch. The legacy runner's
four CSV failures therefore also apply to that master's code/configuration;
no stash or alternate checkout was used. See [the interop explanation](../DEVELOPMENT.md).

| Review area     | Scoped assessment                                           |
| --------------- | ----------------------------------------------------------- |
| Security        | Local asset verification and metadata-only OCR errors fixed |
| Correctness     | Language changes, retries, readiness and cleanup verified   |
| Performance     | One OCR engine; Pi caps, deadlines and measurements open    |
| Maintainability | Shared adapter/probe, regression tests and lessons added    |

Changed files cover `apps/api/Dockerfile`, `ocr-assets.sha256`, the offline
adapter and OCR strategy/specs, PaddleOCR and PDF-renderer/specs,
`src/health/{health.controller,health.module,healthcheck}` and specs,
`src/cache/cache.service` and spec, the bulk cleanup service/spec,
`test/{ocr-assets,runtime-health}.e2e-spec.ts`, Pi compose, this document,
`docs/DEVELOPMENT.md` and `docs/agents/review-lessons.md`. The Codex runtime
checkpoint was removed; useful decisions and current evidence live here.
There are no new financial commands, tenant-resource queries or UI strings.

Commands below used installed tools through `pnpm exec` to avoid npm's warnings
about pnpm-only `.npmrc` keys. API commands run from `apps/api`; web commands
run from `apps/web`; build/legacy commands run from the repository root.

| Command / gate                                                                    | Actual result                        |
| --------------------------------------------------------------------------------- | ------------------------------------ |
| `pnpm exec tsc --noEmit -p tsconfig.json`                                         | Passed, no warnings                  |
| `pnpm exec tsc --noEmit -p test/tsconfig.e2e.json`                                | Passed, no warnings                  |
| `pnpm exec eslint --max-warnings 0 <all 19 changed TypeScript files>`             | Passed, no warnings                  |
| API `pnpm exec jest --runInBand`                                                  | 133 suites / 2,127 tests passed      |
| Web `pnpm exec jest --runInBand`                                                  | 46 suites / 431 tests passed         |
| `node apps/api/_run_tests.js --runInBand`                                         | 132/133 suites; 2,123 pass, 4 fail   |
| `pnpm build --concurrency=1`, then final `pnpm --filter api build`                | All four tasks / final API passed    |
| `pnpm ci:full --concurrency=1`                                                    | Exit 0; 12 tasks, 9 cached; warnings |
| Relevant E2E with `--runInBand --forceExit=false`                                 | 3 suites / 21 tests; clean exit      |
| LF, `git diff --check`, changed Markdown links and Pi compose YAML                | Passed                               |
| Docker arm64/offline/size CI, Pi holdout, API p95 under backlog, browser journeys | Not run here; acceptance stays open  |

For the relevant E2E run, `mizano_e2e_runtime` was created and all five existing
migrations deployed, without resetting another database. PostgreSQL used
`127.0.0.1:5435`; Redis used `127.0.0.1:6380/14` to isolate this lane's queues.
With `OLLAMA_ENABLED=false`, run:

```sh
pnpm exec jest --config test/jest-e2e.json test/ocr-assets.e2e-spec.ts test/runtime-health.e2e-spec.ts test/intake.e2e-spec.ts --runInBand --forceExit=false
```

The intake journey covers durable originals, duplicate uploads, two-tenant
and anonymous rejection including SSE, restart/recovery, bounded retries and
draft linking. Its extractor is stubbed; the separate OCR suite initializes
the real engine. Neither supplies no-LLM invoice accuracy or Pi performance.
Initial verification exposed the broken Tesseract overload and retained
Redis/maintenance handles; after fixes, the same E2E assertions passed and
Jest exited without forced termination.

The full API/E2E runs still emit the existing Node `DEP0169` warning; the build
emits cache-access, Browserslist-age and Node localstorage warnings. E2E's
existing synthetic PDF fixtures also emit parser warnings and the expected
duplicate-upload constraint message. A warning-free overall gate is not
claimed, and the legacy test gate remains failed. Repository CI also replays
existing web lint warnings and emits Turbo cache/output warnings. Its three
API tasks ran fresh; cached web tests contain 40 suites/386 tests, while the
direct run above verified all 46 suites/431 tests in this worktree. CI retains
the package script's two Jest workers; the separate full and affected suites
and E2E used `--runInBand`. The worker and terminating deadlines this
section listed as next are now implemented (see the evidence below); #16
integration, arm64/size CI and the held-out Pi/API measurements remain.

## Dedicated worker evidence (3 October 2026)

Scope: [issue #42](https://github.com/AbdelrhmanAh7/Mizano/issues/42), branch
`demo/42-intake-worker` on top of [PR #60](https://github.com/AbdelrhmanAh7/Mizano/pull/60).
A Codex implementation was reviewed and corrected by Claude Sonnet 5.5; this is
not an independent approval of the exact tested head. Everything ran on the
Windows development host or in a local Linux container; **nothing ran on a Pi,
on arm64, on Alpine/musl or on Node 20**.

| Command / gate                                                                                                                               | Result                                                                                                                                                |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| API `tsc --noEmit` (`tsconfig.json`, `test/tsconfig.e2e.json`); web `tsc --noEmit`                                                           | Passed                                                                                                                                                |
| `eslint --max-warnings 0` on every changed API and web file                                                                                  | Passed                                                                                                                                                |
| API `jest` on the worker, intake, operations and extraction folders plus the document-intake controller/service specs, `--runInBand`         | 15 suites / 222 tests passed; 1 Linux-only suite (9 tests) skipped on Windows                                                                         |
| Web `jest lib/hooks/use-ai-document-intake.spec.ts`                                                                                          | 10 tests passed                                                                                                                                       |
| Linux container (Debian, Node 25): the compiled executor, process, child, CPU-extraction, runtime, queue and healthcheck specs under Jest 29 | 7 suites / 107 tests passed, including the real-process spec (9 tests; three runs on the final code, an earlier 8-test version once under `--cpus=1`) |
| Seeded `test/intake.e2e-spec.ts` (PostgreSQL 16, Redis 7 in Docker; database `mizano_e2e_worker`; Redis DB 11; `OLLAMA_ENABLED=false`)       | 19 tests passed, including the localized timeout, producer-only and concurrency cases                                                                 |
| `bash deploy/pi/scripts/worker-health.test.sh`; ShellCheck on the changed scripts; `docker compose config` on the Pi file                    | 8 checks passed; no findings; rendered                                                                                                                |
| `nest build` (swc)                                                                                                                           | Passed; `dist` has `intake-worker.js`, `intake-worker-healthcheck.js` and `modules/ai/intake/intake-child.js`                                         |

Two defects were found only by running the real supervisor on Linux. Mocked
spawn tests had passed: the CPU-limit classification waited for `SIGXCPU`,
which the kernel never sends when the soft and hard limit are equal (the child
gets `SIGKILL`; a V8 heap overflow is `SIGABRT`), and the deadline test raced
the CPU limit because both were set to the same number of seconds. Both are
fixed above and covered by unit and process tests.

An uncommitted driver also ran the real child end to end in the container: the
pinned Arabic/English assets recognized a synthetic digit image; a wrong
organization key and a wrong checksum failed before any extraction; a 300 ms
deadline, an abort, a CPU-bound child with a busy descendant (killed, with no
process or directory left behind and the supervisor timer unaffected), an
allocation past the 768 MiB RSS limit, a single-thread CPU loop (wall deadline)
and two busy threads (CPU backstop) each ended with the expected code; two
documents ran concurrently. The synthetic image says nothing about invoice
accuracy.

Not run and still unknown: Poppler (`pdftotext`, `pdfinfo`, `pdftoppm`) and
the scanned-PDF path are covered only by mocked unit tests, since the test
container has no Poppler and no package mirror; the image build, the arm64 and
offline CI jobs and the image-size limit; the full API/web suites and
`pnpm ci:full` (the pre-push hook runs them); Pi latency and RAM per document
type (#24); authenticated API p95 under a backlog; browser journeys. Issue #42
stays partial until the Pi gates above have evidence.
