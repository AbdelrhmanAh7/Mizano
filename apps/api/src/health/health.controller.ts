import { Controller, Get, HttpStatus, Optional, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Response } from 'express';
import { CacheService, RedisStatus } from '../cache/cache.service';
import { PrismaService } from '../prisma/prisma.service';

type DatabaseStatus = 'connected' | 'disconnected';

interface HealthCheckResponse {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
  services: {
    database: {
      status: DatabaseStatus;
      latency?: number;
    };
    redis: {
      status: RedisStatus;
      latency?: number;
    };
  };
}

interface ReadinessResponse {
  ready: boolean;
  message: string;
  services: {
    database: DatabaseStatus;
    redis: RedisStatus;
  };
}

@SkipThrottle({ short: true, long: true })
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly cache?: CacheService,
  ) {}

  @Get()
  async check(): Promise<HealthCheckResponse> {
    const database = await this.checkDatabase();
    const redis = await this.checkRedis();
    return {
      status: this.isReady(database.status, redis.status) ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0',
      services: { database, redis },
    };
  }

  /**
   * Readiness for container probes (compose health checks, healthcheck.sh): 503 until
   * the database and, when configured, Redis answer. A probe that only looks at the
   * HTTP status therefore cannot report a dead dependency as healthy.
   */
  @Get('ready')
  async readiness(@Res({ passthrough: true }) res: Response): Promise<ReadinessResponse> {
    const database = (await this.checkDatabase()).status;
    const redis = (await this.checkRedis()).status;
    const ready = this.isReady(database, redis);
    if (!ready) {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
    }
    const down = [database !== 'connected' && 'database', redis === 'disconnected' && 'redis']
      .filter((name): name is string => typeof name === 'string')
      .join(' and ');
    return {
      ready,
      message: ready ? 'Service is ready' : `${down} not available`,
      services: { database, redis },
    };
  }

  @Get('live')
  liveness(): { alive: boolean; uptime: number } {
    return {
      alive: true,
      uptime: process.uptime(),
    };
  }

  private isReady(database: DatabaseStatus, redis: RedisStatus): boolean {
    return database === 'connected' && redis !== 'disconnected';
  }

  private async checkDatabase(): Promise<{ status: DatabaseStatus; latency?: number }> {
    try {
      const start = Date.now();
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'connected', latency: Date.now() - start };
    } catch {
      return { status: 'disconnected' };
    }
  }

  /**
   * A real PING on the direct Redis client (see CacheService.pingRedis). No shared key is
   * written, so overlapping probes from the api, web and healthcheck.sh cannot delete each
   * other's round trip and report a healthy Redis as down.
   */
  private async checkRedis(): Promise<{ status: RedisStatus; latency?: number }> {
    if (!this.cache) {
      return { status: 'not_configured' };
    }
    return this.cache.pingRedis();
  }
}
