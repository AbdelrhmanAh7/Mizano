import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { CacheModule } from './cache/cache.module';
import { envFilePaths } from './env-files';
import { AiOperationsModule } from './modules/ai/operations/ai-operations.module';
import { PrismaModule } from './prisma/prisma.module';

/**
 * Intake worker: only what document extraction needs. No HTTP server, no
 * scheduled ledger jobs (those stay in the API), so the worker can run in its
 * own container with its own memory limit. See worker.ts.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: envFilePaths() }),
    EventEmitterModule.forRoot(),
    PrismaModule,
    CacheModule,
    AiOperationsModule,
  ],
})
export class WorkerModule {}
