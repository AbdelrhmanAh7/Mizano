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
PDF rendering. Integration with #16 is required before claiming CPU extraction.

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

## Worker budget and outstanding integration

The Tesseract adapter serializes initialization and recognition on one worker,
loads both languages once, terminates failed engines before retry and drains
accepted calls on shutdown. OCR errors and Python/render errors log metadata
only, including exception summaries and model status lines. This bounds OCR
engine concurrency, not whole-job concurrency, process RAM or wall-clock time.

Target: one extraction job at a time, at most two only after Pi measurements;
worker memory hard limit 2048 MiB and a CPU quota leaving capacity for the API.
The current Pi compose file reserves a worker but does not launch one; intake
currently consumes inside the API process. Setting `INTAKE_CONCURRENCY=1` alone
does not establish process/memory isolation or API responsiveness. Do not
enable a second API replica as a substitute: it also starts unrelated services.
The coordinator must integrate a dedicated worker entrypoint and producer-only
API, using the same tenant-scoped queue/lease commands, before deployment.

Each page/document needs an enforceable wall-clock deadline, including worker
initialization, preprocessing and PDF rendering. A deadline must terminate the
OCR/render task before releasing its concurrency slot, then persist an
exception under the current tenant-scoped lease. A bare `Promise.race` timeout
leaves expensive work running and is insufficient. Deadline values remain
unagreed until the owner sets them and the Pi holdout run measures them.

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

| Acceptance evidence                 | Current result                   |
| ----------------------------------- | -------------------------------- |
| Pi p50/p95 per document type        | Unknown: no Pi/corpus connected  |
| Peak Pi RAM per document type       | Unknown                          |
| API p95 while processing batch      | Unknown; threshold not agreed    |
| Dedicated worker resource isolation | Not implemented on this baseline |
| Per-document timeout to exceptions  | Not implemented on this baseline |
| No-LLM extraction integration (#16) | Not present on this baseline     |

Issue #42 remains partial until those gates have evidence. An amd64 build or
mocked OCR unit test cannot satisfy Pi acceptance. Do not build arm64 locally.

## Runtime review evidence (3 October 2026)

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
and E2E used `--runInBand`. Next: coordinator integration
of #16's no-LLM worker and terminating deadlines, fresh review, arm64/size CI,
then the held-out Pi/API batch measurements.
