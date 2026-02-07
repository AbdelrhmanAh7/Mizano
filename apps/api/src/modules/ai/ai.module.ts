import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';

// Existing Services
import { AiInsightsService } from './services/ai-insights.service';
import { AiForecastingService } from './services/ai-forecasting.service';
import { AiCategorizationService } from './services/ai-categorization.service';

// Core Services
import { AiTrainingService } from './services/ai-training.service';
import { AiFeedbackService } from './services/ai-feedback.service';
import { ModelRegistryService } from './services/model-registry.service';

// Feature Services
import { AnomalyDetectionService } from './services/anomaly-detection.service';
import { ReorderPointsService } from './services/reorder-points.service';
import { ReconciliationMatcherService } from './services/reconciliation-matcher.service';
import { OcrService } from './services/ocr.service';

// AI Model Services (Core Financial)
import { TransactionCategorizerService } from './services/transaction-categorizer.service';
import { PaymentPredictionService } from './services/payment-prediction.service';
import { FinancialNarrativeService } from './services/financial-narrative.service';
import { DemandForecastingService } from './services/demand-forecasting.service';
import { CashFlowPredictionService } from './services/cash-flow-prediction.service';
import { LeadScoringService } from './services/lead-scoring.service';

// Pattern Detection & AI Alerts Services
import { PatternDetectionService } from './services/pattern-detection.service';
import { AiAlertsService } from './services/ai-alerts.service';

// Sales & CRM AI Services
import { ChurnPredictionService } from './services/churn-prediction.service';
import { ClvAnalysisService } from './services/clv-analysis.service';
import { CrossSellService } from './services/cross-sell.service';
import { DynamicPricingService } from './services/dynamic-pricing.service';
import { PipelineForecastService } from './services/pipeline-forecast.service';

// Security & Compliance AI Services
import { FraudDetectionService } from './services/fraud-detection.service';
import { ComplianceMonitoringService } from './services/compliance-monitoring.service';
import { AuditRiskService } from './services/audit-risk.service';

// NLP & Chat AI Services
import { ChatbotService } from './services/chatbot.service';
import { DocumentClassificationService } from './services/document-classification.service';
import { SentimentAnalysisService } from './services/sentiment-analysis.service';
import { EntityExtractionService } from './services/entity-extraction.service';
import { ContractAnalysisService } from './services/contract-analysis.service';
import { KnowledgeAssistantService } from './services/knowledge-assistant.service';
import { VoiceCommandService } from './services/voice-command.service';

// HR & Operations AI Services
import { EmployeeAttritionService } from './services/employee-attrition.service';
import { CompensationBenchmarkService } from './services/compensation-benchmark.service';
import { SkillsGapService } from './services/skills-gap.service';
import { WorkforceSchedulingService } from './services/workforce-scheduling.service';
import { QualityPredictionService } from './services/quality-prediction.service';
import { PredictiveMaintenanceService } from './services/predictive-maintenance.service';
import { ResourceOptimizationService } from './services/resource-optimization.service';
import { RouteOptimizationService } from './services/route-optimization.service';

// Document Intake Pipeline
import { DocumentIntakeService } from './services/document-intake.service';

// Existing Controllers
import { AiController } from './controllers/ai.controller';
import { AiFeedbackController } from './controllers/ai-feedback.controller';
import { AnomalyDetectionController } from './controllers/anomaly-detection.controller';
import { ReorderPointsController } from './controllers/reorder-points.controller';
import { ReconciliationAiController } from './controllers/reconciliation-ai.controller';
import { OcrController } from './controllers/ocr.controller';
import { CategorizationController } from './controllers/categorization.controller';
import { PaymentPredictionController } from './controllers/payment-prediction.controller';
import { NarrativeController } from './controllers/narrative.controller';
import { DemandForecastingController } from './controllers/demand-forecasting.controller';
import { CashFlowPredictionController } from './controllers/cash-flow-prediction.controller';
import { LeadScoringController } from './controllers/lead-scoring.controller';
import { PatternDetectionController } from './controllers/pattern-detection.controller';
import { AiAlertsController } from './controllers/ai-alerts.controller';

// Sales & CRM AI Controllers
import { ChurnPredictionController } from './controllers/churn-prediction.controller';
import { ClvAnalysisController } from './controllers/clv-analysis.controller';
import { CrossSellController } from './controllers/cross-sell.controller';
import { DynamicPricingController } from './controllers/dynamic-pricing.controller';
import { PipelineForecastController } from './controllers/pipeline-forecast.controller';

// Security & Compliance AI Controllers
import { FraudDetectionController } from './controllers/fraud-detection.controller';
import { ComplianceMonitoringController } from './controllers/compliance-monitoring.controller';
import { AuditRiskController } from './controllers/audit-risk.controller';

// NLP & Chat AI Controllers
import { ChatbotController } from './controllers/chatbot.controller';
import { DocumentClassificationController } from './controllers/document-classification.controller';
import { SentimentAnalysisController } from './controllers/sentiment-analysis.controller';
import { EntityExtractionController } from './controllers/entity-extraction.controller';
import { ContractAnalysisController } from './controllers/contract-analysis.controller';
import { KnowledgeAssistantController } from './controllers/knowledge-assistant.controller';
import { VoiceCommandController } from './controllers/voice-command.controller';

