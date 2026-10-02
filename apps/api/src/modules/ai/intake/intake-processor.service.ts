import { randomUUID } from 'crypto';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IntakeJob, IntakeJobStatus, Prisma } from '@prisma/client';
import { describeError } from '../../../common/utils/redact';
import { PrismaService } from '../../../prisma/prisma.service';
import { DocumentIntakeResult, DocumentIntakeService } from '../services/document-intake.service';
import { intakeLeaseMs, queueJobId } from './intake-jobs.service';
import { IntakeQueuePayload, IntakeQueueService } from './intake-queue.service';
import { IntakeStorage } from './intake-storage';

const LOW_CONFIDENCE = 0.6;
const DEFAULT_RETRY_BASE_MS = 5000;

/** Decide whether an accountant must look before approval. */
export function needsReview(result: DocumentIntakeResult): boolean {
  const fields = result.extractedFields;
  return (
    result.ocrConfidence < LOW_CONFIDENCE ||
    fields.total === null ||
    fields.date === null ||
    result.documentType === 'OTHER' ||
    result.duplicateWarning?.isDuplicate === true
  );
}

class LeaseLostError extends Error {
  constructor() {
    super('Intake lease lost');
    this.name = 'LeaseLostError';
  }
}

@Injectable()
export class IntakeProcessorService implements OnModuleInit {
  private readonly logger = new Logger(IntakeProcessorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: IntakeStorage,
    private readonly intake: DocumentIntakeService,
    private readonly queue: IntakeQueueService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    this.queue.registerHandler((payload) => this.handle(payload));
  }

  private numberConfig(key: string, fallback: number): number {
    const n = Number(this.config.get<string>(key));
    return Number.isFinite(n) && n > 0 ? n : fallback;
  }

  /**
   * Run one job. Idempotent: only one caller can win the guarded
   * QUEUED/FAILED -> PROCESSING transition (a PROCESSING row whose lease
   * expired is also reclaimable, which is how a crashed worker is recovered).
   * The winner holds a lease token that a heartbeat renews; every later write
   * is guarded by that token, so a worker that lost its lease cannot clobber
   * the new owner.
   */
  async handle(payload: IntakeQueuePayload): Promise<void> {
    const { jobId, organizationId } = payload;
    const leaseMs = intakeLeaseMs(this.config);
    const now = new Date();
    const leaseToken = randomUUID();
    const claim = await this.prisma.intakeJob.updateMany({
      where: {
        id: jobId,
        organizationId,
        deletedAt: null,
        OR: [
          { status: { in: [IntakeJobStatus.QUEUED, IntakeJobStatus.FAILED] } },
          {
            status: IntakeJobStatus.PROCESSING,
            OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lt: now } }],
          },
        ],
      },
      data: {
        status: IntakeJobStatus.PROCESSING,
        progress: 10,
        attempts: { increment: 1 },
        leaseToken,
        leaseExpiresAt: new Date(now.getTime() + leaseMs),
      },
    });
    if (claim.count === 0) {
      await this.rescheduleIfLeased(jobId, organizationId);
      return;
    }

    const job = await this.prisma.intakeJob.findFirst({
      where: { id: jobId, organizationId, deletedAt: null, leaseToken },
    });
    if (!job) return;

    let lost: (error: Error) => void = () => undefined;
    const lostLease = new Promise<never>((_, reject) => {
      lost = reject;
    });
    lostLease.catch(() => undefined);
    const heartbeat = setInterval(
      () => {
        this.prisma.intakeJob
          .updateMany({
            where: { id: jobId, organizationId, status: IntakeJobStatus.PROCESSING, leaseToken },
            data: { leaseExpiresAt: new Date(Date.now() + leaseMs) },
          })
          .then((res) => {
            if (res.count === 0) lost(new LeaseLostError());
          })
          .catch(() => undefined);
      },
      Math.max(100, Math.floor(leaseMs / 3)),
    );

    try {
      const buffer = await this.storage.get(job.storageKey, job.sha256);
      const result = await Promise.race([
        this.intake.processDocument(
          organizationId,
          buffer,
          job.mimeType,
          job.originalFileName,
          job.language ?? 'eng+ara',
          (_stage, progress) => {
            void this.prisma.intakeJob
              .updateMany({
                where: {
                  id: jobId,
                  organizationId,
                  status: IntakeJobStatus.PROCESSING,
                  leaseToken,
                },
                data: { progress },
              })
              .catch(() => undefined);
          },
          job.strategy ?? undefined,
        ),
        lostLease,
      ]);
      const status = needsReview(result) ? IntakeJobStatus.NEEDS_REVIEW : IntakeJobStatus.EXTRACTED;
      const written = await this.prisma.intakeJob.updateMany({
        where: { id: jobId, organizationId, status: IntakeJobStatus.PROCESSING, leaseToken },
        data: {
          status,
          progress: 100,
          lastError: null,
          leaseToken: null,
          leaseExpiresAt: null,
          result: JSON.parse(JSON.stringify(result)) as Prisma.InputJsonValue,
        },
      });
      if (written.count === 0) throw new LeaseLostError();
      this.logger.log(`Intake job ${jobId} finished: status=${status} attempts=${job.attempts}`);
    } catch (error) {
      if (error instanceof LeaseLostError) {
        this.logger.warn(`Intake job ${jobId} lost its lease; abandoning this run`);
        return;
      }
      await this.recordFailure(job, leaseToken, error);
    } finally {
      clearInterval(heartbeat);
    }
  }

  /** A delivery that finds a live lease must not vanish: check again when the lease expires. */
  private async rescheduleIfLeased(jobId: string, organizationId: string): Promise<void> {
    const row = await this.prisma.intakeJob.findFirst({
      where: { id: jobId, organizationId, deletedAt: null, status: IntakeJobStatus.PROCESSING },
    });
    if (!row?.leaseExpiresAt) return;
    const delay = Math.max(0, row.leaseExpiresAt.getTime() - Date.now()) + 100;
    await this.queue.enqueue(
      { jobId, organizationId },
      `${jobId}-l${row.leaseExpiresAt.getTime()}`,
      delay,
    );
  }

  private async recordFailure(job: IntakeJob, leaseToken: string, error: unknown): Promise<void> {
    // Extractor errors may quote document text: keep the error type/code only.
    const lastError = describeError(error, { includeMessage: false }).slice(0, 200);
    // `job` was read after the claim, so job.attempts already counts this run.
    const attempts = job.attempts;
    const dead = attempts >= job.maxAttempts;
    const status = dead ? IntakeJobStatus.DEAD_LETTER : IntakeJobStatus.FAILED;
    const moved = await this.prisma.intakeJob.updateMany({
      where: {
        id: job.id,
        organizationId: job.organizationId,
        status: IntakeJobStatus.PROCESSING,
        leaseToken,
      },
      data: { status, lastError, progress: 0, leaseToken: null, leaseExpiresAt: null },
    });
    this.logger.error(
      `Intake job ${job.id} failed: status=${status} attempts=${attempts}/${job.maxAttempts} error=${lastError}`,
    );
    if (dead || moved.count === 0) return;
    const delay =
      this.numberConfig('INTAKE_RETRY_BASE_MS', DEFAULT_RETRY_BASE_MS) * 2 ** (attempts - 1);
    await this.queue.enqueue(
      { jobId: job.id, organizationId: job.organizationId },
      queueJobId(job.id, attempts),
      delay,
    );
  }
}
