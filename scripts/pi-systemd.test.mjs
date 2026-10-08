// Run: node --test scripts/pi-systemd.test.mjs
// Issue #39 AC2 (reboot recovers all services automatically): the boot unit must
// retry a failed `stack.sh up` with a bounded back-off instead of staying failed.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { PI_DIR } from './check-env.mjs';

const UNIT = path.join(PI_DIR, 'systemd', 'mizano-stack.service');

/** Parse an INI-style systemd unit into { Section: { Key: lastValue } }. */
function parseUnit(text) {
  const sections = {};
  let current = null;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith(';')) continue;
    const header = /^\[([A-Za-z]+)\]$/.exec(line);
    if (header) {
      current = header[1];
      sections[current] ??= {};
      continue;
    }
    const eq = line.indexOf('=');
    assert.ok(current && eq > 0, `unexpected line in unit: ${raw}`);
    sections[current][line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
  return sections;
}

/** Seconds from a systemd time span such as `30`, `30s`, `2min` or `1h`. */
function seconds(span) {
  const m = /^(\d+)\s*(s|sec|min|m|h)?$/.exec(span);
  assert.ok(m, `not a time span: ${span}`);
  const unit = m[2] ?? 's';
  return Number(m[1]) * (unit.startsWith('h') ? 3600 : unit.startsWith('m') ? 60 : 1);
}

const unit = parseUnit(readFileSync(UNIT, 'utf8'));

test('@e2e @flow:pi-boot @issue-39 AC2: the boot unit retries a failed stack.sh up with a bounded back-off', () => {
  const { Unit, Service } = unit;
  // The stack is still a remain-after-exit oneshot started after the SSD mount.
  assert.equal(Service.Type, 'oneshot');
  assert.equal(Service.RemainAfterExit, 'yes');
  assert.equal(Unit.RequiresMountsFor, '/mnt/ssd/mizano');
  assert.match(Service.ExecStart, /stack\.sh up$/);

  // A transient boot failure (compose exits while Postgres/Redis still recover)
  // must be retried, not left failed until someone logs in.
  assert.equal(Service.Restart, 'on-failure');
  const restartSec = seconds(Service.RestartSec ?? '');
  assert.ok(restartSec >= 10 && restartSec <= 120, `RestartSec ${restartSec}s outside 10-120s`);

  // Retries are bounded so a real fault cannot loop forever: more than one start
  // is allowed inside the window, and the window itself is finite.
  const burst = Number(Unit.StartLimitBurst);
  const interval = seconds(Unit.StartLimitIntervalSec ?? '');
  assert.ok(burst >= 3 && burst <= 10, `StartLimitBurst ${Unit.StartLimitBurst} outside 3-10`);
  assert.ok(interval > 0, 'StartLimitIntervalSec must be finite (0 disables the bound)');
  // The window must fit every retry plus its start timeout, or the rate limit
  // trips before the last attempt gets to run.
  const timeout = seconds(Service.TimeoutStartSec);
  assert.ok(
    interval >= burst * (timeout + restartSec),
    `StartLimitIntervalSec ${interval}s < ${burst} x (${timeout}s + ${restartSec}s)`,
  );
});

test('@e2e @flow:pi-boot @issue-39 AC1: the soak sampler never runs without the SSD mounted', () => {
  // soak-sample.sh appends every minute; without the mount its mkdir -p would put
  // samples on the SD card. The script guards itself (assert_ssd); the unit must too.
  const soak = parseUnit(readFileSync(path.join(PI_DIR, 'systemd', 'mizano-soak.service'), 'utf8'));
  assert.equal(soak.Unit.RequiresMountsFor, unit.Unit.RequiresMountsFor);
});

test('@e2e @flow:pi-boot @issue-39 AC1: the worker ships its pinned OCR language data in the image', () => {
  // INTAKE_TESSDATA_DIR points inside the image; no runtime download on an offline Pi.
  const compose = readFileSync(path.join(PI_DIR, 'docker-compose.pi.yml'), 'utf8');
  assert.match(compose, /INTAKE_TESSDATA_DIR: \/app\/apps\/api\n/);
  const root = path.join(PI_DIR, '..', '..');
  for (const lang of ['eng', 'ara']) {
    const file = path.join(root, 'apps', 'api', `${lang}.traineddata`);
    assert.ok(existsSync(file), `${lang}.traineddata`);
  }
  const dockerfile = readFileSync(path.join(root, 'apps', 'api', 'Dockerfile'), 'utf8');
  assert.match(dockerfile, /^COPY apps\/api \.\/apps\/api$/m);
});

test('@e2e @flow:pi-boot @issue-39 AC2: stack.sh up is safe to rerun after a partial start', () => {
  // `compose up -d` reuses containers that are already running, so a retry does
  // not recreate healthy services; `stop` on failure would tear them down.
  const stack = readFileSync(path.join(PI_DIR, 'scripts', 'stack.sh'), 'utf8');
  assert.match(stack, /dc up -d --remove-orphans/);
  assert.equal(unit.Service.ExecStopPost, undefined, 'no teardown between retries');
});
