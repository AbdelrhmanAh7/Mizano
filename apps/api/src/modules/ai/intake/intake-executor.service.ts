import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'child_process';
import { accessSync, constants } from 'fs';
import { mkdtemp, readdir, readFile, rm, stat } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import type { IntakeJob } from '@prisma/client';
import { describeError } from '../../../common/utils/redact';
import type { DocumentIntakeResult } from '../services/document-intake.service';
import { intakeDeadlineMs, IntakeRuntimeError } from './intake-runtime';

const PRLIMIT = '/usr/bin/prlimit';
const TEMP_PREFIX = 'mizano-intake-';
const STALE_GRACE_MS = 60_000;
/** Resident-memory ceiling for one extraction child (V8 heap limits do not bound WASM/native memory). */
const CHILD_RSS_LIMIT_KB = 768 * 1024;
const RSS_SAMPLE_MS = 100;
/**
 * The wall-clock timer is the deadline. The kernel CPU limit is only a backstop for a stalled
 * supervisor or a multi-threaded burn, so it sits just above the deadline: at exactly the
 * deadline a single busy thread reaches both at the same instant and the outcome would be a
 * coin toss between a timeout and a resource-limit failure.
 */
const CPU_BACKSTOP_MARGIN_SECONDS = 2;

/**
 * Signals that end a child nobody asked to stop. The kernel enforces the limits we set and
 * reports each as a signal, not an exit code: the CPU rlimit (soft == hard) is a SIGKILL, the
 * V8 heap limit is an abort(), and the container OOM killer is a SIGKILL.
 */
const RESOURCE_SIGNALS: ReadonlySet<NodeJS.Signals | null> = new Set<NodeJS.Signals | null>([
  'SIGKILL',
  'SIGXCPU',
  'SIGABRT',
]);

/**
 * Runs one document at a time in a disposable, resource-capped process group and enforces a
 * hard wall-clock deadline: on expiry, lease loss or shutdown the whole group is killed and
 * the slot is released only after the child has really closed.
 */
