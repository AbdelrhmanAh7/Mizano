import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { CacheModule } from './cache/cache.module';
import { PrismaModule } from './prisma/prisma.module';
import { IntakeModule } from './modules/ai/intake/intake.module';

/**
 * Queue consumer process: no AppModule, no HTTP server. `IntakeModule` is the only place
 * `IntakeProcessorService` is provided, so the API only enqueues and never runs a job.
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
    IntakeModule,
  ],
})
export class IntakeWorkerModule {}
