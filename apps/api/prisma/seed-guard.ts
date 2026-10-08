/**
 * The demo seed creates well-known logins (admin@mizano.com / password123). Refuse to run it
 * against production unless an operator opts in explicitly with SEED_ALLOW_PROD=1.
 */
export function assertSeedAllowed(env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_ENV === 'production' && env.SEED_ALLOW_PROD !== '1') {
    throw new Error(
      'Refusing to seed demo users with NODE_ENV=production. Set SEED_ALLOW_PROD=1 to seed anyway.',
    );
  }
}
