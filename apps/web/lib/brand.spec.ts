import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { BRAND } from '@mizano/shared-types';
import { brandMessages } from '@/i18n/brand-messages';

/**
 * The product's name lives only in packages/shared-types/src/brand.ts. This fails when the old name
 * ("Mizano" / ميزان / ميزانو) is typed into a message catalog or into code a customer reads.
 * Catalogs write `{brand}` / `{brandSlug}`; code reads BRAND. Comments are ignored, lower-case
 * `mizano` stays allowed (storage keys, event types, scopes are identifiers). «ميزان المراجعة»
 * (trial balance) and «الميزانية» (balance sheet, budget) are accounting words, not the brand.
 */
const WEB = join(__dirname, '..');
const OLD_NAME = /Mizano|MIZANO|ميزانو|ميزان(?!ية|يات)(?! المراجعة)/g;
/** Identifiers that are not read as the product name (a developer console tag). */
const ALLOWED = ['[Mizano Logger]'];

function files(dir: string, pattern: RegExp): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (name === 'node_modules' || name === '.next') return [];
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path, pattern);
    return pattern.test(name) && !/\.(spec|test|stories)\.tsx?$/.test(name) ? [path] : [];
  });
}

const withoutComments = (code: string): string =>
  code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '$1');

const offenders = (paths: string[], strip: boolean): string[] =>
  paths.flatMap((file) => {
    let text = readFileSync(file, 'utf8');
    if (strip) text = withoutComments(text);
    for (const token of ALLOWED) text = text.split(token).join('');
    return (text.match(OLD_NAME) ?? []).map((hit) => `${file.replace(WEB, 'apps/web')}: ${hit}`);
  });

describe('brand in the web app', () => {
  it('has no old product name in the message catalogs', () => {
    expect(offenders(files(join(WEB, 'messages'), /\.json$/), false)).toEqual([]);
  });

  it('has no old product name in screens, components or helpers', () => {
    const code = ['app', 'components', 'lib', 'i18n'].flatMap((dir) =>
      files(join(WEB, dir), /\.tsx?$/),
    );
    expect(offenders(code, true)).toEqual([]);
  });

  it('keeps the static files in step with the brand constant', () => {
    const manifest = JSON.parse(readFileSync(join(WEB, 'public/manifest.json'), 'utf8')) as {
      name: string;
      short_name: string;
    };
    expect([manifest.name, manifest.short_name]).toEqual([BRAND.name.en, BRAND.name.en]);
    for (const logo of files(join(WEB, 'public/svg'), /^logo-(full|stacked|wordmark).*\.svg$/)) {
      expect(readFileSync(logo, 'utf8')).toContain(`>${BRAND.slug}</text>`);
    }
  });

  it.each(['en', 'ar'] as const)('fills every brand placeholder of the %s catalogs', (locale) => {
    const catalog = brandMessages(
      Object.fromEntries(
        files(join(WEB, 'messages', locale), /\.json$/).map((file) => [
          file,
          JSON.parse(readFileSync(file, 'utf8')) as unknown,
        ]),
      ),
      locale,
    );
    const text = JSON.stringify(catalog);
    expect(text).not.toMatch(/\{brand(Slug)?\}/);
    expect(text).toContain(BRAND.name[locale]);
  });
});
