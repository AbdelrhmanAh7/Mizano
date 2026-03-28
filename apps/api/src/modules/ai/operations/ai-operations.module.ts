import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../../prisma/prisma.module';
import { AiCoreModule } from '../core/ai-core.module';
import { AiNlpModule } from '../nlp/ai-nlp.module';

// Operations Services
import { OllamaService } from '../services/ollama.service';
import { PaddleOcrService } from '../services/paddle-ocr.service';
import { DocumentIntakeService } from '../services/document-intake.service';
import { ReorderPointsService } from '../services/reorder-points.service';
import { PatternDetectionService } from '../services/pattern-detection.service';
import { AnomalyDetectionService } from '../services/anomaly-detection.service';
import { ReconciliationMatcherService } from '../services/reconciliation-matcher.service';

// Extraction Strategies
import { VlmStrategy } from '../extraction/vlm-strategy.service';
import { OcrLlmStrategy } from '../extraction/ocr-llm-strategy.service';
import { HybridStrategy } from '../extraction/hybrid-strategy.service';
import { ExtractionStrategyResolver } from '../extraction/extraction-strategy-resolver.service';

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
    PaddleOcrService,
    VlmStrategy,
    OcrLlmStrategy,
    HybridStrategy,
    ExtractionStrategyResolver,
    DocumentIntakeService,
    ReorderPointsService,
    PatternDetectionService,
    AnomalyDetectionService,
    ReconciliationMatcherService,
  ],
  exports: [
    OllamaService,
    PaddleOcrService,
    ExtractionStrategyResolver,
    DocumentIntakeService,
    ReorderPointsService,
    PatternDetectionService,
    AnomalyDetectionService,
    ReconciliationMatcherService,
  ],
})
export class AiOperationsModule {}
