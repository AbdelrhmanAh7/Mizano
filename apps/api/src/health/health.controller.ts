import { Controller, Get, Inject, Optional, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { ReadinessService } from './readiness.service';

interface HealthCheckResponse {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
  services: {
    database: {
      status: 'connected' | 'disconnected';
      latency?: number;
    };
    redis: {
      status: 'connected' | 'disconnected' | 'not_configured';
      latency?: number;
    };
  };
}

@SkipThrottle({ short: true, long: true })
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly readinessService: ReadinessService,
    @Optional() @Inject(CACHE_MANAGER) private readonly cacheManager?: Cache,
  ) {}

  @Get()
  async check(): Promise<HealthCheckResponse> {
    const response: HealthCheckResponse = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0',
      services: {
        database: { status: 'disconnected' },
        redis: { status: 'not_configured' },
      },
    };

    // Check database connection
    try {
      const dbStart = Date.now();
      await this.prisma.$queryRaw`SELECT 1`;
      response.services.database = {
        status: 'connected',
        latency: Date.now() - dbStart,
      };
    } catch {
      response.status = 'unhealthy';
      response.services.database = { status: 'disconnected' };
    }

    // Check Redis/cache connection
    if (this.cacheManager) {
      try {
        const redisStart = Date.now();
        const testKey = '__health_check__';
        await this.cacheManager.set(testKey, 'ok', 5000);
        const result = await this.cacheManager.get(testKey);
        await this.cacheManager.del(testKey);
        if (result === 'ok') {
          response.services.redis = {
            status: 'connected',
            latency: Date.now() - redisStart,
          };
        } else {
          response.services.redis = { status: 'disconnected' };
          response.status = 'unhealthy';
        }
      } catch {
        response.services.redis = { status: 'disconnected' };
      }
    }

    return response;
  }

  /** Readiness for the Pi monitor: 200 when DB and data disk are fine, 503 otherwise. */
  @Get('ready')
  async readiness(@Res() res: Response): Promise<void> {
    const report = await this.readinessService.check();
    res.status(report.status === 'ok' ? 200 : 503).json(report);
  }

  @Get('live')
  liveness(): { alive: boolean; uptime: number } {
    return {
      alive: true,
      uptime: process.uptime(),
    };
  }
}
