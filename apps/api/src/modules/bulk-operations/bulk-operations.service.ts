import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { v4 as uuidv4 } from 'uuid';
import { BulkActionType, BulkEntityType, BulkJobState } from './dto/bulk-operation.dto';

const BULK_JOB_TTL = 10 * 60 * 1000; // 10 minutes

@Injectable()
export class BulkOperationsService {
  private readonly logger = new Logger(BulkOperationsService.name);
  private readonly jobs = new Map<string, BulkJobState>();

  constructor(private readonly eventEmitter: EventEmitter2) {
    // Cleanup stale jobs every 5 minutes
    setInterval(() => this.cleanupStaleJobs(), 5 * 60 * 1000);
  }

  createJob(
    organizationId: string,
    ids: string[],
    entityType: BulkEntityType,
    action: BulkActionType,
  ): BulkJobState {
    const jobId = uuidv4();
    const job: BulkJobState = {
      jobId,
      organizationId,
      entityType,
      action,
      status: 'pending',
      ids,
      processed: 0,
      total: ids.length,
      failures: [],
      startedAt: new Date(),
    };
    this.jobs.set(jobId, job);
    return job;
  }

  getJob(jobId: string): BulkJobState | undefined {
    return this.jobs.get(jobId);
  }

  async processJob(
    jobId: string,
    processFn: (id: string, index: number) => Promise<void>,
    chunkSize = 10,
  ): Promise<BulkJobState> {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    job.status = 'running';
    this.emitProgress(job);

    const chunks = this.chunkArray(job.ids, chunkSize);

    for (const chunk of chunks) {
      const results = await Promise.allSettled(
        chunk.map((id, idx) =>
          processFn(id, job.processed + idx).catch((error: Error) => {
            job.failures.push({ id, reason: error.message });
            throw error;
          }),
        ),
      );

      const _successCount = results.filter((r) => r.status === 'fulfilled').length;
      job.processed += chunk.length;
      this.emitProgress(job);

      // Small delay between chunks to allow event propagation
      if (chunks.indexOf(chunk) < chunks.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }

    job.status = job.failures.length === job.total ? 'failed' : 'completed';
    job.completedAt = new Date();
    this.emitProgress(job);

    return job;
  }

  private emitProgress(job: BulkJobState): void {
    this.eventEmitter.emit(`bulk-operation.progress.${job.jobId}`, {
      jobId: job.jobId,
      status: job.status,
      processed: job.processed,
      total: job.total,
      progress: job.total > 0 ? Math.round((job.processed / job.total) * 100) : 0,
      failures: job.failures,
    });
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  private cleanupStaleJobs(): void {
    const now = Date.now();
    for (const [jobId, job] of this.jobs.entries()) {
      if (now - job.startedAt.getTime() > BULK_JOB_TTL) {
        this.jobs.delete(jobId);
        this.logger.debug(`Cleaned up stale bulk job: ${jobId}`);
      }
    }
  }
}
