# Issue 17 synthetic format fixtures

All documents are synthetic; no real invoices or external inference are used.

| Fixture ID                | Purpose                                                                                  |
| ------------------------- | ---------------------------------------------------------------------------------------- |
| `later-page-long.pdf`     | Two native pages; more than 4,000 characters before the second-page totals.              |
| `mixed.pdf`               | Native first page and raster-only second-page invoice summary.                           |
| `mixed-same-page.pdf`     | Native header and raster invoice summary on one page; both sources preserved for review. |
| `scan.jpg`                | Synthetic raster summary embedded in `mixed.pdf`.                                        |
| `table-long.docx`         | Long supporting paragraph followed by two-column label/value table.                      |
| `legacy.doc`              | reserved for the pure-JS .doc follow-up issue                                            |
| `legacy-expected.txt`     | Expected synthetic legacy text, including explicit EGP currency.                         |
| `poor.png`                | Blank low-contrast image: must produce an actionable exception.                          |
| `too-many-pages.pdf`      | 21 pages: reject rather than silently dropping pages.                                    |
| `corrupt.pdf`             | PDF signature with broken content: explicit corrupt error.                               |
| `encrypted.pdf`           | Synthetic password-protected PDF: remove-password repair.                                |
| `embedded-image.docx`     | Word image content requires an explicit export-to-PDF repair.                            |
| `expanded-too-large.docx` | ZIP declares over 20MiB of expanded content; reject before decompressing.                |
| `entity.docx`             | XML entity declaration; reject without expanding it.                                     |

Expected review fields: invoice FMT-17, date 2026-09-01, net 200.0000,
tax amount 28.0000, gross 228.0000, currency EGP.

Additional fixture IDs: `strict-table.docx` contains the same long table using
the Strict OOXML namespace; `forged-word.docx` contains Word-like XML in a ZIP
without the required package content types and relationships and must be corrupt.
The reader validates those package parts and XML roots before accepting text.

Run `node ../../node_modules/jest/bin/jest.js --config test/jest-e2e.json --runInBand formats.e2e-spec.ts`
from `apps/api`, using only the isolated `mizano_e2e_cxformats` database and
Redis at 127.0.0.1:6380 with a separate logical database to isolate its intake queue
from other lanes (this lane uses `/11`). Deploy migrations first. This suite requires the real
CPU tools and pinned local English OCR assets (`INTAKE_TESSDATA_DIR`). It has
no conditional skips or parser mocks. Passing mocked unit routing tests is
not evidence that Linux conversion, OCR or Pi performance passed.

## Required operator Dockerfile change (not applied by this lane)

The API/worker image stays `node:20-alpine`. Add only these runtime packages:

```dockerfile
RUN apk add --no-cache poppler-utils util-linux-misc
```

`poppler-utils` provides pdfinfo, pdfimages, pdftotext and pdftoppm;
`util-linux-misc` provides prlimit. Preserve pinned English/Arabic OCR assets;
no runtime language/model downloads. DOCX uses the in-process Node reader
with yauzl and fast-xml-parser. Legacy DOC is rejected before queueing with
a bilingual save-as-DOCX/PDF repair (`UNSUPPORTED_LEGACY_DOC`).

Limits: 20MiB input, 20 PDF pages, 200,000 extracted characters, 24 million
image pixels, 1,000 ZIP entries and 20MiB declared uncompressed DOCX data.
Each CPU subprocess and OCR recognition has a 30-second limit. Limits reject
the whole extraction; no truncated document is reported as complete. DOCX
embedded images/objects and multi-frame images require re-exporting as PDF or
single-page images. Deskew corrects small tilts up to 7 degrees; orientation
uses EXIF and Tesseract automatic rotation. This is not an OCR accuracy claim.
Any PDF page containing raster content receives OCR even if it also has native
text. Both sources are retained and the job requires review. This conservative
rule also OCRs native pages with raster logos. Only bundled `eng`, `ara`, and
their canonical combination are used; aliases and duplicate language requests
share the corresponding worker.

