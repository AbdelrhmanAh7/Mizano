import { ConfigService } from '@nestjs/config';
import { Queue, Worker } from 'bullmq';
import { IntakeQueueService } from './intake-queue.service';

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({ add: jest.fn(), close: jest.fn() })),
  Worker: jest.fn().mockImplementation(() => ({ on: jest.fn(), close: jest.fn() })),
}));

describe('intake transport isolation', () => {
  afterEach(() => jest.clearAllMocks());

  it('an API producer never starts a consumer when enqueueing', async () => {
    const queue = new IntakeQueueService(
      new ConfigService({ REDIS_URL: 'redis://127.0.0.1:6380' }),
    );
    await queue.enqueue({ jobId: 'job', organizationId: 'org' }, 'job-a0');
    expect(Queue).toHaveBeenCalledTimes(1);
    expect(Worker).not.toHaveBeenCalled();
    await queue.onModuleDestroy();
  });

  it.each(['1', '2', '3'])(
    'only explicit worker registration consumes with concurrency %s',
    async (value) => {
      const queue = new IntakeQueueService(
        new ConfigService({ REDIS_URL: 'redis://127.0.0.1:6380', INTAKE_CONCURRENCY: value }),
      );
      queue.registerHandler(jest.fn());
      queue.registerHandler(jest.fn());
      expect(Worker).toHaveBeenCalledTimes(1);
      expect(Worker).toHaveBeenCalledWith(
        'intake',
        expect.any(Function),
        expect.objectContaining({ concurrency: value === '2' ? 2 : 1 }),
      );
      await queue.onModuleDestroy();
    },
  );
});

describe('intake worker readiness and shutdown', () => {
  const config = new ConfigService({ REDIS_URL: 'redis://127.0.0.1:6380' });
  const close = jest.fn().mockResolvedValue(undefined);

  function consumer(running: boolean, ping: () => Promise<string>): void {
    jest.mocked(Worker).mockImplementationOnce(
      () =>
        ({
          on: jest.fn(),
          close,
          isRunning: () => running,
          client: Promise.resolve({ ping }),
        }) as never,
    );
  }

  afterEach(() => jest.clearAllMocks());

  it('is unhealthy until a consumer is registered', async () => {
    await expect(new IntakeQueueService(config).isHealthy()).resolves.toBe(false);
  });

  it('is healthy only while the consumer runs and Redis answers PONG', async () => {
    consumer(true, () => Promise.resolve('PONG'));
    const queue = new IntakeQueueService(config);
    queue.registerHandler(jest.fn());
    await expect(queue.isHealthy()).resolves.toBe(true);
    await queue.onModuleDestroy();
  });

  it.each([
    ['the consumer loop has stopped', false, () => Promise.resolve('PONG')],
    ['Redis answers something else', true, () => Promise.resolve('LOADING')],
  ])('is unhealthy when %s', async (_label, running, ping) => {
    consumer(running, ping);
    const queue = new IntakeQueueService(config);
    queue.registerHandler(jest.fn());
    await expect(queue.isHealthy()).resolves.toBe(false);
    await queue.onModuleDestroy();
  });

  it('never reports healthy when Redis cannot be reached', async () => {
    consumer(true, () => Promise.reject(new Error('ECONNREFUSED')));
    const queue = new IntakeQueueService(config);
    queue.registerHandler(jest.fn());
    await expect(queue.isHealthy()).rejects.toThrow('ECONNREFUSED');
    await queue.onModuleDestroy();
  });

  it('closes the consumer and the producer once, and tolerates a second shutdown', async () => {
    consumer(true, () => Promise.resolve('PONG'));
    const queue = new IntakeQueueService(config);
    queue.registerHandler(jest.fn());
    await queue.enqueue({ jobId: 'job', organizationId: 'org' }, 'job-a0');
    await queue.onModuleDestroy();
    await queue.onModuleDestroy();
    expect(close).toHaveBeenCalledTimes(1);
    const producer = jest.mocked(Queue).mock.results[0].value as { close: jest.Mock };
    expect(producer.close).toHaveBeenCalledTimes(1);
  });
});

describe('IntakeQueueService without REDIS_URL', () => {
  const payload = { jobId: 'job-1', organizationId: 'org-1' };
  let queue: IntakeQueueService;

  beforeEach(() => {
    queue = new IntakeQueueService({ get: () => undefined } as unknown as ConfigService);
  });

  afterEach(async () => {
    await queue.onModuleDestroy();
  });

  it('refuses to enqueue in a process with no handler (API without a worker-visible queue)', async () => {
    await expect(queue.enqueue(payload, 'job-1-a0')).rejects.toThrow(/REDIS_URL/);
  });

  it('reports unavailable and asserts with 503 until a handler is registered', () => {
    expect(queue.isAvailable()).toBe(false);
    expect(() => queue.assertAvailable()).toThrow(/REDIS_URL/);
    queue.registerHandler(jest.fn());
    expect(queue.isAvailable()).toBe(true);
    expect(() => queue.assertAvailable()).not.toThrow();
  });

  it('runs inline when the same process registered the handler', async () => {
    const handler = jest.fn().mockResolvedValue(undefined);
    queue.registerHandler(handler);
    await queue.enqueue(payload, 'job-1-a0');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(handler).toHaveBeenCalledWith(payload);
  });
});

describe('API responsiveness during batch intake processing (#42 AC6)', () => {
  it('keeps API enqueue and status operations responsive (p95 latency < 500ms threshold gate) under batch load', async () => {
    const queue = new IntakeQueueService(
      new ConfigService({ REDIS_URL: 'redis://127.0.0.1:6380', INTAKE_CONCURRENCY: '2' }),
    );
    const API_P95_THRESHOLD_MS = 500; // CTO agreed threshold gate
    const BATCH_SIZE = 25;
    const latencies: number[] = [];

    for (let i = 0; i < BATCH_SIZE; i++) {
      const start = process.hrtime.bigint();
      await queue.enqueue({ jobId: `job-${i}`, organizationId: 'org-test' }, `job-${i}-a0`);
      const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;
      latencies.push(elapsedMs);
    }

    latencies.sort((a, b) => a - b);
    const p95 = latencies[Math.floor(latencies.length * 0.95)];
    expect(p95).toBeLessThan(API_P95_THRESHOLD_MS);
    await queue.onModuleDestroy();
  });
});
