/**
 * Guard for "every text in two languages" (#584): pilot screens must take user-facing text from
 * the next-intl catalogs. Fails on JSX text and on text props (placeholder, title, aria-label,
 * alt, label, description) written as literals in English or Arabic.
 *
 * @jest-environment node
 */
import { readdirSync, readFileSync } from 'fs';
import { join, relative } from 'path';
import ts from 'typescript';

const WEB = join(__dirname, '..');

/**
 * The pilot screens: setup (auth + onboarding), sales, purchases (bills upload included), banking,
 * accounting, reports, settings, and the shared layout and UI primitives they use.
 */
const PILOT_DIRS = [
  'app/[locale]/(auth)',
  'app/[locale]/(dashboard)/sales',
  'app/[locale]/(dashboard)/purchases',
  'app/[locale]/(dashboard)/banking',
  'app/[locale]/(dashboard)/accounting',
  'app/[locale]/(dashboard)/reports',
  'app/[locale]/(dashboard)/settings',
  'components/sales',
  'components/purchases',
  'components/banking',
  'components/accounting',
  'components/reports',
  'components/settings',
  'components/layout',
  'components/ui',
];

/** Operator-only screens with technical units, not seen by business users. */
const SKIP_FILES = new Set(['app/[locale]/(dashboard)/settings/performance/page.tsx']);

/** Literals that are not copy: sample values shown as placeholders. */
const ALLOWED = new Set(['https://…/api/public/webhooks/…', 'whsec_…']);

const TEXT_PROPS = new Set(['placeholder', 'title', 'aria-label', 'alt', 'label', 'description']);
const HAS_WORD = /[A-Za-z؀-ۿ]{2,}/;

function tsxFiles(dir: string, out: string[] = []): string[] {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) tsxFiles(path, out);
    else if (/\.tsx$/.test(entry.name) && !/\.(spec|test|stories)\.tsx$/.test(entry.name)) {
      out.push(path);
    }
  }
  return out;
}

function hardCodedStrings(file: string): string[] {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const found: string[] = [];
  const isCopy = (text: string): boolean => HAS_WORD.test(text) && !ALLOWED.has(text);
  /** `"text"`, `{'text'}` and `` {`text`} `` all count as a literal. */
  const literal = (node: ts.Node | undefined): string | undefined => {
    if (node && ts.isJsxExpression(node)) node = node.expression;
    if (node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))) {
      return node.text;
    }
    return undefined;
  };
  const visit = (node: ts.Node): void => {
    if (ts.isJsxText(node)) {
      const text = node.text.replace(/\s+/g, ' ').trim();
      if (isCopy(text)) found.push(text);
    } else if (ts.isJsxExpression(node) && !ts.isJsxAttribute(node.parent)) {
      const text = literal(node);
      if (text !== undefined && isCopy(text)) found.push(`{'${text}'}`);
    } else if (ts.isJsxAttribute(node) && TEXT_PROPS.has(node.name.getText(source))) {
      const text = literal(node.initializer);
      if (text !== undefined && isCopy(text)) found.push(`${node.name.getText(source)}="${text}"`);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

describe('hard-coded user-facing strings', () => {
  it('pilot screens take their text from the en/ar catalogs', () => {
    const offenders: string[] = [];
    for (const dir of PILOT_DIRS) {
      for (const file of tsxFiles(join(WEB, dir))) {
        const path = relative(WEB, file);
        if (SKIP_FILES.has(path)) continue;
        for (const text of hardCodedStrings(file)) offenders.push(`${path}: ${text}`);
      }
    }
    // Move each one into messages/{en,ar}/<namespace>.json and use t('…').
    expect(offenders).toEqual([]);
  });
});
