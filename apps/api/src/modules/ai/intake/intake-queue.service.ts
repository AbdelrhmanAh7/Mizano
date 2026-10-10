import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ConnectionOptions, Queue, Worker } from 'bullmq';
import { describeError } from '../../../common/utils/redact';
import { intakeConcurrency } from './intake-runtime';

export const INTAKE_QUEUE_NAME = 'intake';

export interface IntakeQueuePayload {
  jobId: string;
  organizationId: string;
}

export type IntakeQueueHandler = (payload: IntakeQueuePayload) => Promise<void>;

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

/**
 * BullMQ transport for intake jobs. The job row in PostgreSQL is the source of truth; the
 * queue only carries `{ jobId, organizationId }` so a lost queue entry can always be rebuilt
 * from the database. The API only produces: only the dedicated worker calls `registerHandler`.
 * Redis is required; there is no inline extraction fallback.
 */
@Injectable()
export class IntakeQueueService implements OnModuleDestroy {
  private readonly logger = new Logger(IntakeQueueService.name);
  private queue: Queue<IntakeQueuePayload> | null = null;
  private worker: Worker<IntakeQueuePayload> | null = null;

  constructor(private readonly config: ConfigService) {}

  private get redisUrl(): string | undefined {
    return this.config.get<string>('REDIS_URL') || undefined;
  }

  get concurrency(): number {
    return intakeConcurrency(this.config);
  }

  /** Called once by the processor; starts consuming. */
  registerHandler(handler: IntakeQueueHandler): void {
    const url = this.redisUrl;
    if (!url) throw new Error('REDIS_URL is required for the intake worker');
    if (this.worker) return;
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
    if (!url) throw new Error('REDIS_URL is required for intake');
    await this.getQueue(url).add('process', payload, { jobId: queueJobId, delay: delayMs });
  }

  /** Drop a pending (delayed/waiting) queue entry, e.g. a backoff retry superseded by a manual retry. */
  async cancel(queueJobId: string): Promise<void> {
    const url = this.redisUrl;
    if (!url) return;
    try {
      await this.getQueue(url).remove(queueJobId);
    } catch {
      // Active jobs cannot be removed; the processor's guarded claim makes them harmless.
    }
  }

  async isHealthy(): Promise<boolean> {
    return !!this.worker?.isRunning() && (await (await this.worker.client).ping()) === 'PONG';
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
    this.worker = null;
    this.queue = null;
  }
}
