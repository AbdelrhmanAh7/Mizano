# Evidence for Issue #249

## Acceptance Criteria & Verification

| AC  | Description                                                                                 | Verification Method                                                                                                                                                  | Result  |
| --- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| AC1 | `parseDate` returns start/end indices of the parsed substring                               | Unit tests in `invoice-rules-extractor.spec.ts` (`describe('parseDate')`) check `start`/`end` fields on `DateMatch`                                                  | ✅ Pass |
| AC2 | Date span built from `parseDate` match (single source of truth)                             | `extractDates` calls `span(i, d.start, d.end)` using `parseDate` output directly                                                                                     | ✅ Pass |
| AC3 | Two date-like tokens on one line: correct date selected and span points to it               | Test: `"slices the exact substring parseDate parsed when a line has two date-like tokens"` with input `'Date: 15/03/2024 (1445.9.5 H)'` expects slice `'15/03/2024'` | ✅ Pass |
| AC4 | Month-first textual dates (e.g., "March 15, 2024") get correct spans with irregular spacing | Test: `"slices month-first textual dates with irregular spacing"` with input `'Date:   March   15,   2024'` expects slice `'March   15,   2024'`                     | ✅ Pass |
| AC5 | Invalid Hijri ISO date appearing first doesn't shadow valid Gregorian date                  | Test: `"selects valid date when invalid Hijri ISO appears first"` with input `'Date: 1445.9.5 (15/03/2024)'` expects slice `'15/03/2024'`                            | ✅ Pass |
| AC6 | Arabic-Indic digits correctly map back to original text via `mapSpanToOriginal`             | Test: `"translates span back through Arabic-Indic digits via mapSpanToOriginal"` with LRM and Arabic-Indic digits expects slice `'١٥/٠٣/٢٠٢٤'`                       | ✅ Pass |
| AC7 | No raw document text stored in `RulesExtraction` (prevents sensitive data logging)          | Test: `"does not store raw document text in RulesExtraction"` verifies `originalText` field is undefined                                                             | ✅ Pass |

## Test Execution Evidence

```bash
$ nice -n 10 pnpm --filter api exec jest --maxWorkers=2 apps/api/src/modules/ai/extraction/rules/invoice-rules-extractor.spec.ts apps/api/src/modules/ai/extraction/rules/rules-normalize.spec.ts
PASS src/modules/ai/extraction/rules/rules-normalize.spec.ts
PASS src/modules/ai/extraction/rules/invoice-rules-extractor.spec.ts
Test Suites: 2 passed, 2 total
Tests:       75 passed, 75 total
Snapshots:   0 total
Time:        8.986 s
Exit code: 0
```

```bash
$ pnpm --filter api type-check
> api@0.1.0 type-check
> tsc --noEmit && tsc --noEmit -p test/tsconfig.e2e.json
Exit code: 0
```

```bash
$ pnpm --filter api lint
> api@0.1.0 lint
> eslint "{src,apps,libs,test}/**/*.ts"
Exit code: 0
```

```bash
$ nice -n 10 pnpm --filter api exec jest --maxWorkers=2
Test Suites: 151 passed, 151 total
Tests:       1 todo, 2404 passed, 2405 total
Snapshots:   0 total
Time:        34.271 s
```

## Regression Test (Fails on Master, Passes on Head)

The test `"slices the exact substring parseDate parsed when a line has two date-like tokens"` was added in commit `b6308343` and enhanced in `23abe8e0`. On `master` (before the fix), this test would fail because:

1. `parseDate` didn't return `start`/`end` indices
2. No `span` function existed to map offsets
3. The old `findDateSpanInLine` would incorrectly select the Hijri date `1445.9.5`

On `HEAD` (commit `23abe8e0`), the test passes because:

1. `parseDate` returns accurate `start`/`end` from its regex match
2. `span` function maps through `normalizeWithOffsets` → `mapSpanToOriginal`
3. Candidate selection picks the earliest valid date (Gregorian `15/03/2024` at position 6, not Hijri `1445.9.5` at position 17)

## Commit Reference

- **HEAD**: `23abe8e0` - `fix(api): support month-first dates and candidate selection (#249)`
- **Previous**: `62135162` - `fix(api): drop raw document text from rules extraction (#249)`
- **Base**: `master` (commit `c30a5387` merge base)

## Supersedes

This PR supersedes part of #246 (parent issue #182).
