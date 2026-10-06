/** Env files resolved by ConfigModule, shared by the API (main.ts) and the intake worker (worker.ts). */
export function envFilePaths(appEnv: string = process.env.APP_ENV || 'local'): string[] {
  return [
    `.env.${appEnv}`,
    '.env',
    // Also load from monorepo root (CWD is apps/api/ when run via turborepo)
    `../../.env.${appEnv}`,
    '../../.env',
  ];
}
