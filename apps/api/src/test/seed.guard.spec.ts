import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { seedBlockedReason } from '../../prisma/seed-guard';

describe('seed production guard', () => {
  describe('seedBlockedReason', () => {
    it('blocks NODE_ENV=production when SEED_ALLOW_PROD is unset', () => {
      const reason = seedBlockedReason({ NODE_ENV: 'production' });
      expect(reason).toContain('SEED_ALLOW_PROD=1');
    });

    it.each(['0', 'true', 'yes', ''])('blocks production when SEED_ALLOW_PROD=%j', (flag) => {
      expect(seedBlockedReason({ NODE_ENV: 'production', SEED_ALLOW_PROD: flag })).not.toBeNull();
    });

    it('allows production when SEED_ALLOW_PROD=1', () => {
      expect(seedBlockedReason({ NODE_ENV: 'production', SEED_ALLOW_PROD: '1' })).toBeNull();
    });

    it.each([undefined, 'development', 'test', 'staging'])(
      'allows NODE_ENV=%s without the flag',
      (nodeEnv) => {
        expect(seedBlockedReason({ NODE_ENV: nodeEnv })).toBeNull();
      },
    );
  });

  // Runs the real seed entrypoint: the guard must exit before any database access,
  // so DATABASE_URL points at a closed port and a blocked run still fails fast with code 1.
  describe('prisma/seed.ts entrypoint', () => {
    const apiRoot = join(__dirname, '..', '..');
    const run = (env: Record<string, string>): ReturnType<typeof spawnSync> =>
      spawnSync(process.execPath, [require.resolve('ts-node/dist/bin.js'), 'prisma/seed.ts'], {
        cwd: apiRoot,
        encoding: 'utf8',
        env: {
          PATH: process.env.PATH ?? '',
          DATABASE_URL: 'postgresql://seed:seed@127.0.0.1:1/seed',
          ...env,
        },
      });

    it('exits 1 with a warning in production without SEED_ALLOW_PROD', () => {
      const result = run({ NODE_ENV: 'production' });
      expect(result.status).toBe(1);
      expect(String(result.stderr)).toContain('SEED_ALLOW_PROD=1');
      expect(String(result.stdout)).not.toContain('1. Organization');
    }, 60_000);

    it('proceeds past the guard in production with SEED_ALLOW_PROD=1', () => {
      const result = run({ NODE_ENV: 'production', SEED_ALLOW_PROD: '1' });
      // Past the guard the seed starts (and then fails to reach the closed DB port).
      expect(String(result.stdout)).toContain('Mizano ERP - Full Database Seed');
      expect(String(result.stderr)).not.toContain('SEED_ALLOW_PROD=1 to');
    }, 60_000);
  });
});
