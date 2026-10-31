import { Prisma } from '@prisma/client';

/**
 * Arabic-aware search keys. People type names without diacritics, with or without hamza and
 * with Arabic-Indic digits, so both sides of a match are folded the same way: strip tashkeel
 * and tatweel, أ/إ/آ → ا, ى → ي, ة → ه, Arabic-Indic and Persian digits → ASCII, lower case.
 */
const TASHKEEL_TATWEEL = /[ً-ٰٟـ]/g;
const FROM = 'أإآىة٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹';
const TO = 'ااايه01234567890123456789';
const MAP = new Map([...FROM].map((ch, i) => [ch, TO[i]]));

export function normalizeArabic(text: string): string {
  return [...text.replace(TASHKEEL_TATWEEL, '').toLowerCase()]
    .map((ch) => MAP.get(ch) ?? ch)
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The same folding in SQL, for a trusted column expression (never user input). */
export function normalizedSql(column: string): Prisma.Sql {
  return Prisma.sql`translate(regexp_replace(lower(${Prisma.raw(column)}), '[ً-ٰٟـ]', '', 'g'), ${FROM}, ${TO})`;
}

/** `%term%` for LIKE, with the user's own % _ \ taken literally. */
export function containsPattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}
