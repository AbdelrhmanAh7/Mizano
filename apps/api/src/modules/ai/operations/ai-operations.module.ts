import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../../prisma/prisma.module';
import { AiCoreModule } from '../core/ai-core.module';
import { AiNlpModule } from '../nlp/ai-nlp.module';

// Operations Services
import { OllamaService } from '../services/ollama.service';
import { DocumentIntakeService } from '../services/document-intake.service';
import { ReorderPointsService } from '../services/reorder-points.service';
import { PatternDetectionService } from '../services/pattern-detection.service';
import { AnomalyDetectionService } from '../services/anomaly-detection.service';
import { ReconciliationMatcherService } from '../services/reconciliation-matcher.service';

// Operations Controllers
import { DocumentIntakeController } from '../controllers/document-intake.controller';
import { ReorderPointsController } from '../controllers/reorder-points.controller';
import { PatternDetectionController } from '../controllers/pattern-detection.controller';
import { AnomalyDetectionController } from '../controllers/anomaly-detection.controller';
import { ReconciliationAiController } from '../controllers/reconciliation-ai.controller';

@Module({
  imports: [PrismaModule, AiCoreModule, AiNlpModule, HttpModule, ConfigModule],
  controllers: [
    DocumentIntakeController,
    ReorderPointsController,
    PatternDetectionController,
    AnomalyDetectionController,
    ReconciliationAiController,
  ],
  providers: [
    OllamaService,
    DocumentIntakeService,
    ReorderPointsService,
    PatternDetectionService,
    AnomalyDetectionService,
    ReconciliationMatcherService,
  ],
  exports: [
    OllamaService,
    DocumentIntakeService,
    ReorderPointsService,
    PatternDetectionService,
    AnomalyDetectionService,
    ReconciliationMatcherService,
  ],
})
export class AiOperationsModule {}
