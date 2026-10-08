import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ConnectionOptions, Queue, Worker } from 'bullmq';
import { describeError } from '../../../common/utils/redact';

export const INTAKE_QUEUE_NAME = 'intake';

export interface IntakeQueuePayload {
  jobId: string;
  organizationId: string;
}

export type IntakeQueueHandler = (payload: IntakeQueuePayload) => Promise<void>;

/**
 * BullMQ transport for intake jobs. The job row in PostgreSQL is the source of
 * truth; the queue only carries `{ jobId, organizationId }` so a lost queue
 * entry can always be rebuilt from the database. Without REDIS_URL (unit
 * tests, bare local runs) jobs run in-process after the delay.
 */
/** BullMQ owns its Redis connections; hand it plain options parsed from REDIS_URL. */
export function connectionFromUrl(url: string): ConnectionOptions {
  const parsed = new URL(url);
  const db = parsed.pathname.length > 1 ? Number(parsed.pathname.slice(1)) : undefined;
  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 6379,
    ...(parsed.username ? { username: decodeURIComponent(parsed.username) } : {}),
    ...(parsed.password ? { password: decodeURIComponent(parsed.password) } : {}),
    ...(db !== undefined && Number.isInteger(db) ? { db } : {}),
    ...(parsed.protocol === 'rediss:' ? { tls: {} } : {}),
    maxRetriesPerRequest: null,
  };
}

@Injectable()
export class IntakeQueueService implements OnModuleDestroy {
  private readonly logger = new Logger(IntakeQueueService.name);
  private queue: Queue<IntakeQueuePayload> | null = null;
  private worker: Worker<IntakeQueuePayload> | null = null;
  private handler: IntakeQueueHandler | null = null;
  /** In-process fallback timers keyed by queue job id (same dedup semantics as BullMQ). */
  private readonly timers = new Map<string, NodeJS.Timeout>();

  constructor(private readonly config: ConfigService) {}

  private get redisUrl(): string | undefined {
    return this.config.get<string>('REDIS_URL') || undefined;
  }

  get concurrency(): number {
    const n = Number(this.config.get<string>('INTAKE_CONCURRENCY') ?? 1);
    return Number.isInteger(n) && n >= 1 && n <= 4 ? n : 1;
  }

  /** Called once by the processor; starts consuming. */
  registerHandler(handler: IntakeQueueHandler): void {
    this.handler = handler;
    const url = this.redisUrl;
    if (!url || this.worker) return;
    this.worker = new Worker<IntakeQueuePayload>(
      INTAKE_QUEUE_NAME,
      async (job) => {
        await handler(job.data);
      },
      {
        connection: connectionFromUrl(url),
        concurrency: this.concurrency,
        // A crashed worker's active job is reclaimed after the lock expires.
        lockDuration: 60_000,
      },
    );
    this.worker.on('error', (error) => {
      this.logger.error(`Intake worker error: ${describeError(error, { includeMessage: false })}`);
    });
  }

  private getQueue(url: string): Queue<IntakeQueuePayload> {
    if (!this.queue) {
      this.queue = new Queue<IntakeQueuePayload>(INTAKE_QUEUE_NAME, {
        connection: connectionFromUrl(url),
        defaultJobOptions: { removeOnComplete: true, removeOnFail: true, attempts: 1 },
      });
    }
    return this.queue;
  }

  /**
   * Enqueue a job. `queueJobId` must be stable per logical attempt so a
   * duplicate enqueue (boot-time recovery) collapses into one queue entry.
   */
  async enqueue(payload: IntakeQueuePayload, queueJobId: string, delayMs = 0): Promise<void> {
    const url = this.redisUrl;
    if (!url) {
      if (this.timers.has(queueJobId)) return;
      const timer = setTimeout(() => {
        this.timers.delete(queueJobId);
        const handler = this.handler;
        if (!handler) return;
        handler(payload).catch((error: unknown) => {
          this.logger.error(
            `Inline intake run failed: ${describeError(error, { includeMessage: false })}`,
          );
        });
      }, delayMs);
      timer.unref();
      this.timers.set(queueJobId, timer);
      return;
    }
    await this.getQueue(url).add('process', payload, { jobId: queueJobId, delay: delayMs });
  }

  /** Drop a pending (delayed/waiting) queue entry, e.g. a backoff retry superseded by a manual retry. */
  async cancel(queueJobId: string): Promise<void> {
    const timer = this.timers.get(queueJobId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(queueJobId);
    }
    const url = this.redisUrl;
    if (!url) return;
    try {
      await this.getQueue(url).remove(queueJobId);
    } catch {
      // Active jobs cannot be removed; the processor's guarded claim makes them harmless.
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.timers.forEach((t) => clearTimeout(t));
    this.timers.clear();
    await this.worker?.close();
    await this.queue?.close();
    this.worker = null;
    this.queue = null;
  }

  /** True when Redis answers on the consumer (or producer) connection; always true without REDIS_URL. */
  async isHealthy(): Promise<boolean> {
    if (!this.redisUrl) return true;
    try {
      const client = await (this.worker ?? this.queue)?.client;
      if (!client) return false;
      await client.ping();
      return true;
    } catch {
      return false;
    }
  }
}
