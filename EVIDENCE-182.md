# Verification report — #182 slice 1 (offset mapping after normalization)

Sentry issue: none (no originating Sentry issue; GitHub issue #182, part 2/2 of #109).
Tested code commit: `2a9bfc26` (all 4 extraction test suites passing, 68/68 passed).
Scope: entity offset mapping for amounts, dates, invoice numbers, tax IDs, and line-indexed vendors back to original document text.
Follow-up issues:

- #182-B: restore async entity-extraction path (T3) in service/controller/DTO
- #182-C: update E2E PDF fixtures for Unicode length/offsets and full E2E validation
  e2e-army: no test added. Internal extraction change, no screen or HTTP contract changes; the only callers read `RulesExtraction` fields, and the new fields (`start`, `end`, `originalText`) are additive.

## Acceptance criteria

| AC  | Criterion                                                                                                           | Verified by                                                                                                                                                        | Result |
| --- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| AC1 | `normalizeWithOffsets(input).normalized` equals `normalizeDigits(input)`; `toOriginal.length === normalized.length` | `rules-normalize.spec.ts` › "matches normalizeDigits and keeps a bounded non-decreasing map" (6 inputs incl. ASCII, Arabic-Indic, full-width, marks, emoji, empty) | pass   |
| AC2 | `toOriginal` non-decreasing, each entry in `[0, input.length)`                                                      | same test; "skips dropped characters", "maps a surrogate pair…"                                                                                                    | pass   |
| AC3 | `total ٤٢٠٠ USD` → `originalText.slice(start, end) === "٤٢٠٠"`                                                      | `invoice-rules-extractor.spec.ts` › "slices Arabic-Indic digits from the original text"                                                                            | pass   |
| AC4 | Emoji prefix shifts offsets by 2 (UTF-16), not the normalized length                                                | › "shifts by the emoji UTF-16 length, not the normalized length"                                                                                                   | pass   |
| AC5 | ASCII input: identity map, `mapSpanToOriginal` returns the span unchanged                                           | `rules-normalize.spec.ts` › "is the identity for ASCII"; extractor spec › "keeps ASCII spans identical"                                                            | pass   |
| AC6 | Every returned span satisfies `0 <= start < end <= originalText.length`                                             | extractor spec › "keeps ASCII spans identical and inside the text"; "accounts for dropped marks and earlier lines" (CRLF, bidi mark, Arabic separators)            | pass   |
| AC7 | Round-trip offsets for date, dueDate, invoiceNumber, taxId, and line-indexed vendor                                 | extractor spec › "slices invoice number...", "slices date and dueDate...", "slices tax ID...", "slices line-matched vendor...", "leaves start/end undefined..."    | pass   |

Deferred to follow-up issues: #182-B (T3 async extraction path) and #182-C (E2E PDF fixtures).

## Commands and observed results

```text
$ pnpm --filter @mizano/shared-types build
exit 0

$ pnpm --filter api type-check
exit 0 (tsc --noEmit && tsc --noEmit -p test/tsconfig.e2e.json)

$ pnpm --filter api lint
exit 0 (eslint "{src,apps,libs,test}/**/*.ts")

$ pnpm --filter api exec jest --maxWorkers=2 src/modules/ai/extraction
Test Suites: 4 passed, 4 total   Tests: 68 passed, 68 total        (exit 0)
```

## Regression on base

Ran the new specs against the base (`origin/master`) versions of `rules-normalize.ts` and `invoice-rules-extractor.ts`, then restored HEAD:

```text
FAIL src/modules/ai/extraction/rules/invoice-rules-extractor.spec.ts
  ● Test suite failed to run
    Property 'start' does not exist on type 'RuleField<Decimal>'.
    Property 'originalText' does not exist on type 'RulesExtraction'.
FAIL src/modules/ai/extraction/rules/rules-normalize.spec.ts
  ● Test suite failed to run
    Module '"./rules-normalize"' has no exported member 'mapSpanToOriginal'.
    Module '"./rules-normalize"' has no exported member 'normalizeWithOffsets'.
Test Suites: 2 failed, 1 passed, 3 total   Tests: 7 passed, 7 total (exit 1)
```

They fail on base because the new specs import symbols/fields that do not exist there (`normalizeWithOffsets`, `mapSpanToOriginal`, `originalText`, `start`/`end`), so TypeScript compilation stops before any test runs. On HEAD all suites pass (68/68 passed, exit 0).