CPU money travels as exact fixed 4-dp strings. The web display also reads
historical numeric results without converting newly extracted money before
confirmation. Durable format evidence records reader version and PDF page routes.

## Architecture decision, 3 October 2026 (coordinator)

The Pi API image stays `node:20-alpine` (branch `demo/38-arm64-images`).
Ship PDF (native, scanned and mixed), DOCX and images. Legacy `.doc` is
rejected before queueing: "Save the file as DOCX or PDF and upload again"
(`UNSUPPORTED_LEGACY_DOC`). The `legacy.doc` and `legacy-expected.txt`
fixtures are reserved for a separate pure-JS DOC follow-up issue.

Runtime apk packages are `poppler-utils` and `util-linux-misc` only.
DOCX parsing uses Node with `yauzl` and `fast-xml-parser`, entity processing
off, retaining package, ZIP and XML checks. Process limits stay at 1 GiB
address space, 30 s CPU and bounded stdout, plus the limits above.

Both format and intake E2E suites are Linux-image acceptance suites. Their
beforeAll preflight runs every required version command once and reports all
missing or unusable tools in one error before starting services. No skips.
CI runs them inside the built API image; Windows is expected to fail preflight.

## Historical local reviewer evidence, 3 October 2026 (superseded implementation)

Provider: Codex (GPT-6). Base HEAD and locally recorded `origin/master`:
`1d37f28ac87ba7ce6621fd09eb76664c51635eda`. Changes remain uncommitted by
instruction; this is worktree evidence, not a tested new commit or release approval.

- API `tsc --noEmit -p tsconfig.json`, E2E `tsc --noEmit -p test/tsconfig.e2e.json`
  and web `tsc --noEmit`: passed.
- `eslint --max-warnings 0` on the 32 changed API and 6 changed web TypeScript
  files: passed.
- Focused `jest --runInBand --runTestsByPath ...`: API 246 tests across 17
  affected spec files; web 35 tests across 4 affected spec files; passed.
- `prisma migrate deploy`: no pending migrations on `mizano_e2e_cxformats`.
- `jest --config test/jest-e2e.json --runInBand --runTestsByPath test/intake.e2e-spec.ts test/formats.e2e-spec.ts`:
  12 passed, 17 failed, 29 total. Formats: 8 passed / 7 failed; durable intake:
  4 passed / 10 failed. The Windows host lacks `pdfinfo`, `pdfimages`,
  `pdftoppm` and the former legacy-conversion tools, so jobs fail with `TOOL_UNAVAILABLE` and
  dependent journeys fail. These are blocked evidence, not accepted PDF/DOC behavior.
- Actual real-parser DOCX and Strict OOXML tables, malformed packages, expanded
  ZIP limits, XML entities, embedded images, poor images and HTTP upload size
  repairs passed their E2E assertions. No conditional skips or relaxed assertions.

Commands used the installed Node CLI entrypoints rather than PowerShell's blocked
`npx.ps1`. Jest forbids combining `--runInBand` with `--maxWorkers=1`, so tests
used `--runInBand` alone. Node 25.6.1 emitted the installed dependency's
`DEP0169` warning during E2E; it was not suppressed. No full suites, builds or
`ci:full` ran under this review lane's low-memory instruction.

The coordinator must rerun both E2E specs inside the built Alpine API image
with the runtime apk tools above. PDF raster OCR, Arabic
OCR quality, Pi resource/performance measurements, browser journeys and fresh
independent review of these fixes remain open. The rules baseline prepares
header fields and preserves complete bounded raw text; line items remain empty
and require accountant input. No deployment or issue closure is implied.

No checkpoint files were present. Automatic approval review rejected removal
of verified worktree caches, including explicit absolute paths, with only
"blocked by policy" as the reason. Cache cleanup remains incomplete.
