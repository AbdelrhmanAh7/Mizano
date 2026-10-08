import { readFileSync } from 'fs';

/** Written by the worker after each successful database and Redis probe. */
export const WORKER_HEARTBEAT_FILE = '/tmp/mizano-worker-health';
const MAX_HEARTBEAT_AGE_MS = 20_000;

export function workerHeartbeatHealthy(file = WORKER_HEARTBEAT_FILE, now = Date.now()): boolean {
  try {
    const heartbeat = Number(readFileSync(file, 'utf8'));
    const age = now - heartbeat;
    return Number.isFinite(heartbeat) && age >= 0 && age <= MAX_HEARTBEAT_AGE_MS;
  } catch {
    return false;
  }
}

if (require.main === module && !workerHeartbeatHealthy()) process.exitCode = 1;
