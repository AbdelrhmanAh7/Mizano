/**
 * Log redaction helpers.
 *
 * Logs must never contain invoice/OCR text, credentials, bot tokens or auth
 * headers (AGENTS.md). These helpers turn arbitrary values into log-safe
 * summaries: sensitive keys are masked at any depth, credential-looking
 * substrings are masked inside free text, and long text is truncated.
 *
 * They are a safety net, not a licence to log payloads: prefer logging ids,
 * counts, durations and error codes in the first place.
 */

export const REDACTED = '[REDACTED]';

/** Default cap for free text that reaches a log line. */
export const DEFAULT_MAX_LOG_TEXT = 500;

/** Default cap for individual strings inside a redacted object. */
const DEFAULT_MAX_STRING = 2000;
const DEFAULT_MAX_DEPTH = 8;
const DEFAULT_MAX_ARRAY = 100;

/**
 * Key fragments that mark a value as a secret. Keys are normalised (lower-cased,
 * `-`/`_` removed) before matching, so `X-Api-Key`, `api_key` and `apiKey` all match.
 */
const SENSITIVE_KEY_FRAGMENTS = [
  'authorization',
  'cookie',
  'password',
  'passwd',
  'passphrase',
  'secret',
  'token',
  'apikey',
  'accesskey',
  'privatekey',
  'credential',
  'signature',
];

/** Whole keys that are secrets but too short to match by fragment. */
const SENSITIVE_EXACT_KEYS = new Set(['pass', 'pwd', 'otp', 'totp', 'pin', 'sig', 'jwt', 'auth']);

/** Returns true when an object key names a credential-like value. */
export function isSensitiveKey(key: string): boolean {
  const normalised = key.toLowerCase().replace(/[-_\s]/g, '');
  if (SENSITIVE_EXACT_KEYS.has(normalised)) return true;
  return SENSITIVE_KEY_FRAGMENTS.some((fragment) => normalised.includes(fragment));
}

/** `key=value`, `key: value`, `"key":"value"` for credential-like keys. */
const SENSITIVE_PAIR_PATTERN =
  /(["']?)([A-Za-z0-9_-]*(?:authorization|cookie|password|passwd|secret|token|api[_-]?key|access[_-]?key|private[_-]?key|credential|signature)[A-Za-z0-9_-]*)\1(\s*[:=]\s*)("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^\s,;&}\]]+)/gi;

interface TextRule {
  pattern: RegExp;
  replace: string | ((...groups: string[]) => string);
}

