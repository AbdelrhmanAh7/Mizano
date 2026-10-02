import { foldForMatch } from './rules-normalize';

export interface DateMatch {
  iso: string;
  /** Day and month were both <= 12 in a numeric date, so day-first is an assumption. */
  ambiguous: boolean;
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
const NAMED_RE = new RegExp(
  String.raw`(\d{1,2})\s*(?:st|nd|rd|th)?\s+(${MONTH_WORDS})\s*,?\s+(\d{2,4})`,
  'i',
);

/** First date found in a digit-normalized line, or null. */
export function parseDate(line: string): DateMatch | null {
  // Collapse whitespace runs so adjacent \s* / \s+ in the patterns cannot backtrack quadratically.
  const folded = foldForMatch(line).replace(/\s+/g, ' ');
  const ymd = folded.match(/(?<!\d)(\d{4})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{1,2})(?!\d)/);
  if (ymd) {
    const iso = validIso(Number(ymd[1]), Number(ymd[2]), Number(ymd[3]));
    if (iso) return { iso, ambiguous: false }; // year-first is always year-month-day
  }
  const dmy = folded.match(/(?<!\d)(\d{1,2})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{4}|\d{2})(?!\d)/);
  if (dmy) {
    const a = Number(dmy[1]);
    const b = Number(dmy[2]);
    const y = fullYear(Number(dmy[3]), dmy[3].length);
    if (a > 12) {
      const iso = validIso(y, b, a);
      if (iso) return { iso, ambiguous: false };
    } else if (b > 12) {
      const iso = validIso(y, a, b);
      if (iso) return { iso, ambiguous: false };
    } else {
      const iso = validIso(y, b, a); // day-first
      if (iso) return { iso, ambiguous: a !== b };
    }
  }
  const named = folded.match(NAMED_RE);
  if (named) {
    const month = monthByName(named[2]);
    if (month) {
      const iso = validIso(fullYear(Number(named[3]), named[3].length), month, Number(named[1]));
      if (iso) return { iso, ambiguous: false };
    }
  }
  return null;
}
