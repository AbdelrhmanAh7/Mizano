#!/usr/bin/env bash
set -euo pipefail
pi_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
node - "$pi_dir" <<'JS'
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = process.argv[2];
const shell = fs.readFileSync(path.join(root, 'scripts/healthcheck.sh'), 'utf8');
const probe = shell.match(/exec -T api node -e '([\s\S]*?)'/)[1];
const good = {status: 'healthy', services: {database: {status: 'connected'}, redis: {status: 'connected'}}};
const cases = [
  [good, true, 0],
  [{...good, status: 'unhealthy'}, true, 1],
  [{...good, services: {...good.services, database: {status: 'disconnected'}}}, true, 1],
  [{...good, services: {...good.services, redis: {status: 'disconnected'}}}, true, 1],
  [{...good, services: {...good.services, redis: {status: 'not_configured'}}}, true, 1],
  [{}, true, 1],
  [good, false, 1],
  [good, true, 1, 'fetch'],
  [good, true, 1, 'json'],
];
async function run() {
  for (const [body, ok, expected, failure] of cases) {
    const actual = await new Promise(resolve => {
      vm.runInNewContext(probe, {
        fetch: async () => {
          if (failure === 'fetch') throw new Error('Unavailable');
          return {ok, json: async () => {
            if (failure === 'json') throw new Error('Malformed');
            return body;
          }};
        },
        AbortSignal: {timeout: () => undefined},
        process: {exit: resolve},
      });
    });
    if (actual !== expected) throw new Error('Health readiness assertion failed');
  }
  process.stdout.write(`PASS: ${cases.length} semantic health cases\n`);
  const workerProbe = shell.match(/exec -T -w \/app\/apps\/api api node -e '([\s\S]*?)'/)[1];
  const workerCases = [[1, false, 0], [0, false, 1], [1, true, 1], [1, false, 0, 'rediss://user:p%40ss@redis:6380/2'], [1, false, 1, 'redis://redis:6379', true]];
  for (const [workers, reject, expected, url = 'redis://redis:6379', hang = false] of workerCases) {
    let closed = false;
    let bounded = false;
    class Queue {
      constructor(name, options) {
        if (name !== 'intake' || options.connection.host !== 'redis') throw new Error('Wrong worker queue');
        if (url.startsWith('rediss:') && (
          !options.connection.tls || options.connection.port !== 6380 || options.connection.db !== 2 ||
          options.connection.username !== 'user' || options.connection.password !== 'p@ss'
        )) throw new Error('Wrong worker connection');
      }
      async getWorkers() {
        if (hang) return new Promise(() => {});
        if (reject) throw new Error('Unavailable');
        return Array.from({length: workers}, () => ({}));
      }
      async close() { closed = true; }
    }
    const actual = await new Promise(resolve => {
      vm.runInNewContext(workerProbe, {
        require: name => { if (name !== 'bullmq') throw new Error('Wrong dependency'); return {Queue}; },
        URL,
        setTimeout: (callback, ms) => {
          if (ms !== 8000) throw new Error('Wrong probe deadline');
          bounded = true;
          if (hang) Promise.resolve().then(callback);
        },
        process: {env: {REDIS_URL: url}, exit: resolve},
      });
    });
    if (actual !== expected || !bounded || (!reject && !hang && !closed)) throw new Error('Worker readiness assertion failed');
  }
  process.stdout.write(`PASS: ${workerCases.length} worker registration cases\n`);
}
run().catch(() => {process.stderr.write('FAIL: semantic health checks\n'); process.exitCode = 1;});
JS
