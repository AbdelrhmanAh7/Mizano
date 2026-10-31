import { HttpStatus, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import {
  ERROR_CATALOG,
  ErrorCatalogEntry,
  FIELD_MESSAGES,
  FieldMessageEntry,
  GENERIC_ERRORS,
} from './error-catalog';
import type { Locale } from './request-locale';

const PARAM = /\{(\w+)\}/g;

interface CompiledPattern<T> {
  entry: T;
  regex: RegExp;
  names: string[];
  /** Length of the fixed text: the more fixed text, the more specific the pattern. */
  weight: number;
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasParams(text: string): boolean {
  return new RegExp(PARAM.source).test(text);
}

function compile<T extends { en: string }>(entry: T): CompiledPattern<T> {
  const names: string[] = [];
  let source = '';
  let last = 0;
  for (const match of entry.en.matchAll(PARAM)) {
    const index = match.index ?? 0;
    source += `${escapeRegex(entry.en.slice(last, index))}(.+?)`;
    names.push(match[1]);
    last = index + match[0].length;
  }
  source += escapeRegex(entry.en.slice(last));
  return {
    entry,
    regex: new RegExp(`^${source}$`, 's'),
    names,
    weight: entry.en.replace(PARAM, '').length,
  };
}

function compileAll<T extends { en: string }>(entries: readonly T[]): CompiledPattern<T>[] {
  return entries
    .filter((entry) => hasParams(entry.en))
    .map((entry) => compile(entry))
    .sort((a, b) => b.weight - a.weight);
}

function matchPattern<T>(
  pattern: CompiledPattern<T>,
  text: string,
): Record<string, string> | undefined {
  const found = pattern.regex.exec(text);
  if (!found) return undefined;
  const params: Record<string, string> = {};
  pattern.names.forEach((name, i) => {
    params[name] = found[i + 1];
  });
  return params;
}

function fill(template: string, params: Record<string, string>): string {
  return template.replace(PARAM, (whole, name: string) => params[name] ?? whole);
}

const EXACT = new Map<string, ErrorCatalogEntry>();
const BY_CODE = new Map<string, ErrorCatalogEntry>();
for (const entry of ERROR_CATALOG) {
  BY_CODE.set(entry.code, entry);
  if (hasParams(entry.en)) continue;
  for (const text of [entry.en, ...(entry.aliases ?? [])]) EXACT.set(text, entry);
}
const PATTERNS = compileAll(ERROR_CATALOG);
const PATTERN_BY_CODE = new Map(PATTERNS.map((pattern) => [pattern.entry.code, pattern]));
const FIELD_PATTERNS = compileAll<FieldMessageEntry>(FIELD_MESSAGES);

const GENERIC_BY_STATUS: Partial<Record<number, string>> = {
  [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'PAYLOAD_TOO_LARGE',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'UNPROCESSABLE_ENTITY',
  [HttpStatus.TOO_MANY_REQUESTS]: 'TOO_MANY_REQUESTS',
  [HttpStatus.INTERNAL_SERVER_ERROR]: 'INTERNAL_ERROR',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'SERVICE_UNAVAILABLE',
};

function genericEntry(code: string): ErrorCatalogEntry {
  const entry = GENERIC_ERRORS.find((candidate) => candidate.code === code);
  if (!entry) throw new Error(`Generic error ${code} is missing from the catalog`);
  return entry;
}

/** The generic message for a status, and the code a throw without one gets. */
function genericFor(status: number): { entry: ErrorCatalogEntry; code: string } {
  const own = GENERIC_BY_STATUS[status];
  if (own) return { entry: genericEntry(own), code: own };
  const entry = genericEntry(status >= 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST');
  const code = (HttpStatus as unknown as Record<number, string | undefined>)[status];
  return { entry, code: code ?? entry.code };
}

const logger = new Logger('ErrorCatalog');
const reportedMisses = new Set<string>();
const MAX_REPORTED_MISSES = 1000;

/**
 * Logs a message that has no catalog entry, once per message and with metadata only: the text
 * itself can embed user data, so only a short hash of it is written.
 */
function reportMiss(status: number, code: string | undefined, text: string): void {
  const hash = createHash('sha256').update(text).digest('hex').slice(0, 12);
  if (reportedMisses.has(hash) || reportedMisses.size >= MAX_REPORTED_MISSES) return;
  reportedMisses.add(hash);
  logger.warn(
    `Error message missing from the catalog (status=${status}, code=${code ?? '-'}, hash=${hash})`,
  );
}

interface Resolved {
  entry: ErrorCatalogEntry;
  params: Record<string, string>;
}

function resolve(text: string, code: string | undefined): Resolved | undefined {
  if (code) {
    const byCode = BY_CODE.get(code);
    if (byCode) {
      const pattern = PATTERN_BY_CODE.get(code);
      if (pattern) {
        const params = matchPattern(pattern, text);
        if (params) return { entry: byCode, params };
      } else if (text === byCode.en || byCode.aliases?.includes(text)) {
        return { entry: byCode, params: {} };
      }
    }
  }
  const exact = EXACT.get(text);
  if (exact) return { entry: exact, params: {} };
  for (const pattern of PATTERNS) {
    const params = matchPattern(pattern, text);
    if (params) return { entry: pattern.entry, params };
  }
  return undefined;
}

function messageText(message: unknown): string {
  if (typeof message === 'string') return message.trim();
  if (Array.isArray(message)) {
    return message
      .filter((part): part is string => typeof part === 'string')
      .join('; ')
      .trim();
  }
  return '';
}

export interface LocalizedError {
  code: string;
  message: string;
}

/**
 * The code and request-language message for a thrown English message.
 *
 * Looks up the throw's own code first, then the exact text, then the parameterised patterns.
 * A message without an entry keeps its code (or gets one from the status) and is answered with
 * the generic message for its status; English requests keep the original English text, which
 * is already in their language. Misses are logged once, without the text.
 */
export function localizeError(input: {
  /** The thrown message; normally a string, but an exception response may carry anything. */
  message: unknown;
  code?: string;
  status: number;
  locale: Locale;
}): LocalizedError {
  const { code, status, locale } = input;
  const text = messageText(input.message);
  const resolved = resolve(text, code);
  if (resolved) {
    return {
      code: code ?? resolved.entry.code,
      message: fill(resolved.entry[locale], resolved.params),
    };
  }

  // A known code whose message varies: its own text still names the problem.
  const byCode = code ? BY_CODE.get(code) : undefined;
  if (byCode && !hasParams(byCode.en)) {
    return { code: byCode.code, message: locale === 'en' && text ? text : byCode[locale] };
  }

  const generic = genericFor(status);
  if (text) reportMiss(status, code, text);
  return {
    code: code ?? generic.code,
    message: locale === 'en' && text ? text : generic.entry[locale],
  };
}

const EACH_PREFIX = 'each value in ';
const EACH_PROPERTY_AR = 'كل عنصر في';

/**
 * A per-field validation message in the request language. English is returned unchanged;
 * Arabic comes from the exact catalog entries (custom rules such as the password ones), the
 * class-validator shapes in `FIELD_MESSAGES`, then the error patterns, and finally a generic
 * "the value of <field> is not valid".
 */
export function localizeFieldMessage(text: string, locale: Locale): string {
  if (locale === 'en') return text;

  const exact = EXACT.get(text);
  if (exact) return exact[locale];

  const each = text.startsWith(EACH_PREFIX);
  const rest = each ? text.slice(EACH_PREFIX.length) : text;
  for (const pattern of FIELD_PATTERNS) {
    const params = matchPattern(pattern, rest);
    if (!params) continue;
    if (each && params.property) params.property = `${EACH_PROPERTY_AR} ${params.property}`;
    return fill(pattern.entry[locale], params);
  }
  for (const pattern of PATTERNS) {
    const params = matchPattern(pattern, text);
    if (params) return fill(pattern.entry[locale], params);
  }

  reportMiss(HttpStatus.BAD_REQUEST, 'VALIDATION_ERROR', text);
  const field = /^(\S+)/.exec(rest)?.[1];
  const invalid = BY_CODE.get('FIELD_INVALID');
  return field && invalid ? fill(invalid[locale], { field }) : genericEntry('BAD_REQUEST')[locale];
}
