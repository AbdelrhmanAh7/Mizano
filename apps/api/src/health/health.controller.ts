import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SkipThrottle } from '@nestjs/throttler';
import Redis from 'ioredis';
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

@SkipThrottle({ short: true, long: true })
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
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

    // A cache round trip may hit the in-memory fallback. Probe Redis itself.
    const redisUrl = this.config.get<string>('REDIS_URL');
    if (redisUrl) {
      let redis: Redis | undefined;
      try {
        const redisStart = Date.now();
        redis = new Redis(redisUrl, {
          lazyConnect: true,
          connectTimeout: 2500,
          commandTimeout: 2500,
          maxRetriesPerRequest: 0,
          enableOfflineQueue: false,
          retryStrategy: () => null,
        });
        // Connection errors are reflected in status, never logged with URLs.
        redis.on('error', () => undefined);
        await redis.connect();
        if ((await redis.ping()) === 'PONG') {
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
        response.status = 'unhealthy';
      } finally {
        redis?.disconnect();
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