@Injectable()
export class IntakeExecutorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IntakeExecutorService.name);
  private readonly active = new Set<AbortController>();
  private stopping = false;
  constructor(private readonly config: ConfigService) {}

  /**
   * Fail at boot, not on the first document, when the runtime cannot enforce its caps; then
   * remove private directories that a crashed worker left behind (they hold original bytes).
   */
  async onModuleInit(): Promise<void> {
    const deadline = intakeDeadlineMs(this.config);
    if (process.platform !== 'linux') {
      throw new Error('The intake worker requires Linux and /usr/bin/prlimit');
    }
    accessSync(PRLIMIT, constants.X_OK);
    await this.sweepStaleDirectories(deadline + STALE_GRACE_MS);
  }

  /**
   * Only directories older than any job could still be alive are touched: a live job's
   * directory was created at most one deadline ago and is modified after that.
   */
  private async sweepStaleDirectories(maxAgeMs: number): Promise<void> {
    const root = tmpdir();
    let names: string[] = [];
    try {
      names = (await readdir(root)).filter((n) => n.startsWith(TEMP_PREFIX));
    } catch (error) {
      this.warnSweep(error);
      return;
    }
    for (const name of names) {
      try {
        const path = join(root, name);
        if (Date.now() - (await stat(path)).mtimeMs > maxAgeMs) {
          await rm(path, { recursive: true, force: true });
        }
      } catch (error) {
        this.warnSweep(error);
      }
    }
  }

  private warnSweep(error: unknown): void {
    this.logger.warn(
      `Stale intake directory sweep failed: ${describeError(error, { includeMessage: false })}`,
    );
  }

  async run(job: IntakeJob, signal: AbortSignal): Promise<DocumentIntakeResult> {
    // Pi/Linux is the supported runtime. Never silently run uncapped on another OS.
    if (process.platform !== 'linux') throw new IntakeRuntimeError('INTAKE_WORKER_FAILED');
    const deadline = intakeDeadlineMs(this.config);
    const started = Date.now();
    const directory = await mkdtemp(join(tmpdir(), TEMP_PREFIX));
    const controller = new AbortController();
    const abort = (): void => controller.abort();
    signal.addEventListener('abort', abort, { once: true });
    this.active.add(controller);
    try {
      if (this.stopping) throw new IntakeRuntimeError('INTAKE_WORKER_FAILED');
      return await new Promise<DocumentIntakeResult>((resolve, reject) => {
        const child = spawn(
          PRLIMIT,
          [
            `--cpu=${Math.ceil(deadline / 1000) + CPU_BACKSTOP_MARGIN_SECONDS}`,
            '--core=0',
            '--nofile=128',
            '--',
            process.execPath,
            '--max-old-space-size=256',
            join(__dirname, 'intake-child.js'),
          ],
          {
            detached: true,
            stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
            // Do not forward DB, Redis, provider credentials or arbitrary NODE_OPTIONS.
            env: {
              PATH: '/usr/bin:/bin',
              TMPDIR: directory,
              OMP_THREAD_LIMIT: '1',
              INTAKE_STORAGE_DIR:
                this.config.get<string>('INTAKE_STORAGE_DIR') || './storage/intake',
              INTAKE_TESSDATA_DIR: this.config.get<string>('INTAKE_TESSDATA_DIR'),
              INTAKE_TOOL_CPU_SECONDS: String(Math.min(60, Math.ceil(deadline / 1000))),
            },
          },
        );
        let result: DocumentIntakeResult | undefined;
        let failure: IntakeRuntimeError | undefined;
        let stopping = false;
        const kill = (): void => {
          if (!child.pid) return;
          try {
            process.kill(-child.pid, 'SIGKILL');
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ESRCH') child.kill('SIGKILL');
          }
        };
        const stop = (error?: IntakeRuntimeError): void => {
          if (stopping) return;
          stopping = true;
          failure = error;
          kill();
        };
        const cancel = (): void => stop(new IntakeRuntimeError('INTAKE_WORKER_FAILED'));
        controller.signal.addEventListener('abort', cancel, { once: true });
        const timer = setTimeout(
          () => stop(new IntakeRuntimeError('INTAKE_TIMEOUT')),
          Math.max(1, deadline - (Date.now() - started)),
        );
        // WASM/native allocations are outside V8's heap. Bound resident memory too;
        // the container cgroup supplies the aggregate hard cap between samples.
        const memory = setInterval(() => {
          if (!child.pid || stopping) return;
          void readFile(`/proc/${child.pid}/status`, 'utf8')
            .then((status) => {
              const kb = Number(/^VmRSS:\s+(\d+)/m.exec(status)?.[1] ?? 0);
              if (kb > CHILD_RSS_LIMIT_KB) stop(new IntakeRuntimeError('INTAKE_RESOURCE_LIMIT'));
            })
            .catch(() => undefined);
        }, RSS_SAMPLE_MS);
        // `on`, not `once`: a second 'error' event without a listener would crash the worker.
        child.on('error', () => stop(new IntakeRuntimeError('INTAKE_WORKER_FAILED')));
        child.once('message', (message: { result?: DocumentIntakeResult }) => {
          if (stopping) return;
          result = message.result;
          stop(result ? undefined : new IntakeRuntimeError('INTAKE_WORKER_FAILED'));
        });
        child.once('close', (_code, exitSignal) => {
          clearTimeout(timer);
          clearInterval(memory);
          controller.signal.removeEventListener('abort', cancel);
          kill(); // Also kill descendants if the main child crashed before the deadline.
          if (failure) reject(failure);
          else if (result) resolve(result);
          else
            reject(
              new IntakeRuntimeError(
                RESOURCE_SIGNALS.has(exitSignal) ? 'INTAKE_RESOURCE_LIMIT' : 'INTAKE_WORKER_FAILED',
              ),
            );
        });
        if (signal.aborted || controller.signal.aborted) cancel();
        if (!stopping)
          child.send(
            {
              storageKey: job.storageKey,
              sha256: job.sha256,
              mimeType: job.mimeType,
              organizationId: job.organizationId,
              directory,
            },
            (error) => {
              if (error) stop(new IntakeRuntimeError('INTAKE_WORKER_FAILED'));
            },
          );
      });
    } finally {
      signal.removeEventListener('abort', abort);
      this.active.delete(controller);
      // Cleanup must never replace the real outcome: a finished extraction stays a success
      // and a deadline stays INTAKE_TIMEOUT. The directory name is random, never document data.
      try {
        await rm(directory, { recursive: true, force: true });
      } catch (error) {
        this.logger.warn(
          `Intake temporary directory cleanup failed: ${describeError(error, { includeMessage: false })}`,
        );
      }
    }
  }

  onModuleDestroy(): void {
    this.stopping = true;
    this.active.forEach((controller) => controller.abort());
  }
}
