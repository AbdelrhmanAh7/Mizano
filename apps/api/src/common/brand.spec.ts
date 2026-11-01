import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { BRAND, brandName, brandTagline, withBrand } from '@mizano/shared-types';

/**
 * The product's name lives only in packages/shared-types/src/brand.ts. This fails when the old
 * name ("Mizano" / ميزان / ميزانو) is typed into code that a customer reads: emails, PDF and
 * document templates, AI-app (MCP) and OAuth texts, API messages. Comments are ignored, lower-case
 * `mizano` stays allowed (scopes, package names, event types, env names are identifiers).
 */
const SRC = join(__dirname, '..');
const OLD_NAME = /Mizano|MIZANO|ميزانو|ميزان(?!ية|يات)(?! المراجعة)/g;
/** Identifiers that are not read as the product name (a log tag, a User-Agent token). */
const ALLOWED = ['[Mizano Logger]', 'Mizano-Webhooks'];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.ts$/.test(name) && !/\.(spec|e2e-spec)\.ts$/.test(name) ? [path] : [];
  });
}

const withoutComments = (code: string): string =>
  code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '$1');

describe('brand constant', () => {
  it('holds the decided name and tagline in both languages', () => {
    expect(BRAND.name).toEqual({ ar: 'جردة', en: 'Jarda' });
    expect(BRAND.tagline.ar).toBe('جردة: حساباتك واضحة، وإقفال الشهر أسرع.');
    expect(BRAND.tagline.en).toBe('Jarda: clear books, a faster month-end.');
    expect(BRAND.slug).toBe('jarda');
    expect([brandName('ar'), brandName('en'), brandTagline('ar')]).toEqual([
      'جردة',
      'Jarda',
      BRAND.tagline.ar,
    ]);
  });

  it('fills the catalog placeholders in the text language', () => {
    expect(withBrand('في {brand} ({brandSlug})', 'ar')).toBe('في جردة (jarda)');
    expect(withBrand('Open {brand}', 'en')).toBe('Open Jarda');
  });
});

describe('user-facing server texts', () => {
  it('never type the old product name outside the brand constant', () => {
    const offenders = sourceFiles(SRC).flatMap((file) => {
      let code = withoutComments(readFileSync(file, 'utf8'));
      for (const token of ALLOWED) code = code.split(token).join('');
      return (code.match(OLD_NAME) ?? []).map((hit) => `${file.replace(SRC, 'src')}: ${hit}`);
    });
    expect(offenders).toEqual([]);
  });
});
