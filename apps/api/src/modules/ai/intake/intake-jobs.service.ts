import {
  BadRequestException,
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
import { INTAKE_DRAFT_ENTITY, parseIntakeDraftMarker } from './intake-draft-marker';
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

const RECOVERY_BATCH = 200;
const MAX_SWEEP_INTERVAL_MS = 30_000;
/** An APPROVED job still without its draft after this long lost its confirm request. */
const DEFAULT_APPROVAL_GRACE_MS = 10 * 60 * 1000;

/** `lastError` of a job whose approval was interrupted before any draft was created. */
export const INTAKE_APPROVAL_INTERRUPTED = 'INTAKE_APPROVAL_INTERRUPTED';

/** The currency read from a stored result, or null when the reader found none. */
function readCurrency(result: Prisma.JsonValue | null): string | null {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return null;
  const fields = (result as Record<string, unknown>).extractedFields;
  if (!fields || typeof fields !== 'object') return null;
  const currency = (fields as Record<string, unknown>).currency;
  return typeof currency === 'string' && currency.trim() !== '' ? currency : null;
}

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
    await this.recoverApprovals();
    // Periodic sweep (interval <= lease) so a crashed worker's job is always reclaimed.
    const interval = Math.max(500, Math.min(MAX_SWEEP_INTERVAL_MS, intakeLeaseMs(this.config) / 2));
    this.sweepTimer = setInterval(() => {
      void this.recoverJobs();
      void this.recoverApprovals();
    }, interval);
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
    // An API process without Redis cannot hand rows to the worker; the worker's own sweep does it.
    if (!this.queue.isAvailable()) return 0;
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
    } catch (error) {
      this.logger.error(
        `Intake recovery failed: ${describeError(error, { includeMessage: false })}`,
      );
    }
    return enqueued;
  }

  /**
   * Repair APPROVED jobs that still have no draft link after the grace period (the confirm
   * request died between the approval claim and the draft). If the job's INTAKE_DRAFT marker
   * exists, link the draft it names (defensive: today the marker and the link commit together);
   * otherwise no draft was created, so reopen the job for review with the stable code
   * INTAKE_APPROVAL_INTERRUPTED. Both writes are guarded by APPROVED + no link, and a confirm
   * that commits later fails its own guarded link and rolls back, so a job never ends with two
   * drafts. Cross-tenant system sweep like `recoverJobs`; every lookup and write is scoped by the
   * job's own organizationId.
   *
   * Only claims that recorded their draft type are swept. The earlier code linked the draft in a
   * separate step and wrote no type at claim time, so an older APPROVED job without a link may
   * have a draft no marker names: it is left alone rather than reopened for a second draft.
   */
  async recoverApprovals(now: Date = new Date()): Promise<{ linked: number; reopened: number }> {
    const counts = { linked: 0, reopened: 0 };
    const configured = Number(this.config.get<string>('INTAKE_APPROVAL_GRACE_MS'));
    const graceMs =
      Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_APPROVAL_GRACE_MS;
    try {
      const stuck = await this.prisma.intakeJob.findMany({
        where: {
          deletedAt: null,
          status: IntakeJobStatus.APPROVED,
          draftDocumentId: null,
          draftDocumentType: { not: null },
          updatedAt: { lt: new Date(now.getTime() - graceMs) },
        },
        select: { id: true, organizationId: true },
        orderBy: { id: 'asc' },
        take: RECOVERY_BATCH,
      });
      for (const job of stuck) {
        const guard = {
          id: job.id,
          organizationId: job.organizationId,
          deletedAt: null,
          status: IntakeJobStatus.APPROVED,
          draftDocumentId: null,
        };
        const marker = await this.prisma.auditLog.findFirst({
          where: {
            organizationId: job.organizationId,
            entityType: INTAKE_DRAFT_ENTITY,
            entityId: job.id,
          },
          orderBy: { createdAt: 'desc' },
          select: { newValues: true },
        });
        const draft = parseIntakeDraftMarker(marker?.newValues ?? null);
        if (draft) {
          const res = await this.prisma.intakeJob.updateMany({ where: guard, data: draft });
          counts.linked += res.count;
        } else {
          const res = await this.prisma.intakeJob.updateMany({
            where: guard,
            data: {
              status: IntakeJobStatus.NEEDS_REVIEW,
              lastError: INTAKE_APPROVAL_INTERRUPTED,
              draftDocumentType: null,
            },
          });
          counts.reopened += res.count;
        }
      }
      if (counts.linked + counts.reopened > 0) {
        this.logger.warn(
          `Recovered interrupted intake approvals: linked=${counts.linked} reopened=${counts.reopened}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Intake approval recovery failed: ${describeError(error, { includeMessage: false })}`,
      );
    }
    return counts;
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

    // Fail before any side effect (stored file, DB row): a job nothing can consume must not exist.
    this.queue.assertAvailable();

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
    this.queue.assertAvailable();
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

  /**
   * EXTRACTED/NEEDS_REVIEW -> APPROVED; returns the status to restore if the draft fails.
   * A currency the reader could not find is never assumed: the person must pick one. The claim
   * records the draft type it is about to create, which marks it for `recoverApprovals`.
   */
  async claimForApproval(
    jobId: string,
    organizationId: string,
    draft: { type: 'BILL' | 'INVOICE'; currencyCode?: string },
  ): Promise<IntakeJobStatus> {
    const current = await this.getForOrg(jobId, organizationId);
    const previous = current.status;
    const claimable =
      current.status === IntakeJobStatus.EXTRACTED ||
      current.status === IntakeJobStatus.NEEDS_REVIEW;
    if (claimable && !readCurrency(current.result) && !draft.currencyCode?.trim()) {
      throw new BadRequestException(
        'The currency could not be read from the document; choose the currency before approving',
      );
    }
    const claimed = await this.prisma.intakeJob.updateMany({
      where: {
        id: jobId,
        organizationId,
        deletedAt: null,
        status: { in: [IntakeJobStatus.EXTRACTED, IntakeJobStatus.NEEDS_REVIEW] },
      },
      data: {
        status: IntakeJobStatus.APPROVED,
        draftDocumentType: draft.type === 'BILL' ? 'bill' : 'invoice',
      },
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
      data: { status: restore, draftDocumentType: null },
    });
  }
}
