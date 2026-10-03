import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../prisma/prisma.service';
import { HealthController } from './health.controller';

const redis = {
  connect: jest.fn(),
  ping: jest.fn(),
  disconnect: jest.fn(),
  on: jest.fn(),
};
const constructRedis = jest.fn();
jest.mock('ioredis', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation((...args: unknown[]): unknown => constructRedis(...args)),
}));

describe('HealthController live dependency probes', () => {
  let query: jest.Mock;
  let getConfig: jest.Mock;
  let controller: HealthController;

  beforeEach(() => {
    query = jest.fn().mockResolvedValue([{ value: 1 }]);
    getConfig = jest.fn().mockReturnValue('redis://127.0.0.1:6380');
    redis.connect.mockReset().mockResolvedValue(undefined);
    redis.ping.mockReset().mockResolvedValue('PONG');
    redis.disconnect.mockReset();
    redis.on.mockReset();
    constructRedis.mockReset().mockReturnValue(redis);
    controller = new HealthController(
      { $queryRaw: query } as unknown as PrismaService,
      { get: getConfig } as unknown as ConfigService,
    );
  });

  it('requires a real Redis PING and releases the connection', async () => {
    const result = await controller.check();
    expect(result.status).toBe('healthy');
    expect(result.services.database.status).toBe('connected');
    expect(result.services.redis.status).toBe('connected');
    expect(query).toHaveBeenCalledTimes(1);
    expect(constructRedis).toHaveBeenCalledWith('redis://127.0.0.1:6380', {
      lazyConnect: true,
      connectTimeout: 2500,
      commandTimeout: 2500,
      maxRetriesPerRequest: 0,
      enableOfflineQueue: false,
      retryStrategy: expect.any(Function),
    });
    expect(redis.connect).toHaveBeenCalledTimes(1);
    expect(redis.ping).toHaveBeenCalledTimes(1);
    expect(redis.disconnect).toHaveBeenCalledTimes(1);
  });

  it('reports an unavailable database as unhealthy even if Redis responds', async () => {
    query.mockRejectedValue(new Error('synthetic database outage'));
    const result = await controller.check();
    expect(result.status).toBe('unhealthy');
    expect(result.services.database.status).toBe('disconnected');
  });

  it.each(['connect', 'ping'] as const)(
    'reports a Redis %s failure as unhealthy',
    async (method) => {
      redis[method].mockRejectedValue(new Error('synthetic Redis outage'));
      const result = await controller.check();
      expect(result.status).toBe('unhealthy');
      expect(result.services.redis.status).toBe('disconnected');
      expect(redis.disconnect).toHaveBeenCalledTimes(1);
    },
  );

  it('rejects an unexpected Redis response', async () => {
    redis.ping.mockResolvedValue('unexpected');
    const result = await controller.check();
    expect(result.status).toBe('unhealthy');
    expect(result.services.redis.status).toBe('disconnected');
    expect(redis.disconnect).toHaveBeenCalledTimes(1);
  });

  it('reports absent Redis configuration honestly', async () => {
    getConfig.mockReturnValue(undefined);
    const result = await controller.check();
    expect(result.services.redis.status).toBe('not_configured');
    expect(constructRedis).not.toHaveBeenCalled();
  });
});
