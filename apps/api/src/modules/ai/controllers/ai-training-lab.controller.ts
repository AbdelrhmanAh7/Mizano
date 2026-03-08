import { Controller, Post, Get, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { AiFeature } from '@prisma/client';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { CurrentOrg } from '../../../common/decorators/current-org.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { AiTrainingDataGeneratorService } from '../services/ai-training-data-generator.service';
import { AiTrainingService } from '../services/ai-training.service';
import { AiFeedbackService } from '../services/ai-feedback.service';
import { ModelRegistryService } from '../services/model-registry.service';
import { TransactionCategorizerService } from '../services/transaction-categorizer.service';
import { ChurnPredictionService } from '../services/churn-prediction.service';
import { LeadScoringService } from '../services/lead-scoring.service';
import { ChatbotService } from '../services/chatbot.service';
import { QualityPredictionService } from '../services/quality-prediction.service';
import { AuditRiskService } from '../services/audit-risk.service';
import { EmployeeAttritionService } from '../services/employee-attrition.service';
import { DocumentClassificationService } from '../services/document-classification.service';
import { GenerateTrainingDataDto } from '../dto/generate-training-data.dto';
import { PrismaService } from '../../../prisma/prisma.service';

const ALL_FEATURES: AiFeature[] = [
  'CATEGORIZATION',
  'RECONCILIATION',
  'OCR_LAYOUT',
  'DEMAND_FORECAST',
  'LEAD_SCORING',
  'ANOMALY',
  'REORDER',
  'PAYMENT_PREDICTION',
  'CASH_FLOW',
  'PATTERN_DETECTION',
  'CHURN_PREDICTION',
  'CLV_ANALYSIS',
  'CROSS_SELL',
  'DYNAMIC_PRICING',
  'PIPELINE_FORECAST',
  'FRAUD_DETECTION',
  'COMPLIANCE_MONITORING',
  'AUDIT_RISK',
  'DOCUMENT_CLASSIFICATION',
  'SENTIMENT_ANALYSIS',
  'ENTITY_EXTRACTION',
  'CONTRACT_ANALYSIS',
  'EMPLOYEE_ATTRITION',
  'COMPENSATION_BENCHMARK',
  'SKILLS_GAP',
  'QUALITY_PREDICTION',
  'PREDICTIVE_MAINTENANCE',
  'WORKFORCE_SCHEDULING',
  'ROUTE_OPTIMIZATION',
  'RESOURCE_OPTIMIZATION',
  'CHATBOT',
  'KNOWLEDGE_ASSISTANT',
  'VOICE_COMMAND',
];

@ApiTags('AI Training Lab')
@ApiBearerAuth()
@Controller('ai/training-lab')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AiTrainingLabController {
  constructor(
    private generatorService: AiTrainingDataGeneratorService,
    private trainingService: AiTrainingService,
    private feedbackService: AiFeedbackService,
    private modelRegistry: ModelRegistryService,
    private categorizerService: TransactionCategorizerService,
    private churnService: ChurnPredictionService,
    private leadScoringService: LeadScoringService,
    private chatbotService: ChatbotService,
    private qualityService: QualityPredictionService,
    private auditRiskService: AuditRiskService,
    private attritionService: EmployeeAttritionService,
    private docClassService: DocumentClassificationService,
    private prisma: PrismaService,
  ) {}

  @Post('generate/:feature')
  @Permissions('ai.manage')
  @ApiOperation({ summary: 'Generate synthetic training data for an AI feature' })
  @ApiParam({ name: 'feature', enum: ALL_FEATURES })
  @ApiResponse({ status: 201, description: 'Training data generated' })
  async generateData(
    @CurrentOrg() orgId: string,
    @Param('feature') feature: AiFeature,
    @Body() dto: GenerateTrainingDataDto,
  ) {
    const result = await this.generatorService.generate(orgId, feature, dto.count || 100);
    return { data: result };
  }

  @Get('dashboard')
  @Permissions('ai.view')
  @ApiOperation({ summary: 'Get aggregated status for all 33 AI models' })
  async getDashboard(@CurrentOrg() orgId: string) {
    // Batch query: training data counts by feature
    const trainingCounts = await this.prisma.aiTrainingData.groupBy({
      by: ['feature'],
      where: { organizationId: orgId },
      _count: true,
    });

    const trainingCountMap = new Map(trainingCounts.map((tc) => [tc.feature, tc._count]));

    // Batch query: active models
    const activeModels = await this.prisma.aiModel.findMany({
      where: { organizationId: orgId, status: 'ACTIVE' },
      select: {
        feature: true,
        version: true,
        accuracy: true,
        sampleCount: true,
        trainedAt: true,
      },
    });

    const activeModelMap = new Map(activeModels.map((m) => [m.feature, m]));

    // Batch query: feedback counts by feature
    const feedbackCounts = await this.prisma.aiFeedback.groupBy({
      by: ['feature'],
      where: { organizationId: orgId },
      _count: true,
    });

    const feedbackCountMap = new Map(feedbackCounts.map((fc) => [fc.feature, fc._count]));

    // Build dashboard items
    const models = ALL_FEATURES.map((feature) => {
      const model = activeModelMap.get(feature);
      return {
        feature,
        trainingDataCount: trainingCountMap.get(feature) || 0,
        feedbackCount: feedbackCountMap.get(feature) || 0,
        hasActiveModel: !!model,
        activeVersion: model?.version || null,
        accuracy: model?.accuracy ? Number(model.accuracy) : null,
        sampleCount: model?.sampleCount || null,
        lastTrainedAt: model?.trainedAt || null,
      };
    });

    const totalActive = models.filter((m) => m.hasActiveModel).length;
    const totalTrainingData = models.reduce((sum, m) => sum + m.trainingDataCount, 0);
    const avgAccuracy =
      totalActive > 0
        ? models.filter((m) => m.accuracy !== null).reduce((sum, m) => sum + (m.accuracy || 0), 0) /
          totalActive
        : 0;

    return {
      data: {
        summary: {
          totalModels: ALL_FEATURES.length,
          activeModels: totalActive,
          totalTrainingData,
          avgAccuracy: parseFloat(avgAccuracy.toFixed(4)),
          totalFeedback: models.reduce((sum, m) => sum + m.feedbackCount, 0),
        },
        models,
      },
    };
  }

  @Get('training-stats/:feature')
  @Permissions('ai.view')
  @ApiOperation({ summary: 'Get training data statistics for a feature' })
  @ApiParam({ name: 'feature', enum: ALL_FEATURES })
  async getTrainingStats(@CurrentOrg() orgId: string, @Param('feature') feature: AiFeature) {
    const [stats, distribution] = await Promise.all([
      this.trainingService.getTrainingStats(orgId, feature),
      this.trainingService.getLabelDistribution(orgId, feature),
    ]);

    return { data: { ...stats, labelDistribution: distribution } };
  }

  @Get('readiness/:feature')
  @Permissions('ai.view')
  @ApiOperation({ summary: 'Check training readiness for a feature' })
  @ApiParam({ name: 'feature', enum: ALL_FEATURES })
  async getReadiness(@CurrentOrg() orgId: string, @Param('feature') feature: AiFeature) {
    const readiness = await this.trainingService.validateTrainingReadiness(orgId, feature);
    return { data: readiness };
  }

  @Post('train-all')
  @Permissions('ai.manage')
  @ApiOperation({ summary: 'Train all models that have sufficient training data' })
  async trainAll(@CurrentOrg() orgId: string) {
    const trainable: Array<{
      feature: AiFeature;
      train: () => Promise<unknown>;
    }> = [
      { feature: 'CATEGORIZATION', train: () => this.categorizerService.train(orgId) },
      { feature: 'CHURN_PREDICTION', train: () => this.churnService.trainModel(orgId) },
      { feature: 'LEAD_SCORING', train: () => this.leadScoringService.trainMLModel(orgId) },
      { feature: 'CHATBOT', train: () => this.chatbotService.trainClassifier(orgId) },
      { feature: 'QUALITY_PREDICTION', train: () => this.qualityService.trainModel(orgId) },
      { feature: 'AUDIT_RISK', train: () => this.auditRiskService.trainModel(orgId) },
      { feature: 'EMPLOYEE_ATTRITION', train: () => this.attritionService.trainModel(orgId) },
      { feature: 'DOCUMENT_CLASSIFICATION', train: () => this.docClassService.trainModel(orgId) },
    ];

    const trainableFeatures = new Set(trainable.map((t) => t.feature));

    const results: Array<{
      feature: string;
      trained: boolean;
      message: string;
      accuracy?: number;
    }> = [];

    // Train features that have a train method
    for (const { feature, train } of trainable) {
      try {
        const readiness = await this.trainingService.validateTrainingReadiness(orgId, feature);
        if (!readiness.isReady) {
          results.push({
            feature,
            trained: false,
            message: `Not ready: ${readiness.currentSamples}/${readiness.minimumRequired} samples`,
          });
          continue;
        }

        const result = await train();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const resultObj = result as any;
        results.push({
          feature,
          trained: true,
          message: 'Training completed',
          accuracy: resultObj?.accuracy ?? resultObj?.testAccuracy ?? undefined,
        });
      } catch (error) {
        results.push({
          feature,
          trained: false,
          message: `Training failed: ${error.message}`,
        });
      }
    }

    // Report non-trainable features
    for (const feature of ALL_FEATURES) {
      if (!trainableFeatures.has(feature)) {
        results.push({
          feature,
          trained: false,
          message: 'No direct training method available',
        });
      }
    }

    const trainedCount = results.filter((r) => r.trained).length;
    return {
      data: {
        summary: {
          total: ALL_FEATURES.length,
          trained: trainedCount,
          failed: trainable.length - trainedCount,
        },
        results,
      },
    };
  }
}
