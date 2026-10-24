import { randomUUID } from 'crypto';
import { Inject, Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IntakeJob, IntakeJobStatus, Prisma } from '@prisma/client';
import { describeError } from '../../../common/utils/redact';
import { PrismaService } from '../../../prisma/prisma.service';
import type { DocumentIntakeResult } from '../services/document-intake.service';
import { intakeLeaseMs, queueJobId } from './intake-jobs.service';
import { IntakeQueuePayload, IntakeQueueService } from './intake-queue.service';
import { IntakeExecutorService } from './intake-executor.service';
import { IntakeMatchingService } from './intake-matching.service';
import { IntakeRuntimeError } from './intake-runtime';
import { IntakeStorage } from './intake-storage';
import { Clock, INTAKE_CLOCK, monotonicClock, StageTimer } from './stage-timer';

const LOW_CONFIDENCE = 0.6;
const DEFAULT_RETRY_BASE_MS = 5000;

/** The parts of an intake result that decide review routing. */
export type ReviewInput = Pick<
  DocumentIntakeResult,
  'ocrConfidence' | 'documentType' | 'classificationConfidence'
> & {
  extractedFields: Pick<DocumentIntakeResult['extractedFields'], 'total' | 'date'>;
  duplicateWarning?: DocumentIntakeResult['duplicateWarning'];
  matchedVendor?: DocumentIntakeResult['matchedVendor'];
};

