import { existsSync } from 'node:fs';

export function requireBrowserExecutable(path, channel) {
  if (channel && channel !== 'chrome') throw new Error('Unsupported browser channel');
  if (!channel && !existsSync(path)) {
    throw new Error(
      'Chromium is missing. Provision it with pnpm --filter @mizano/web exec playwright install chromium',
    );
  }
}

export const apiURL = 'http://127.0.0.1:6103/api';
export const webURL = 'http://127.0.0.1:5103';

/** Refuse shared/remote databases even when inherited from an operator shell. */
export function browserEnvironment(source = process.env) {
  if (
    source.MIZANO_BROWSER_MUTATION &&
    !['required-route', 'wrong-total'].includes(source.MIZANO_BROWSER_MUTATION)
  ) {
    throw new Error('Unsupported browser negative control');
  }
  const database =
    source.DATABASE_URL || 'postgresql://mizano:mizano_secret@127.0.0.1:5435/mizano_e2e_cxe2e';
  let parsed;
  try {
    parsed = new URL(database);
  } catch {
    throw new Error('Browser journey requires a valid isolated local database URL');
  }
  if (
    parsed.protocol !== 'postgresql:' ||
    parsed.hostname !== '127.0.0.1' ||
    parsed.port !== '5435' ||
    parsed.pathname !== '/mizano_e2e_cxe2e' ||
    parsed.search
  ) {
    throw new Error('Browser journey requires the isolated local mizano_e2e_cxe2e database');
  }
  return {
    ...source,
    APP_ENV: 'browser-e2e',
    DATABASE_URL: database,
    // Reports use a separate Prisma client; inherited replica URLs must not escape this DB.
    READ_DATABASE_URL: database,
    REDIS_URL: 'redis://127.0.0.1:6380',
    INTAKE_EXTRACTION_STRATEGY: 'rules',
    PRISMA_LOG_QUERIES: 'false',
    API_PORT: '6103',
    API_INTERNAL_URL: apiURL,
    NEXT_PUBLIC_API_URL: apiURL,
    NEXTAUTH_URL: webURL,
    NEXTAUTH_SECRET: 'synthetic-browser-e2e-nextauth-secret-only',
    JWT_SECRET: 'synthetic-browser-e2e-jwt-secret-only',
    JWT_REFRESH_SECRET: 'synthetic-browser-e2e-refresh-secret-only',
    CORS_ORIGIN: webURL,
    TELEGRAM_BOT_TOKEN: '',
    TELEGRAM_WEBHOOK_SECRET: '',
  };
}
