import { spawnSync } from 'child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

/**
 * Issue #141 review T1: the intake worker has no HTTP port, so a dead worker must still fail the
 * deploy (rollback path) and raise the periodic health alert.
 */
const scripts = resolve(__dirname, '../../../deploy/pi/scripts');

describe('Pi deploy scripts gate on the intake worker', () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'mizano-gate-'));
    writeFileSync(join(dir, 'env'), '');
    // Fake docker: `compose ... ps -q <svc>` prints the service name as its container id;
    // `inspect ... <id>` prints $HEALTH_<ID>, defaulting to healthy.
    writeFileSync(
      join(dir, 'docker'),
      `#!/usr/bin/env bash
if [ "$1" = compose ]; then echo "\${@: -1}"; exit 0; fi
var="HEALTH_$(echo "\${@: -1}" | tr a-z A-Z)"
echo "\${!var:-healthy}"
`,
    );
    chmodSync(join(dir, 'docker'), 0o755);
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  const waitHealthy = (env: Record<string, string>): number | null =>
    spawnSync('bash', ['-c', `. "${scripts}/lib.sh"; wait_healthy 1`], {
      env: {
        ...process.env,
        ...env,
        ENV_FILE: join(dir, 'env'),
        PATH: `${dir}:${process.env.PATH}`,
      },
      timeout: 15_000,
    }).status;

  it('wait_healthy succeeds when api, web and worker are healthy', () => {
    expect(waitHealthy({})).toBe(0);
  });

  it('wait_healthy fails when only the worker is unhealthy', () => {
    expect(waitHealthy({ HEALTH_WORKER: 'unhealthy' })).toBe(1);
  });

  it('healthcheck.sh reports a missing or unhealthy worker like api and web', () => {
    const script = readFileSync(join(scripts, 'healthcheck.sh'), 'utf8');
    expect(script).toContain('dc ps -q worker');
    expect(script).toContain('worker-down|');
    expect(script).toContain('worker-unhealthy|');
    expect(script).toMatch(/^check_worker$/m);
  });
});
