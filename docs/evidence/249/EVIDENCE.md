# Evidence: Issue #249 — Date Span Extraction and parseDate Single Source of Truth

- **Issue**: [#249](https://github.com/AbdelrhmanAh7/Mizano/issues/249)
- **PR**: [#269](https://github.com/AbdelrhmanAh7/Mizano/pull/269) (Supersedes part of #246)
- **Base commit**: `4c0063865c3b9409d6f6ef434e3a8fa6a8b7dd55` (`origin/master`)
- **Tested HEAD commit**: `47f757aa9f7f5c04926839b78c0ed5c8fc234f4e` (`ai/249`)
- **Originating Sentry issue**: None (split from PR #246 review finding `0b74c29e8a46`, parent issue #182).
- **User-facing flow / E2E**: Not user-facing (internal rules extraction backend logic in `apps/api/src/modules/ai/extraction/rules/`). `E2E: not needed — internal extraction utility fix, no user-facing flow or schema change.`
- **Skills used**: `diagnosing-bugs`, `systematic-debugging`, `verification-before-completion`, `test-driven-development`.
- **Changed covering tests**:
  - `apps/api/src/modules/ai/extraction/rules/invoice-rules-extractor.spec.ts`
  - `apps/api/src/modules/ai/extraction/rules/rules-normalize.spec.ts`

## Acceptance Criteria

1. **AC1 — parseDate Substring Offsets as Single Source of Truth**: `parseDate` returns `{ iso, ambiguous, start, end }` where `start` and `end` are the exact UTF-16 character indices `[start, end)` of the matched date substring in parsed line coordinates.
2. **AC2 — Global Candidate Evaluation on Lines with Multiple Date Tokens**: `parseDate` evaluates candidate dates globally across the line rather than stopping at the first regex match, and selects the earliest valid date on the line. Non-qualifying tokens (e.g. Hijri dates such as `1445.9.5 H`) never shadow or eclipse valid Gregorian dates (`15/03/2024`) regardless of position.
3. **AC3 — Direct Span Mapping in extractInvoiceFields via mapSpanToOriginal**: `extractDates` in `invoice-rules-extractor.ts` derives date span offsets directly from `d.start` and `d.end` returned by `parseDate` and maps line offsets through `mapSpanToOriginal`, accurately slicing original text across irregular whitespace and Arabic-Indic digit representations. Re-scanning via `findDateSpanInLine` is completely eliminated.
4. **AC4 — Month-First Textual Dates Support**: `parseDate` parses month-first textual dates (e.g. `March 15, 2024`) in addition to day-first dates (`15 March 2024`), returning the correct ISO date and exact `[start, end)` span offsets.
5. **AC5 — Privacy Preservation in RulesExtraction**: `RulesExtraction` does not store or expose raw document text (`originalText`) to ensure invoice content is never logged wholesale, while providing precise `[start, end)` character offsets on `RuleField`.

## Verification Report

| AC  | Requirement Description                                                  | Verification Command / Test                                                                                                                                                                                                  | Exit Code | Observed Result                                                                                                                | Status |
| --- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------ | ------ |
| AC1 | `parseDate` returns accurate `[start, end)` offsets in line coordinates  | `pnpm --filter api exec jest src/modules/ai/extraction/rules/invoice-rules-extractor.spec.ts -t "parseDate"`                                                                                                                 | 0         | `Tests: 2 passed, 2 total` (`15/03/2024` -> `start: 0, end: 10`; `March 15, 2024` -> `start: 0, end: 14`)                      | PASSED |
| AC2 | Global candidate evaluation selects valid date over invalid Hijri tokens | `pnpm --filter api exec jest src/modules/ai/extraction/rules/invoice-rules-extractor.spec.ts -t "two date-like tokens\|invalid Hijri"`                                                                                       | 0         | `Tests: 2 passed, 2 total` (handles `Date: 15/03/2024 (1445.9.5 H)` and `Date: 1445.9.5 (15/03/2024)`)                         | PASSED |
| AC3 | Date span offsets accurately map back to original text                   | `pnpm --filter api exec jest src/modules/ai/extraction/rules/invoice-rules-extractor.spec.ts -t "date offsets map back"`                                                                                                     | 0         | `Tests: 6 passed, 6 total` (slices `March 15, 2024`, `١٥ March ٢٠٢٤`, `2024 / 03 / 15`, `١٥/٠٣/٢٠٢٤`)                          | PASSED |
| AC4 | Month-first textual dates support with irregular spacing                 | `pnpm --filter api exec jest src/modules/ai/extraction/rules/invoice-rules-extractor.spec.ts -t "month-first"`                                                                                                               | 0         | `Tests: 2 passed, 2 total` (`March 15, 2024` and `Date: March 15, 2024`)                                                       | PASSED |
| AC5 | `RulesExtraction` omits `originalText` to uphold data privacy            | `pnpm --filter api exec jest src/modules/ai/extraction/rules/invoice-rules-extractor.spec.ts -t "does not store raw document text"`                                                                                          | 0         | `Tests: 1 passed, 1 total` (`originalText` is undefined)                                                                       | PASSED |
| —   | Type check `api` package                                                 | `pnpm --filter api type-check`                                                                                                                                                                                               | 0         | `tsc --noEmit && tsc --noEmit -p test/tsconfig.e2e.json` exited 0                                                              | PASSED |
| —   | Lint `api` package                                                       | `pnpm --filter api lint`                                                                                                                                                                                                     | 0         | `eslint "{src,apps,libs,test}/**/*.ts"` exited 0                                                                               | PASSED |
| —   | Rules extraction suites (3 suites)                                       | `pnpm --filter api exec jest src/modules/ai/extraction/rules/invoice-rules-extractor.spec.ts src/modules/ai/extraction/rules/rules-normalize.spec.ts src/modules/ai/extraction/rules-strategy.spec.ts`                       | 0         | `Test Suites: 3 passed, 3 total. Tests: 82 passed, 82 total` (42 in invoice-rules, 33 in rules-normalize, 7 in rules-strategy) | PASSED |
| —   | Related unit test suites (12 suites)                                     | `pnpm --filter api exec jest --maxWorkers=2 --findRelatedTests src/modules/ai/extraction/rules/rules-dates.ts src/modules/ai/extraction/rules/rules-normalize.ts src/modules/ai/extraction/rules/invoice-rules-extractor.ts` | 0         | `Test Suites: 12 passed, 12 total. Tests: 196 passed, 196 total`                                                               | PASSED |

## Bug Fix Regression Demonstration (Red on Base, Green on Head)

### Base (`origin/master` at `4c0063865c3b9409d6f6ef434e3a8fa6a8b7dd55`)

1. **Missing Month-First Textual Date Support**:
   - On base, `parseDate('March 15, 2024')` returns `null` because `NAMED_RE` only supported day-first dates (`(\d{1,2})\s*(?:st|nd|rd|th)?\s+(${MONTH_WORDS})\s*,?\s+(\d{2,4})`).
   - Month-first textual dates were unsupported and dropped as unextractable.
2. **Missing Substring Offsets on parseDate**:
   - On base, `parseDate('15/03/2024')` returns `{ iso: '2024-03-15', ambiguous: false }`.
   - The returned object has `start: undefined` and `end: undefined`, so downstream consumers had no single source of truth for the match location.
3. **Span Disagreement in PR #246 (Parent Issue #182 / Finding `0b74c29e8a46`)**:
   - In PR #246, `findDateSpanInLine` re-scanned the line with a separate regex list rather than reusing the match from `parseDate`.
   - On a line with multiple date-like tokens such as `Date: 15/03/2024 (1445.9.5 H)`, the ISO-shaped regex matched `1445.9.5` first, so the span captured `1445.9.5` while `parseDate` returned `2024-03-15`.
   - On base, `RuleField` completely lacked `start` and `end` character offsets mapped to the source document.

### Head (`ai/249`)

1. `parseDate` evaluates all candidate matches globally and selects the earliest valid date on the line. Non-qualifying tokens (e.g. invalid Hijri years `< 1990`) are rejected by `validIso` and cannot eclipse valid Gregorian dates.
2. `parseDate` returns accurate `start` and `end` character offsets `[start, end)` in parsed line coordinates via `collapseWhitespace` and `toLine`.
3. Support for month-first textual dates (`MONTH_FIRST_NAMED_RE`) is integrated, parsing both day-first (`15 March 2024`) and month-first (`March 15, 2024`) with accurate offsets.
4. `extractDates` in `invoice-rules-extractor.ts` uses `d.start` and `d.end` directly, translating them to raw document offsets via `lineStarts` and `mapSpanToOriginal`. Re-scanning via `findDateSpanInLine` is completely eliminated.
5. All 6 regression tests in `invoice-rules-extractor.spec.ts` pass:
   - Slices exact substring when two date tokens exist (`Date: 15/03/2024 (1445.9.5 H)` -> slices `15/03/2024`).
   - Slices month-first textual dates with irregular spacing (`Date:   March   15,   2024` -> slices `March   15,   2024`).
   - Slices day-first named dates and dates with irregular spacing (`Date:   ١٥   March ٢٠٢٤` -> slices `١٥   March ٢٠٢٤`).
   - Selects valid date when invalid Hijri ISO appears first (`Date: 1445.9.5 (15/03/2024)` -> slices `15/03/2024`).
   - Translates span back through Arabic-Indic digits via `mapSpanToOriginal` (`\u200e١٥/٠٣/٢٠٢٤` -> slices `١٥/٠٣/٢٠٢٤`).
   - Ensures `originalText` is omitted from `RulesExtraction` for privacy.

```text
PASS src/modules/ai/extraction/rules/rules-normalize.spec.ts
PASS src/modules/ai/extraction/rules/invoice-rules-extractor.spec.ts
PASS src/modules/ai/extraction/rules-strategy.spec.ts

Test Suites: 3 passed, 3 total
Tests:       82 passed, 82 total
Snapshots:   0 total
Exit code: 0
```
