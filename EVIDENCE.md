# EVIDENCE.md — Issue #87: pdf-parse and zero-offset Buffers

Not user-facing (internal intake utility), so no e2e-army test. Sentry issue: none linked in the brief.

## Acceptance criteria

1. **AC1** Every pdf-parse call site passes a fresh zero-offset copy.
2. **AC2** A unit test feeds a Buffer sliced from a larger pool (non-zero `byteOffset`) and asserts the text is extracted.
3. **AC3** One line about zero-offset buffers for pdf.js in `docs/agents/review-lessons.md`.

## Verification (run on this branch)

| AC  | Evidence                                                                                                                                                                                       | Exit |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| AC1 | `grep -rn pdf-parse apps/api/src`: the only call site is `extractTextFromPdf` in `pdf-extractor.util.ts`; it builds `new Uint8Array(buffer)` once and uses it in both the v1 and v2 branches.  | 0    |
| AC2 | `cd apps/api && npx jest src/modules/ai/utils/pdf-extractor.util.spec.ts`: 3 tests pass against the real pdf-parse 1.1.1 (a PDF built in the spec, slice at `byteOffset` 50 of a larger pool). | 0    |
| AC3 | `git diff master -- docs/agents/review-lessons.md`: one bullet added.                                                                                                                          | 0    |
| —   | `pnpm --filter ./apps/api type-check` (after `pnpm --filter @mizano/shared-types build`)                                                                                                       | 0    |
| —   | `pnpm --filter ./apps/api exec eslint src/modules/ai/utils --max-warnings 0`                                                                                                                   | 0    |
| —   | `npx jest` on `pdf-extractor.util.spec.ts` + `document-intake.service.spec.ts` (the only caller): 2 suites, 29 tests pass                                                                      | 0    |

## Regression check against master

With master's `pdf-extractor.util.ts` (raw `Buffer` passed to pdf-parse) and this branch's spec, all 3 tests fail (pdf.js throws `UnknownErrorException` inside Jest). With the fix they pass.

Limits of that result:

- The plain zero-offset test also fails on master under Jest, so under Jest the raw-`Buffer` failure is not specific to `byteOffset`. The offset-specific assertion is the second test (`byteOffset === 0`, `buffer.byteLength === pdf.length`, a different `ArrayBuffer` from the pool).
- Outside Jest on Node v26.10.0, a probe with pdf-parse's own `01-valid.pdf` sliced at offset 50 extracted 14 pages from the raw sliced Buffer, the `Uint8Array` copy and the control alike. I could not reproduce the Node 25 flake from the issue on this machine, so the fix is verified for its contract (zero-offset copy), not against the original flake.
