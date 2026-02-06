import { Controller, Get } from '@nestjs/common';
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
    redis?: {
      status: 'connected' | 'disconnected';
      latency?: number;
    };
  };
}

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check(): Promise<HealthCheckResponse> {
    const startTime = Date.now();
    const response: HealthCheckResponse = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0',
      services: {
        database: {
          status: 'disconnected',
        },
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
    } catch (error) {
      response.status = 'unhealthy';
      response.services.database = {
        status: 'disconnected',
      };
    }

    return response;
  }

  @Get('ready')
  async readiness(): Promise<{ ready: boolean; message: string }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { ready: true, message: 'Service is ready' };
    } catch (error) {
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
