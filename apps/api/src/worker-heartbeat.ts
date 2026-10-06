import { statSync, writeFileSync } from 'fs';

export const DEFAULT_HEARTBEAT_FILE = '/tmp/mizano-worker.heartbeat';
export const HEARTBEAT_INTERVAL_MS = 15_000;
/** Four missed beats: the container health check fails after about a minute. */
export const HEARTBEAT_MAX_AGE_MS = 60_000;

/** Touch the heartbeat file only while the worker is really consuming. */
export function beat(file: string, alive: () => boolean, now: Date = new Date()): boolean {
  if (!alive()) return false;
  writeFileSync(file, now.toISOString());
  return true;
}

/** Health probe for the worker container (no HTTP server to probe). */
export function heartbeatIsFresh(
  file: string,
  maxAgeMs: number = HEARTBEAT_MAX_AGE_MS,
  nowMs: number = Date.now(),
): boolean {
  try {
    return nowMs - statSync(file).mtimeMs <= maxAgeMs;
  } catch {
    return false;
  }
}
