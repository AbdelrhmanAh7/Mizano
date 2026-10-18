import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IntakeJobStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  DocumentIntakeResult,
  DocumentIntakeService,
  IntakeStage,
} from '../services/document-intake.service';
import { IntakeProcessorService } from './intake-processor.service';
import { IntakeQueueService } from './intake-queue.service';
import { sha256Hex } from './intake-storage';
import { FakeIntakeJobTable, MemoryIntakeStorage } from './intake-test-utils';

const ORG = 'org-a';
const SECRET_TEXT = 'ACME Corp invoice 123456';
type OnProgress = (stage: IntakeStage, progress: number, message: string) => void;

const result = {
  documentType: 'BILL',
  ocrConfidence: 0.9,
  duplicateWarning: null,
  rawText: SECRET_TEXT,
  extractedFields: { total: 10, date: '2026-09-01', vendorName: 'ACME Corp' },
} as unknown as DocumentIntakeResult;

describe('@issue-126 IntakeProcessorService stage timings', () => {
  let table: FakeIntakeJobTable;
  let storage: MemoryIntakeStorage;
  let intake: { processDocument: jest.Mock };
  let now: number;
  let clock: jest.Mock<number, []>;
  const body = Buffer.from(SECRET_TEXT);

  /** Simulates extraction: each stage advances the fake clock, then optionally fails. */
  function extraction(failAfter?: IntakeStage) {
    return async (...args: unknown[]): Promise<DocumentIntakeResult> => {
      const onProgress = args[5] as OnProgress;
      const steps: Array<[IntakeStage, number]> = [
        ['extracting', 1840],
        ['classifying', 12],
        ['matching', 3],
      ];
      for (const [stage, ms] of steps) {
        onProgress(stage, 0, '');
        now += ms;
        if (stage === failAfter) throw new Error(`boom ${SECRET_TEXT}`);
      }
      return result;
    };
  }

  async function run(): Promise<void> {
    const processor = new IntakeProcessorService(
      { intakeJob: table.delegate } as unknown as PrismaService,
      storage,
      intake as unknown as DocumentIntakeService,
      { enqueue: jest.fn(), registerHandler: jest.fn() } as unknown as IntakeQueueService,
      { get: jest.fn() } as unknown as ConfigService,
      clock,
    );
    const job = await table.delegate.create({
      data: {
        organizationId: ORG,
        createdById: 'u1',
        originalFileName: 'a.pdf',
        mimeType: 'application/pdf',
        sizeBytes: body.length,
        sha256: sha256Hex(body),
        storageKey: 'key-1',
      },
    });
    await processor.handle({ jobId: job.id, organizationId: ORG });
  }

  beforeEach(() => {
    table = new FakeIntakeJobTable();
    storage = new MemoryIntakeStorage();
    storage.objects.set('key-1', body);
    now = 1000;
    clock = jest.fn(() => now);
    storage.get.mockImplementation(async () => {
      now += 7;
      return body;
    });
    intake = { processDocument: jest.fn(extraction()) };
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('AC1: a completed job stores whole milliseconds for every stage that ran', async () => {
    await run();
    expect(table.rows[0].status).toBe(IntakeJobStatus.EXTRACTED);
    expect(table.rows[0].stageTimingsMs).toEqual({
      load: 7,
      extract: 1840,
      parse: 12,
      validate: 3,
    });
  });

  it('AC2: a failed job keeps timings for the stages that ran before the failure', async () => {
    intake.processDocument.mockImplementation(extraction('classifying'));
    await run();
    expect(table.rows[0].status).toBe(IntakeJobStatus.FAILED);
    expect(table.rows[0].stageTimingsMs).toEqual({ load: 7, extract: 1840, parse: 12 });
  });

  it('AC2: a job that fails while loading the original records the load stage only', async () => {
    storage.get.mockImplementation(async () => {
      now += 4;
      throw new Error('Stored original failed checksum verification');
    });
    await run();
    expect(table.rows[0].status).toBe(IntakeJobStatus.FAILED);
    expect(table.rows[0].stageTimingsMs).toEqual({ load: 4 });
  });

  it('AC3: a clock that always throws never fails the job', async () => {
    clock.mockImplementation(() => {
      throw new Error('clock unavailable');
    });
    await run();
    expect(table.rows[0].status).toBe(IntakeJobStatus.EXTRACTED);
    expect(table.rows[0].stageTimingsMs).toEqual({});
  });

  it('AC3: a clock that fails mid-run keeps the stages it could time', async () => {
    let calls = 0;
    clock.mockImplementation(() => {
      calls += 1;
      if (calls === 3) throw new Error('clock unavailable'); // start of parse
      return now;
    });
    await run();
    expect(table.rows[0].status).toBe(IntakeJobStatus.EXTRACTED);
    expect(table.rows[0].stageTimingsMs).toEqual({ load: 7, validate: 3 });
  });

  it('timings contain stage names and numbers only, never document content', async () => {
    await run();
    const stored = JSON.stringify(table.rows[0].stageTimingsMs);
    expect(stored).not.toContain('ACME');
    expect(stored).not.toContain('123456');
  });
});
