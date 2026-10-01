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
 * the SQL text and duration are logged; parameters need a second explicit opt-in
 * (`PRISMA_LOG_QUERY_PARAMS=true`) which is ignored in production.
 */

type Env = Record<string, string | undefined>;

export function isQueryLoggingEnabled(env: Env = process.env): boolean {
  return env.PRISMA_LOG_QUERIES === 'true';
}

export function isQueryParamLoggingEnabled(env: Env = process.env): boolean {
  return (
    isQueryLoggingEnabled(env) &&
    env.PRISMA_LOG_QUERY_PARAMS === 'true' &&
    env.NODE_ENV !== 'production'
  );
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
  const withParams = isQueryParamLoggingEnabled(env);

  (client as QueryEventSource).$on('query', (event) => {
    const sql = redactText(event.query, 2000);
    logger.debug(
      withParams
        ? `${sql} -- params=${redactText(event.params, 500)} (${event.duration}ms)`
        : `${sql} (${event.duration}ms)`,
    );
  });
  return true;
}