// HR & Operations AI Controllers
import { EmployeeAttritionController } from './controllers/employee-attrition.controller';
import { CompensationBenchmarkController } from './controllers/compensation-benchmark.controller';
import { SkillsGapController } from './controllers/skills-gap.controller';
import { WorkforceSchedulingController } from './controllers/workforce-scheduling.controller';
import { QualityPredictionController } from './controllers/quality-prediction.controller';
import { PredictiveMaintenanceController } from './controllers/predictive-maintenance.controller';
import { ResourceOptimizationController } from './controllers/resource-optimization.controller';
import { RouteOptimizationController } from './controllers/route-optimization.controller';

// Document Intake Pipeline
import { DocumentIntakeController } from './controllers/document-intake.controller';

// Schedulers
import { AiRetrainingScheduler } from './schedulers/ai-retraining.scheduler';
import { AiSalesCrmScheduler } from './schedulers/ai-sales-crm.scheduler';
import { AiSecurityScheduler } from './schedulers/ai-security.scheduler';
import { AiHrOpsScheduler } from './schedulers/ai-hr-ops.scheduler';
import { AiNlpChatScheduler } from './schedulers/ai-nlp-chat.scheduler';

@Module({
  imports: [PrismaModule],
  controllers: [
    // Core
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
    // Sales & CRM
    ChurnPredictionController,
    ClvAnalysisController,
    CrossSellController,
    DynamicPricingController,
    PipelineForecastController,
    // Security & Compliance
    FraudDetectionController,
    ComplianceMonitoringController,
    AuditRiskController,
    // NLP & Chat
    ChatbotController,
    DocumentClassificationController,
    SentimentAnalysisController,
    EntityExtractionController,
    ContractAnalysisController,
    KnowledgeAssistantController,
    VoiceCommandController,
    // HR & Operations
    EmployeeAttritionController,
    CompensationBenchmarkController,
    SkillsGapController,
    WorkforceSchedulingController,
    QualityPredictionController,
    PredictiveMaintenanceController,
    ResourceOptimizationController,
    RouteOptimizationController,
    // Document Intake
    DocumentIntakeController,
  ],
  providers: [
    // Existing Services
    AiInsightsService,
    AiForecastingService,
    AiCategorizationService,
    // Core Services
    AiTrainingService,
    AiFeedbackService,
    ModelRegistryService,
    // Feature Services
    AnomalyDetectionService,
    ReorderPointsService,
    ReconciliationMatcherService,
    OcrService,
    // Core Financial AI
    TransactionCategorizerService,
    PaymentPredictionService,
    FinancialNarrativeService,
    DemandForecastingService,
    CashFlowPredictionService,
    LeadScoringService,
    // Pattern Detection & Alerts
    PatternDetectionService,
    AiAlertsService,
    // Sales & CRM AI
    ChurnPredictionService,
    ClvAnalysisService,
    CrossSellService,
    DynamicPricingService,
    PipelineForecastService,
    // Security & Compliance AI
    FraudDetectionService,
    ComplianceMonitoringService,
    AuditRiskService,
    // NLP & Chat AI
    ChatbotService,
    DocumentClassificationService,
    SentimentAnalysisService,
    EntityExtractionService,
    ContractAnalysisService,
    KnowledgeAssistantService,
    VoiceCommandService,
    // HR & Operations AI
    EmployeeAttritionService,
    CompensationBenchmarkService,
    SkillsGapService,
    WorkforceSchedulingService,
    QualityPredictionService,
    PredictiveMaintenanceService,
    ResourceOptimizationService,
    RouteOptimizationService,
    // Document Intake
    DocumentIntakeService,
    // Schedulers
    AiRetrainingScheduler,
    AiSalesCrmScheduler,
    AiSecurityScheduler,
    AiHrOpsScheduler,
    AiNlpChatScheduler,
  ],
  exports: [
    // Existing Services
    AiInsightsService,
    AiForecastingService,
    AiCategorizationService,
    // Core Services
    AiTrainingService,
    AiFeedbackService,
    ModelRegistryService,
    // Feature Services
    AnomalyDetectionService,
    ReorderPointsService,
    ReconciliationMatcherService,
    OcrService,
    // Core Financial AI
    TransactionCategorizerService,
    PaymentPredictionService,
    FinancialNarrativeService,
    DemandForecastingService,
    CashFlowPredictionService,
    LeadScoringService,
    // Pattern Detection & Alerts
    PatternDetectionService,
    AiAlertsService,
    // Sales & CRM AI
    ChurnPredictionService,
    ClvAnalysisService,
    CrossSellService,
    DynamicPricingService,
    PipelineForecastService,
    // Security & Compliance AI
    FraudDetectionService,
    ComplianceMonitoringService,
    AuditRiskService,
    // NLP & Chat AI
    ChatbotService,
    DocumentClassificationService,
    SentimentAnalysisService,
    EntityExtractionService,
    ContractAnalysisService,
    KnowledgeAssistantService,
    VoiceCommandService,
    // HR & Operations AI
    EmployeeAttritionService,
    CompensationBenchmarkService,
    SkillsGapService,
    WorkforceSchedulingService,
    QualityPredictionService,
    PredictiveMaintenanceService,
    ResourceOptimizationService,
    RouteOptimizationService,
    // Document Intake
    DocumentIntakeService,
  ],
})
export class AiModule {}
