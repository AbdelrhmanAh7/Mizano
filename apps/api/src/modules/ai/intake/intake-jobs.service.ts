import {
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
  OnModuleDestroy,
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
  language?: string;
}

const DEFAULT_MAX_ACTIVE_PER_ORG = 50;
const DEFAULT_LEASE_MS = 5 * 60 * 1000;
const DEFAULT_RETRY_BASE_MS = 5000;
export const DEFAULT_APPROVAL_GRACE_MS = 5 * 60 * 1000;

/** AuditLog.entityType of the per-job idempotency record of a created draft. */
export const INTAKE_DRAFT_ENTITY = 'INTAKE_DRAFT';

/** How long a PROCESSING job may go without an update before another worker may take it over. */
export function intakeLeaseMs(config: ConfigService): number {
  const n = Number(config.get<string>('INTAKE_LEASE_MS'));
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_LEASE_MS;
}

/** How long an APPROVED job may remain without draftDocumentId before recovery sweep claims or reopens it. */
export function intakeApprovalGraceMs(config: ConfigService): number {
  const n = Number(config.get<string>('INTAKE_APPROVAL_GRACE_MS'));
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_APPROVAL_GRACE_MS;
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
    case IntakeJobStatus.FAILED:
      // FAILED is terminal for the UI (it offers Retry) even though a backoff retry may follow.
      return 'error';
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

/**
 * Row-locks one intake job for the rest of the transaction.
 * Scoped by organization: another tenant's job id matches nothing and is never locked.
 */
export async function lockIntakeJob(
  tx: Prisma.TransactionClient,
  organizationId: string,
  jobId: string,
): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "intake_jobs" WHERE id = ${jobId} AND "organizationId" = ${organizationId} FOR UPDATE`;
}

const RECOVERY_BATCH = 200;
const MAX_SWEEP_INTERVAL_MS = 30_000;

@Injectable()
export class IntakeJobsService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(IntakeJobsService.name);
  private sweepTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: IntakeStorage,
    private readonly queue: IntakeQueueService,
    private readonly config: ConfigService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.recoverJobs();
    // Periodic sweep (interval <= lease) so a crashed worker's job is always reclaimed.
    const interval = Math.max(500, Math.min(MAX_SWEEP_INTERVAL_MS, intakeLeaseMs(this.config) / 2));
    this.sweepTimer = setInterval(() => void this.recoverJobs(), interval);
    this.sweepTimer.unref();
  }

  onModuleDestroy(): void {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    this.sweepTimer = null;
  }

  /**
   * Re-enqueue QUEUED jobs, FAILED jobs awaiting a retry and PROCESSING jobs whose lease
   * expired. A deliberate system-level sweep across tenants: every payload carries its own
   * organizationId and the processor re-checks it. Queue job ids make duplicates collapse.
   * Pages through all recoverable rows. Returns the number of jobs enqueued.
   */
  async recoverJobs(): Promise<number> {
    let enqueued = 0;
    try {
      let after = '';
      for (;;) {
        const now = new Date();
        const batch = await this.prisma.intakeJob.findMany({
          where: {
            deletedAt: null,
            id: { gt: after },
            OR: [
              { status: IntakeJobStatus.QUEUED },
              { status: IntakeJobStatus.FAILED },
              {
                status: IntakeJobStatus.PROCESSING,
                OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lt: now } }],
              },
            ],
          },
          select: { id: true, organizationId: true, attempts: true, status: true, updatedAt: true },
          orderBy: { id: 'asc' },
          take: RECOVERY_BATCH,
        });
        for (const job of batch) {
          const queueId =
            job.status === IntakeJobStatus.PROCESSING
              ? `${job.id}-s${job.attempts}`
              : queueJobId(job.id, job.attempts);
          let delay = 0;
          if (job.status === IntakeJobStatus.FAILED) {
            const configured = Number(this.config.get<string>('INTAKE_RETRY_BASE_MS'));
            const base =
              Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_RETRY_BASE_MS;
            delay = Math.max(
              0,
              base * 2 ** (job.attempts - 1) - (Date.now() - job.updatedAt.getTime()),
            );
          }
          await this.queue.enqueue(
            { jobId: job.id, organizationId: job.organizationId },
            queueId,
            delay,
          );
          enqueued += 1;
        }
        if (batch.length < RECOVERY_BATCH) break;
        after = batch[batch.length - 1].id;
      }
      if (enqueued > 0) this.logger.log(`Re-enqueued ${enqueued} intake job(s)`);

      await this.recoverApprovedJobs();
    } catch (error) {
      this.logger.error(
        `Intake recovery failed: ${describeError(error, { includeMessage: false })}`,
      );
    }
    return enqueued;
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
      where: { organizationId: input.organizationId, sha256, deletedAt: null },
    });
    if (existing) return { job: existing, duplicate: true };

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
          language: input.language ?? null,
        },
      });
    } catch (error) {
      await this.storage.delete(storageKey);
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const winner = await this.prisma.intakeJob.findFirst({
          where: { organizationId: input.organizationId, sha256, deletedAt: null },
        });
        if (winner) return { job: winner, duplicate: true };
      }
      throw error;
    }

    await this.enqueueSafely(job);
    return { job, duplicate: false };
  }

  /** The DB row stays QUEUED if the queue is down; bootstrap recovery picks it up. */
  private async enqueueSafely(
    job: Pick<IntakeJob, 'id' | 'organizationId' | 'attempts'>,
    queueId: string = queueJobId(job.id, job.attempts),
  ): Promise<void> {
    try {
      await this.queue.enqueue({ jobId: job.id, organizationId: job.organizationId }, queueId);
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
    const before = await this.getForOrg(jobId, organizationId);
    const pendingQueueId = queueJobId(before.id, before.attempts);
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
    // Supersede a pending backoff entry, and use a fresh queue id so the retry can never
    // collapse into a stale entry for the same attempt number.
    await this.queue.cancel(pendingQueueId);
    await this.enqueueSafely(job, `${job.id}-r${Date.now()}`);
    return job;
  }

  /** EXTRACTED/NEEDS_REVIEW -> APPROVED; returns the status to restore if the draft fails. */
  async claimForApproval(
    jobId: string,
    organizationId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<IntakeJobStatus> {
    const db = tx ?? this.prisma;
    const current = tx
      ? await tx.intakeJob.findFirst({ where: { id: jobId, organizationId, deletedAt: null } })
      : await this.getForOrg(jobId, organizationId);
    if (!current) throw new NotFoundException('Intake job not found');
    const previous = current.status;
    const claimed = await db.intakeJob.updateMany({
      where: {
        id: jobId,
        organizationId,
        deletedAt: null,
        status: { in: [IntakeJobStatus.EXTRACTED, IntakeJobStatus.NEEDS_REVIEW] },
      },
      data: { status: IntakeJobStatus.APPROVED },
    });
    if (claimed.count === 0) {
      throw new ConflictException({
        message: 'This intake job cannot be approved in its current state',
        draftDocumentType: current.draftDocumentType,
        draftDocumentId: current.draftDocumentId,
      });
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

  /** Claim, draft and link commit together; recovery cannot reopen an in-flight confirmation. */
  async confirmWithApproval<T extends { type: string; id: string }>(
    jobId: string,
    organizationId: string,
    createDraft: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await lockIntakeJob(tx, organizationId, jobId);
      await this.claimForApproval(jobId, organizationId, tx);
      const draft = await createDraft(tx);
      const linked = await tx.intakeJob.updateMany({
        where: {
          id: jobId,
          organizationId,
          deletedAt: null,
          status: IntakeJobStatus.APPROVED,
          draftDocumentId: null,
        },
        data: { draftDocumentType: draft.type, draftDocumentId: draft.id },
      });
      if (linked.count === 0) throw new ConflictException('Intake job could not be linked');
      return draft;
    });
  }

  async linkDraft(
    jobId: string,
    organizationId: string,
    draft: { type: string; id: string },
  ): Promise<void> {
    await this.prisma.intakeJob.updateMany({
      where: {
        id: jobId,
        organizationId,
        deletedAt: null,
        status: IntakeJobStatus.APPROVED,
        draftDocumentId: null,
      },
      data: { draftDocumentType: draft.type, draftDocumentId: draft.id },
    });
  }

  /**
   * Recovers APPROVED jobs that have no draftDocumentId (e.g. process crashed between approval
   * claim and draft linking).
   *
   * For each job older than the grace period:
   * 1. Looks up the INTAKE_DRAFT audit marker (strictly org-scoped).
   * 2. If marker and draft exist: links the draft with a guarded org-scoped update.
   * 3. If no draft exists: marks the job back to EXTRACTED with a redacted lastError
   *    so the accountant can confirm again.
   *
   * Never creates a draft during recovery.
   */
  async recoverApprovedJobs(options?: {
    organizationId?: string;
    now?: Date;
    graceMs?: number;
  }): Promise<{ linked: number; reopened: number }> {
    let linked = 0;
    let reopened = 0;
    const now = options?.now ?? new Date();
    const graceMs = options?.graceMs ?? intakeApprovalGraceMs(this.config);
    const cutoff = new Date(now.getTime() - graceMs);

    try {
      let after = '';
      for (;;) {
        const batch = await this.prisma.intakeJob.findMany({
          where: {
            deletedAt: null,
            id: { gt: after },
            status: IntakeJobStatus.APPROVED,
            draftDocumentId: null,
            updatedAt: { lt: cutoff },
            ...(options?.organizationId ? { organizationId: options.organizationId } : {}),
          },
          select: {
            id: true,
            organizationId: true,
            status: true,
            updatedAt: true,
          },
          orderBy: { id: 'asc' },
          take: RECOVERY_BATCH,
        });

        for (const job of batch) {
          const outcome = await this.recoverSingleApprovedJob(job.id, job.organizationId);
          if (outcome === 'linked') linked += 1;
          else if (outcome === 'reopened') reopened += 1;
        }

        if (batch.length < RECOVERY_BATCH) break;
        after = batch[batch.length - 1].id;
      }

      if (linked > 0 || reopened > 0) {
        this.logger.log(`Recovered approved intake jobs: linked=${linked}, reopened=${reopened}`);
      }
    } catch (error) {
      this.logger.error(
        `Intake approved jobs recovery failed: ${describeError(error, { includeMessage: false })}`,
      );
    }

    return { linked, reopened };
  }

  private async recoverSingleApprovedJob(
    jobId: string,
    organizationId: string,
  ): Promise<'linked' | 'reopened' | 'none'> {
    return this.prisma.$transaction(async (tx) => {
      await lockIntakeJob(tx, organizationId, jobId);

      const marker = await tx.auditLog.findFirst({
        where: { organizationId, entityType: INTAKE_DRAFT_ENTITY, entityId: jobId },
        orderBy: { createdAt: 'desc' },
        select: { newValues: true },
      });

      let draftInfo: { type: string; id: string } | null = null;
      if (marker && marker.newValues && typeof marker.newValues === 'object') {
        const v = marker.newValues as Record<string, unknown>;
        const draftType = typeof v.draftType === 'string' ? v.draftType : null;
        const draftId = typeof v.draftId === 'string' ? v.draftId : null;
        if (draftType && draftId) {
          const exists = await this.verifyDraftExists(organizationId, draftType, draftId, tx);
          if (exists) {
            draftInfo = { type: draftType.toLowerCase(), id: draftId };
          }
        }
      }

      if (draftInfo) {
        const updated = await tx.intakeJob.updateMany({
          where: {
            id: jobId,
            organizationId,
            deletedAt: null,
            status: IntakeJobStatus.APPROVED,
            draftDocumentId: null,
          },
          data: {
            draftDocumentType: draftInfo.type,
            draftDocumentId: draftInfo.id,
          },
        });
        if (updated.count > 0) {
          this.logger.log(
            `Recovered intake job ${jobId}: linked draft ${draftInfo.type}:${draftInfo.id} for org ${organizationId}`,
          );
          return 'linked';
        }
        return 'none';
      }

      const reopened = await tx.intakeJob.updateMany({
        where: {
          id: jobId,
          organizationId,
          deletedAt: null,
          status: IntakeJobStatus.APPROVED,
          draftDocumentId: null,
        },
        data: {
          status: IntakeJobStatus.EXTRACTED,
          lastError: 'Approval interrupted before draft creation; ready to confirm again',
        },
      });
      if (reopened.count > 0) {
        this.logger.warn(
          `Recovered intake job ${jobId}: no draft found for org ${organizationId}; reopened to EXTRACTED`,
        );
        return 'reopened';
      }
      return 'none';
    });
  }

  private async verifyDraftExists(
    organizationId: string,
    draftType: string,
    draftId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<boolean> {
    const db = tx ?? this.prisma;
    const type = draftType.toLowerCase();
    if (type === 'bill') {
      const bill = await db.bill.findFirst({
        where: { id: draftId, organizationId, deletedAt: null },
        select: { id: true },
      });
      return !!bill;
    }
    if (type === 'invoice') {
      const invoice = await db.invoice.findFirst({
        where: { id: draftId, organizationId, deletedAt: null },
        select: { id: true },
      });
      return !!invoice;
    }
    if (type === 'expense') {
      const expense = await db.expense.findFirst({
        where: { id: draftId, organizationId, deletedAt: null },
        select: { id: true },
      });
      return !!expense;
    }
    return false;
  }
}
