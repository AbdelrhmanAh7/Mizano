# Evidence: Issue #249 — Date Span Extraction and parseDate Single Source of Truth

- **Issue**: [#249](https://github.com/AbdelrhmanAh7/Mizano/issues/249)
- **PR**: [#269](https://github.com/AbdelrhmanAh7/Mizano/pull/269) (Supersedes part of #246)
- **Base commit**: `34da63d23f176550d8f9e006788d03426ebdc44b` (`origin/master`)
- **Tested HEAD commit**: `6abec353cabd4806c2380fdf8052a00fd8cf8107` (`ai/249`)
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

| AC  | Requirement Description                                                  | Verification Command / Test                                                                                                                                                                                                  | Exit Code | Observed Result                                                                                           | Status |
| --- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | --------------------------------------------------------------------------------------------------------- | ------ |
| AC1 | `parseDate` returns accurate `[start, end)` offsets in line coordinates  | `pnpm --filter api exec jest src/modules/ai/extraction/rules/invoice-rules-extractor.spec.ts -t "parseDate"`                                                                                                                 | 0         | `Tests: 2 passed, 2 total` (`15/03/2024` -> `start: 0, end: 10`; `March 15, 2024` -> `start: 0, end: 14`) | PASSED |
| AC2 | Global candidate evaluation selects valid date over invalid Hijri tokens | `pnpm --filter api exec jest src/modules/ai/extraction/rules/invoice-rules-extractor.spec.ts -t "two date-like tokens\|invalid Hijri"`                                                                                       | 0         | `Tests: 2 passed, 2 total` (handles `Date: 15/03/2024 (1445.9.5 H)` and `Date: 1445.9.5 (15/03/2024)`)    | PASSED |
| AC3 | Date span offsets accurately map back to original text                   | `pnpm --filter api exec jest src/modules/ai/extraction/rules/invoice-rules-extractor.spec.ts -t "date offsets map back"`                                                                                                     | 0         | `Tests: 6 passed, 6 total` (slices `March 15, 2024`, `١٥ March ٢٠٢٤`, `2024 / 03 / 15`, `١٥/٠٣/٢٠٢٤`)     | PASSED |
| AC4 | Month-first textual dates support with irregular spacing                 | `pnpm --filter api exec jest src/modules/ai/extraction/rules/invoice-rules-extractor.spec.ts -t "month-first"`                                                                                                               | 0         | `Tests: 2 passed, 2 total` (`March 15, 2024` and `Date: March 15, 2024`)                                  | PASSED |
| AC5 | `RulesExtraction` omits `originalText` to uphold data privacy            | `pnpm --filter api exec jest src/modules/ai/extraction/rules/invoice-rules-extractor.spec.ts -t "does not store raw document text"`                                                                                          | 0         | `Tests: 1 passed, 1 total` (`originalText` is undefined)                                                  | PASSED |
| —   | Type check `api` package                                                 | `pnpm --filter api type-check`                                                                                                                                                                                               | 0         | `tsc --noEmit && tsc --noEmit -p test/tsconfig.e2e.json` exited 0                                         | PASSED |
| —   | Lint `api` package                                                       | `pnpm --filter api lint`                                                                                                                                                                                                     | 0         | `eslint "{src,apps,libs,test}/**/*.ts"` exited 0                                                          | PASSED |
| —   | Related unit test suites                                                 | `pnpm --filter api exec jest --maxWorkers=2 --findRelatedTests src/modules/ai/extraction/rules/rules-dates.ts src/modules/ai/extraction/rules/rules-normalize.ts src/modules/ai/extraction/rules/invoice-rules-extractor.ts` | 0         | `Test Suites: 12 passed, 12 total. Tests: 196 passed, 196 total`                                          | PASSED |

## Bug Fix Regression Demonstration (Red on Base, Green on Head)

### Base (`origin/master` at `34da63d23f176550d8f9e006788d03426ebdc44b`)

Running `pnpm --filter api exec jest src/modules/ai/extraction/rules/invoice-rules-extractor.spec.ts` against `origin/master`:

- `DateMatch` in `rules-dates.ts` and `RuleField` in `invoice-rules-extractor.ts` lack `start` and `end` offsets.
- `ts-jest` fails compilation with:
  `src/modules/ai/extraction/rules/invoice-rules-extractor.spec.ts:281:20 - error TS2339: Property 'start' does not exist on type 'RuleField<string>'.`
- At runtime, `parseDate('March 15, 2024')` returns `null` because `NAMED_RE` only supported day-first dates.
- Observed exit code: `1` (FAIL).

```text
FAIL src/modules/ai/extraction/rules/invoice-rules-extractor.spec.ts
  ● Test suite failed to run

    src/modules/ai/extraction/rules/invoice-rules-extractor.spec.ts:281:20 - error TS2339: Property 'start' does not exist on type 'RuleField<string>'.

    281     expect(r.date?.start).toBeDefined();
                           ~~~~~
    src/modules/ai/extraction/rules/invoice-rules-extractor.spec.ts:282:20 - error TS2339: Property 'end' does not exist on type 'RuleField<string>'.

    282     expect(r.date?.end).toBeDefined();
                           ~~~
    src/modules/ai/extraction/rules/invoice-rules-extractor.spec.ts:283:31 - error TS2339: Property 'start' does not exist on type 'RuleField<string>'.

    283     expect(text.slice(r.date?.start, r.date?.end)).toBe('15/03/2024');
                                      ~~~~~

Test Suites: 1 failed, 1 total
Tests:       0 total
Exit code: 1
```

### Head (`ai/249`)

Running the same test command on `ai/249`:

- `parseDate` returns accurate `[start, end)` offsets for day-first, month-first, and ISO dates.
- `extractInvoiceFields` maps `start` and `end` offsets to original text coordinates.
- Observed exit code: `0` (PASS).

```text
PASS src/modules/ai/extraction/rules/invoice-rules-extractor.spec.ts
PASS src/modules/ai/extraction/rules/rules-normalize.spec.ts
Test Suites: 2 passed, 2 total
Tests:       75 passed, 75 total
Exit code: 0
```
