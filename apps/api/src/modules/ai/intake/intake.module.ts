import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../../prisma/prisma.module';
import { AiOperationsModule } from '../operations/ai-operations.module';
import { IntakeProcessorService } from './intake-processor.service';

/**
 * Self-contained intake consumer: adds `IntakeProcessorService` on top of the queue, storage,
 * extraction, job service and owner guard that `AiOperationsModule` provides and exports. Those
 * are provided in exactly one place, so importing this module never creates a second
 * `IntakeJobsService` (and a second recovery sweep).
 *
 * `AiOperationsModule` (so `AppModule`) deliberately does not provide `IntakeProcessorService`;
 * only a context that imports this module consumes the queue.
 */
@Module({
  imports: [ConfigModule, PrismaModule, AiOperationsModule],
  providers: [IntakeProcessorService],
  // Re-exporting the module also exposes the queue, jobs service, guard and storage it exports.
  exports: [IntakeProcessorService, AiOperationsModule],
})
export class IntakeModule {}
