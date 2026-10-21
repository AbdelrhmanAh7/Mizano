# Verification Report — Issue #182 (Entity offset mapping after normalization)

- **Issue:** #182 (Mizano #109‑B: Fix entity offset mapping and async extraction path after normalization)
- **Base commit (`origin/master`):** `e07f1e3d7585844a9af23dae48f870087993e4b3`
- **Tested branch:** `ai/182`
- **Tested commit:** `10f717ae`
- **Originating Sentry issue:** None (GitHub issue #182, split part 2/2 of #109)
- **Scope:** First slice of #182 — entity offset mapping for amounts, dates, invoice numbers, tax IDs, and line-indexed vendors back to original document text, plus O(N) whitespace collapsing for date parsing.
- **Follow-up issues:**
  - #182-B: restore async entity-extraction path (T3) in service/controller/DTO
  - #182-C: update E2E PDF fixtures for Unicode length/offsets and full E2E validation
- **E2E status:** No e2e-army test added (`E2E: not needed — internal extraction rules change with no screen or HTTP contract alterations`).

## Acceptance Criteria & Verification Matrix

| AC ID   | Acceptance Criterion                                                                                                                                                          | Verification Method / Covering Test                                                                                                                                                                                        | Observed Result | Exit Code |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | --------- |
| **AC1** | For every input string, `normalizeWithOffsets(input).normalized` equals `normalizeDigits(input)`, and `toOriginal.length === normalized.length`.                              | `rules-normalize.spec.ts` › `matches normalizeDigits and keeps a bounded non-decreasing map for ...` (ASCII, Arabic-Indic, full-width, marks, emoji, empty)                                                                | `PASS`          | 0         |
| **AC2** | `toOriginal` is non-decreasing and every entry satisfies `0 <= toOriginal[i] < input.length`.                                                                                 | `rules-normalize.spec.ts` › `matches normalizeDigits and keeps a bounded non-decreasing map`, `skips dropped characters`, `maps a surrogate pair`                                                                          | `PASS`          | 0         |
| **AC3** | For input `"total ٤٢٠٠ USD"` (Arabic-Indic digits), the amount entity returned by the rules extractor has `originalText.slice(entity.start, entity.end) === "٤٢٠٠"`.          | `invoice-rules-extractor.spec.ts` › `slices Arabic-Indic digits from the original text`                                                                                                                                    | `PASS`          | 0         |
| **AC4** | For an input whose match is preceded by an emoji surrogate pair, the reported amount/date offsets are shifted by the emoji's UTF-16 length (2), not by the normalized length. | `invoice-rules-extractor.spec.ts` › `shifts by the emoji UTF-16 length, not the normalized length`                                                                                                                         | `PASS`          | 0         |
| **AC5** | For input containing only ASCII, `toOriginal` is the identity sequence and `mapSpanToOriginal` returns the input span unchanged.                                              | `rules-normalize.spec.ts` › `is the identity for ASCII`, `invoice-rules-extractor.spec.ts` › `keeps ASCII spans identical and inside the text`                                                                             | `PASS`          | 0         |
| **AC6** | Every returned entity satisfies `0 <= start < end <= originalText.length`.                                                                                                    | `invoice-rules-extractor.spec.ts` › `keeps ASCII spans identical and inside the text`, `accounts for dropped marks and earlier lines`                                                                                      | `PASS`          | 0         |
| **AC7** | Round-trip offsets map back to original text for date, dueDate, invoiceNumber, taxId, and line-indexed vendor.                                                                | `invoice-rules-extractor.spec.ts` › `slices invoice number with Arabic-Indic digits`, `slices date and dueDate...`, `slices tax ID...`, `slices line-matched vendor...`, `leaves start/end undefined for heuristic vendor` | `PASS`          | 0         |
| **AC8** | Linear-time whitespace collapsing for date parsing without quadratic backtracking or memory allocation explosion.                                                             | `invoice-rules-extractor.spec.ts` › `collapses whitespace runs and maps indices back to input`, `efficiently handles large inputs with extensive whitespace runs in O(N)`                                                  | `PASS`          | 0         |

## Verification Commands & Outputs

### 1. Shared Types Build

```bash
$ pnpm --filter @mizano/shared-types build
> @mizano/shared-types@0.1.0 build
> tsc
Exit code: 0
```

### 2. API Type-Check

```bash
$ pnpm --filter api type-check
> api@0.1.0 type-check
> tsc --noEmit && tsc --noEmit -p test/tsconfig.e2e.json
Exit code: 0
```

### 3. API Lint Check

```bash
$ pnpm --filter api lint
> api@0.1.0 lint
> eslint "{src,apps,libs,test}/**/*.ts"
Exit code: 0
```

### 4. Unit Test Suite (Extraction Rules)

```bash
$ pnpm --filter api exec jest src/modules/ai/extraction
PASS src/modules/ai/extraction/rules/rules-normalize.spec.ts
PASS src/modules/ai/extraction/rules-strategy.spec.ts
PASS src/modules/ai/extraction/rules/invoice-rules-extractor.spec.ts
PASS src/modules/ai/extraction/extraction-strategy-resolver.spec.ts

Test Suites: 4 passed, 4 total
Tests:       95 passed, 95 total
Snapshots:   0 total
Time:        5.091 s
Exit code: 0
```

## Regression Test Demonstration (Fails on Base, Passes on Head)

When running the new test specs on the base branch (`origin/master`):

```text
FAIL src/modules/ai/extraction/rules/invoice-rules-extractor.spec.ts
  ● Test suite failed to run
    Property 'start' does not exist on type 'RuleField<Decimal>'.
    Property 'originalText' does not exist on type 'RulesExtraction'.
    Property 'collapseWhitespace' does not exist in './rules-dates'.

FAIL src/modules/ai/extraction/rules/rules-normalize.spec.ts
  ● Test suite failed to run
    Module '"./rules-normalize"' has no exported member 'mapSpanToOriginal'.
    Module '"./rules-normalize"' has no exported member 'normalizeWithOffsets'.

Test Suites: 2 failed, 1 passed, 3 total   Tests: 7 passed, 7 total (exit 1)
```

On HEAD, all exported members exist, offsets and originalText are fully populated, and all 95 tests pass with exit 0.

## Changed Covering Tests

- `apps/api/src/modules/ai/extraction/rules/rules-normalize.spec.ts`:
  - `matches normalizeDigits and keeps a bounded non-decreasing map`
  - `is the identity for ASCII`
  - `skips dropped characters so later indexes shift`
  - `maps a surrogate pair to one source cluster of 2 UTF-16 units`
  - `expands a span ending inside a cluster to the whole source cluster`
  - `clamps out-of-range spans and keeps start <= end`
- `apps/api/src/modules/ai/extraction/rules/invoice-rules-extractor.spec.ts`:
  - `collapseWhitespace`: collapses whitespace runs and maps indices back to input
  - `collapseWhitespace`: efficiently handles large inputs with extensive whitespace runs in O(N)
  - `parseDate`: updated assertions with `start` and `end` indices
  - `extractInvoiceFields offsets map back to the original text`:
    - `slices Arabic-Indic digits from the original text`
    - `shifts by the emoji UTF-16 length, not the normalized length`
    - `accounts for dropped marks and earlier lines`
    - `keeps ASCII spans identical and inside the text`
    - `slices invoice number with Arabic-Indic digits`
    - `slices date and dueDate with Arabic-Indic and Eastern Arabic digits`
    - `slices the exact substring parseDate parsed when a line has two date-like tokens`
    - `slices month-first-less named dates and dates with irregular spacing`
    - `slices tax ID with Arabic-Indic digits`
    - `slices line-matched vendor and accounts for multi-code-unit emoji cluster`
    - `leaves start/end undefined for heuristic vendor`
