import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IntakeJob, IntakeJobStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { DocumentIntakeResult, DocumentIntakeService } from '../services/document-intake.service';
import { IntakeProcessorService, needsReview } from './intake-processor.service';
import { IntakeQueueService } from './intake-queue.service';
import { FakeIntakeJobTable, MemoryIntakeStorage } from './intake-test-utils';
import { sha256Hex } from './intake-storage';

const ORG_A = 'org-a';
const ORG_B = 'org-b';
const SECRET_TEXT = 'ACME Corp invoice 123456 total 9999.99';

function result(
  fields: Partial<DocumentIntakeResult['extractedFields']> = {},
  ocr = 0.9,
): DocumentIntakeResult {
  return {
    documentType: 'BILL',
    ocrConfidence: ocr,
    duplicateWarning: null,
    rawText: SECRET_TEXT,
    extractedFields: { total: 10, date: '2026-09-01', vendorName: 'ACME Corp', ...fields },
  } as unknown as DocumentIntakeResult;
}

describe('IntakeProcessorService', () => {
  let table: FakeIntakeJobTable;
  let storage: MemoryIntakeStorage;
  let intake: { processDocument: jest.Mock };
  let queue: { enqueue: jest.Mock; registerHandler: jest.Mock };
  let processor: IntakeProcessorService;
  let config: { get: jest.Mock };
  let logSpies: jest.SpyInstance[];
  const body = Buffer.from(SECRET_TEXT);

  beforeEach(() => {
    table = new FakeIntakeJobTable();
    storage = new MemoryIntakeStorage();
    intake = { processDocument: jest.fn().mockResolvedValue(result()) };
    queue = { enqueue: jest.fn().mockResolvedValue(undefined), registerHandler: jest.fn() };
    config = { get: jest.fn() };
    processor = new IntakeProcessorService(
      { intakeJob: table.delegate } as unknown as PrismaService,
      storage,
      intake as unknown as DocumentIntakeService,
      queue as unknown as IntakeQueueService,
      config as unknown as ConfigService,
    );
    logSpies = (['log', 'warn', 'error', 'debug', 'verbose'] as const).map((m) =>
      jest.spyOn(Logger.prototype, m).mockImplementation(() => undefined),
    );
    storage.objects.set('key-1', body);
  });

  afterEach(() => jest.restoreAllMocks());

  async function seed(overrides: Partial<IntakeJob> = {}): Promise<IntakeJob> {
    return table.delegate.create({
      data: {
        organizationId: ORG_A,
        createdById: 'u1',
        originalFileName: 'a.pdf',
        mimeType: 'application/pdf',
        sizeBytes: body.length,
        sha256: sha256Hex(body),
        storageKey: 'key-1',
        ...overrides,
      },
    });
  }

  it('registers itself as the queue handler', () => {
    processor.onModuleInit();
    expect(queue.registerHandler).toHaveBeenCalledTimes(1);
  });

  it('runs a QUEUED job to EXTRACTED and stores the result', async () => {
    const job = await seed();
    await processor.handle({ jobId: job.id, organizationId: ORG_A });
    expect(table.rows[0]).toMatchObject({
      status: IntakeJobStatus.EXTRACTED,
      attempts: 1,
      progress: 100,
    });
    expect(table.rows[0].result).toMatchObject({ documentType: 'BILL' });
  });

  it('marks incomplete or low-confidence extractions NEEDS_REVIEW', async () => {
    intake.processDocument.mockResolvedValue(result({ total: null }));
    const job = await seed();
    await processor.handle({ jobId: job.id, organizationId: ORG_A });
    expect(table.rows[0].status).toBe(IntakeJobStatus.NEEDS_REVIEW);
    expect(needsReview(result({}, 0.2))).toBe(true);
    expect(needsReview(result())).toBe(false);
  });

  it('routes a job with a blocking field validation to NEEDS_REVIEW at high confidence', async () => {
    const validation = { fields: {}, blockingFields: ['total'], requiresReview: true };
    const flagged = { ...result(), validation } as unknown as DocumentIntakeResult;
    expect(needsReview(flagged)).toBe(true);
    intake.processDocument.mockResolvedValue(flagged);
    const job = await seed();
    await processor.handle({ jobId: job.id, organizationId: ORG_A });
    expect(table.rows[0].status).toBe(IntakeJobStatus.NEEDS_REVIEW);
    expect(JSON.stringify(table.rows[0].result)).toContain('blockingFields');
  });

  it('is idempotent: a second delivery of a finished job does nothing', async () => {
    const job = await seed();
    await processor.handle({ jobId: job.id, organizationId: ORG_A });
    await processor.handle({ jobId: job.id, organizationId: ORG_A });
    expect(intake.processDocument).toHaveBeenCalledTimes(1);
    expect(table.rows[0].attempts).toBe(1);
  });

  it('only one concurrent delivery wins the QUEUED -> PROCESSING transition', async () => {
    const job = await seed();
    let release: () => void = () => undefined;
    intake.processDocument.mockImplementation(
      () => new Promise<DocumentIntakeResult>((resolve) => (release = () => resolve(result()))),
    );
    const first = processor.handle({ jobId: job.id, organizationId: ORG_A });
    await new Promise((r) => setImmediate(r));
    await processor.handle({ jobId: job.id, organizationId: ORG_A });
    release();
    await first;
    expect(intake.processDocument).toHaveBeenCalledTimes(1);
  });

  it('reclaims a PROCESSING job whose worker died (expired lease)', async () => {
    const job = await seed({ status: IntakeJobStatus.PROCESSING, attempts: 1 });
    table.rows[0].leaseExpiresAt = new Date(Date.now() - 1000);
    await processor.handle({ jobId: job.id, organizationId: ORG_A });
    expect(table.rows[0].status).toBe(IntakeJobStatus.EXTRACTED);
    expect(table.rows[0].attempts).toBe(2);
  });

  it('does not touch a job from another organization', async () => {
    const job = await seed();
    await processor.handle({ jobId: job.id, organizationId: ORG_B });
    expect(intake.processDocument).not.toHaveBeenCalled();
    expect(table.rows[0].status).toBe(IntakeJobStatus.QUEUED);
  });

  it('failure -> FAILED with backoff retry, then DEAD_LETTER after maxAttempts', async () => {
    intake.processDocument.mockRejectedValue(new Error(`boom ${SECRET_TEXT}`));
    const job = await seed();
    const payload = { jobId: job.id, organizationId: ORG_A };

    await processor.handle(payload);
    expect(table.rows[0]).toMatchObject({ status: IntakeJobStatus.FAILED, attempts: 1 });
    expect(queue.enqueue).toHaveBeenLastCalledWith(payload, `${job.id}-a1`, 5000);

    await processor.handle(payload);
    expect(table.rows[0]).toMatchObject({ status: IntakeJobStatus.FAILED, attempts: 2 });
    expect(queue.enqueue).toHaveBeenLastCalledWith(payload, `${job.id}-a2`, 10000);

    await processor.handle(payload);
    expect(table.rows[0]).toMatchObject({ status: IntakeJobStatus.DEAD_LETTER, attempts: 3 });
    expect(queue.enqueue).toHaveBeenCalledTimes(2);

    // Dead letters are never picked up again without an explicit retry.
    await processor.handle(payload);
    expect(intake.processDocument).toHaveBeenCalledTimes(3);
  });

  it('stores a redacted lastError and never logs document content or results', async () => {
    intake.processDocument.mockRejectedValueOnce(new Error(`boom ${SECRET_TEXT}`));
    const failing = await seed();
    await processor.handle({ jobId: failing.id, organizationId: ORG_A });
    expect(table.rows[0].lastError).not.toContain('ACME');
    expect(table.rows[0].lastError).not.toContain('9999');

    intake.processDocument.mockResolvedValueOnce(result());
    table.rows[0].status = IntakeJobStatus.QUEUED;
    await processor.handle({ jobId: failing.id, organizationId: ORG_A });

    const logged = logSpies
      .flatMap((spy) => spy.mock.calls.map((c) => JSON.stringify(c)))
      .join('\n');
    expect(logged.length).toBeGreaterThan(0);
    for (const secret of ['ACME', '9999', '123456', 'invoice']) {
      expect(logged).not.toContain(secret);
    }
  });

  it('fails the attempt when the stored original fails checksum verification', async () => {
    storage.get.mockRejectedValueOnce(new Error('Stored original failed checksum verification'));
    const job = await seed();
    await processor.handle({ jobId: job.id, organizationId: ORG_A });
    expect(table.rows[0].status).toBe(IntakeJobStatus.FAILED);
    expect(intake.processDocument).not.toHaveBeenCalled();
  });

  it('passes the requested language through to extraction', async () => {
    const job = await seed({ language: 'ara' });
    await processor.handle({ jobId: job.id, organizationId: ORG_A });
    expect(intake.processDocument.mock.calls[0][4]).toBe('ara');
  });

  it('a delivery that finds a live lease reschedules a check at lease expiry', async () => {
    const expires = new Date(Date.now() + 30_000);
    const job = await seed({ status: IntakeJobStatus.PROCESSING, attempts: 1 });
    table.rows[0].leaseExpiresAt = expires;
    await processor.handle({ jobId: job.id, organizationId: ORG_A });
    expect(intake.processDocument).not.toHaveBeenCalled();
    expect(queue.enqueue).toHaveBeenCalledTimes(1);
    const [payload, id, delay] = queue.enqueue.mock.calls[0];
    expect(payload).toEqual({ jobId: job.id, organizationId: ORG_A });
    expect(id).toBe(`${job.id}-l${expires.getTime()}`);
    expect(delay).toBeGreaterThan(25_000);
  });

  describe('lease heartbeat', () => {
    beforeEach(() =>
      config.get.mockImplementation((k: string) => (k === 'INTAKE_LEASE_MS' ? '300' : undefined)),
    );

    it('renews the lease while extraction runs', async () => {
      const job = await seed();
      intake.processDocument.mockImplementation(
        () => new Promise<DocumentIntakeResult>((r) => setTimeout(() => r(result()), 450)),
      );
      const run = processor.handle({ jobId: job.id, organizationId: ORG_A });
      await new Promise((r) => setTimeout(r, 20));
      const firstExpiry = table.rows[0].leaseExpiresAt?.getTime() ?? 0;
      await new Promise((r) => setTimeout(r, 250));
      expect(table.rows[0].leaseExpiresAt?.getTime() ?? 0).toBeGreaterThan(firstExpiry);
      await run;
      expect(table.rows[0].status).toBe(IntakeJobStatus.EXTRACTED);
      expect(table.rows[0].leaseToken).toBeNull();
    });

    it('abandons the run and writes nothing when the lease was taken over', async () => {
      const job = await seed();
      intake.processDocument.mockImplementation(
        () => new Promise<DocumentIntakeResult>((r) => setTimeout(() => r(result()), 600)),
      );
      const run = processor.handle({ jobId: job.id, organizationId: ORG_A });
      await new Promise((r) => setTimeout(r, 20));
      table.rows[0].leaseToken = 'someone-else'; // another worker reclaimed the job
      await run;
      expect(table.rows[0].leaseToken).toBe('someone-else');
      expect(table.rows[0].status).toBe(IntakeJobStatus.PROCESSING);
      expect(table.rows[0].result).toBeNull();
    });
  });
});
