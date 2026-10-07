// Run: node --test scripts/pi-scripts.test.mjs
// Issue #39: the shell tooling behind the two acceptance items, exercised with a
// docker shim (no Docker on the test machine).
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { PI_DIR } from './check-env.mjs';

const SCRIPTS = path.join(PI_DIR, 'scripts');
const SERVICES = ['postgres', 'redis', 'api', 'worker', 'web', 'cloudflared'];

/** A synthetic soak window: one host row and one row per service every minute. */
function samples({ hours = 24, metrics = {} } = {}) {
  const lines = [];
  const t0 = 1_760_000_000;
  for (let i = 0; i <= hours * 60; i++) {
    const t = t0 + i * 60;
    const iso = new Date(t * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
    lines.push(['host', t, iso, 8000, 4000, 0, 100, 100, 0].join('\t'));
    for (const svc of SERVICES) {
      const m = metrics[svc] ?? { cur: 100, peak: 120, limit: 1024, ooms: 0 };
      lines.push(['ctr', t, iso, svc, m.cur, m.peak, m.limit, m.ooms, 0, 'healthy'].join('\t'));
    }
  }
  return `${lines.join('\n')}\n`;
}

function report(tsv) {
  const dir = mkdtempSync(path.join(tmpdir(), 'mizano-soak-'));
  try {
    const file = path.join(dir, 'samples.tsv');
    writeFileSync(file, tsv);
    const run = spawnSync('bash', [path.join(SCRIPTS, 'soak-report.sh'), file], {
      encoding: 'utf8',
    });
    const verdict = /^verdict\s+(\S+)/m.exec(run.stdout)?.[1];
    return { verdict, status: run.status, out: run.stdout + run.stderr };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('@e2e @flow:pi-soak @issue-39 AC1: a complete 24h window with healthy services and real cgroup numbers passes', () => {
  const r = report(samples());
  assert.equal(r.verdict, 'PASS', r.out);
  assert.equal(r.status, 0);
});

test('@e2e @flow:pi-soak @issue-39 AC1: a service whose cgroup memory metrics could not be read cannot pass', () => {
  // soak-sample.sh writes `na` when the cgroup directory or memory.* files are missing;
  // 0 MB and no OOM counter is absence of evidence, not evidence of a healthy budget.
  const r = report(
    samples({ metrics: { worker: { cur: 'na', peak: 'na', limit: 'na', ooms: 'na' } } }),
  );
  assert.notEqual(r.verdict, 'PASS', r.out);
  assert.notEqual(r.status, 0);
  assert.match(r.out, /worker.*(no|missing|unread).*metric/i);
});

test('@e2e @flow:pi-soak @issue-39 AC1: a cgroup OOM kill still fails even when other samples are unreadable', () => {
  // The api's cgroup counter goes from 0 to 1 half-way through the window.
  const lines = samples().split('\n');
  const index = lines.findIndex((l, i) => i > lines.length / 2 && /^ctr\t\d+\t\S+\tapi\t/.test(l));
  lines[index] = lines[index].replace(/\t0\t0\thealthy$/, '\t1\t0\thealthy');
  const r = report(lines.join('\n'));
  assert.equal(r.verdict, 'FAIL', r.out);
});

/**
 * Runs `wait_healthy` from lib.sh with a fake `docker` on PATH. `states` maps a service to
 * "<State.Status> <Health.Status|none>" as `docker inspect` would print it.
 */
function waitHealthy(states) {
  const dir = mkdtempSync(path.join(tmpdir(), 'mizano-stack-'));
  try {
    writeFileSync(path.join(dir, '.env.pi'), 'MIZANO_DATA_DIR=/mnt/ssd/mizano\n');
    const shim = path.join(dir, 'docker');
    writeFileSync(
      shim,
      `#!/usr/bin/env bash
# compose -f X --env-file Y ps -q <svc>  -> a container id; inspect -f <fmt> <id> -> the state
if [ "$1" = compose ]; then
  svc="\${!#}"; printf 'id-%s\\n' "$svc"
elif [ "$1" = inspect ]; then
  id="\${!#}"; svc="\${id#id-}"; var="STATE_$svc"; fmt="$3"
  if [ -z "\${!var:-}" ]; then exit 1; fi
  case "$fmt" in
    *State.Status*) printf '%s\\n' "\${!var}" ;;
    *) printf '%s\\n' "\${!var#* }" ;;
  esac
fi
`,
    );
    chmodSync(shim, 0o755);
    const env = {
      ...process.env,
      PATH: `${dir}:${process.env.PATH}`,
      ENV_FILE: path.join(dir, '.env.pi'),
    };
    for (const [svc, state] of Object.entries(states)) env[`STATE_${svc}`] = state;
    const run = spawnSync('bash', ['-c', `. "${path.join(SCRIPTS, 'lib.sh')}"; wait_healthy 1`], {
      encoding: 'utf8',
      env,
    });
    return run.status;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const healthy = {
  postgres: 'running healthy',
  redis: 'running healthy',
  api: 'running healthy',
  worker: 'running healthy',
  web: 'running healthy',
  cloudflared: 'running none',
};

test('@e2e @flow:pi-boot @issue-39 AC2: stack.sh up reports healthy only when the tunnel container runs too', () => {
  assert.equal(waitHealthy(healthy), 0, 'all services up');
  assert.notEqual(
    waitHealthy({ ...healthy, cloudflared: 'restarting none' }),
    0,
    'crash-looping tunnel',
  );
  assert.notEqual(waitHealthy({ ...healthy, cloudflared: 'exited none' }), 0, 'exited tunnel');
  assert.notEqual(waitHealthy({ ...healthy, cloudflared: '' }), 0, 'no tunnel container');
  assert.notEqual(waitHealthy({ ...healthy, api: 'running unhealthy' }), 0, 'unhealthy api');
});

test('@e2e @flow:pi-boot @issue-39 AC2: the health gate names every long-running service', () => {
  // The gate and the soak sampler must agree on what "the stack" is.
  const lib = execFileSync(
    'bash',
    ['-c', `grep -E '^STACK_SERVICES=' "${path.join(SCRIPTS, 'lib.sh')}"`],
    {
      encoding: 'utf8',
    },
  );
  assert.equal(lib.trim(), `STACK_SERVICES=(${SERVICES.join(' ')})`);
});
