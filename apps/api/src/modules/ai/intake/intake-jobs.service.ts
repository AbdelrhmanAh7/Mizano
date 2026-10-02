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
import { Decimal } from '@prisma/client/runtime/library';
import { describeError } from '../../../common/utils/redact';
import { endOfUtcDay } from '../../reports/utils/report-utils';
import { PrismaService } from '../../../prisma/prisma.service';
import { DocumentIntakeResult, IntakeStage } from '../services/document-intake.service';
import { buildBillConfirmation, IntakeBlockerCode } from './intake-bulk-approve';
import { IntakeQueueService } from './intake-queue.service';
import { buildIntakeStorageKey, IntakeStorage, sha256Hex } from './intake-storage';

/** Never exposes `storageKey` or the deletion marker. */
export type IntakeJobView = Omit<IntakeJob, 'storageKey' | 'deletedAt' | 'result'> & {
  result?: Prisma.JsonValue | null;
  stage: IntakeStage;
};

/** Inbox row data derived from the stored result; never includes raw document text. */
export interface IntakeJobSummary {
  documentType: string | null;
  vendorName: string | null;
  documentNumber: string | null;
  date: string | null;
  /** Fixed 4-dp decimal string. */
  total: string | null;
  currency: string | null;
  confidence: number | null;
  /** EXTRACTED and complete enough for bulk approval. */
  readyToApprove: boolean;
  blocker: IntakeBlockerCode | null;
}

export type IntakeJobListItem = Omit<IntakeJobView, 'result'> & { summary: IntakeJobSummary };

export interface ListIntakeJobsQuery {
  status?: IntakeJobStatus | IntakeJobStatus[];
  source?: IntakeSource;
  /** Inclusive date-only bounds on createdAt. */
  from?: string;
  to?: string;
  search?: string;
  page?: number;
  limit?: number;
}

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

  /** Base currency of the organization; drafts in another currency are never bulk-approved. */
  async baseCurrency(organizationId: string): Promise<string | null> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { baseCurrency: true },
    });
    return org?.baseCurrency ?? null;
  }

  summarize(job: IntakeJob, baseCurrency: string | null): IntakeJobSummary {
    const result = (job.result ?? null) as DocumentIntakeResult | null;
    const fields = result?.extractedFields;
    let total: string | null = null;
    if (fields?.total !== null && fields?.total !== undefined) {
      try {
        total = new Decimal(String(fields.total)).toFixed(4);
      } catch {
        total = null;
      }
    }
    const confirmation =
      job.status === IntakeJobStatus.EXTRACTED
        ? buildBillConfirmation(result, { baseCurrency })
        : null;
    return {
      documentType: result?.documentType ?? null,
      vendorName: result?.matchedVendor?.name ?? fields?.vendorName ?? null,
      documentNumber: fields?.documentNumber ?? null,
      date: fields?.date ?? null,
      total,
      currency: fields?.currency ?? null,
      confidence: typeof result?.ocrConfidence === 'number' ? result.ocrConfidence : null,
      readyToApprove: confirmation?.ok === true,
      blocker: confirmation && !confirmation.ok ? confirmation.code : null,
    };
  }

  async list(
    organizationId: string,
    query: ListIntakeJobsQuery,
  ): Promise<{
    data: IntakeJobListItem[];
    meta: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const search = query.search?.trim();
    // JSON string filters are case-sensitive in Prisma, so match ids with ILIKE (org-scoped).
    let searchIds: string[] | null = null;
    if (search) {
      const pattern = `%${search.replace(/[\\%_]/g, '\\$&')}%`;
      const matches = await this.prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT "id" FROM "intake_jobs"
        WHERE "organizationId" = ${organizationId} AND "deletedAt" IS NULL AND (
          "originalFileName" ILIKE ${pattern}
          OR "result"->'extractedFields'->>'vendorName' ILIKE ${pattern}
          OR "result"->'matchedVendor'->>'name' ILIKE ${pattern}
          OR "result"->'extractedFields'->>'documentNumber' ILIKE ${pattern}
        )`);
      searchIds = matches.map((m) => m.id);
    }
    const createdAt: Prisma.DateTimeFilter = {};
    if (query.from) createdAt.gte = new Date(query.from);
    if (query.to) createdAt.lte = endOfUtcDay(new Date(query.to));
    // An empty status list (`?status=`) means "no status filter", not "no rows".
    const statuses = Array.isArray(query.status) ? query.status : [query.status];
    const statusFilter = statuses.filter((s): s is IntakeJobStatus => Boolean(s));
    const where: Prisma.IntakeJobWhereInput = {
      organizationId,
      deletedAt: null,
      ...(statusFilter.length > 0 ? { status: { in: statusFilter } } : {}),
      ...(query.source ? { source: query.source } : {}),
      ...(query.from || query.to ? { createdAt } : {}),
      ...(searchIds ? { id: { in: searchIds } } : {}),
    };
    const [rows, total, baseCurrency] = await Promise.all([
      this.prisma.intakeJob.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.intakeJob.count({ where }),
      this.baseCurrency(organizationId),
    ]);
    return {
      data: rows.map((row) => ({
        ...this.toView(row, false),
        summary: this.summarize(row, baseCurrency),
      })),
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
  async claimForApproval(jobId: string, organizationId: string): Promise<IntakeJobStatus> {
    const current = await this.getForOrg(jobId, organizationId);
    const previous = current.status;
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
