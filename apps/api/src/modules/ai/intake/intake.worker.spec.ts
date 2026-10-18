import { EventEmitter } from 'events';
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
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        EventEmitterModule.forRoot(),
        CacheModule,
        IntakeModule,
      ],
    }).compile();
    const app = await moduleRef.init();
    try {
      for (const token of [
        IntakeProcessorService,
        IntakeQueueService,
        IntakeJobsService,
        IntakeJobOwnerGuard,
        IntakeStorage,
      ]) {
        expect(app.get(token, { strict: false })).toBeDefined();
      }
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
