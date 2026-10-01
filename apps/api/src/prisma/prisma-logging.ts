import { Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { redactText } from '../common/utils/redact';

/**
 * Prisma logging policy.
 *
 * Query logging is OFF in every environment unless `PRISMA_LOG_QUERIES=true`. Prisma's
 * built-in `query` logger writes the SQL *and bound parameters* (invoice amounts, tax
 * ids, e-mail addresses, password hashes) straight to stdout, so it is never enabled
 * implicitly (it used to be on whenever NODE_ENV=development). Even when enabled, only
 * the parameterized SQL text and duration are logged; bound values never are.
 */

type Env = Record<string, string | undefined>;

export function isQueryLoggingEnabled(env: Env = process.env): boolean {
  return env.PRISMA_LOG_QUERIES === 'true';
}

/** `log` option for `new PrismaClient({ log })`. Query events are emitted, never printed. */
export function buildPrismaLogConfig(env: Env = process.env): Prisma.LogDefinition[] {
  const levels: Prisma.LogDefinition[] = [{ emit: 'stdout', level: 'error' }];
  if (env.NODE_ENV === 'development') {
    levels.push({ emit: 'stdout', level: 'warn' });
  }
  if (isQueryLoggingEnabled(env)) {
    levels.push({ emit: 'event', level: 'query' });
  }
  return levels;
}

interface QueryEventSource {
  $on(event: 'query', callback: (event: Prisma.QueryEvent) => void): void;
}

/**
 * Subscribe to query events when (and only when) query logging is opted in. Returns
 * whether a listener was attached.
 */
export function attachPrismaQueryLogging(
  client: unknown,
  label: string,
  env: Env = process.env,
): boolean {
  if (!isQueryLoggingEnabled(env)) return false;

  const logger = new Logger(`PrismaQuery[${label}]`);

  (client as QueryEventSource).$on('query', (event) => {
    const sql = redactText(event.query, 2000);
    // Bound values (descriptions, amounts, tax ids...) are never logged, only the
    // parameterized SQL and its duration.
    logger.debug(`${sql} (${event.duration}ms)`);
  });
  return true;
}
