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
  it('fails closed without Redis instead of running inline', async () => {
    const queue = new IntakeQueueService(new ConfigService({ REDIS_URL: '' }));
    await expect(queue.enqueue({ jobId: 'job', organizationId: 'org' }, 'job-a0')).rejects.toThrow(
      'REDIS_URL',
    );
    expect(() => queue.registerHandler(jest.fn())).toThrow('REDIS_URL');
    expect(Worker).not.toHaveBeenCalled();
  });
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
    // The worker's probe catches this and simply stops refreshing its heartbeat.
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
