import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { CacheModule } from './cache/cache.module';
import { PrismaModule } from './prisma/prisma.module';
import { AiOperationsModule } from './modules/ai/operations/ai-operations.module';
import { IntakeProcessorService } from './modules/ai/intake/intake-processor.service';

/**
 * Queue consumer process: no AppModule, no HTTP server. It reuses the AI operations providers
 * (document intake, queue, storage) and is the only place `IntakeProcessorService` is provided,
 * so the API only enqueues and never runs a job.
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
    // The AI core providers publish events; AppModule normally supplies the emitter.
    EventEmitterModule.forRoot(),
    PrismaModule,
    CacheModule,
    AiOperationsModule,
  ],
  providers: [IntakeProcessorService],
})
export class IntakeWorkerModule {}
