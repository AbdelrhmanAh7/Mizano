import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { attachQueryMetricsMiddleware } from './prisma-query.middleware';

/**
 * ReadReplicaService provides a separate PrismaClient connected to a read replica.
 * If READ_DATABASE_URL is not set, falls back to the primary DATABASE_URL.
 * Use this for read-heavy queries (reports, dashboards, analytics) to offload the primary.
 */
@Injectable()
export class ReadReplicaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReadReplicaService.name);
  private readonly usingReplica: boolean;

  constructor() {
    const readUrl = process.env.READ_DATABASE_URL;
    const primaryUrl = process.env.DATABASE_URL || '';
    const useReplica = !!readUrl;

    const poolSize = parseInt(
      process.env.DATABASE_READ_POOL_SIZE || process.env.DATABASE_POOL_SIZE || '10',
      10,
    );
    const poolTimeout = parseInt(process.env.DATABASE_POOL_TIMEOUT || '20', 10);

    const baseUrl = readUrl || primaryUrl;
    const url = new URL(baseUrl || 'postgresql://localhost:5432/mizano');
    if (!url.searchParams.has('connection_limit')) {
      url.searchParams.set('connection_limit', String(poolSize));
    }
    if (!url.searchParams.has('pool_timeout')) {
      url.searchParams.set('pool_timeout', String(poolTimeout));
    }

    super({
      log: ['error'],
      datasources: {
        db: { url: url.toString() },
      },
    });

    this.usingReplica = useReplica;

    // Attach query metrics middleware
    const slowThreshold = parseInt(process.env.SLOW_QUERY_THRESHOLD_MS || '500', 10);
    attachQueryMetricsMiddleware(this, slowThreshold, useReplica ? 'replica' : 'primary-fallback');
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    if (this.usingReplica) {
      this.logger.log('Connected to READ REPLICA database');
    } else {
      this.logger.log('READ_DATABASE_URL not set — read replica falling back to primary database');
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /**
   * Returns whether this service is actually connected to a separate read replica.
   */
  isUsingReplica(): boolean {
    return this.usingReplica;
  }
}
