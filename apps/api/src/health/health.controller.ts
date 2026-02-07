import { Controller, Get, Inject, Optional } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { PrismaService } from '../prisma/prisma.service';

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

@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
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

  @Get('ready')
  async readiness(): Promise<{ ready: boolean; message: string }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { ready: true, message: 'Service is ready' };
    } catch {
      return { ready: false, message: 'Database not available' };
    }
  }

  @Get('live')
  liveness(): { alive: boolean; uptime: number } {
    return {
      alive: true,
      uptime: process.uptime(),
    };
  }
}
