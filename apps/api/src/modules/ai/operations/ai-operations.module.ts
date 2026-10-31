import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../../prisma/prisma.module';
import { AiAccountModule } from '../account/ai-account.module';

// Document intake: readers, classification and party matching (CPU), jobs and storage
import { AiDocumentReader } from '../extraction/ai-document-reader';
import { ExtractionStrategyResolver } from '../extraction/extraction-strategy-resolver.service';
import { RulesStrategy } from '../extraction/rules-strategy.service';
import { AiFeedbackService } from '../services/ai-feedback.service';
import { DocumentClassificationService } from '../services/document-classification.service';
import { DocumentIntakeService } from '../services/document-intake.service';
import { EntityExtractionService } from '../services/entity-extraction.service';

import { IntakeJobOwnerGuard } from '../intake/intake-job-owner.guard';
import { IntakeJobsService } from '../intake/intake-jobs.service';
import { IntakeQueueService } from '../intake/intake-queue.service';
import { IntakeStorage, LocalFsIntakeStorage } from '../intake/intake-storage';
import { INTAKE_CLOCK, monotonicClock } from '../intake/stage-timer';

import { DocumentIntakeController } from '../controllers/document-intake.controller';

/**
 * Invoice and receipt intake. Reading uses the organization's own AI provider only when its
 * `documents` feature is active (AiAccountModule); otherwise the CPU rules reader.
 */
@Module({
  imports: [PrismaModule, ConfigModule, AiAccountModule],
  controllers: [DocumentIntakeController],
  providers: [
    RulesStrategy,
    AiDocumentReader,
    ExtractionStrategyResolver,
    DocumentClassificationService,
    EntityExtractionService,
    AiFeedbackService,
    DocumentIntakeService,
    IntakeJobsService,
    IntakeJobOwnerGuard,
    IntakeQueueService,
    { provide: IntakeStorage, useClass: LocalFsIntakeStorage },
    { provide: INTAKE_CLOCK, useValue: monotonicClock },
  ],
  exports: [
    DocumentIntakeService,
    IntakeJobsService,
    IntakeJobOwnerGuard,
    IntakeQueueService,
    IntakeStorage,
  ],
})
export class AiOperationsModule {}
