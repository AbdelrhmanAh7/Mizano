import { mkdtempSync, readFileSync, rmSync, utimesSync } from 'fs';
import { tmpdir } from 'os';
import * as path from 'path';
import { HEARTBEAT_MAX_AGE_MS, beat, heartbeatIsFresh } from './worker-heartbeat';

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
});
