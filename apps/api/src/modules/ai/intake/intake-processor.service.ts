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
   */
  async handle(payload: IntakeQueuePayload): Promise<void> {
    const { jobId, organizationId } = payload;
    const leaseCutoff = new Date(Date.now() - intakeLeaseMs(this.config));
    const claim = await this.prisma.intakeJob.updateMany({
      where: {
        id: jobId,
        organizationId,
        deletedAt: null,
        OR: [
          { status: { in: [IntakeJobStatus.QUEUED, IntakeJobStatus.FAILED] } },
          { status: IntakeJobStatus.PROCESSING, updatedAt: { lt: leaseCutoff } },
        ],
      },
      data: { status: IntakeJobStatus.PROCESSING, progress: 10, attempts: { increment: 1 } },
    });
    if (claim.count === 0) return; // already running, finished, or not ours

    const job = await this.prisma.intakeJob.findFirst({
      where: { id: jobId, organizationId, deletedAt: null },
    });
    if (!job) return;

    try {
      const buffer = await this.storage.get(job.storageKey, job.sha256);
      const result = await this.intake.processDocument(
        organizationId,
        buffer,
        job.mimeType,
        job.originalFileName,
        'eng+ara',
        (_stage, progress) => {
          void this.prisma.intakeJob
            .updateMany({
              where: { id: jobId, organizationId, status: IntakeJobStatus.PROCESSING },
              data: { progress },
            })
            .catch(() => undefined);
        },
        job.strategy ?? undefined,
      );
      const status = needsReview(result) ? IntakeJobStatus.NEEDS_REVIEW : IntakeJobStatus.EXTRACTED;
      await this.prisma.intakeJob.updateMany({
        where: { id: jobId, organizationId, status: IntakeJobStatus.PROCESSING },
        data: {
          status,
          progress: 100,
          lastError: null,
          result: JSON.parse(JSON.stringify(result)) as Prisma.InputJsonValue,
        },
      });
      this.logger.log(`Intake job ${jobId} finished: status=${status} attempts=${job.attempts}`);
    } catch (error) {
      await this.recordFailure(job, error);
    }
  }

  private async recordFailure(job: IntakeJob, error: unknown): Promise<void> {
    // Extractor errors may quote document text: keep the error type/code only.
    const lastError = describeError(error, { includeMessage: false }).slice(0, 200);
    // `job` was read after the claim, so job.attempts already counts this run.
    const attempts = job.attempts;
    const dead = attempts >= job.maxAttempts;
    const status = dead ? IntakeJobStatus.DEAD_LETTER : IntakeJobStatus.FAILED;
    const moved = await this.prisma.intakeJob.updateMany({
      where: { id: job.id, organizationId: job.organizationId, status: IntakeJobStatus.PROCESSING },
      data: { status, lastError, progress: 0 },
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
