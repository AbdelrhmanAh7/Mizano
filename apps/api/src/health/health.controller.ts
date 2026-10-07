import { Controller, Get, Inject, Optional, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { Response } from 'express';
import * as fs from 'fs';
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
  async readiness(@Res() res: Response): Promise<void> {
    try {
      // Trivial DB query with short timeout.
      // The Prisma connection should timeout based on its configuration,
      // but we could also wrap it in Promise.race. Let's assume Prisma handles it.
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      res.status(503).json({ status: 'error', db: 'down' });
      return;
    }

    const dataDir = process.env.DATA_DIR || '/data';
    const minFreePct = parseInt(process.env.READY_MIN_FREE_PCT || '10', 10);

    let stat;
    try {
      // Node >= 18.15.0 has fs.promises.statfs
      stat = await fs.promises.statfs(dataDir);
    } catch {
      res.status(503).json({ status: 'error', disk: { status: 'check_failed' } });
      return;
    }

    // blocks, bfree, bavail, bsize
    // statfs types define bfree as number (or bigint)
    const bsize = Number(stat.bsize);
    const blocks = Number(stat.blocks);
    const bfree = Number(stat.bfree);

    // In POSIX, usually bavail is used, but either works. bfree is total free.
    const freePct = blocks > 0 ? (bfree / blocks) * 100 : 0;
    const freeBytes = bfree * bsize;

    if (freePct < minFreePct) {
      res.status(503).json({
        status: 'error',
        disk: {
          status: 'low_space',
          freeBytes,
          freePct,
        },
      });
      return;
    }

    res.status(200).json({
      status: 'ok',
      db: 'ok',
      disk: {
        freeBytes,
        freePct,
      },
    });
  }

  @Get('live')
  liveness(): { alive: boolean; uptime: number } {
    return {
      alive: true,
      uptime: process.uptime(),
    };
  }
}
