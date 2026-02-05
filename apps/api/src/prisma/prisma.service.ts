import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({
      log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  async cleanDatabase() {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Cannot clean database in production');
    }
    // Delete all data in reverse order of dependencies
    const models = Reflect.ownKeys(this).filter((key) => typeof key === 'string' && !key.startsWith('_'));
    for (const model of models) {
      if (typeof (this as any)[model]?.deleteMany === 'function') {
        await (this as any)[model].deleteMany();
      }
    }
  }
}
