# Evidence for Issue #109: Normalize Arabic-Indic digits and separators in extracted amounts and dates

## Commit SHA

`4922791bdec7e86025b0b0b94b971af62746816f`

## Acceptance Criteria Verification

### AC1: `١٢٣٫٤٥` parses to 123.45 and `١٬٢٣٤٫٥٠` parses to 1234.50

- **Unit test**: `rules-normalize.spec.ts` line 9-10, 14-15
- **Verification**: `normalizeDigits('١٢٣٫٤٥') === '123.45'` ✓
- **Verification**: `normalizeDigits('١٬٢٣٤٫٥٠') === '1,234.50'` ✓
- **Integration test**: `extractInvoiceFields` with Arabic invoice fixture ✓
- **Integration test**: `findAmounts(normalizeDigits('Total: EGP ١٬٢٣٤٫٥٠'))` → `['1234.5']` ✓

### AC2: A date like `٠٧/١٠/٢٠٢٦` parses to the same date as `07/10/2026`

- **Unit test**: `rules-normalize.spec.ts` line 20-21
- **Verification**: `normalizeDigits('٠٧/١٠/٢٠٢٦') === '07/10/2026'` ✓
- **Integration test**: `parseDate(normalizeDigits('٠٧/١٠/٢٠٢٦'))` → `{ iso: '2026-10-07', ambiguous: true }` ✓
- **Integration test**: `extractInvoiceFields` with Arabic date `١٥/٠٣/٢٠٢٤` → `'2024-03-15'` ✓

### AC3: Mixed-script strings (for example `EGP ١٢٠٠`) parse correctly

- **Unit test**: `rules-normalize.spec.ts` line 26-28
- **Verification**: `normalizeDigits('EGP ١٢٠٠') === 'EGP 1200'` ✓
- **Verification**: `normalizeDigits('SAR ١٬٢٣٤٫٥٠') === 'SAR 1,234.50'` ✓
- **Integration test**: `extractInvoiceFields` with mixed-script invoice ✓
- **Integration test**: `findAmounts(normalizeDigits('Total: EGP ١٬٢٣٤٫٥٠'))` → `['1234.5']` ✓

### AC4: Existing English-only parser tests pass unchanged

- **Unit test**: `rules-normalize.spec.ts` line 33-37
- **Verification**: `normalizeDigits('123.45') === '123.45'` ✓
- **Verification**: `normalizeDigits('1,234.50') === '1,234.50'` ✓
- **Integration test**: English invoice extraction unchanged ✓
- **All existing tests**: 2220 API tests + 458 web tests pass ✓

### AC5: Amounts remain decimal-safe, with no float math (consistent with #94)

- **Unit test**: `rules-normalize.spec.ts` line 57-63
- **Verification**: `parseAmount` returns `Decimal.js` instances ✓
- **Verification**: Decimal arithmetic used throughout (no float) ✓
- **Precision bounds**: Rejects values beyond Decimal(19,4) ✓

### AC6: Change is ≤ ~200 lines

- **Production code changes**: 13 lines added (2 files)
  - `ollama.service.ts`: +7 lines (import + 2 normalization calls)
  - `entity-extraction.service.ts`: +6 lines (import + normalization in extractEntities)
- **Test code**: ~426 lines (2 new test files)
- **Total production change**: Well under 200 lines ✓

## Files Changed

### Production Code

1. `apps/api/src/modules/ai/services/ollama.service.ts`
   - Added `normalizeDigits` import
   - Applied normalization in `extractFromText()` before sending to Ollama
   - Applied normalization in `extractFromOcrText()` before sending to Ollama

2. `apps/api/src/modules/ai/services/entity-extraction.service.ts`
   - Added `normalizeDigits` import
   - Applied normalization in `extractEntities()` before regex-based money/date extraction

### Test Code

1. `apps/api/src/modules/ai/extraction/rules/rules-normalize.spec.ts` (new)
   - 23 unit tests covering all acceptance criteria
   - Tests for `normalizeDigits`, `parseAmount`, `findAmounts`, `parseDate`, `extractInvoiceFields`

2. `apps/api/test/intake-arabic-digits.e2e-spec.ts` (new)
   - 5 E2E tests for full intake pipeline with Arabic/Persian/mixed-script digits
   - Uses real rules strategy with PDF fixtures containing native Arabic/Persian text

## Test Results

- API unit tests: 2220 passed
- Web tests: 458 passed
- Lint: passed
- Type-check: passed
- CI full: passed

## Implementation Notes

The `normalizeDigits` function was already present in `rules-normalize.ts` and used by the rules-based extractor. This change extends its application to:

1. **Ollama text extraction path** (PDF native text, OCR text) - normalizes before sending to LLM
2. **Entity extraction service** (regex-based money/date extraction) - normalizes before pattern matching

The function handles:

- Arabic-Indic digits (U+0660..U+0669) → ASCII
- Persian digits (U+06F0..U+06F9) → ASCII
- Arabic decimal separator (U+066B) → `.`
- Arabic thousands separator (U+066C) → `,`
- Arabic percent sign (U+066A) → `%`
- Removes bidi control marks, tatweel, Arabic diacritics
- Preserves line count for evidence tracking

All changes are deterministic, CPU-only, and require no network calls or GPU.
