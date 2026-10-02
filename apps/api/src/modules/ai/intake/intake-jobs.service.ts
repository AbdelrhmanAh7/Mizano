import {
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IntakeJob, IntakeJobStatus, IntakeSource, Prisma } from '@prisma/client';
import { describeError } from '../../../common/utils/redact';
import { PrismaService } from '../../../prisma/prisma.service';
import { IntakeStage } from '../services/document-intake.service';
import { IntakeQueueService } from './intake-queue.service';
import { buildIntakeStorageKey, IntakeStorage, sha256Hex } from './intake-storage';

/** Never exposes `storageKey` or the deletion marker. */
export type IntakeJobView = Omit<IntakeJob, 'storageKey' | 'deletedAt' | 'result'> & {
  result?: Prisma.JsonValue | null;
  stage: IntakeStage;
};

export interface CreateIntakeUpload {
  organizationId: string;
  userId: string;
  buffer: Buffer;
  mimeType: string;
  fileName: string;
  source?: IntakeSource;
  forceType?: 'BILL' | 'INVOICE';
  strategy?: string;
}

const DEFAULT_MAX_ACTIVE_PER_ORG = 50;
const DEFAULT_LEASE_MS = 5 * 60 * 1000;

/** How long a PROCESSING job may go without an update before another worker may take it over. */
export function intakeLeaseMs(config: ConfigService): number {
  const n = Number(config.get<string>('INTAKE_LEASE_MS'));
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_LEASE_MS;
}

/** Legacy progress stage derived from the durable status, for the progress UI. */
export function stageFor(
  job: Pick<IntakeJob, 'status' | 'progress' | 'attempts' | 'maxAttempts'>,
): IntakeStage {
  switch (job.status) {
    case IntakeJobStatus.EXTRACTED:
    case IntakeJobStatus.NEEDS_REVIEW:
    case IntakeJobStatus.APPROVED:
      return 'complete';
    case IntakeJobStatus.DEAD_LETTER:
      return 'error';
    case IntakeJobStatus.FAILED:
      // FAILED with attempts left is retried automatically.
      return job.attempts >= job.maxAttempts ? 'error' : 'received';
    case IntakeJobStatus.PROCESSING:
      return job.progress >= 80 ? 'matching' : job.progress >= 60 ? 'classifying' : 'extracting';
    default:
      return 'received';
  }
}

export function isTerminalStage(stage: IntakeStage): boolean {
  return stage === 'complete' || stage === 'error';
}

export function queueJobId(jobId: string, attempts: number): string {
  return `${jobId}-a${attempts}`;
}

