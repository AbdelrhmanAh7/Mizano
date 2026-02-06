import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { PrismaModule } from '../../prisma/prisma.module';

// Existing Services
import { AiInsightsService } from './services/ai-insights.service';
import { AiForecastingService } from './services/ai-forecasting.service';
import { AiCategorizationService } from './services/ai-categorization.service';

// New Core Services
import { AiTrainingService } from './services/ai-training.service';
import { AiFeedbackService } from './services/ai-feedback.service';
import { ModelRegistryService } from './services/model-registry.service';

// New Feature Services
import { AnomalyDetectionService } from './services/anomaly-detection.service';
import { ReorderPointsService } from './services/reorder-points.service';
import { ReconciliationMatcherService } from './services/reconciliation-matcher.service';
import { OcrService } from './services/ocr.service';

// AI Model Services (Models 1, 6, 10)
import { TransactionCategorizerService } from './services/transaction-categorizer.service';
import { PaymentPredictionService } from './services/payment-prediction.service';
import { FinancialNarrativeService } from './services/financial-narrative.service';

// AI Model Services (Models 4, 5, 7)
import { DemandForecastingService } from './services/demand-forecasting.service';
import { CashFlowPredictionService } from './services/cash-flow-prediction.service';
import { LeadScoringService } from './services/lead-scoring.service';

// Pattern Detection & AI Alerts Services (Feature 1 & 2)
import { PatternDetectionService } from './services/pattern-detection.service';
import { AiAlertsService } from './services/ai-alerts.service';

// Controllers
import { AiController } from './controllers/ai.controller';
import { AiFeedbackController } from './controllers/ai-feedback.controller';
import { AnomalyDetectionController } from './controllers/anomaly-detection.controller';
import { ReorderPointsController } from './controllers/reorder-points.controller';
import { ReconciliationAiController } from './controllers/reconciliation-ai.controller';
import { OcrController } from './controllers/ocr.controller';

// AI Model Controllers (Models 1, 6, 10)
import { CategorizationController } from './controllers/categorization.controller';
import { PaymentPredictionController } from './controllers/payment-prediction.controller';
import { NarrativeController } from './controllers/narrative.controller';

// AI Model Controllers (Models 4, 5, 7)
import { DemandForecastingController } from './controllers/demand-forecasting.controller';
import { CashFlowPredictionController } from './controllers/cash-flow-prediction.controller';
import { LeadScoringController } from './controllers/lead-scoring.controller';

// Pattern Detection & AI Alerts Controllers (Feature 1 & 2)
import { PatternDetectionController } from './controllers/pattern-detection.controller';
import { AiAlertsController } from './controllers/ai-alerts.controller';

// Schedulers
import { AiRetrainingScheduler } from './schedulers/ai-retraining.scheduler';

@Module({
  imports: [
    PrismaModule,
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot(),
  ],
  controllers: [
    AiController,
    AiFeedbackController,
    AnomalyDetectionController,
    ReorderPointsController,
    ReconciliationAiController,
    OcrController,
    CategorizationController,
    PaymentPredictionController,
    NarrativeController,
    DemandForecastingController,
    CashFlowPredictionController,
    LeadScoringController,
    PatternDetectionController,
    AiAlertsController,
  ],
  providers: [
    // Existing Services
    AiInsightsService,
    AiForecastingService,
    AiCategorizationService,

    // New Core Services
    AiTrainingService,
    AiFeedbackService,
    ModelRegistryService,

    // New Feature Services
    AnomalyDetectionService,
    ReorderPointsService,
    ReconciliationMatcherService,
    OcrService,

    // AI Model Services (Models 1, 6, 10)
    TransactionCategorizerService,
    PaymentPredictionService,
    FinancialNarrativeService,

    // AI Model Services (Models 4, 5, 7)
    DemandForecastingService,
    CashFlowPredictionService,
    LeadScoringService,

    // Pattern Detection & AI Alerts Services (Feature 1 & 2)
    PatternDetectionService,
    AiAlertsService,

    // Schedulers
    AiRetrainingScheduler,
  ],
  exports: [
    // Existing Services
    AiInsightsService,
    AiForecastingService,
    AiCategorizationService,

    // New Core Services
    AiTrainingService,
    AiFeedbackService,
    ModelRegistryService,

    // New Feature Services
    AnomalyDetectionService,
    ReorderPointsService,
    ReconciliationMatcherService,
    OcrService,

    // AI Model Services (Models 1, 6, 10)
    TransactionCategorizerService,
    PaymentPredictionService,
    FinancialNarrativeService,

    // AI Model Services (Models 4, 5, 7)
    DemandForecastingService,
    CashFlowPredictionService,
    LeadScoringService,

    // Pattern Detection & AI Alerts Services (Feature 1 & 2)
    PatternDetectionService,
    AiAlertsService,
  ],
})
export class AiModule {}
