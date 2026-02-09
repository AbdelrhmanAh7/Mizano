import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module';
import { AiCoreModule } from '../core/ai-core.module';
import { AiNlpModule } from '../nlp/ai-nlp.module';

// Operations Services
import { OcrService } from '../services/ocr.service';
import { PaddleOcrService } from '../services/paddle-ocr.service';
import { DocumentIntakeService } from '../services/document-intake.service';
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

@Module({
  imports: [PrismaModule, AiCoreModule, AiNlpModule],
  controllers: [
    OcrController,
    OcrTrainingController,
    DocumentIntakeController,
    ReorderPointsController,
    PatternDetectionController,
    AnomalyDetectionController,
    ReconciliationAiController,
  ],
  providers: [
    OcrService,
    PaddleOcrService,
    DocumentIntakeService,
    ReorderPointsService,
    PatternDetectionService,
    AnomalyDetectionService,
    ReconciliationMatcherService,
  ],
  exports: [
    OcrService,
    PaddleOcrService,
    DocumentIntakeService,
    ReorderPointsService,
    PatternDetectionService,
    AnomalyDetectionService,
    ReconciliationMatcherService,
  ],
})
export class AiOperationsModule {}
