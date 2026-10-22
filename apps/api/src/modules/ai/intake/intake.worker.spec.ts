import { EventEmitter } from 'events';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { CacheModule } from '../../../cache/cache.module';
import { IntakeJobOwnerGuard } from './intake-job-owner.guard';
import { IntakeJobsService } from './intake-jobs.service';
import { IntakeProcessorService } from './intake-processor.service';
import { IntakeQueueService } from './intake-queue.service';
import { IntakeStorage } from './intake-storage';
import { IntakeModule } from './intake.module';
import { createIntakeWorker, registerGracefulShutdown } from './intake.worker';

// No database or Redis in unit tests: PrismaService and ReadReplicaService never connect and the queue runs in-process.
process.env.REDIS_URL = '';
const prismaSpies = (): jest.SpyInstance[] => [
  jest.spyOn(PrismaClient.prototype, '$connect').mockResolvedValue(undefined),
  jest.spyOn(PrismaClient.prototype, '$disconnect').mockResolvedValue(undefined),
  jest.spyOn(IntakeJobsService.prototype, 'recoverJobs').mockResolvedValue(0), // startup sweep
];
const listeningServers = (): number =>
  process.getActiveResourcesInfo().filter((name) => name === 'TCPServerWrap').length;

describe('IntakeModule', () => {
  let spies: jest.SpyInstance[];
  beforeEach(() => {
    spies = prismaSpies();
  });
  afterEach(() => spies.forEach((spy) => spy.mockRestore()));

  it('exports the processor, queue, jobs service, owner guard and storage without redeclaration', async () => {
    const tokens = [
      IntakeProcessorService,
      IntakeQueueService,
      IntakeJobsService,
      IntakeJobOwnerGuard,
      IntakeStorage,
    ];
    // A consumer that injects each token can only see what IntakeModule exports; resolving it
    // strictly from the consumer proves the exports, not a global lookup.
    @Module({
      imports: [IntakeModule],
      providers: [
        {
          provide: 'CONSUMED',
          inject: tokens,
          useFactory: (...resolved: unknown[]): unknown[] => resolved,
        },
      ],
    })
    class ConsumerModule {}

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        EventEmitterModule.forRoot(),
        CacheModule,
        ConsumerModule,
      ],
    }).compile();
    const app = await moduleRef.init();
    try {
      const consumed = app.select(ConsumerModule).get<unknown[]>('CONSUMED', { strict: true });
      expect(consumed).toHaveLength(tokens.length);
      consumed.forEach((instance) => expect(instance).toBeDefined());
      // One IntakeJobsService means one startup recovery sweep.
      expect(IntakeJobsService.prototype.recoverJobs).toHaveBeenCalledTimes(1);
    } finally {
      await app.close();
    }
  });
});

describe('createIntakeWorker', () => {
  let spies: jest.SpyInstance[];
  beforeEach(() => {
    spies = prismaSpies();
  });
  afterEach(() => spies.forEach((spy) => spy.mockRestore()));

  it('initialises a bare context with the processor, binds no port and closes cleanly', async () => {
    const serversBefore = listeningServers();
    const app = await createIntakeWorker();
    try {
      expect(app.get(IntakeProcessorService, { strict: false })).toBeDefined();
      expect('getHttpServer' in app).toBe(false);
      expect('getHttpAdapter' in app).toBe(false);
      expect(listeningServers()).toBe(serversBefore);
    } finally {
      await expect(app.close()).resolves.toBeUndefined();
    }
    expect(listeningServers()).toBe(serversBefore);
    expect(spies[1]).toHaveBeenCalled(); // Prisma disconnected on close
  });
});

describe('registerGracefulShutdown', () => {
  function setup(close: () => Promise<void>): { signals: EventEmitter; exit: jest.Mock } {
    const signals = new EventEmitter();
    const exit = jest.fn();
    registerGracefulShutdown(close, { signals, exit });
    return { signals, exit };
  }
  const settle = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

  it('exits 0 only after close has finished, and only once', async () => {
    let release!: () => void;
    const close = jest.fn(() => new Promise<void>((resolve) => (release = resolve)));
    const { signals, exit } = setup(close);

    signals.emit('SIGTERM');
    signals.emit('SIGINT');
    await settle();
    expect(exit).not.toHaveBeenCalled();

    release();
    await settle();
    expect(close).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
  });

  it('exits 1 when close fails', async () => {
    const { signals, exit } = setup(() => Promise.reject(new Error('redis down')));
    signals.emit('SIGINT');
    await settle();
    expect(exit).toHaveBeenCalledWith(1);
  });
});

describe('worker require.cache isolation @issue-391 @issue-257 @issue-142', () => {
  it('API require.cache has no tesseract.js or pdf-parse', () => {
    const tesseractKeys = Object.keys(require.cache).filter((k) => k.includes('tesseract.js'));
    expect(tesseractKeys).toHaveLength(0);
    const pdfParseKeys = Object.keys(require.cache).filter((k) => k.includes('pdf-parse'));
    expect(pdfParseKeys).toHaveLength(0);
  });

  it('worker extraction loads pdf-parse into require.cache during document processing', async () => {
    const { extractTextFromPdf } = await import('../utils/pdf-extractor.util');
    const pdfBytes = Buffer.from(
      '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
        '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n' +
        '4 0 obj<</Length 35>>stream\nBT /F1 12 Tf 20 100 Td (Invoice Test) Tj ET\nendstream endobj\n' +
        '5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
    );
    await extractTextFromPdf(pdfBytes);
    const pdfParseKeys = Object.keys(require.cache).filter((k) => k.includes('pdf-parse'));
    expect(pdfParseKeys.length).toBeGreaterThan(0);
  });
});
