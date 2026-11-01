import type { Locale } from './request-locale';
import { SYSTEM_NAMES_AR } from './system-names';

/** A row of system data: `name` as stored, plus both languages when Mizano wrote it. */
export interface BilingualName {
  name: string;
  nameAr?: string | null;
  nameEn?: string | null;
}

/**
 * The one helper that resolves a localized name: the asked language, else the other one, else
 * the stored `name` (a name a person typed or changed is shown as typed, never translated).
 */
export function localize<T extends BilingualName>(row: T, locale: Locale): T {
  const asked = locale === 'ar' ? row.nameAr : row.nameEn;
  const other = locale === 'ar' ? row.nameEn : row.nameAr;
  const name = asked || other || row.name;
  return name === row.name ? row : { ...row, name };
}

/** The fields a seed writes for a system row: English as `name`, plus both languages. */
export function systemName(en: string): { name: string; nameEn: string; nameAr: string | null } {
  return { name: en, nameEn: en, nameAr: SYSTEM_NAMES_AR[en] ?? null };
}

/**
 * Update fields for a possibly renamed row. Edit forms show the localized name, so saving it
 * back unchanged keeps the stored name and both languages; any other name is the person's own
 * and replaces both languages.
 */
export function renameFields(
  existing: BilingualName,
  name: string | undefined,
): { name?: string; nameAr?: null; nameEn?: null } {
  if (name === undefined || name === existing.name) return {};
  if (name === existing.nameAr || name === existing.nameEn) return {};
  return { name, nameAr: null, nameEn: null };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value) as unknown;
  return proto === Object.prototype || proto === null;
}

function isBilingual(
  value: Record<string, unknown>,
): value is Record<string, unknown> & BilingualName {
  return typeof value.name === 'string' && ('nameAr' in value || 'nameEn' in value);
}

/**
 * Localizes every bilingual row inside a response (plain objects and arrays only; Decimals,
 * Dates and Buffers are left alone). Returns the same value when nothing changes.
 */
export function localizeDeep<T>(value: T, locale: Locale, depth = 0): T {
  if (depth > 12) return value;
  if (Array.isArray(value)) {
    // Copy only once something changes: most responses carry no system names.
    let out: unknown[] | null = null;
    value.forEach((item: unknown, index) => {
      const next = localizeDeep(item, locale, depth + 1);
      if (next !== item) (out ??= value.slice())[index] = next;
    });
    return (out ?? value) as T;
  }
  if (!isPlainObject(value)) return value;
  let out: Record<string, unknown> = value;
  for (const [key, child] of Object.entries(value)) {
    const next = localizeDeep(child, locale, depth + 1);
    if (next !== child) {
      if (out === value) out = { ...value };
      out[key] = next;
    }
  }
  return (isBilingual(out) ? localize(out, locale) : out) as T;
}
