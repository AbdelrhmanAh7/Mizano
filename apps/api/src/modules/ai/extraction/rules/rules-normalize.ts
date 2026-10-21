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
 * Same normalization as {@link normalizeDigits}, plus `toOriginal[i]`: the UTF-16
 * index in `input` of the source code point that produced `normalized[i]`. A
 * non-BMP code point (emoji) yields two entries pointing at its first unit.
 */
export function normalizeWithOffsets(input: string): { normalized: string; toOriginal: number[] } {
  let normalized = '';
  const toOriginal: number[] = [];
  let pos = 0;
  for (const ch of input) {
    const code = ch.codePointAt(0) ?? 0;
    let rep = ch;
    if (code >= ARABIC_INDIC_ZERO && code <= ARABIC_INDIC_ZERO + 9) {
      rep = String(code - ARABIC_INDIC_ZERO);
    } else if (code >= PERSIAN_ZERO && code <= PERSIAN_ZERO + 9) {
      rep = String(code - PERSIAN_ZERO);
    } else if (code === 0x066c) {
      rep = ',';
    } else if (code === 0x066b) {
      rep = '.';
    } else if (code === 0x066a) {
      rep = '%';
    } else if (
      code === 0x200e ||
      code === 0x200f ||
      (code >= 0x202a && code <= 0x202e) ||
      (code >= 0x2066 && code <= 0x2069) ||
      code === 0x0640 ||
      (code >= 0x064b && code <= 0x065f) ||
      code === 0x0670
    ) {
      rep = '';
    }
    normalized += rep;
    for (let k = 0; k < rep.length; k++) toOriginal.push(pos);
    pos += ch.length;
  }
  return { normalized, toOriginal };
}

/**
 * Translate a `[start, end)` span of normalized text to the original text. The
 * result is clamped to `[0, originalLength]`, and an end inside a source cluster
 * (e.g. half of a surrogate pair) widens to cover the whole cluster.
 */
export function mapSpanToOriginal(
  start: number,
  end: number,
  toOriginal: number[],
  originalLength: number,
): { start: number; end: number } {
  const n = toOriginal.length;
  const s = Math.min(Math.max(start, 0), n);
  const e = Math.min(Math.max(end, s), n);
  const clamp = (v: number): number => Math.min(Math.max(v, 0), originalLength);
  const origStart = s < n ? toOriginal[s] : originalLength;
  if (e <= s) return { start: clamp(origStart), end: clamp(origStart) };
  const src = toOriginal[e - 1];
  let runEnd = e;
  while (runEnd < n && toOriginal[runEnd] === src) runEnd++;
  let runStart = e - 1;
  while (runStart > 0 && toOriginal[runStart - 1] === src) runStart--;
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
