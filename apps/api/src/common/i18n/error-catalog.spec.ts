import { readdirSync, readFileSync } from 'fs';
import { join, relative, resolve } from 'path';
import * as ts from 'typescript';
import { ERROR_CATALOG, FIELD_MESSAGES } from './error-catalog';

const SRC = resolve(__dirname, '..', '..');

/** Exceptions whose first argument (second for BusinessRuleException) is the user message. */
const MESSAGE_EXCEPTIONS = new Set([
  'BadRequestException',
  'NotFoundException',
  'ConflictException',
  'ForbiddenException',
  'UnauthorizedException',
  'UnprocessableEntityException',
  'ServiceUnavailableException',
  'InternalServerErrorException',
  'PayloadTooLargeException',
  'HttpException',
  'BusinessRuleException',
]);

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(path, out);
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) out.push(path);
  }
  return out;
}

/** The literal strings an expression can evaluate to: a literal or a ternary of literals. */
function literals(node: ts.Expression | undefined): string[] {
  if (!node) return [];
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return [node.text];
  if (ts.isParenthesizedExpression(node)) return literals(node.expression);
  if (ts.isConditionalExpression(node)) {
    return [...literals(node.whenTrue), ...literals(node.whenFalse)];
  }
  if (ts.isObjectLiteralExpression(node)) {
    const message = node.properties.find(
      (p): p is ts.PropertyAssignment =>
        ts.isPropertyAssignment(p) && p.name.getText() === 'message',
    );
    return literals(message?.initializer);
  }
  return [];
}

/** Every literal message thrown in `src` (specs excluded), with where it is thrown. */
function thrownLiteralMessages(): Map<string, string> {
  const found = new Map<string, string>();
  for (const file of sourceFiles(SRC)) {
    const text = readFileSync(file, 'utf8');
    if (!text.includes('Exception(')) continue;
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    const visit = (node: ts.Node): void => {
      if (
        ts.isNewExpression(node) &&
        ts.isIdentifier(node.expression) &&
        MESSAGE_EXCEPTIONS.has(node.expression.text)
      ) {
        const args = node.arguments ?? [];
        const messageArg = node.expression.text === 'BusinessRuleException' ? args[1] : args[0];
        for (const message of literals(messageArg)) {
          if (!found.has(message)) {
            const { line } = source.getLineAndCharacterOfPosition(node.getStart());
            found.set(message, `${relative(SRC, file)}:${line + 1}`);
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return found;
}

const PARAM = /\{(\w+)\}/g;
const params = (text: string): string[] => [...text.matchAll(PARAM)].map((m) => m[1]).sort();
const TECHNICAL_WORDS = /\b(api|http|json|token|payload|webhook)\b/i;
const ARABIC = /[؀-ۿ]/;

describe('error catalog', () => {
  it('has unique codes', () => {
    const codes = ERROR_CATALOG.map((entry) => entry.code);
    const duplicates = codes.filter((code, i) => codes.indexOf(code) !== i);
    expect(duplicates).toEqual([]);
  });

  it('has no English text twice', () => {
    const texts = ERROR_CATALOG.flatMap((entry) => [entry.en, ...(entry.aliases ?? [])]);
    const duplicates = texts.filter((text, i) => texts.indexOf(text) !== i);
    expect(duplicates).toEqual([]);
  });

  it('gives every entry a non-empty English and Arabic text', () => {
    const incomplete = [...ERROR_CATALOG, ...FIELD_MESSAGES].filter(
      (entry) => !entry.en.trim() || !entry.ar.trim() || !ARABIC.test(entry.ar),
    );
    expect(incomplete).toEqual([]);
  });

  it('uses in Arabic only the parameters the English text captures', () => {
    const unknown = [...ERROR_CATALOG, ...FIELD_MESSAGES].filter((entry) => {
      const captured = new Set(params(entry.en));
      return params(entry.ar).some((name) => !captured.has(name));
    });
    expect(unknown).toEqual([]);
  });

  it('keeps technical words out of the Arabic text', () => {
    const technical = [...ERROR_CATALOG, ...FIELD_MESSAGES].filter((entry) =>
      TECHNICAL_WORDS.test(entry.ar),
    );
    expect(technical).toEqual([]);
  });

  it('has an entry for every literal error message thrown in src', () => {
    const catalogued = new Set(
      ERROR_CATALOG.flatMap((entry) => [entry.en, ...(entry.aliases ?? [])]),
    );
    const thrown = thrownLiteralMessages();
    // Guards the scan itself: it must keep finding the messages it is meant to check.
    expect(thrown.size).toBeGreaterThan(300);

    const missing = [...thrown.entries()]
      .filter(([message]) => !catalogued.has(message))
      .map(([message, where]) => `${where}: ${message}`);
    // Add each one to common/i18n/error-catalog.ts with its Arabic text.
    expect(missing).toEqual([]);
  });
});
