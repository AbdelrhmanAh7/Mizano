/**
 * The demo seed creates admin@mizano.com / password123 (issue #132). It must refuse to run when
 * NODE_ENV=production unless the operator opts in with SEED_ALLOW_PROD=1.
 *
 * The seed runs as a real child process (the same entry point as `prisma db seed`) against an
 * unreachable database, so no run of this suite can write the demo users anywhere.
 */
import { spawnSync } from 'child_process';
import * as path from 'path';

const API_DIR = path.resolve(__dirname, '..');
const UNREACHABLE_DB = 'postgresql://nobody:nothing@127.0.0.1:1/none?connect_timeout=2';
const REFUSAL = /SEED_ALLOW_PROD/;

function runSeed(env: Record<string, string>): { status: number | null; output: string } {
  const result = spawnSync(
    process.execPath,
    [require.resolve('ts-node/dist/bin.js'), '--transpile-only', 'prisma/seed.ts'],
    {
      cwd: API_DIR,
      env: { PATH: process.env.PATH ?? '', DATABASE_URL: UNREACHABLE_DB, ...env },
      encoding: 'utf8',
      timeout: 120_000,
    },
  );
  return { status: result.status, output: `${result.stdout}\n${result.stderr}` };
}

describe('@e2e @flow:seed @issue-132 production seed guard', () => {
  it('@issue-132 AC4: refuses to seed demo credentials when NODE_ENV=production', () => {
    const { status, output } = runSeed({ NODE_ENV: 'production' });
    expect(status).not.toBe(0);
    expect(output).toMatch(REFUSAL);
    expect(output).not.toMatch(/Organization\.\.\./);
  });

  it('@issue-132 AC4: SEED_ALLOW_PROD=1 lets an operator seed production on purpose', () => {
    const { output } = runSeed({ NODE_ENV: 'production', SEED_ALLOW_PROD: '1' });
    expect(output).not.toMatch(REFUSAL);
    expect(output).toMatch(/Organization\.\.\./);
  });

  it('@issue-132 AC4: other values of SEED_ALLOW_PROD do not unlock production', () => {
    const { status, output } = runSeed({ NODE_ENV: 'production', SEED_ALLOW_PROD: 'true' });
    expect(status).not.toBe(0);
    expect(output).toMatch(REFUSAL);
  });

  it('@issue-132 AC4: development seeding is unaffected', () => {
    const { output } = runSeed({ NODE_ENV: 'development' });
    expect(output).not.toMatch(REFUSAL);
    expect(output).toMatch(/Organization\.\.\./);
  });
});