@Injectable()
export class IntakeJobsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(IntakeJobsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: IntakeStorage,
    private readonly queue: IntakeQueueService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Re-enqueue QUEUED (and lease-expired PROCESSING) jobs after a restart or a lost queue entry. This is a
   * deliberate system-level sweep across tenants; each payload carries its own
   * organizationId and the processor re-checks it. Queue job ids make
   * duplicates collapse.
   */
  async onApplicationBootstrap(): Promise<void> {
    try {
      const queued = await this.prisma.intakeJob.findMany({
        where: {
          deletedAt: null,
          OR: [
            { status: IntakeJobStatus.QUEUED },
            // A worker that died mid-job leaves PROCESSING behind; reclaim once its lease expired.
            {
              status: IntakeJobStatus.PROCESSING,
              updatedAt: { lt: new Date(Date.now() - intakeLeaseMs(this.config)) },
            },
          ],
        },
        select: { id: true, organizationId: true, attempts: true },
        take: 200,
        orderBy: { createdAt: 'asc' },
      });
      for (const job of queued) {
        await this.queue.enqueue(
          { jobId: job.id, organizationId: job.organizationId },
          queueJobId(job.id, job.attempts),
        );
      }
      if (queued.length > 0) this.logger.log(`Re-enqueued ${queued.length} intake job(s)`);
    } catch (error) {
      this.logger.error(
        `Intake recovery failed: ${describeError(error, { includeMessage: false })}`,
      );
    }
  }

  toView(job: IntakeJob, includeResult: boolean): IntakeJobView {
    const { storageKey: _storageKey, deletedAt: _deletedAt, result, ...rest } = job;
    return { ...rest, ...(includeResult ? { result } : {}), stage: stageFor(job) };
  }

  /** Create (or return the existing, deduplicated) job for an upload. */
  async createFromUpload(
    input: CreateIntakeUpload,
  ): Promise<{ job: IntakeJob; duplicate: boolean }> {
    const sha256 = sha256Hex(input.buffer);
    const existing = await this.prisma.intakeJob.findFirst({
      where: { organizationId: input.organizationId, sha256 },
    });
    if (existing) return { job: this.assertNotDeleted(existing), duplicate: true };

    const configured = Number(this.config.get<string>('INTAKE_MAX_ACTIVE_JOBS'));
    const maxActive =
      Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_MAX_ACTIVE_PER_ORG;
    const active = await this.prisma.intakeJob.count({
      where: {
        organizationId: input.organizationId,
        deletedAt: null,
        status: { in: [IntakeJobStatus.QUEUED, IntakeJobStatus.PROCESSING] },
      },
    });
    if (active >= maxActive) {
      throw new HttpException(
        'Too many documents are waiting to be processed. Try again shortly.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const storageKey = buildIntakeStorageKey(input.organizationId);
    await this.storage.put(storageKey, input.buffer);

    let job: IntakeJob;
    try {
      job = await this.prisma.intakeJob.create({
        data: {
          organizationId: input.organizationId,
          createdById: input.userId,
          source: input.source ?? IntakeSource.WEB,
          originalFileName: input.fileName.slice(0, 255),
          mimeType: input.mimeType,
          sizeBytes: input.buffer.length,
          sha256,
          storageKey,
          forceType: input.forceType ?? null,
          strategy: input.strategy ?? null,
        },
      });
    } catch (error) {
      await this.storage.delete(storageKey);
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const winner = await this.prisma.intakeJob.findFirst({
          where: { organizationId: input.organizationId, sha256 },
        });
        if (winner) return { job: this.assertNotDeleted(winner), duplicate: true };
      }
      throw error;
    }

    await this.enqueueSafely(job);
    return { job, duplicate: false };
  }

  private assertNotDeleted(job: IntakeJob): IntakeJob {
    if (job.deletedAt) {
      throw new ConflictException('This document was previously removed');
    }
    return job;
  }

  /** The DB row stays QUEUED if the queue is down; bootstrap recovery picks it up. */
  private async enqueueSafely(
    job: Pick<IntakeJob, 'id' | 'organizationId' | 'attempts'>,
  ): Promise<void> {
    try {
      await this.queue.enqueue(
        { jobId: job.id, organizationId: job.organizationId },
        queueJobId(job.id, job.attempts),
      );
    } catch (error) {
      this.logger.error(
        `Enqueue failed for intake job ${job.id}: ${describeError(error, { includeMessage: false })}`,
      );
    }
  }

  /** Org-scoped lookup. Another tenant's id is indistinguishable from a missing one. */
  async getForOrg(jobId: string, organizationId: string): Promise<IntakeJob> {
    if (!organizationId) throw new NotFoundException('Intake job not found');
    const job = await this.prisma.intakeJob.findFirst({
      where: { id: jobId, organizationId, deletedAt: null },
    });
    if (!job) throw new NotFoundException('Intake job not found');
    return job;
  }

  async list(
    organizationId: string,
    query: { status?: IntakeJobStatus; page?: number; limit?: number },
  ): Promise<{
    data: IntakeJobView[];
    meta: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const where: Prisma.IntakeJobWhereInput = {
      organizationId,
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.intakeJob.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.intakeJob.count({ where }),
    ]);
    return {
      data: rows.map((row) => this.toView(row, false)),
      meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
  }

  async readOriginal(
    jobId: string,
    organizationId: string,
  ): Promise<{ job: IntakeJob; buffer: Buffer }> {
    const job = await this.getForOrg(jobId, organizationId);
    const buffer = await this.storage.get(job.storageKey, job.sha256);
    return { job, buffer };
  }

  /** FAILED/DEAD_LETTER -> QUEUED as a guarded transition; dead letters get a fresh attempt budget. */
  async retry(jobId: string, organizationId: string): Promise<IntakeJob> {
    await this.getForOrg(jobId, organizationId);
    const fromDead = await this.prisma.intakeJob.updateMany({
      where: { id: jobId, organizationId, deletedAt: null, status: IntakeJobStatus.DEAD_LETTER },
      data: { status: IntakeJobStatus.QUEUED, attempts: 0, progress: 0, lastError: null },
    });
    const fromFailed =
      fromDead.count === 0
        ? await this.prisma.intakeJob.updateMany({
            where: { id: jobId, organizationId, deletedAt: null, status: IntakeJobStatus.FAILED },
            data: { status: IntakeJobStatus.QUEUED, progress: 0, lastError: null },
          })
        : { count: 0 };
    if (fromDead.count + fromFailed.count === 0) {
      throw new ConflictException('Only failed intake jobs can be retried');
    }
    const job = await this.getForOrg(jobId, organizationId);
    await this.enqueueSafely(job);
    return job;
  }

  /** EXTRACTED/NEEDS_REVIEW -> APPROVED; returns the status to restore if the draft fails. */
  async claimForApproval(jobId: string, organizationId: string): Promise<IntakeJobStatus> {
    const previous = (await this.getForOrg(jobId, organizationId)).status;
    const claimed = await this.prisma.intakeJob.updateMany({
      where: {
        id: jobId,
        organizationId,
        deletedAt: null,
        status: { in: [IntakeJobStatus.EXTRACTED, IntakeJobStatus.NEEDS_REVIEW] },
      },
      data: { status: IntakeJobStatus.APPROVED },
    });
    if (claimed.count === 0) {
      throw new ConflictException('This intake job cannot be approved in its current state');
    }
    return previous;
  }

  async releaseApproval(
    jobId: string,
    organizationId: string,
    restore: IntakeJobStatus,
  ): Promise<void> {
    await this.prisma.intakeJob.updateMany({
      where: { id: jobId, organizationId, status: IntakeJobStatus.APPROVED, draftDocumentId: null },
      data: { status: restore },
    });
  }

  async linkDraft(
    jobId: string,
    organizationId: string,
    draft: { type: string; id: string },
  ): Promise<void> {
    await this.prisma.intakeJob.updateMany({
      where: { id: jobId, organizationId, status: IntakeJobStatus.APPROVED },
      data: { draftDocumentType: draft.type, draftDocumentId: draft.id },
    });
  }
}
