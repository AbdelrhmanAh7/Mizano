import type { LogLevel } from '@nestjs/common';

/**
 * `LOG_LEVEL` support for the NestJS logger.
 *
 * Accepted values (case-insensitive): `verbose`, `debug`, `info` (alias of Nest's `log`),
 * `log`, `warn`/`warning`, `error`, `fatal`, and `silent`/`off`/`none`. Each value enables
 * itself and everything more severe, e.g. `warn` => fatal + error + warn.
 *
 * When unset or unrecognised the default is `info` in production and `debug` elsewhere.
 * An unrecognised value never silences logging.
 */

/** Ordered from most to least severe. */
const SEVERITY_ORDER: LogLevel[] = ['fatal', 'error', 'warn', 'log', 'debug', 'verbose'];

const ALIASES: Record<string, LogLevel | 'silent'> = {
  verbose: 'verbose',
  trace: 'verbose',
  debug: 'debug',
  info: 'log',
  log: 'log',
  warn: 'warn',
  warning: 'warn',
  error: 'error',
  fatal: 'fatal',
  silent: 'silent',
  off: 'silent',
  none: 'silent',
};

export type LogLevelName = 'verbose' | 'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'silent';

/** Default level when `LOG_LEVEL` is missing or invalid. */
export function defaultLogLevel(nodeEnv: string | undefined): LogLevelName {
  return nodeEnv === 'production' ? 'info' : 'debug';
}

/** Parse a raw `LOG_LEVEL` value; returns `undefined` when absent or unrecognised. */
export function parseLogLevel(raw: string | undefined): LogLevel | 'silent' | undefined {
  if (!raw) return undefined;
  return ALIASES[raw.trim().toLowerCase()];
}

/** The set of Nest log levels to enable for the given `LOG_LEVEL` / `NODE_ENV`. */
export function resolveLogLevels(raw: string | undefined, nodeEnv?: string): LogLevel[] {
  const parsed = parseLogLevel(raw) ?? parseLogLevel(defaultLogLevel(nodeEnv)) ?? 'log';
  if (parsed === 'silent') return [];
  const cutoff = SEVERITY_ORDER.indexOf(parsed);
  return SEVERITY_ORDER.slice(0, cutoff + 1);
}
