import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../../prisma/prisma.module';
import { AiOperationsModule } from '../operations/ai-operations.module';
import { IntakeJobOwnerGuard } from './intake-job-owner.guard';
import { IntakeJobsService } from './intake-jobs.service';
import { IntakeProcessorService } from './intake-processor.service';

/**
 * Self-contained intake consumer: the processor, the job service and the owner guard on top of
 * the queue, storage and extraction providers that AiOperationsModule already exports.
 *
 * `AiOperationsModule` (so `AppModule`) deliberately does not provide `IntakeProcessorService`;
 * only a context that imports this module consumes the queue. Do not import both
 * `IntakeModule` and a module that declares its own `IntakeJobsService` in one process.
 */
@Module({
  imports: [ConfigModule, PrismaModule, AiOperationsModule],
  providers: [IntakeProcessorService, IntakeJobsService, IntakeJobOwnerGuard],
  // Re-exporting the module also exposes the queue and storage providers it exports.
  exports: [IntakeProcessorService, IntakeJobsService, IntakeJobOwnerGuard, AiOperationsModule],
})
export class IntakeModule {}
