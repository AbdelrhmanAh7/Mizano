import { Injectable, Logger } from '@nestjs/common';
import {
  globalQueryMetricsBuffer,
  QueryMetricEntry,
} from '../../../prisma/prisma-query.middleware';
import { PrismaService } from '../../../prisma/prisma.service';
import { ReadReplicaService } from '../../../prisma/read-replica.service';
import {
  DatabaseHealthDto,
  QueryDistributionItemDto,
  QueryStatsResponseDto,
  TimeTrendItemDto,
} from '../dto/query-metrics.dto';
import { describeError } from '../../../common/utils/redact';

@Injectable()
export class QueryMetricsService {
  private readonly logger = new Logger(QueryMetricsService.name);
  private readonly startTime = Date.now();

  constructor(
    private readonly prisma: PrismaService,
    private readonly readReplica: ReadReplicaService,
  ) {}

  /**
   * Get paginated slow queries (above threshold).
   */
  getSlowQueries(options: {
    threshold?: number;
    model?: string;
    action?: string;
    page?: number;
    limit?: number;
  }): {
    data: QueryMetricEntry[];
    meta: { page: number; limit: number; total: number; totalPages: number };
  } {
    const threshold = options.threshold ?? 100;
    const page = options.page ?? 1;
    const limit = options.limit ?? 20;

    const result = globalQueryMetricsBuffer.getFiltered({
      threshold,
      model: options.model,
      action: options.action,
      page,
      limit,
    });

    return {
      data: result.data,
      meta: {
        page,
        limit,
        total: result.total,
        totalPages: Math.ceil(result.total / limit),
      },
    };
  }

  /**
   * Aggregate query statistics.
   */
  getStats(): QueryStatsResponseDto {
    const aggregates = globalQueryMetricsBuffer.getAggregates();
    const percentiles = globalQueryMetricsBuffer.getPercentiles();

    return {
      totalQueries: aggregates.totalQueries,
      avgDuration: Math.round(aggregates.avgDuration * 100) / 100,
      slowQueryCount: aggregates.slowQueryCount,
      p50: percentiles.p50,
      p95: percentiles.p95,
      p99: percentiles.p99,
      bufferSize: globalQueryMetricsBuffer.getSize(),
    };
  }

  /**
   * Query distribution by model.
   */
  getDistribution(): QueryDistributionItemDto[] {
    return globalQueryMetricsBuffer.getDistributionByModel().map((item) => ({
      model: item.model,
      count: item.count,
      avgDuration: Math.round(item.avgDuration * 100) / 100,
    }));
  }

  /**
   * Response time trend over time.
   */
  getTrend(intervalMinutes: number): TimeTrendItemDto[] {
    return globalQueryMetricsBuffer.getTimeTrend(intervalMinutes).map((item) => ({
      bucket: item.bucket,
      avgDuration: Math.round(item.avgDuration * 100) / 100,
      count: item.count,
    }));
  }

  /**
   * Database health including primary and replica status.
   */
  async getHealth(): Promise<DatabaseHealthDto> {
    let primaryConnected = false;
    let primaryLatencyMs = 0;

    try {
      const start = performance.now();
      await this.prisma.$queryRaw`SELECT 1`;
      primaryLatencyMs = Math.round((performance.now() - start) * 100) / 100;
      primaryConnected = true;
    } catch (error) {
      this.logger.error(
        `Primary database health check failed: ${describeError(error, { includeMessage: false })}`,
      );
    }

    const replicaConfigured = this.readReplica.isUsingReplica();
    let replicaConnected = false;
    let replicaLatencyMs: number | undefined;

    if (replicaConfigured) {
      try {
        const start = performance.now();
        await this.readReplica.$queryRaw`SELECT 1`;
        replicaLatencyMs = Math.round((performance.now() - start) * 100) / 100;
        replicaConnected = true;
      } catch (error) {
        this.logger.error(
          `Read replica health check failed: ${describeError(error, { includeMessage: false })}`,
        );
      }
    }

    const uptimeSeconds = Math.floor((Date.now() - this.startTime) / 1000);
    const poolSize = parseInt(process.env.DATABASE_POOL_SIZE || '10', 10);

    return {
      status: primaryConnected ? 'healthy' : 'unhealthy',
      primaryConnected,
      replicaConfigured,
      replicaConnected: replicaConfigured ? replicaConnected : false,
      poolSize,
      uptimeSeconds,
      primaryLatencyMs,
      replicaLatencyMs,
    };
  }

  /**
   * Reset all collected metrics.
   */
  resetMetrics(): { message: string } {
    globalQueryMetricsBuffer.reset();
    this.logger.log('Query metrics buffer reset');
    return { message: 'Metrics reset successfully' };
  }
}
