const ARABIC_INDIC_ZERO = 0x0660;
const PERSIAN_ZERO = 0x06f0;

/**
 * Normalize OCR/PDF text for rule matching. Line count is never changed, so line
 * indexes stay valid evidence.
 *
 * - Arabic-Indic (U+0660..9) and Persian (U+06F0..9) digits -> ASCII
 * - Arabic thousands separator (U+066C) -> ',' and decimal separator (U+066B) -> '.'
 * - Arabic percent sign (U+066A) -> '%'
 * - bidi control marks, tatweel and Arabic diacritics are removed
 */
export function normalizeDigits(input: string): string {
  return normalizeWithOffsets(input).normalized;
}

/**
 * Same normalization as {@link normalizeDigits}, plus `normalizedToSourceOffsets[i]`:
 * the UTF-16 index in `input` of the source code point that produced `normalizedText[i]`.
 * A non-BMP code point (emoji) yields two entries pointing at its first unit.
 */
export function normalizeWithOffsets(input: string): {
  normalized: string;
  normalizedToSourceOffsets: number[];
} {
  let normalizedText = '';
  const normalizedToSourceOffsets: number[] = [];
  let sourceIndex = 0;
  for (const sourceChar of input) {
    const sourceCodePoint = sourceChar.codePointAt(0) ?? 0;
    let replacement = sourceChar;
    if (sourceCodePoint >= ARABIC_INDIC_ZERO && sourceCodePoint <= ARABIC_INDIC_ZERO + 9) {
      replacement = String(sourceCodePoint - ARABIC_INDIC_ZERO);
    } else if (sourceCodePoint >= PERSIAN_ZERO && sourceCodePoint <= PERSIAN_ZERO + 9) {
      replacement = String(sourceCodePoint - PERSIAN_ZERO);
    } else if (sourceCodePoint === 0x066c) {
      replacement = ',';
    } else if (sourceCodePoint === 0x066b) {
      replacement = '.';
    } else if (sourceCodePoint === 0x066a) {
      replacement = '%';
    } else if (
      sourceCodePoint === 0x200e ||
      sourceCodePoint === 0x200f ||
      (sourceCodePoint >= 0x202a && sourceCodePoint <= 0x202e) ||
      (sourceCodePoint >= 0x2066 && sourceCodePoint <= 0x2069) ||
      sourceCodePoint === 0x0640 ||
      (sourceCodePoint >= 0x064b && sourceCodePoint <= 0x065f) ||
      sourceCodePoint === 0x0670
    ) {
      replacement = '';
    }
    normalizedText += replacement;
    for (let replacementIndex = 0; replacementIndex < replacement.length; replacementIndex++) {
      normalizedToSourceOffsets.push(sourceIndex);
    }
    sourceIndex += sourceChar.length;
  }
  return { normalized: normalizedText, normalizedToSourceOffsets };
}

/**
 * Translate a `[start, end)` span of normalized text to the original text. The
 * result is clamped to `[0, originalLength]`, and an end inside a source cluster
 * (e.g. half of a surrogate pair) widens to cover the whole cluster.
 */
export function mapSpanToOriginal(
  start: number,
  end: number,
  normalizedToSourceOffsets: number[],
  originalLength: number,
): { start: number; end: number } {
  const n = normalizedToSourceOffsets.length;
  const s = Math.min(Math.max(start, 0), n);
  const e = Math.min(Math.max(end, s), n);
  const clamp = (v: number): number => Math.min(Math.max(v, 0), originalLength);
  const origStart = s < n ? normalizedToSourceOffsets[s] : originalLength;
  if (e <= s) return { start: clamp(origStart), end: clamp(origStart) };
  const src = normalizedToSourceOffsets[e - 1];
  let runEnd = e;
  while (runEnd < n && normalizedToSourceOffsets[runEnd] === src) runEnd++;
  let runStart = e - 1;
  while (runStart > 0 && normalizedToSourceOffsets[runStart - 1] === src) runStart--;
  return { start: clamp(origStart), end: clamp(src + (runEnd - runStart)) };
}

/** Fold letters for keyword matching only (never used for evidence snippets). */
export function foldForMatch(input: string): string {
  return input
    .toLowerCase()
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه');
}

export function splitLines(normalized: string): string[] {
  return normalized.split(/\r\n|\r|\n/);
}
