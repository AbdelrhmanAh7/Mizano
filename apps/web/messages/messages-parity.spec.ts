import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * Every screen text exists in both languages: each catalog file under messages/en has an Arabic
 * twin with exactly the same keys, and every value is a non-empty string.
 */
const root = __dirname;
const catalogs = (locale: string): string[] =>
  readdirSync(join(root, locale))
    .filter((file) => file.endsWith('.json'))
    .sort();

const read = (locale: string, file: string): unknown =>
  JSON.parse(readFileSync(join(root, locale, file), 'utf8'));

/** Dotted paths of every leaf, with the leaf value. */
const leaves = (node: unknown, prefix = ''): Array<[string, unknown]> =>
  node && typeof node === 'object' && !Array.isArray(node)
    ? Object.entries(node as Record<string, unknown>).flatMap(([key, value]) =>
        leaves(value, `${prefix}${key}.`),
      )
    : [[prefix.slice(0, -1), node]];

describe('message catalogs (en and ar)', () => {
  it('has the same catalog files in both languages', () => {
    expect(catalogs('ar')).toEqual(catalogs('en'));
  });

  it.each(catalogs('en'))('%s has every key in both languages', (file) => {
    const en = leaves(read('en', file)).map(([key]) => key);
    const ar = leaves(read('ar', file)).map(([key]) => key);
    expect({ file, missingInAr: en.filter((key) => !ar.includes(key)) }).toEqual({
      file,
      missingInAr: [],
    });
    expect({ file, missingInEn: ar.filter((key) => !en.includes(key)) }).toEqual({
      file,
      missingInEn: [],
    });
  });

  it.each(catalogs('en'))('%s has only non-empty text values', (file) => {
    for (const locale of ['en', 'ar']) {
      const bad = leaves(read(locale, file))
        .filter(([, value]) => typeof value !== 'string' || value.trim() === '')
        .map(([key]) => `${locale}:${key}`);
      expect(bad).toEqual([]);
    }
  });
});
