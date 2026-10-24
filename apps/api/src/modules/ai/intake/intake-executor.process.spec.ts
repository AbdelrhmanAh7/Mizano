/**
 * Linux process integration: the real supervisor, real `prlimit`, a real detached process
 * group and real Node IPC. Only the workload inside the child is substituted. Needs no
 * database, Redis, model, OCR asset or build output; skipped where the caps cannot be enforced
 * (Windows, macOS), so the Linux CI job is what executes it.
 */
import * as childProcess from 'child_process';
import { ConfigService } from '@nestjs/config';
import { IntakeJob } from '@prisma/client';
import { accessSync, constants } from 'fs';
import { access, mkdtemp, readFile, rm, utimes, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { IntakeExecutorService } from './intake-executor.service';

function canEnforceCaps(): boolean {
  if (process.platform !== 'linux') return false;
  try {
    accessSync('/usr/bin/prlimit', constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

const linuxDescribe = canEnforceCaps() ? describe : describe.skip;

linuxDescribe('intake OS isolation (Linux only)', () => {
  const realSpawn = childProcess.spawn;
  const job = {
    storageKey: 'org/key',
    organizationId: 'org',
    sha256: 'hash',
    mimeType: 'image/png',
  } as IntakeJob;
  let directory = '';
  let executor: IntakeExecutorService;

  /**
   * Substitute only the workload. The production supervisor, prlimit arguments, detached process
   * group, environment and IPC lifecycle stay unchanged: the child entry path (the last argument)
   * is replaced by `-e <program>`.
   */
  function withWorkload(program: string): void {
    jest.spyOn(childProcess, 'spawn').mockImplementation((command, args, options) => {
      directory = options?.env?.TMPDIR ?? '';
      return realSpawn(command, [...(args ?? []).slice(0, -1), '-e', program], options);
    });
  }

  function isGone(pid: number): Promise<boolean> {
    // A zombie has stopped executing and only awaits reaping by the container's init.
    return readFile(`/proc/${pid}/status`, 'utf8').then(
      (status) => /^State:\s+Z/m.test(status),
      () => true,
    );
  }

  /** Guards against a vacuous pass: the supervisor must have created the directory we check. */
  async function expectDirectoryRemoved(): Promise<void> {
    expect(directory).toContain('mizano-intake-');
    await expect(access(directory)).rejects.toThrow();
  }

  beforeEach(() => {
    directory = '';
    executor = new IntakeExecutorService(new ConfigService({ INTAKE_JOB_DEADLINE_MS: '2000' }));
  });
  afterEach(() => {
    executor.onModuleDestroy();
    jest.restoreAllMocks();
  });

  it('kills a CPU-bound child and its descendant at the deadline while the supervisor stays responsive', async () => {
    let descendant = 0;
    withWorkload(`
      const {spawn} = require('child_process');
      const fs = require('fs');
      process.once('message', () => {
        const nested = spawn(process.execPath, ['-e', 'for (;;) {}'], {stdio:'ignore'});
        fs.writeFileSync(process.env.TMPDIR + '/descendant', String(nested.pid));
        for (;;) {}
      });
    `);
    const started = Date.now();
    const failure = expect(executor.run(job, new AbortController().signal)).rejects.toMatchObject({
      code: 'INTAKE_TIMEOUT',
    });
    let ticks = 0;
    const timer = setInterval(() => {
      ticks += 1;
      if (directory)
        void readFile(join(directory, 'descendant'), 'utf8')
          .then((pid) => {
            descendant = Number(pid);
          })
          .catch(() => undefined);
    }, 25);
    try {
      await failure;
      expect(Date.now() - started).toBeLessThan(5000);
      expect(ticks).toBeGreaterThan(10);
      expect(descendant).toBeGreaterThan(0);
      expect(await isGone(descendant)).toBe(true);
      await expectDirectoryRemoved();
    } finally {
      clearInterval(timer);
    }
  });

  it('delivers a result over real IPC, then reaps the group and removes the private directory', async () => {
    withWorkload(`
      process.once('message', (m) =>
        process.send({ result: { rawText: 'ok:' + m.organizationId + ':' + m.storageKey } }),
      );
    `);
    const result = await executor.run(job, new AbortController().signal);
    expect(result.rawText).toBe('ok:org:org/key');
    await expectDirectoryRemoved();
  });

  it('stops a running child when the lease is lost', async () => {
    withWorkload(`process.once('message', () => { for (;;) {} });`);
    const controller = new AbortController();
    const started = Date.now();
    const failure = expect(executor.run(job, controller.signal)).rejects.toMatchObject({
      code: 'INTAKE_WORKER_FAILED',
    });
    setTimeout(() => controller.abort(), 300);
    await failure;
    expect(Date.now() - started).toBeLessThan(1500);
    await expectDirectoryRemoved();
  });

  it.each([
    // What the kernel and V8 really report for each cap (see the signal table in the runtime doc).
    ['a V8 heap abort', `process.once('message', () => process.abort());`, 'INTAKE_RESOURCE_LIMIT'],
    [
      'an external SIGKILL (CPU rlimit hard kill, container OOM killer)',
      `process.once('message', () => process.kill(process.pid, 'SIGKILL'));`,
      'INTAKE_RESOURCE_LIMIT',
    ],
    [
      'an uncaught exception',
      `process.once('message', () => { throw new Error('x'); });`,
      'INTAKE_WORKER_FAILED',
    ],
    [
      'a clean exit without a result',
      `process.once('message', () => process.exit(0));`,
      'INTAKE_WORKER_FAILED',
    ],
  ])('maps %s to a stable code', async (_label, program, code) => {
    withWorkload(program);
    await expect(executor.run(job, new AbortController().signal)).rejects.toMatchObject({ code });
    await expectDirectoryRemoved();
  });

  it('runs two documents at once in separate process groups', async () => {
    withWorkload(`
      process.once('message', (m) => setTimeout(() => process.send({ result: { rawText: String(process.pid) } }), 300));
    `);
    const [a, b] = await Promise.all([
      executor.run(job, new AbortController().signal),
      executor.run(job, new AbortController().signal),
    ]);
    expect(a.rawText).not.toBe(b.rawText);
  });

  it('removes stale private directories at boot, even non-empty ones, and keeps a fresh one', async () => {
    const stale = await mkdtemp(join(tmpdir(), 'mizano-intake-'));
    const fresh = await mkdtemp(join(tmpdir(), 'mizano-intake-'));
    try {
      await writeFile(join(stale, 'original'), 'invoice bytes');
      const longAgo = new Date(Date.now() - 20 * 60_000);
      await utimes(stale, longAgo, longAgo);
      await executor.onModuleInit();
      await expect(access(stale)).rejects.toThrow();
      await expect(access(fresh)).resolves.toBeUndefined();
    } finally {
      await rm(stale, { recursive: true, force: true });
      await rm(fresh, { recursive: true, force: true });
    }
  });
});
