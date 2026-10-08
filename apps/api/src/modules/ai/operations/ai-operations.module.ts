import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../../prisma/prisma.module';
import { AiCoreModule } from '../core/ai-core.module';
import { AiNlpModule } from '../nlp/ai-nlp.module';

// Operations Services
import { OllamaService } from '../services/ollama.service';
import { IntakeConfirmationService } from '../services/intake-confirmation.service';
import { ReorderPointsService } from '../services/reorder-points.service';
import { PatternDetectionService } from '../services/pattern-detection.service';
import { AnomalyDetectionService } from '../services/anomaly-detection.service';
import { ReconciliationMatcherService } from '../services/reconciliation-matcher.service';

// Intake Queue & Processing (API side: enqueue only)
import { IntakeJobOwnerGuard } from '../intake/intake-job-owner.guard';
import { IntakeJobsService } from '../intake/intake-jobs.service';
import { IntakeQueueService } from '../intake/intake-queue.service';
import { IntakeStorage, LocalFsIntakeStorage } from '../intake/intake-storage';

// Operations Controllers
import { DocumentIntakeController } from '../controllers/document-intake.controller';
import { ReorderPointsController } from '../controllers/reorder-points.controller';
import { PatternDetectionController } from '../controllers/pattern-detection.controller';
import { AnomalyDetectionController } from '../controllers/anomaly-detection.controller';
import { ReconciliationAiController } from '../controllers/reconciliation-ai.controller';
import { OllamaTunnelController } from '../controllers/ollama-tunnel.controller';

@Module({
  imports: [PrismaModule, AiCoreModule, AiNlpModule, HttpModule, ConfigModule],
  controllers: [
    DocumentIntakeController,
    ReorderPointsController,
    PatternDetectionController,
    AnomalyDetectionController,
    ReconciliationAiController,
    OllamaTunnelController,
  ],
  providers: [
    OllamaService,
    IntakeConfirmationService,
    IntakeJobsService,
    IntakeJobOwnerGuard,
    IntakeQueueService,
    { provide: IntakeStorage, useClass: LocalFsIntakeStorage },
    ReorderPointsService,
    PatternDetectionService,
    AnomalyDetectionService,
    ReconciliationMatcherService,
  ],
  exports: [
    OllamaService,
    IntakeQueueService,
    IntakeJobsService,
    IntakeConfirmationService,
    ReorderPointsService,
    PatternDetectionService,
    AnomalyDetectionService,
    ReconciliationMatcherService,
  ],
})
export class AiOperationsModule {}
