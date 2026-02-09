import { Logger } from '@nestjs/common';

/**
 * A single captured query metric entry.
 */
export interface QueryMetricEntry {
  model: string;
  action: string;
  duration: number; // milliseconds
  timestamp: Date;
  isSlow: boolean;
}

/**
 * Ring buffer storing the last N query metrics in-memory.
 * Thread-safe for single-process Node.js. Resets on process restart.
 */
export class QueryMetricsBuffer {
  private readonly buffer: QueryMetricEntry[];
  private head = 0;
  private count = 0;
  private readonly capacity: number;

  // Aggregate counters (survive buffer wrap-around)
  private totalQueries = 0;
  private totalDuration = 0;
  private slowQueryCount = 0;

  constructor(capacity = 10000) {
    this.capacity = capacity;
    this.buffer = new Array<QueryMetricEntry>(capacity);
  }

  push(entry: QueryMetricEntry): void {
    this.buffer[this.head] = entry;
    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) this.count++;

    this.totalQueries++;
    this.totalDuration += entry.duration;
    if (entry.isSlow) this.slowQueryCount++;
  }

  /**
   * Get all entries in chronological order (oldest first).
   */
  getAll(): QueryMetricEntry[] {
    if (this.count < this.capacity) {
      return this.buffer.slice(0, this.count);
    }
    // Ring buffer wrapped — stitch together
    return [...this.buffer.slice(this.head, this.capacity), ...this.buffer.slice(0, this.head)];
  }

  /**
   * Get entries filtered and sorted newest-first, with pagination.
   */
  getFiltered(options: {
    threshold?: number;
    model?: string;
    action?: string;
    page?: number;
    limit?: number;
  }): { data: QueryMetricEntry[]; total: number } {
    let entries = this.getAll();

    if (options.threshold) {
      entries = entries.filter((e) => e.duration >= options.threshold!);
    }
    if (options.model) {
      entries = entries.filter((e) => e.model === options.model);
    }
    if (options.action) {
      entries = entries.filter((e) => e.action === options.action);
    }

    // Newest first
    entries.reverse();

    const total = entries.length;
    const page = options.page || 1;
    const limit = options.limit || 20;
    const start = (page - 1) * limit;

    return {
      data: entries.slice(start, start + limit),
      total,
    };
  }

  getAggregates(): {
    totalQueries: number;
    totalDuration: number;
    slowQueryCount: number;
    avgDuration: number;
  } {
    return {
      totalQueries: this.totalQueries,
      totalDuration: this.totalDuration,
      slowQueryCount: this.slowQueryCount,
      avgDuration: this.totalQueries > 0 ? this.totalDuration / this.totalQueries : 0,
    };
  }

  /**
   * Compute percentile latencies from the buffer contents.
   */
  getPercentiles(): { p50: number; p95: number; p99: number } {
    const entries = this.getAll();
    if (entries.length === 0) return { p50: 0, p95: 0, p99: 0 };

    const durations = entries.map((e) => e.duration).sort((a, b) => a - b);
    const p = (pct: number) => {
      const idx = Math.ceil((pct / 100) * durations.length) - 1;
      return durations[Math.max(0, idx)];
    };

    return { p50: p(50), p95: p(95), p99: p(99) };
  }

  /**
   * Query distribution by model.
   */
  getDistributionByModel(): Array<{ model: string; count: number; avgDuration: number }> {
    const entries = this.getAll();
    const map = new Map<string, { count: number; totalDuration: number }>();

    for (const entry of entries) {
      const existing = map.get(entry.model);
      if (existing) {
        existing.count++;
        existing.totalDuration += entry.duration;
      } else {
        map.set(entry.model, { count: 1, totalDuration: entry.duration });
      }
    }

    return Array.from(map.entries())
      .map(([model, stats]) => ({
        model,
        count: stats.count,
        avgDuration: stats.count > 0 ? stats.totalDuration / stats.count : 0,
      }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Response time trend bucketed by interval.
   */
  getTimeTrend(intervalMinutes = 5): Array<{ bucket: string; avgDuration: number; count: number }> {
    const entries = this.getAll();
    const map = new Map<string, { totalDuration: number; count: number }>();

    for (const entry of entries) {
      const ts = entry.timestamp.getTime();
      const bucketTs = ts - (ts % (intervalMinutes * 60 * 1000));
      const bucketKey = new Date(bucketTs).toISOString();

      const existing = map.get(bucketKey);
      if (existing) {
        existing.totalDuration += entry.duration;
        existing.count++;
      } else {
        map.set(bucketKey, { totalDuration: entry.duration, count: 1 });
      }
    }

    return Array.from(map.entries())
      .map(([bucket, stats]) => ({
        bucket,
        avgDuration: stats.count > 0 ? stats.totalDuration / stats.count : 0,
        count: stats.count,
      }))
      .sort((a, b) => a.bucket.localeCompare(b.bucket));
  }

  reset(): void {
    this.head = 0;
    this.count = 0;
    this.totalQueries = 0;
    this.totalDuration = 0;
    this.slowQueryCount = 0;
    this.buffer.fill(undefined as unknown as QueryMetricEntry);
  }

  getSize(): number {
    return this.count;
  }
}

// Global singleton buffer shared across Prisma instances
export const globalQueryMetricsBuffer = new QueryMetricsBuffer(10000);

/**
 * Attaches Prisma middleware that measures query execution time and records to the buffer.
 */
export function attachQueryMetricsMiddleware(
  prismaClient: {
    $use: (
      middleware: (params: PrismaMiddlewareParams, next: PrismaMiddlewareNext) => Promise<unknown>,
    ) => void;
  },
  slowThresholdMs = 500,
  label = 'primary',
): void {
  const logger = new Logger(`QueryMetrics[${label}]`);

  prismaClient.$use(async (params, next) => {
    const start = performance.now();
    const result = await next(params);
    const duration = Math.round((performance.now() - start) * 100) / 100;

    const isSlow = duration >= slowThresholdMs;
    const entry: QueryMetricEntry = {
      model: params.model || 'unknown',
      action: params.action,
      duration,
      timestamp: new Date(),
      isSlow,
    };

    globalQueryMetricsBuffer.push(entry);

    if (isSlow) {
      logger.warn(`Slow query: ${params.model}.${params.action} took ${duration}ms`);
    }

    return result;
  });
}

// Types for Prisma middleware compatibility
interface PrismaMiddlewareParams {
  model?: string;
  action: string;
  args: unknown;
  dataPath: string[];
  runInTransaction: boolean;
}

type PrismaMiddlewareNext = (params: PrismaMiddlewareParams) => Promise<unknown>;
