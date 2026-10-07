import { readFileSync, statSync, writeFileSync } from 'fs';
import { envFilePaths } from './env-files';

export const DEFAULT_HEARTBEAT_FILE = '/tmp/mizano-worker.heartbeat';
const HEARTBEAT_KEY = 'WORKER_HEARTBEAT_FILE';
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

/** Value of `key` in a dotenv-style file (`KEY=value`, optional quotes), or undefined. */
function readEnvFileKey(file: string, key: string): string | undefined {
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return undefined;
  }
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m || m[1] !== key) continue;
    const value = m[2].trim();
    const quoted = /^(['"])(.*)\1$/.exec(value);
    return quoted ? quoted[2] : value.replace(/\s+#.*$/, '').trim();
  }
  return undefined;
}

/**
 * The heartbeat path the worker writes: process env first, then the env files the worker's
 * ConfigModule loads, in the same order (an earlier file wins). `--healthcheck` resolves it
 * this way too, so a path set only in an env file is probed, not the default.
 */
export function resolveHeartbeatFile(
  env: NodeJS.ProcessEnv = process.env,
  files: string[] = envFilePaths(),
): string {
  if (env[HEARTBEAT_KEY]) return env[HEARTBEAT_KEY];
  for (const file of files) {
    const value = readEnvFileKey(file, HEARTBEAT_KEY);
    if (value) return value;
  }
  return DEFAULT_HEARTBEAT_FILE;
}
