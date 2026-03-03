import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../../prisma/prisma.module';
import { AiCoreModule } from '../core/ai-core.module';
import { AiNlpModule } from '../nlp/ai-nlp.module';

// Operations Services
import { VlmService } from '../services/vlm.service';
import { VlmFeedbackService } from '../services/vlm-feedback.service';
import { OcrService } from '../services/ocr.service';
import { PaddleOcrService } from '../services/paddle-ocr.service';
import { DocumentIntakeService } from '../services/document-intake.service';
import { OcrMicroserviceClient } from '../services/ocr-microservice-client.service';
import { ReorderPointsService } from '../services/reorder-points.service';
import { PatternDetectionService } from '../services/pattern-detection.service';
import { AnomalyDetectionService } from '../services/anomaly-detection.service';
import { ReconciliationMatcherService } from '../services/reconciliation-matcher.service';

// Operations Controllers
import { OcrController } from '../controllers/ocr.controller';
import { OcrTrainingController } from '../controllers/ocr-training.controller';
import { DocumentIntakeController } from '../controllers/document-intake.controller';
import { ReorderPointsController } from '../controllers/reorder-points.controller';
import { PatternDetectionController } from '../controllers/pattern-detection.controller';
import { AnomalyDetectionController } from '../controllers/anomaly-detection.controller';
import { ReconciliationAiController } from '../controllers/reconciliation-ai.controller';
import { VlmStatsController } from '../controllers/vlm-stats.controller';

@Module({
  imports: [PrismaModule, AiCoreModule, AiNlpModule, HttpModule, ConfigModule],
  controllers: [
    OcrController,
    OcrTrainingController,
    DocumentIntakeController,
    ReorderPointsController,
    PatternDetectionController,
    AnomalyDetectionController,
    ReconciliationAiController,
    VlmStatsController,
  ],
  providers: [
    VlmService,
    VlmFeedbackService,
    OcrService,
    PaddleOcrService,
    DocumentIntakeService,
    OcrMicroserviceClient,
    ReorderPointsService,
    PatternDetectionService,
    AnomalyDetectionService,
    ReconciliationMatcherService,
  ],
  exports: [
    VlmService,
    VlmFeedbackService,
    OcrService,
    PaddleOcrService,
    DocumentIntakeService,
    OcrMicroserviceClient,
    ReorderPointsService,
    PatternDetectionService,
    AnomalyDetectionService,
    ReconciliationMatcherService,
  ],
})
export class AiOperationsModule {}