const TEXT_RULES: TextRule[] = [
  // Credentials embedded in URLs: scheme://user:password@host
  {
    pattern: /\b([a-z][a-z0-9+.-]*:\/\/)([^\s:@/]+):([^\s@/]+)@/gi,
    replace: `$1$2:${REDACTED}@`,
  },
  // Telegram bot tokens, also inside https://api.telegram.org/bot<token>/...
  { pattern: /\b(bot)?\d{6,12}:[A-Za-z0-9_-]{30,}\b/g, replace: `$1${REDACTED}` },
  // JSON Web Tokens
  {
    pattern: /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\b/g,
    replace: REDACTED,
  },
  // HTTP auth schemes
  { pattern: /\b(Bearer|Basic|Token)\s+[A-Za-z0-9\-._~+/]{6,}=*/gi, replace: `$1 ${REDACTED}` },
  // Cookie headers carry several name=value pairs: mask to end of line
  { pattern: /\b((?:set-)?cookie)(["']?\s*[:=]\s*)[^\n]*/gi, replace: `$1$2${REDACTED}` },
  // key=value / "key": "value" pairs for credential-like keys
  {
    pattern: SENSITIVE_PAIR_PATTERN,
    replace: (_match: string, quote: string, key: string, separator: string): string =>
      `${quote}${key}${quote}${separator}${REDACTED}`,
  },
];

/**
 * Truncate text to `maxLength` characters, noting how much was dropped.
 */
export function truncateText(text: string, maxLength: number = DEFAULT_MAX_LOG_TEXT): string {
  if (!Number.isFinite(maxLength) || text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength))}…[truncated ${text.length - maxLength} chars]`;
}

/**
 * Mask credential-looking substrings (bearer/basic auth, JWTs, bot tokens,
 * URL passwords, `password=…`/`"token": "…"` pairs) and truncate.
 */
export function redactText(text: string, maxLength: number = DEFAULT_MAX_LOG_TEXT): string {
  let result = String(text);
  for (const rule of TEXT_RULES) {
    rule.pattern.lastIndex = 0;
    result =
      typeof rule.replace === 'string'
        ? result.replace(rule.pattern, rule.replace)
        : result.replace(rule.pattern, rule.replace as (...args: string[]) => string);
  }
  return truncateText(result, maxLength);
}

/**
 * Make a request URL log-safe: credential-like query parameters are masked
 * and the result is truncated.
 */
export function redactUrl(url: string | undefined, maxLength: number = 300): string | undefined {
  if (!url) return url;
  return redactText(url, maxLength);
}

export interface RedactOptions {
  /** Max length of each string; `Infinity` keeps strings intact. Default 2000. */
  maxStringLength?: number;
  /** Apply pattern-based text redaction to string values. Default true. */
  redactStrings?: boolean;
  /** Max nesting depth before values are replaced by a marker. Default 8. */
  maxDepth?: number;
  /** Max array items kept. Default 100. */
  maxArrayLength?: number;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Deep-copy `value` with credential-like keys masked at any depth.
 *
 * Only plain objects and arrays are traversed; class instances such as
 * `Decimal` and `Date` are returned as-is so the result still serialises the
 * same way. Buffers are replaced by a size marker, circular references by a
 * marker, and strings are pattern-redacted and truncated (configurable).
 */
export function redactSensitive<T>(value: T, options: RedactOptions = {}): T {
  const opts: Required<RedactOptions> = {
    maxStringLength: options.maxStringLength ?? DEFAULT_MAX_STRING,
    redactStrings: options.redactStrings ?? true,
    maxDepth: options.maxDepth ?? DEFAULT_MAX_DEPTH,
    maxArrayLength: options.maxArrayLength ?? DEFAULT_MAX_ARRAY,
  };
  return walk(value, opts, 0, new WeakSet<object>()) as T;
}

function walk(
  value: unknown,
  opts: Required<RedactOptions>,
  depth: number,
  seen: WeakSet<object>,
): unknown {
  if (typeof value === 'string') {
    return opts.redactStrings
      ? redactText(value, opts.maxStringLength)
      : truncateText(value, opts.maxStringLength);
  }
  if (value === null || typeof value !== 'object') return value;
  if (Buffer.isBuffer(value)) return `[Buffer ${value.length} bytes]`;
  if (!Array.isArray(value) && !isPlainObject(value)) return value;
  if (seen.has(value)) return '[Circular]';
  if (depth >= opts.maxDepth) return '[Truncated]';
  seen.add(value);

  if (Array.isArray(value)) {
    const items = value
      .slice(0, opts.maxArrayLength)
      .map((item) => walk(item, opts, depth + 1, seen));
    if (value.length > opts.maxArrayLength) {
      items.push(`[${value.length - opts.maxArrayLength} more items]`);
    }
    seen.delete(value);
    return items;
  }

  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    out[key] =
      isSensitiveKey(key) && child !== null && child !== undefined && child !== ''
        ? REDACTED
        : walk(child, opts, depth + 1, seen);
  }
  seen.delete(value);
  return out;
}

interface ErrorLike {
  name?: unknown;
  message?: unknown;
  code?: unknown;
  status?: unknown;
  statusCode?: unknown;
  isAxiosError?: unknown;
  response?: { status?: unknown };
}

function errorName(error: ErrorLike): string {
  return typeof error.name === 'string' && error.name ? error.name : 'Error';
}

function errorCode(error: ErrorLike): string | undefined {
  const code = error.code;
  if (typeof code === 'string' || typeof code === 'number') {
    return truncateText(String(code), 40);
  }
  return undefined;
}

function errorStatus(error: ErrorLike): number | undefined {
  const candidates = [error.response?.status, error.status, error.statusCode];
  for (const candidate of candidates) {
    if (typeof candidate === 'number') return candidate;
  }
  return undefined;
}

/**
 * Errors whose message is known to embed caller data:
 * - Prisma errors render the full query arguments,
 * - JSON.parse SyntaxErrors (Node 20+) quote the parsed input,
 * - Axios errors carry request config/headers on the object (the message is
 *   safe, but nothing else on the object is).
 */
function messageIsUnsafe(error: ErrorLike): boolean {
  const name = errorName(error);
  return name.startsWith('PrismaClient') || name === 'SyntaxError';
}

export interface DescribeErrorOptions {
  /** Include the (redacted, first-line, truncated) message. Default true. */
  includeMessage?: boolean;
  /** Max message length. Default 200. */
  maxMessageLength?: number;
}

/**
 * Turn any thrown value into a short, log-safe description:
 * `Name(code) status=NNN: first line of message`.
 *
 * Never serialises the error object itself, so request config, headers and
 * bodies attached to HTTP client errors are not emitted. Messages from error
 * types that embed caller data (Prisma, JSON.parse) are dropped entirely.
 */
export function describeError(error: unknown, options: DescribeErrorOptions = {}): string {
  if (error === null || error === undefined) return 'Unknown error';
  if (typeof error !== 'object') {
    return `Non-Error thrown (${typeof error})`;
  }

  const err = error as ErrorLike;
  const name = errorName(err);
  const code = errorCode(err);
  const status = errorStatus(err);

  let summary = code ? `${name}(${code})` : name;
  if (status !== undefined) summary += ` status=${status}`;

  const includeMessage = options.includeMessage ?? true;
  if (includeMessage && !messageIsUnsafe(err) && typeof err.message === 'string') {
    const firstLine =
      err.message
        .split('\n')
        .map((line) => line.trim())
        .find((line) => line.length > 0) ?? '';
    if (firstLine) {
      summary += `: ${redactText(firstLine, options.maxMessageLength ?? 200)}`;
    }
  }
  return summary;
}

/**
 * Rebuild a stack trace without the error message (which may embed caller
 * data): keeps the error name, a safe description and the first `maxFrames`
 * `at …` frames.
 */
export function sanitizeStack(error: unknown, maxFrames: number = 15): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const stack = (error as { stack?: unknown }).stack;
  if (typeof stack !== 'string') return undefined;
  const frames = stack
    .split('\n')
    .filter((line) => /^\s+at\s/.test(line))
    .slice(0, maxFrames);
  return [describeError(error), ...frames].join('\n');
}
