import { readFileSync } from 'fs';
import { resolve } from 'path';
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

describe('docker-compose.production.yml intake-worker @issue-257 @issue-142', () => {
  it('defines the intake-worker service with dist/intake-worker.js', () => {
    const compose = readFileSync(
      resolve(__dirname, '../../../../../../docker-compose.production.yml'),
      'utf8',
    );
    const block = /^ {2}intake-worker:\r?\n((?: {4}.*\r?\n|\s*\r?\n)+)/m.exec(compose)?.[1] ?? '';
    expect(block).not.toBe('');
    expect(block).toContain('dist/intake-worker.js');
    expect(block).toMatch(/healthcheck:[\s\S]*dist\/intake-worker-healthcheck\.js/);
    expect(block).toContain('intake_storage:/data/intake');
  });

  it('API require.cache has no tesseract.js or pdf-parse', () => {
    const tesseractKeys = Object.keys(require.cache).filter((k) => k.includes('tesseract.js'));
    expect(tesseractKeys).toHaveLength(0);
    const pdfParseKeys = Object.keys(require.cache).filter((k) => k.includes('pdf-parse'));
    expect(pdfParseKeys).toHaveLength(0);
  });
});
