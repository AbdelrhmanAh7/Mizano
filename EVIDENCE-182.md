# Verification report — #182 slice 1 (offset mapping after normalization)

Sentry issue: none (no originating Sentry issue; GitHub issue #182, part 2/2 of #109).
Tested code commit: `e66a43fb` (source files under `extraction/rules/` are unchanged from `2f5edb7c`; later commits touch only docs/evidence and merges from master).
Scope: first slice only. The async T3 path and PDF fixtures are deferred (see `AI_QUESTIONS.md`).
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

Not covered in this slice (deferred, in `AI_QUESTIONS.md`): async extraction path restore, E2E PDF fixtures, full E2E run, offsets for date/vendor/tax id.

## Commands and observed results

```text
$ cd apps/api && pnpm exec jest --maxWorkers=2 src/modules/ai/extraction
Test Suites: 4 passed, 4 total   Tests: 63 passed, 63 total        (exit 0)

$ pnpm exec eslint --max-warnings 0 <4 changed files in extraction/rules>
exit 0

$ pnpm exec tsc --noEmit
10 errors, none under extraction/rules. All in src/common/filters/http-exception.filter.ts
and src/modules/logger/* (files not touched here); cause: @mizano/shared-types is not built in
this worktree. Not caused by this change; not re-checked on a clean base build.
```

## Regression on base

Ran the two new specs against the base (`origin/master`) versions of `rules-normalize.ts` and `invoice-rules-extractor.ts`, then restored HEAD:

```text
FAIL rules-normalize.spec.ts
FAIL invoice-rules-extractor.spec.ts
Test Suites: 2 failed, 2 total   Tests: 0 total
```

They fail on base because the new specs import symbols/fields that do not exist there (`normalizeWithOffsets`, `mapSpanToOriginal`, `originalText`, `start`/`end`), so TypeScript compilation stops before any test runs. No assertion-level failure on base was observed. On HEAD both suites pass (command above).
