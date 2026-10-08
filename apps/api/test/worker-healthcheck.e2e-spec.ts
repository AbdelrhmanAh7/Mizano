/**
 * Pi 5 intake worker container health probe (issue #39 AC2: reboot recovers all services).
 * Compose runs `node dist/worker.js --healthcheck` every 30 s; this drives the real entrypoint
 * as a child process, so a WORKER_HEARTBEAT_FILE that only an env file sets (the way
 * ConfigModule loads it for the worker itself) is probed, not the default path.
 */
import { spawnSync } from 'child_process';
import { mkdtempSync, rmSync, utimesSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import * as path from 'path';
import { HEARTBEAT_MAX_AGE_MS } from '../src/worker-heartbeat';

const API_ROOT = path.resolve(__dirname, '..');
const TS_NODE = path.resolve(API_ROOT, '../../node_modules/ts-node/dist/bin.js');

describe('intake worker --healthcheck (e2e)', () => {
  let dir: string;
  let heartbeat: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'mizano-worker-hc-'));
    heartbeat = path.join(dir, 'custom.heartbeat');
    writeFileSync(path.join(dir, '.env.pi'), `WORKER_HEARTBEAT_FILE=${heartbeat}\n`);
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  /** Exit code of the healthcheck run from `dir`, with only APP_ENV exported by the parent. */
  function healthcheck(extraEnv: NodeJS.ProcessEnv = {}): number | null {
    const { WORKER_HEARTBEAT_FILE: _inherited, ...inherited } = process.env;
    const env: NodeJS.ProcessEnv = { ...inherited, APP_ENV: 'pi', ...extraEnv };
    return spawnSync(
      process.execPath,
      [
        TS_NODE,
        '--transpile-only',
        '--project',
        path.join(API_ROOT, 'tsconfig.json'),
        path.join(API_ROOT, 'src/worker.ts'),
        '--healthcheck',
      ],
      { cwd: dir, env, encoding: 'utf8', timeout: 50_000 },
    ).status;
  }

  test('@e2e @flow:pi-stack @issue-39 AC2: a heartbeat path set only in the env file is probed (fresh = healthy)', () => {
    writeFileSync(heartbeat, new Date().toISOString());
    expect(healthcheck()).toBe(0);
  });

  test('@e2e @flow:pi-stack @issue-39 AC2: the env-file heartbeat missing or stale is unhealthy, not rescued by the default path', () => {
    expect(healthcheck()).toBe(1);

    writeFileSync(heartbeat, new Date().toISOString());
    const old = (Date.now() - HEARTBEAT_MAX_AGE_MS - 5_000) / 1000;
    utimesSync(heartbeat, old, old);
    expect(healthcheck()).toBe(1);
  });

  test('@e2e @flow:pi-stack @issue-39 AC2: an exported WORKER_HEARTBEAT_FILE wins over the env file', () => {
    const exported = path.join(dir, 'exported.heartbeat');
    writeFileSync(exported, new Date().toISOString());
    expect(healthcheck({ WORKER_HEARTBEAT_FILE: exported })).toBe(0);
  });
});
