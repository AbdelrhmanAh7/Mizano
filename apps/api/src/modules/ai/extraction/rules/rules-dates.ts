import { foldForMatch } from './rules-normalize';

export interface DateMatch {
  iso: string;
  /** Day and month were both <= 12 in a numeric date, so day-first is an assumption. */
  ambiguous: boolean;
  /** [start, end) of the substring that produced `iso`, in the coordinates of the parsed line. */
  start: number;
  end: number;
}

const MONTHS: Array<[number, string[]]> = [
  [1, ['january', 'jan', 'يناير', 'كانون الثاني']],
  [2, ['february', 'feb', 'فبراير', 'شباط']],
  [3, ['march', 'mar', 'مارس', 'اذار']],
  [4, ['april', 'apr', 'ابريل', 'نيسان']],
  [5, ['may', 'مايو', 'ايار']],
  [6, ['june', 'jun', 'يونيو', 'يونيه', 'حزيران']],
  [7, ['july', 'jul', 'يوليو', 'يوليه', 'تموز']],
  [8, ['august', 'aug', 'اغسطس', 'اب']],
  [9, ['september', 'sept', 'sep', 'سبتمبر', 'ايلول']],
  [10, ['october', 'oct', 'اكتوبر', 'تشرين الاول']],
  [11, ['november', 'nov', 'نوفمبر', 'تشرين الثاني']],
  [12, ['december', 'dec', 'ديسمبر', 'كانون الاول']],
];

function monthByName(name: string): number | null {
  const folded = foldForMatch(name).replace(/\s+/g, ' ').trim();
  for (const [n, names] of MONTHS) {
    if (names.includes(folded)) return n;
  }
  return null;
}

function validIso(y: number, m: number, d: number): string | null {
  // Hijri and nonsense years stay unknown rather than being guessed.
  if (y < 1990 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function fullYear(y: number, digits: number): number {
  return digits <= 2 ? 2000 + y : y;
}

const MONTH_WORDS = MONTHS.flatMap(([, names]) => names)
  .map((n) => n.replace(/ /g, String.raw`\s+`))
  .sort((a, b) => b.length - a.length)
  .join('|');

/**
 * Regex for day-first named dates (e.g., "15 Jan 2024").
 *
 * Flags:
 * - 'i': Makes Latin month names case-insensitive (JAN, Jan, jan). Arabic script
 *   has no letter case, so this flag has no effect on Arabic month names.
 * - 'g': Required by the matchAll call at line 109. matchAll on a string with a
 *   global regex creates a fresh iterator each call and does not mutate lastIndex,
 *   so no stale-state bug occurs across repeated calls.
 *
 * The global flag is kept (not removed) because matchAll requires a global regex
 * to iterate all matches. Using a non-global regex with matchAll would throw.
 */
const DAY_FIRST_NAMED_RE = new RegExp(
  String.raw`(\d{1,2})\s*(?:st|nd|rd|th)?\s+(${MONTH_WORDS})\s*,?\s+(\d{2,4})`,
  'gi',
);

const MONTH_FIRST_NAMED_RE = new RegExp(
  String.raw`(${MONTH_WORDS})\s+(\d{1,2})\s*(?:st|nd|rd|th)?\s*,?\s+(\d{2,4})`,
  'gi',
);

const YMD_RE = /(?<!\d)(\d{4})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{1,2})(?!\d)/g;
const DMY_RE = /(?<!\d)(\d{1,2})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{4}|\d{2})(?!\d)/g;

/** Collapse whitespace runs to one space, keeping the line index of every kept character. */
function collapseWhitespace(input: string): { text: string; toLine: number[] } {
  let text = '';
  const toLine: number[] = [];
  for (let i = 0; i < input.length; i++) {
    const isSpace = /\s/.test(input[i]);
    if (isSpace && text.endsWith(' ')) continue;
    text += isSpace ? ' ' : input[i];
    toLine.push(i);
  }
  return { text, toLine };
}

/** First date found in a digit-normalized line, or null. */
export function parseDate(line: string): DateMatch | null {
  // Collapse whitespace runs so adjacent \s* / \s+ in the patterns cannot backtrack quadratically.
  const { text: folded, toLine } = collapseWhitespace(foldForMatch(line));
  const at = (m: RegExpExecArray): { start: number; end: number } => ({
    start: toLine[m.index],
    end: toLine[m.index + m[0].length - 1] + 1,
  });

  const candidates: DateMatch[] = [];

  for (const m of folded.matchAll(YMD_RE)) {
    const iso = validIso(Number(m[1]), Number(m[2]), Number(m[3]));
    if (iso) candidates.push({ iso, ambiguous: false, ...at(m) });
  }

  for (const m of folded.matchAll(DMY_RE)) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    const y = fullYear(Number(m[3]), m[3].length);
    if (a > 12) {
      const iso = validIso(y, b, a);
      if (iso) candidates.push({ iso, ambiguous: false, ...at(m) });
    } else if (b > 12) {
      const iso = validIso(y, a, b);
      if (iso) candidates.push({ iso, ambiguous: false, ...at(m) });
    } else {
      const iso = validIso(y, b, a); // day-first
      if (iso) candidates.push({ iso, ambiguous: a !== b, ...at(m) });
    }
  }

  for (const m of folded.matchAll(DAY_FIRST_NAMED_RE)) {
    const month = monthByName(m[2]);
    if (month) {
      const iso = validIso(fullYear(Number(m[3]), m[3].length), month, Number(m[1]));
      if (iso) candidates.push({ iso, ambiguous: false, ...at(m) });
    }
  }

  for (const m of folded.matchAll(MONTH_FIRST_NAMED_RE)) {
    const month = monthByName(m[1]);
    if (month) {
      const iso = validIso(fullYear(Number(m[3]), m[3].length), month, Number(m[2]));
      if (iso) candidates.push({ iso, ambiguous: false, ...at(m) });
    }
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));
  return candidates[0];
}
