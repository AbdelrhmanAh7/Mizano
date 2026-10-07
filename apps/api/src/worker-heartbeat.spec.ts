import { mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import * as path from 'path';
import {
  DEFAULT_HEARTBEAT_FILE,
  HEARTBEAT_MAX_AGE_MS,
  beat,
  heartbeatIsFresh,
  resolveHeartbeatFile,
} from './worker-heartbeat';

describe('worker heartbeat', () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'mizano-hb-'));
    file = path.join(dir, 'heartbeat');
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('writes only while the worker is consuming', () => {
    expect(beat(file, () => false)).toBe(false);
    expect(heartbeatIsFresh(file)).toBe(false);

    const now = new Date('2026-10-06T08:00:00.000Z');
    expect(beat(file, () => true, now)).toBe(true);
    expect(readFileSync(file, 'utf8')).toBe(now.toISOString());
  });

  it('is fresh right after a beat and stale after the max age', () => {
    beat(file, () => true);
    expect(heartbeatIsFresh(file)).toBe(true);

    const old = (Date.now() - HEARTBEAT_MAX_AGE_MS - 5_000) / 1000;
    utimesSync(file, old, old);
    expect(heartbeatIsFresh(file)).toBe(false);
  });

  it('a missing file is unhealthy', () => {
    expect(heartbeatIsFresh(path.join(dir, 'missing'))).toBe(false);
  });

  describe('resolveHeartbeatFile (the --healthcheck probe reads the same env files as the worker)', () => {
    it('defaults when nothing configures it', () => {
      expect(resolveHeartbeatFile({}, [path.join(dir, '.env.missing')])).toBe(
        DEFAULT_HEARTBEAT_FILE,
      );
    });

    it('reads WORKER_HEARTBEAT_FILE from an env file that only ConfigModule would load', () => {
      writeFileSync(path.join(dir, '.env.pi'), 'WORKER_HEARTBEAT_FILE=/data/hb\nOTHER=1\n');
      expect(resolveHeartbeatFile({}, [path.join(dir, '.env.pi')])).toBe('/data/hb');
    });

    it('prefers the process environment, then the earlier env file, like ConfigModule', () => {
      writeFileSync(path.join(dir, '.env.pi'), 'WORKER_HEARTBEAT_FILE=/from-pi\n');
      writeFileSync(path.join(dir, '.env'), 'WORKER_HEARTBEAT_FILE=/from-default\n');
      const files = [path.join(dir, '.env.pi'), path.join(dir, '.env')];
      expect(resolveHeartbeatFile({}, files)).toBe('/from-pi');
      expect(resolveHeartbeatFile({ WORKER_HEARTBEAT_FILE: '/from-env' }, files)).toBe('/from-env');
    });
  });
});
