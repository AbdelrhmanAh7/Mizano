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
  let out = '';
  for (const ch of input) {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= ARABIC_INDIC_ZERO && code <= ARABIC_INDIC_ZERO + 9) {
      out += String(code - ARABIC_INDIC_ZERO);
    } else if (code >= PERSIAN_ZERO && code <= PERSIAN_ZERO + 9) {
      out += String(code - PERSIAN_ZERO);
    } else if (code === 0x066c) {
      out += ',';
    } else if (code === 0x066b) {
      out += '.';
    } else if (code === 0x066a) {
      out += '%';
    } else if (
      code === 0x200e ||
      code === 0x200f ||
      (code >= 0x202a && code <= 0x202e) ||
      (code >= 0x2066 && code <= 0x2069) ||
      code === 0x0640 ||
      (code >= 0x064b && code <= 0x065f) ||
      code === 0x0670
    ) {
      // dropped
    } else {
      out += ch;
    }
  }
  return out;
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
