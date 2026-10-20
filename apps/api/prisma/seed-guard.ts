/**
 * Production guard for prisma/seed.ts: the seed creates demo users (admin@mizano.com /
 * password123) and demo data, so it must never run against production by accident.
 * Returns the warning to print when the seed must abort, or null when it may run.
 */
export function seedBlockedReason(env: NodeJS.ProcessEnv): string | null {
  if (env.NODE_ENV !== 'production' || env.SEED_ALLOW_PROD === '1') {
    return null;
  }
  return (
    'Refusing to seed: NODE_ENV=production creates demo users with a known password. ' +
    'Set SEED_ALLOW_PROD=1 to run the seed in production deliberately.'
  );
}
