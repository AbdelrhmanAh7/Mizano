# Evidence: Issue #315 — Date Span Extraction & Multi-Token Line Verification

- **Issue**: [#315](https://github.com/AbdelrhmanAh7/Mizano/issues/315)
- **PR**: Supersedes part of [#269](https://github.com/AbdelrhmanAh7/Mizano/pull/269) (Parent issue: #249)
- **Base commit**: `e07f1e3d7585844a9af23dae48f870087993e4b3` (`origin/master`)
- **Tested branch**: `ai/315`
- **Originating Sentry issue**: None (split from PR #269 QA finding `a4c90c6fa83d`, parent issue #249).
- **User-facing flow / E2E**: Not user-facing (internal rules extraction backend logic in `apps/api/src/modules/ai/extraction/rules/`). `E2E: not needed — internal extraction utility fix, no user-facing flow or schema change.`
- **Skills used**: `model-effort-routing`, `diagnosing-bugs`, `systematic-debugging`, `tdd`, `verification-before-completion`.
- **Changed covering tests**:
  - `apps/api/src/modules/ai/extraction/rules/invoice-rules-extractor.spec.ts`
  - `apps/api/src/modules/ai/extraction/rules/rules-normalize.spec.ts`

## Acceptance Criteria

1. **AC1 — Date Substring Offsets in parseDate as Single Source of Truth**: `parseDate` returns `{ iso, ambiguous, start, end }` where `start` and `end` are the exact UTF-16 character indices `[start, end)` of the matched date substring in parsed line coordinates.
2. **AC2 — Global Candidate Evaluation on Lines with Multiple Date Tokens**: `parseDate` evaluates candidate dates globally across the line rather than halting at the first regex match, selecting the earliest valid date on the line. Non-qualifying tokens (e.g. Hijri dates such as `1445.9.5 H`) never shadow or eclipse valid Gregorian dates (`15/03/2024`) regardless of position on the line.
3. **AC3 — Direct Span Mapping in extractInvoiceFields via mapSpanToOriginal**: `extractDates` in `invoice-rules-extractor.ts` derives date span offsets directly from `d.start` and `d.end` returned by `parseDate` and maps line offsets through `lineStarts` and `mapSpanToOriginal`, accurately slicing original text across irregular whitespace, Arabic-Indic digit representations, and CRLF / indentation.
4. **AC4 — Month-First Textual Dates Support**: `parseDate` parses month-first textual dates (e.g. `March 15, 2024`) in addition to day-first dates (`15 March 2024`), returning the correct ISO date and exact `[start, end)` span offsets.
5. **AC5 — Privacy Preservation & Small PR Scope**: `RuleField<string>` optionally exposes precise `start` and `end` character offsets without storing raw document text wholesale in `RulesExtraction`. Changes are strictly scoped to date extraction logic and keep total diff within ~300 lines.

## Verification Report

| AC  | Requirement Description                                                  | Verification Command / Test                                                                                                                                                                                                  | Exit Code | Observed Result                                                                                                             | Status |
| --- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------- | ------ |
| AC1 | `parseDate` returns accurate `[start, end)` offsets in line coordinates  | `pnpm --filter api exec jest src/modules/ai/extraction/rules/invoice-rules-extractor.spec.ts -t "parseDate"`                                                                                                                 | 0         | `Tests: 2 passed, 2 total` (`15/03/2024` -> `start: 0, end: 10`; `March 15, 2024` -> `start: 0, end: 14`)                   | PASSED |
| AC2 | Global candidate evaluation selects valid date over invalid Hijri tokens | `pnpm --filter api exec jest src/modules/ai/extraction/rules/invoice-rules-extractor.spec.ts -t "two date-like tokens\|invalid Hijri"`                                                                                       | 0         | `Tests: 2 passed, 2 total` (handles `Date: 15/03/2024 (1445.9.5 H)` and `Date: 1445.9.5 (15/03/2024)`)                      | PASSED |
| AC3 | Date span offsets accurately map back to original text                   | `pnpm --filter api exec jest src/modules/ai/extraction/rules/invoice-rules-extractor.spec.ts -t "date offsets map back"`                                                                                                     | 0         | `Tests: 6 passed, 6 total` (covers 2-token line, invalid Hijri prefix, irregular spacing, Arabic-Indic, CRLF + indentation) | PASSED |
| AC4 | Month-first textual date parsing with span                               | `pnpm --filter api exec jest src/modules/ai/extraction/rules/invoice-rules-extractor.spec.ts -t "month-first"`                                                                                                               | 0         | `Tests: 2 passed, 2 total` (`March 15, 2024` parsed to `2024-03-15` with exact offsets)                                     | PASSED |
| AC5 | Character mapping through normalization & bidi                           | `pnpm --filter api exec jest src/modules/ai/extraction/rules/rules-normalize.spec.ts -t "normalizeWithOffsets"`                                                                                                              | 0         | `Tests: 3 passed, 3 total` (character offsets converted, bidi marks dropped, clamped bounds)                                | PASSED |
| —   | Type-check `api` package                                                 | `pnpm --filter api type-check`                                                                                                                                                                                               | 0         | `tsc --noEmit && tsc --noEmit -p test/tsconfig.e2e.json` exited 0                                                           | PASSED |
| —   | Lint `api` package                                                       | `pnpm --filter api lint`                                                                                                                                                                                                     | 0         | `eslint "{src,apps,libs,test}/**/*.ts"` exited 0 (0 warnings, 0 errors)                                                     | PASSED |
| —   | Rules extraction suites (2 suites)                                       | `pnpm --filter api exec jest src/modules/ai/extraction/rules/invoice-rules-extractor.spec.ts src/modules/ai/extraction/rules/rules-normalize.spec.ts`                                                                        | 0         | `Test Suites: 2 passed, 2 total. Tests: 68 passed, 68 total`                                                                | PASSED |
| —   | Related unit test suites (12 suites)                                     | `pnpm --filter api exec jest --maxWorkers=2 --findRelatedTests src/modules/ai/extraction/rules/rules-dates.ts src/modules/ai/extraction/rules/rules-normalize.ts src/modules/ai/extraction/rules/invoice-rules-extractor.ts` | 0         | `Test Suites: 12 passed, 12 total. Tests: 189 passed, 189 total`                                                            | PASSED |
| —   | No merge conflict markers                                                | `python3 scripts/test_no_conflict_markers.py`                                                                                                                                                                                | 0         | `Ran 10 tests ... OK`                                                                                                       | PASSED |

## Bug Fix Regression Demonstration (Red on Base, Green on Head)

### Base (`origin/master` at `e07f1e3d7585844a9af23dae48f870087993e4b3`)

Running the regression test on base fails both at compile time and runtime:
Command:

```bash
pnpm --filter api exec jest src/modules/ai/extraction/rules/invoice-rules-extractor.spec.ts -t "date offsets map back"
```

Output:

```text
FAIL src/modules/ai/extraction/rules/invoice-rules-extractor.spec.ts
  ● extractInvoiceFields date offsets map back to original text › slices the exact substring parseDate parsed when a line has two date-like tokens

    expect(received).toBeDefined()

    Received: undefined

      263 |     const r = extractInvoiceFields(text);
      264 |     expect(r.date?.value).toBe('2024-03-15');
    > 265 |     expect(r.date?.start).toBeDefined();
          |                           ^
      266 |     expect(r.date?.end).toBeDefined();
      267 |     expect(text.slice(r.date?.start, r.date?.end)).toBe('15/03/2024');

  ● extractInvoiceFields date offsets map back to original text › slices month-first textual dates with irregular spacing

    expect(received).toBe('2024-03-15')

    Received: undefined

      280 |     const text = 'Date:   March   15,   2024';
      281 |     const r = extractInvoiceFields(text);
    > 282 |     expect(r.date?.value).toBe('2024-03-15');

Test Suites: 1 failed, 1 total
Tests:       6 failed, 36 skipped, 22 passed, 64 total
```

### Head (`ai/315`)

Running the regression test on head passes cleanly:
Command:

```bash
pnpm --filter api exec jest src/modules/ai/extraction/rules/invoice-rules-extractor.spec.ts -t "date offsets map back"
```

Output:

```text
PASS src/modules/ai/extraction/rules/invoice-rules-extractor.spec.ts
  extractInvoiceFields date offsets map back to original text
    ✓ slices the exact substring parseDate parsed when a line has two date-like tokens (3 ms)
    ✓ selects valid date when invalid Hijri ISO appears first on the line
    ✓ slices month-first textual dates with irregular spacing (1 ms)
    ✓ slices day-first named dates and dates with irregular spacing
    ✓ translates span back through Arabic-Indic digits via mapSpanToOriginal
    ✓ correctly maps date offsets with CRLF line endings and leading indentation (1 ms)

Test Suites: 1 passed, 1 total
Tests:       36 skipped, 6 passed, 42 total
Snapshots:   0 total
Time:        1.63 s
Exit code: 0
```
