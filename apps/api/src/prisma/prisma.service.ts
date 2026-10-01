import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { attachPrismaQueryLogging, buildPrismaLogConfig } from './prisma-logging';
import { attachQueryMetricsMiddleware } from './prisma-query.middleware';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const poolSize = parseInt(process.env.DATABASE_POOL_SIZE || '10', 10);
    const poolTimeout = parseInt(process.env.DATABASE_POOL_TIMEOUT || '20', 10);
    const databaseUrl = process.env.DATABASE_URL || '';

    // Append connection pool params to the URL if not already present
    const url = new URL(databaseUrl || 'postgresql://localhost:5432/mizano');
    if (!url.searchParams.has('connection_limit')) {
      url.searchParams.set('connection_limit', String(poolSize));
    }
    if (!url.searchParams.has('pool_timeout')) {
      url.searchParams.set('pool_timeout', String(poolTimeout));
    }

    super({
      // Query logging is opt-in (PRISMA_LOG_QUERIES=true) in every environment; see prisma-logging.ts
      log: buildPrismaLogConfig(),
      datasources: {
        db: { url: url.toString() },
      },
    });

    attachPrismaQueryLogging(this, 'primary');

    // Attach query metrics middleware
    const slowThreshold = parseInt(process.env.SLOW_QUERY_THRESHOLD_MS || '500', 10);
    attachQueryMetricsMiddleware(this, slowThreshold, 'primary');
  }

  async onModuleInit() {
    await this.$connect();
    const poolSize = process.env.DATABASE_POOL_SIZE || '10';
    this.logger.log(`Connected to database (pool_size=${poolSize})`);
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  async cleanDatabase() {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Cannot clean database in production');
    }
    // Delete all data in reverse order of dependencies
    const models = Reflect.ownKeys(this).filter(
      (key) => typeof key === 'string' && !key.startsWith('_'),
    );
    for (const model of models) {
      if (typeof model === 'string') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const delegate = (
          this as unknown as Record<string, { deleteMany?: () => Promise<unknown> }>
        )[model];
        if (typeof delegate?.deleteMany === 'function') {
          await delegate.deleteMany();
        }
      }
    }
  }
}
