import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaService } from './prisma/prisma.service';
import { IntakeQueueService } from './modules/ai/intake/intake-queue.service';
import { IntakeProcessorService } from './modules/ai/intake/intake-processor.service';
import { IntakeExecutorService } from './modules/ai/intake/intake-executor.service';
import { IntakeMatchingService } from './modules/ai/intake/intake-matching.service';

/**
 * Deliberately excludes AppModule, HTTP controllers, schedulers and all AI/LLM modules. The
 * extraction child applies the deterministic rules; `IntakeMatchingService` adds the tenant-scoped
 * vendor and duplicate checks from the database, with no model.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Same resolution as AppModule so a worker started from apps/api sees the same settings.
      envFilePath: [
        `.env.${process.env.APP_ENV || 'local'}`,
        '.env',
        `../../.env.${process.env.APP_ENV || 'local'}`,
        '../../.env',
      ],
    }),
  ],
  providers: [
    PrismaService,
    IntakeQueueService,
    IntakeExecutorService,
    IntakeMatchingService,
    IntakeProcessorService,
  ],
})
export class IntakeWorkerModule {}
