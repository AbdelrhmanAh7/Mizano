import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IntakeJob } from '@prisma/client';
import { EventEmitter } from 'events';
import { spawn } from 'child_process';
import * as fs from 'fs';
import { readdir, readFile, rm, stat } from 'fs/promises';
import { IntakeExecutorService } from './intake-executor.service';
import { cpuReviewResult } from './cpu-extraction';

jest.mock('child_process', () => ({ spawn: jest.fn(), execFile: jest.fn() }));
jest.mock('fs/promises', () => ({
  mkdtemp: jest.fn().mockResolvedValue('/tmp/mizano-intake-test'),
  rm: jest.fn().mockResolvedValue(undefined),
  readFile: jest.fn().mockResolvedValue('VmRSS: 100 kB'),
  readdir: jest.fn().mockResolvedValue([]),
  stat: jest.fn(),
}));

describe('isolated intake executor', () => {
  const platform = process.platform;
  let child: EventEmitter & { pid: number; send: jest.Mock; kill: jest.Mock };
  let executor: IntakeExecutorService;
  let kill: jest.SpyInstance;
  const job = {
    storageKey: 'org/key',
    organizationId: 'org',
    sha256: 'hash',
    mimeType: 'image/png',
  } as IntakeJob;

  beforeEach(() => {
    jest.useFakeTimers();
    Object.defineProperty(process, 'platform', { value: 'linux' });
    child = Object.assign(new EventEmitter(), { pid: 12345, send: jest.fn(), kill: jest.fn() });
    jest.mocked(spawn).mockReturnValue(child as unknown as ReturnType<typeof spawn>);
    jest.mocked(readFile).mockResolvedValue('VmRSS: 100 kB');
    jest.mocked(rm).mockResolvedValue(undefined);
    jest.mocked(readdir).mockResolvedValue([] as never);
    kill = jest.spyOn(process, 'kill').mockReturnValue(true);
    executor = new IntakeExecutorService(new ConfigService({ INTAKE_JOB_DEADLINE_MS: '1000' }));
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: platform });
    jest.useRealTimers();
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  async function launch(signal = new AbortController().signal) {
    const run = executor.run(job, signal);
    // Attach a rejection observer before simulating any failure.
    const settled = run.then(
      (result) => ({ result, error: undefined }),
      (error: unknown) => ({ result: undefined, error }),
    );
    await Promise.resolve();
    return { settled };
  }

  it('uses a detached CPU-capped child without credentials, shell, or document bytes', async () => {
    const { settled } = await launch();
    expect(spawn).toHaveBeenCalledWith(
      '/usr/bin/prlimit',
      expect.arrayContaining([
        '--cpu=3', // ceil(1000 ms) + the 2 s backstop margin
        '--max-old-space-size=256',
        expect.stringContaining('intake-child.js'),
      ]),
      expect.objectContaining({ detached: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] }),
    );
    const options = jest.mocked(spawn).mock.calls[0][2];
    expect(options?.env).not.toHaveProperty('DATABASE_URL');
    expect(options?.env).not.toHaveProperty('NODE_OPTIONS');
    expect(options?.env?.INTAKE_TOOL_CPU_SECONDS).toBe('1');
    expect(child.send).toHaveBeenCalledWith(
      expect.objectContaining({ storageKey: 'org/key', organizationId: 'org' }),
      expect.any(Function),
    );
    child.emit('message', { result: cpuReviewResult('private', 0.9) });
    expect(kill).toHaveBeenCalledWith(-12345, 'SIGKILL');
    child.emit('close', null, 'SIGKILL');
    expect((await settled).result?.rawText).toBe('private');
    expect(rm).toHaveBeenCalledWith('/tmp/mizano-intake-test', { recursive: true, force: true });
    expect(jest.getTimerCount()).toBe(0);
  });

  it.each(['100', '999', '1000', '1001', '59000', '120000', '600000'])(
    'never lets an external-tool CPU cap exceed the child hard cap (deadline %s ms)',
    async (deadlineMs) => {
      // A child cannot raise an inherited hard limit: prlimit would fail every tool call.
      executor = new IntakeExecutorService(
        new ConfigService({ INTAKE_JOB_DEADLINE_MS: deadlineMs }),
      );
      const { settled } = await launch();
      const [, args, options] = jest.mocked(spawn).mock.calls[0];
      const childCap = Number(
        (args as string[]).find((a) => a.startsWith('--cpu='))?.slice('--cpu='.length),
      );
      const toolCap = Number(options?.env?.INTAKE_TOOL_CPU_SECONDS);
      expect(toolCap).toBeGreaterThanOrEqual(1);
      expect(toolCap).toBeLessThanOrEqual(60);
      expect(toolCap).toBeLessThanOrEqual(childCap);
      // The kernel limit is a backstop strictly above the wall deadline, never a tie with it.
      expect(childCap).toBeGreaterThan(Number(deadlineMs) / 1000);
      child.emit('message', { result: cpuReviewResult('x', 1) });
      child.emit('close', null, 'SIGKILL');
      await settled;
    },
  );

  it('kills on the total deadline but holds the slot until close and ignores late success', async () => {
    const { settled } = await launch();
    let finished = false;
    void settled.then(() => {
      finished = true;
    });
    await jest.advanceTimersByTimeAsync(1000);
    expect(kill).toHaveBeenCalledWith(-12345, 'SIGKILL');
    expect(finished).toBe(false);
    child.emit('message', { result: cpuReviewResult('late', 1) });
    child.emit('close', null, 'SIGKILL');
    expect((await settled).error).toMatchObject({ code: 'INTAKE_TIMEOUT' });
    expect(jest.getTimerCount()).toBe(0);
  });

  it('kills WASM/native memory excess outside the V8 heap', async () => {
    jest.mocked(readFile).mockResolvedValue('VmRSS: 900000 kB');
    const { settled } = await launch();
    await jest.advanceTimersByTimeAsync(100);
    expect(kill).toHaveBeenCalledWith(-12345, 'SIGKILL');
    child.emit('close', null, 'SIGKILL');
    expect((await settled).error).toMatchObject({ code: 'INTAKE_RESOURCE_LIMIT' });
  });

  it.each(['lease', 'shutdown'])(
    'terminates before releasing on %s cancellation',
    async (reason) => {
      const controller = new AbortController();
      const { settled } = await launch(controller.signal);
      if (reason === 'lease') controller.abort();
      else executor.onModuleDestroy();
      expect(kill).toHaveBeenCalledWith(-12345, 'SIGKILL');
      child.emit('close', null, 'SIGKILL');
      expect((await settled).error).toMatchObject({ code: 'INTAKE_WORKER_FAILED' });
    },
  );

  it('handles spawn failure and cleans all timers and private temporary files', async () => {
    const { settled } = await launch();
    child.emit('error', new Error('private data'));
    child.emit('close', -2, null);
    expect((await settled).error).toMatchObject({ message: 'INTAKE_WORKER_FAILED' });
    expect(jest.getTimerCount()).toBe(0);
    expect(rm).toHaveBeenCalledTimes(1);
  });

  it('does not start another child after shutdown begins', async () => {
    executor.onModuleDestroy();
    await expect(executor.run(job, new AbortController().signal)).rejects.toMatchObject({
      code: 'INTAKE_WORKER_FAILED',
    });
    expect(spawn).not.toHaveBeenCalled();
    expect(rm).toHaveBeenCalledTimes(1);
  });

  it.each([
    // The kernel reports each limit it enforces as a signal, never as an exit code.
    ['the CPU rlimit hard kill and the container OOM killer', 'SIGKILL', 'INTAKE_RESOURCE_LIMIT'],
    ['a CPU soft limit', 'SIGXCPU', 'INTAKE_RESOURCE_LIMIT'],
    ['the V8 heap limit (abort)', 'SIGABRT', 'INTAKE_RESOURCE_LIMIT'],
    ['an unrelated crash signal', 'SIGSEGV', 'INTAKE_WORKER_FAILED'],
    ['a plain non-zero exit', null, 'INTAKE_WORKER_FAILED'],
  ])('maps %s to a stable code', async (_label, exitSignal, code) => {
    const { settled } = await launch();
    child.emit('close', exitSignal === null ? 1 : null, exitSignal);
    expect((await settled).error).toMatchObject({ code });
    expect(jest.getTimerCount()).toBe(0);
  });

  it('keeps the real outcome when temporary-file cleanup fails', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest
      .mocked(rm)
      .mockRejectedValue(Object.assign(new Error('EBUSY /secret/path'), { code: 'EBUSY' }));
    const { settled } = await launch();
    child.emit('message', { result: cpuReviewResult('private', 0.9) });
    child.emit('close', null, 'SIGKILL');
    expect((await settled).result?.rawText).toBe('private');
    // Metadata only: never the error message (it can carry paths or document names).
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).not.toContain('/secret/path');
  });

  it('keeps a deadline failure when cleanup also fails', async () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.mocked(rm).mockRejectedValue(new Error('EBUSY'));
    const { settled } = await launch();
    await jest.advanceTimersByTimeAsync(1000);
    child.emit('close', null, 'SIGKILL');
    expect((await settled).error).toMatchObject({ code: 'INTAKE_TIMEOUT' });
  });

  it('survives repeated child error events instead of crashing the worker', async () => {
    const { settled } = await launch();
    expect(() => {
      child.emit('error', new Error('first'));
      child.emit('error', new Error('second'));
    }).not.toThrow();
    child.emit('close', -2, null);
    expect((await settled).error).toMatchObject({ code: 'INTAKE_WORKER_FAILED' });
  });

  it('shutdown terminates every active child and refuses new work', async () => {
    const second = Object.assign(new EventEmitter(), {
      pid: 777,
      send: jest.fn(),
      kill: jest.fn(),
    });
    jest
      .mocked(spawn)
      .mockReset()
      .mockReturnValueOnce(child as unknown as ReturnType<typeof spawn>)
      .mockReturnValueOnce(second as unknown as ReturnType<typeof spawn>);
    const first = await launch();
    const other = await launch();
    expect(spawn).toHaveBeenCalledTimes(2);
    executor.onModuleDestroy();
    expect(kill).toHaveBeenCalledWith(-12345, 'SIGKILL');
    expect(kill).toHaveBeenCalledWith(-777, 'SIGKILL');
    // Slots are released only after both children really closed.
    child.emit('close', null, 'SIGKILL');
    second.emit('close', null, 'SIGKILL');
    expect((await first.settled).error).toMatchObject({ code: 'INTAKE_WORKER_FAILED' });
    expect((await other.settled).error).toMatchObject({ code: 'INTAKE_WORKER_FAILED' });
    expect(jest.getTimerCount()).toBe(0);
  });

  describe('boot-time runtime check', () => {
    it('accepts a Linux host with prlimit and a valid deadline', async () => {
      jest.spyOn(fs, 'accessSync').mockReturnValue(undefined);
      await expect(executor.onModuleInit()).resolves.toBeUndefined();
    });

    it('fails fast on an invalid deadline instead of failing every document', async () => {
      jest.spyOn(fs, 'accessSync').mockReturnValue(undefined);
      const bad = new IntakeExecutorService(new ConfigService({ INTAKE_JOB_DEADLINE_MS: 'soon' }));
      await expect(bad.onModuleInit()).rejects.toThrow('INTAKE_JOB_DEADLINE_MS');
    });

    it('fails fast when the caps cannot be enforced (not Linux, or no prlimit)', async () => {
      jest.spyOn(fs, 'accessSync').mockReturnValue(undefined);
      Object.defineProperty(process, 'platform', { value: 'win32' });
      await expect(executor.onModuleInit()).rejects.toThrow('requires Linux');
      Object.defineProperty(process, 'platform', { value: 'linux' });
      jest.spyOn(fs, 'accessSync').mockImplementation(() => {
        throw new Error('ENOENT');
      });
      await expect(executor.onModuleInit()).rejects.toThrow('ENOENT');
    });

    describe('stale directory sweep (a crashed worker leaves original bytes in /tmp)', () => {
      const now = Date.now();
      const age = (ms: number) => ({ mtimeMs: now - ms }) as never;

      beforeEach(() => jest.spyOn(fs, 'accessSync').mockReturnValue(undefined));

      it('removes only our own directories older than a deadline plus the grace period', async () => {
        jest
          .mocked(readdir)
          .mockResolvedValue([
            'mizano-intake-old',
            'mizano-intake-fresh',
            'mizano-intake-alive',
            'unrelated-old',
          ] as never);
        jest
          .mocked(stat)
          .mockImplementation(((path: string) =>
            Promise.resolve(
              path.endsWith('old') ? age(10 * 60_000) : path.endsWith('alive') ? age(1500) : age(0),
            )) as never);
        jest.setSystemTime(now);
        await executor.onModuleInit();
        const removed = jest.mocked(rm).mock.calls.map(([path]) => String(path));
        expect(removed).toHaveLength(1);
        expect(removed[0]).toContain('mizano-intake-old');
      });

      it('boots even when the sweep cannot read or remove anything, logging metadata only', async () => {
        const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
        jest.mocked(readdir).mockRejectedValueOnce(new Error('EACCES /private/dir'));
        await expect(executor.onModuleInit()).resolves.toBeUndefined();
        jest.mocked(readdir).mockResolvedValue(['mizano-intake-a', 'mizano-intake-b'] as never);
        jest.mocked(stat).mockResolvedValue(age(10 * 60_000));
        jest.mocked(rm).mockRejectedValueOnce(new Error('EBUSY /private/dir'));
        await expect(executor.onModuleInit()).resolves.toBeUndefined();
        // The failing entry does not stop the next one.
        expect(rm).toHaveBeenCalledTimes(2);
        for (const [message] of warn.mock.calls) expect(String(message)).not.toContain('/private');
        expect(warn).toHaveBeenCalledTimes(2);
      });
    });
  });
});
