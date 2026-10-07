import { HttpStatus } from '@nestjs/common';
import { Cache } from 'cache-manager';
import { Response } from 'express';
import { HealthController } from './health.controller';
import { PrismaService } from '../prisma/prisma.service';

type PrismaMock = { $queryRaw: jest.Mock };
type CacheMock = { set: jest.Mock; get: jest.Mock; del: jest.Mock };

function makePrisma(): PrismaMock {
  return { $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]) };
}

function makeCache(): CacheMock {
  return {
    set: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockResolvedValue('ok'),
    del: jest.fn().mockResolvedValue(undefined),
  };
}

function makeRes(): Response & { status: jest.Mock } {
  const res = { status: jest.fn() };
  res.status.mockReturnValue(res);
  return res as unknown as Response & { status: jest.Mock };
}

function controller(prisma: PrismaMock, cache?: CacheMock): HealthController {
  return new HealthController(
    prisma as unknown as PrismaService,
    cache as unknown as Cache | undefined,
  );
}

describe('HealthController', () => {
  describe('GET /health/ready', () => {
    it('answers 200 with ready=true when the database and redis respond', async () => {
      const res = makeRes();
      const body = await controller(makePrisma(), makeCache()).readiness(res);
      expect(body).toEqual({
        ready: true,
        message: 'Service is ready',
        services: { database: 'connected', redis: 'connected' },
      });
      expect(res.status).not.toHaveBeenCalled();
    });

    it('answers 503 when the database query fails', async () => {
      const prisma = makePrisma();
      prisma.$queryRaw.mockRejectedValue(new Error('connection refused'));
      const res = makeRes();
      const body = await controller(prisma, makeCache()).readiness(res);
      expect(res.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
      expect(body.ready).toBe(false);
      expect(body.services).toEqual({ database: 'disconnected', redis: 'connected' });
      expect(body.message).toBe('database not available');
    });

    it('answers 503 when redis throws', async () => {
      const cache = makeCache();
      cache.set.mockRejectedValue(new Error('ECONNREFUSED'));
      const res = makeRes();
      const body = await controller(makePrisma(), cache).readiness(res);
      expect(res.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
      expect(body.services).toEqual({ database: 'connected', redis: 'disconnected' });
      expect(body.message).toBe('redis not available');
    });

    it('answers 503 when the redis round trip returns the wrong value', async () => {
      const cache = makeCache();
      cache.get.mockResolvedValue(undefined);
      const res = makeRes();
      const body = await controller(makePrisma(), cache).readiness(res);
      expect(res.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
      expect(body.ready).toBe(false);
    });

    it('names both dependencies when both are down', async () => {
      const prisma = makePrisma();
      prisma.$queryRaw.mockRejectedValue(new Error('down'));
      const cache = makeCache();
      cache.set.mockRejectedValue(new Error('down'));
      const body = await controller(prisma, cache).readiness(makeRes());
      expect(body.message).toBe('database and redis not available');
    });

    it('is ready without a cache manager (redis not configured)', async () => {
      const res = makeRes();
      const body = await controller(makePrisma()).readiness(res);
      expect(body.ready).toBe(true);
      expect(body.services.redis).toBe('not_configured');
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe('GET /health', () => {
    it('reports healthy with latencies when everything responds', async () => {
      const body = await controller(makePrisma(), makeCache()).check();
      expect(body.status).toBe('healthy');
      expect(body.services.database.status).toBe('connected');
      expect(body.services.redis.status).toBe('connected');
      expect(typeof body.services.database.latency).toBe('number');
      expect(typeof body.services.redis.latency).toBe('number');
    });

    it('reports unhealthy when the database is down', async () => {
      const prisma = makePrisma();
      prisma.$queryRaw.mockRejectedValue(new Error('down'));
      const body = await controller(prisma, makeCache()).check();
      expect(body.status).toBe('unhealthy');
      expect(body.services.database).toEqual({ status: 'disconnected' });
    });

    it('reports unhealthy when redis throws', async () => {
      const cache = makeCache();
      cache.get.mockRejectedValue(new Error('down'));
      const body = await controller(makePrisma(), cache).check();
      expect(body.status).toBe('unhealthy');
      expect(body.services.redis).toEqual({ status: 'disconnected' });
    });

    it('stays healthy with redis not configured', async () => {
      const body = await controller(makePrisma()).check();
      expect(body.status).toBe('healthy');
      expect(body.services.redis).toEqual({ status: 'not_configured' });
    });
  });
});