/** Decide whether an accountant must look before approval. */
export function needsReview(result: ReviewInput): boolean {
  const fields = result.extractedFields;
  return (
    result.ocrConfidence < LOW_CONFIDENCE ||
    result.classificationConfidence < LOW_CONFIDENCE ||
    fields.total === null ||
    fields.date === null ||
    result.documentType === 'OTHER' ||
    result.documentType === 'RECEIPT' ||
    result.duplicateWarning?.isDuplicate === true ||
    // No resolved supplier (none found, or two strong candidates tied); undefined means matching has not run: a draft needs one.
    result.matchedVendor === null
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
  private storage?: IntakeStorage;
  private documentIntake?: {
    processDocument(
      organizationId: string,
      buffer: Buffer,
      mimeType: string,
      originalFileName: string,
      language: string,
      onProgress: (stage: string, progress: number) => void,
      strategy?: string,
    ): Promise<DocumentIntakeResult>;
  };
  private intake?: IntakeExecutorService;
  private queue!: IntakeQueueService;
  private config!: ConfigService;
  private matching?: IntakeMatchingService;
  private clock!: Clock;

  constructor(
    prisma: PrismaService,
    storage: IntakeStorage,
    documentIntake: unknown,
    queue: IntakeQueueService,
    config: ConfigService,
    clock?: Clock,
  );
  constructor(
    prisma: PrismaService,
    intake?: IntakeExecutorService,
    queue?: IntakeQueueService,
    config?: ConfigService,
    matching?: IntakeMatchingService,
    clock?: Clock,
  );
  constructor(
    private readonly prisma: PrismaService,
    @Optional() intake?: unknown,
    @Optional() queue?: unknown,
    @Optional() config?: unknown,
    @Optional() matching?: unknown,
    @Optional() @Inject(INTAKE_CLOCK) clock: Clock = monotonicClock,
  ) {
    if (intake && typeof (intake as unknown as Record<string, unknown>).get === 'function') {
      // Called as: (prisma, storage, documentIntake, queue, config, clock?)
      this.storage = intake as unknown as IntakeStorage;
      this.documentIntake = queue as unknown as typeof this.documentIntake;
      this.queue = config as unknown as IntakeQueueService;
      this.config = matching as unknown as ConfigService;
      this.clock = (clock as unknown as Clock) ?? monotonicClock;
    } else {
      this.intake = intake as IntakeExecutorService | undefined;
      this.queue = queue as IntakeQueueService;
      this.config = config as ConfigService;
      this.matching = matching as IntakeMatchingService | undefined;
      this.clock = clock ?? monotonicClock;
    }
  }

  onModuleInit(): void {
    this.queue?.registerHandler((payload) => this.handle(payload));
  }

  private numberConfig(key: string, fallback: number): number {
    const n = Number(this.config?.get<string>(key));
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

    const cancellation = new AbortController();
    let leaseLost = false;
    const heartbeat = setInterval(
      () => {
        this.prisma.intakeJob
          .updateMany({
            where: { id: jobId, organizationId, status: IntakeJobStatus.PROCESSING, leaseToken },
            data: { leaseExpiresAt: new Date(Date.now() + leaseMs) },
          })
          .then((res) => {
            if (res.count === 0) {
              leaseLost = true;
              cancellation.abort();
            }
          })
          .catch(() => undefined);
      },
      Math.max(100, Math.floor(leaseMs / 3)),
    );

    // Worker stages: load the original; extract (text/OCR + strategy fields) until
    // 'classifying'; parse (classification + entity parsing) until 'matching';
    // validate (party matching, duplicate check, review decision).
    const timer = new StageTimer(this.clock);
    try {
      let result: DocumentIntakeResult;
      if (this.intake) {
        timer.start('load');
        timer.start('extract');
        const extracted = await this.intake.run(job, cancellation.signal);
        if (leaseLost) throw new LeaseLostError();
        timer.start('validate');
        // The child holds no database access: vendor candidates and the duplicate check are
        // tenant-scoped reads, made here after it has closed.
        result = this.matching
          ? await this.matching.enrich(job.organizationId, extracted)
          : extracted;
        if (leaseLost) throw new LeaseLostError();
      } else if (this.documentIntake && this.storage) {
        timer.start('load');
        const buffer = await this.storage.get(job.storageKey, job.sha256);
        timer.start('extract');
        const lostLease = new Promise<never>((_, reject) => {
          cancellation.signal.addEventListener('abort', () => reject(new LeaseLostError()), {
            once: true,
          });
        });
        result = await Promise.race([
          this.documentIntake.processDocument(
            organizationId,
            buffer,
            job.mimeType,
            job.originalFileName,
            job.language ?? 'eng+ara',
            (stage, progress) => {
              if (stage === 'classifying') timer.start('parse');
              if (stage === 'matching') timer.start('validate');
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
      } else {
        throw new Error('No intake engine configured');
      }
      const status = needsReview(result) ? IntakeJobStatus.NEEDS_REVIEW : IntakeJobStatus.EXTRACTED;
      timer.stop();
      const written = await this.prisma.intakeJob.updateMany({
        where: { id: jobId, organizationId, status: IntakeJobStatus.PROCESSING, leaseToken },
        data: {
          status,
          progress: 100,
          lastError: null,
          leaseToken: null,
          leaseExpiresAt: null,
          result: JSON.parse(JSON.stringify(result)) as Prisma.InputJsonValue,
          stageTimingsMs: timer.snapshot(),
        },
      });
      if (written.count === 0) throw new LeaseLostError();
      this.logger.log(`Intake job ${jobId} finished: status=${status} attempts=${job.attempts}`);
    } catch (error) {
      if (leaseLost || error instanceof LeaseLostError) {
        this.logger.warn(`Intake job ${jobId} lost its lease; abandoning this run`);
        return;
      }
      timer.stop();
      await this.recordFailure(job, leaseToken, error, timer.snapshot());
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

  private async recordFailure(
    job: IntakeJob,
    leaseToken: string,
    error: unknown,
    stageTimingsMs: Record<string, number>,
  ): Promise<void> {
    // Extractor errors may quote document text: keep the error type/code only.
    const lastError =
      error instanceof IntakeRuntimeError
        ? error.code
        : describeError(error, { includeMessage: false }).slice(0, 200);
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
      data: {
        status,
        lastError,
        progress: 0,
        leaseToken: null,
        leaseExpiresAt: null,
        stageTimingsMs,
      },
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
