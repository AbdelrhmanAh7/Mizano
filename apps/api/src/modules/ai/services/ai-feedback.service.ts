import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../../prisma/prisma.service';
import { AiFeature, AiFeedbackAction } from '@prisma/client';
import { AiTrainingService } from './ai-training.service';

export interface FeedbackDto {
  feature: AiFeature;
  predictionId?: string;
  aiSuggestion: Record<string, any>;
  userAction: AiFeedbackAction;
  userAnswer?: string;
  inputData: Record<string, any>;
}

export interface FeedbackStats {
  total: number;
  accepted: number;
  rejected: number;
  corrected: number;
  acceptanceRate: number;
  rejectionRate: number;
  correctionRate: number;
}

// Retraining thresholds per feature (0 = retraining disabled)
const RETRAINING_THRESHOLDS: Record<AiFeature, number> = {
  // Core financial
  CATEGORIZATION: 50,
  RECONCILIATION: 30,
  OCR_LAYOUT: 20,
  DEMAND_FORECAST: 100,
  LEAD_SCORING: 20,
  ANOMALY: 50,
  REORDER: 50,
  PAYMENT_PREDICTION: 30,
  CASH_FLOW: 50,
  PATTERN_DETECTION: 30,
  // Sales & CRM
  CHURN_PREDICTION: 30,
  CLV_ANALYSIS: 50,
  CROSS_SELL: 40,
  DYNAMIC_PRICING: 50,
  PIPELINE_FORECAST: 30,
  // Security
  FRAUD_DETECTION: 20,
  COMPLIANCE_MONITORING: 30,
  AUDIT_RISK: 30,
  // NLP & Documents
  DOCUMENT_CLASSIFICATION: 30,
  SENTIMENT_ANALYSIS: 50,
  ENTITY_EXTRACTION: 30,
  CONTRACT_ANALYSIS: 50,
  // HR
  EMPLOYEE_ATTRITION: 30,
  COMPENSATION_BENCHMARK: 50,
  SKILLS_GAP: 50,
  QUALITY_PREDICTION: 40,
  PREDICTIVE_MAINTENANCE: 40,
  WORKFORCE_SCHEDULING: 50,
  // Operations
  ROUTE_OPTIMIZATION: 100,
  RESOURCE_OPTIMIZATION: 100,
  // Chat
  CHATBOT: 50,
  KNOWLEDGE_ASSISTANT: 50,
  // Not implemented
  VOICE_COMMAND: 0,
};

@Injectable()
export class AiFeedbackService {
  private readonly logger = new Logger(AiFeedbackService.name);

  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
    private trainingService: AiTrainingService,
  ) {}

  /**
   * Process user feedback (accept/reject/correct)
   */
  async processFeedback(
    organizationId: string,
    dto: FeedbackDto,
  ): Promise<{ id: string; shouldRetrain: boolean }> {
    // Store the feedback
    const feedback = await this.prisma.aiFeedback.create({
      data: {
        organizationId,
        feature: dto.feature,
        predictionId: dto.predictionId,
        aiSuggestion: dto.aiSuggestion,
        userAction: dto.userAction,
        userAnswer: dto.userAnswer,
        inputData: dto.inputData,
      },
    });

    this.logger.debug(
      `Received ${dto.userAction} feedback for ${dto.feature} in org ${organizationId}`,
    );

    // If corrected, add to training data
    if (dto.userAction === 'CORRECTED' && dto.userAnswer) {
      await this.trainingService.addTrainingData(
        organizationId,
        dto.feature,
        dto.inputData,
        dto.userAnswer,
        'CORRECTION',
      );
    }

    // Check if retraining is needed
    const { shouldRetrain } = await this.checkRetrainingThreshold(organizationId, dto.feature);

    if (shouldRetrain) {
      this.triggerRetraining(organizationId, dto.feature);
    }

    return { id: feedback.id, shouldRetrain };
  }

  /**
   * Check if retraining threshold is met
   */
  async checkRetrainingThreshold(
    organizationId: string,
    feature: AiFeature,
  ): Promise<{ shouldRetrain: boolean; correctionCount: number; threshold: number }> {
    const threshold = RETRAINING_THRESHOLDS[feature];

    // Features with threshold 0 have retraining disabled
    if (threshold === 0) {
      return { shouldRetrain: false, correctionCount: 0, threshold: 0 };
    }

    const correctionCount = await this.trainingService.countCorrectionsSinceLastTraining(
      organizationId,
      feature,
    );

    const shouldRetrain = correctionCount >= threshold;

    return { shouldRetrain, correctionCount, threshold };
  }

  /**
   * Get feedback statistics for a feature
   */
  async getFeedbackStats(
    organizationId: string,
    feature: AiFeature,
    options?: { startDate?: Date; endDate?: Date },
  ): Promise<FeedbackStats> {
    const where: any = {
      organizationId,
      feature,
      ...(options?.startDate || options?.endDate
        ? {
            createdAt: {
              ...(options.startDate && { gte: options.startDate }),
              ...(options.endDate && { lte: options.endDate }),
            },
          }
        : {}),
    };

    const [total, byAction] = await Promise.all([
      this.prisma.aiFeedback.count({ where }),
      this.prisma.aiFeedback.groupBy({
        by: ['userAction'],
        where,
        _count: true,
      }),
    ]);

    const actionCounts: Record<AiFeedbackAction, number> = {
      ACCEPTED: 0,
      REJECTED: 0,
      CORRECTED: 0,
    };

    for (const item of byAction) {
      actionCounts[item.userAction] = item._count;
    }

    return {
      total,
      accepted: actionCounts.ACCEPTED,
      rejected: actionCounts.REJECTED,
      corrected: actionCounts.CORRECTED,
      acceptanceRate: total > 0 ? actionCounts.ACCEPTED / total : 0,
      rejectionRate: total > 0 ? actionCounts.REJECTED / total : 0,
      correctionRate: total > 0 ? actionCounts.CORRECTED / total : 0,
    };
  }

  /**
   * Get recent feedback for a feature
   */
  async getRecentFeedback(
    organizationId: string,
    feature: AiFeature,
    limit: number = 50,
  ): Promise<
    Array<{
      id: string;
      userAction: AiFeedbackAction;
      aiSuggestion: any;
      userAnswer: string | null;
      createdAt: Date;
    }>
  > {
    const feedback = await this.prisma.aiFeedback.findMany({
      where: {
        organizationId,
        feature,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        userAction: true,
        aiSuggestion: true,
        userAnswer: true,
        createdAt: true,
      },
    });

    return feedback;
  }

  /**
   * Get feedback for a specific prediction
   */
  async getFeedbackForPrediction(
    organizationId: string,
    predictionId: string,
  ): Promise<{
    id: string;
    userAction: AiFeedbackAction;
    userAnswer: string | null;
  } | null> {
    const feedback = await this.prisma.aiFeedback.findFirst({
      where: {
        organizationId,
        predictionId,
      },
      select: {
        id: true,
        userAction: true,
        userAnswer: true,
      },
    });

    return feedback;
  }

  /**
   * Get aggregated feedback trends
   */
  async getFeedbackTrends(
    organizationId: string,
    feature: AiFeature,
    days: number = 30,
  ): Promise<
    Array<{
      date: string;
      accepted: number;
      rejected: number;
      corrected: number;
    }>
  > {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    const feedback = await this.prisma.aiFeedback.findMany({
      where: {
        organizationId,
        feature,
        createdAt: { gte: startDate },
      },
      select: {
        userAction: true,
        createdAt: true,
      },
    });

    // Aggregate by date
    const trends: Record<string, { accepted: number; rejected: number; corrected: number }> = {};

    for (const item of feedback) {
      const date = item.createdAt.toISOString().split('T')[0];
      if (!trends[date]) {
        trends[date] = { accepted: 0, rejected: 0, corrected: 0 };
      }
      if (item.userAction === 'ACCEPTED') trends[date].accepted++;
      else if (item.userAction === 'REJECTED') trends[date].rejected++;
      else if (item.userAction === 'CORRECTED') trends[date].corrected++;
    }

    return Object.entries(trends)
      .map(([date, counts]) => ({ date, ...counts }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  /**
   * Trigger retraining event
   */
  private triggerRetraining(organizationId: string, feature: AiFeature): void {
    this.logger.log(`Triggering retraining for ${feature} in org ${organizationId}`);

    this.eventEmitter.emit('ai.retraining.needed', {
      organizationId,
      feature,
      triggeredAt: new Date(),
    });
  }

  /**
   * Store a prediction for tracking
   */
  async storePrediction(
    organizationId: string,
    feature: AiFeature,
    inputData: Record<string, any>,
    prediction: Record<string, any>,
    confidence: number,
    modelVersion: number,
  ): Promise<{ id: string; inputHash: string }> {
    const inputHash = this.trainingService.generateInputHash(inputData);

    // Check if same prediction exists (cache)
    const existing = await this.prisma.aiPrediction.findFirst({
      where: {
        organizationId,
        feature,
        inputHash,
      },
      orderBy: { createdAt: 'desc' },
    });

    // If exists and recent (within 1 hour), return it
    if (existing) {
      const oneHourAgo = new Date();
      oneHourAgo.setHours(oneHourAgo.getHours() - 1);
      if (existing.createdAt > oneHourAgo) {
        return { id: existing.id, inputHash };
      }
    }

    // Create new prediction record
    const record = await this.prisma.aiPrediction.create({
      data: {
        organizationId,
        feature,
        inputHash,
        prediction,
        confidence,
        modelVersion,
      },
    });

    return { id: record.id, inputHash };
  }

  /**
   * Get cached prediction if available
   */
  async getCachedPrediction(
    organizationId: string,
    feature: AiFeature,
    inputData: Record<string, any>,
    maxAgeMinutes: number = 60,
  ): Promise<{
    prediction: any;
    confidence: number;
    modelVersion: number;
    predictionId: string;
  } | null> {
    const inputHash = this.trainingService.generateInputHash(inputData);
    const minDate = new Date();
    minDate.setMinutes(minDate.getMinutes() - maxAgeMinutes);

    const cached = await this.prisma.aiPrediction.findFirst({
      where: {
        organizationId,
        feature,
        inputHash,
        createdAt: { gte: minDate },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!cached) return null;

    return {
      prediction: cached.prediction,
      confidence: Number(cached.confidence),
      modelVersion: cached.modelVersion,
      predictionId: cached.id,
    };
  }

  /**
   * Invalidate cached predictions when a new model is activated
   */
  @OnEvent('ai.model.activated')
  async onModelActivated(payload: { organizationId: string; feature: AiFeature; version: number }) {
    this.logger.log(
      `Model v${payload.version} activated for ${payload.feature} — invalidating prediction cache`,
    );
    await this.invalidatePredictionCache(payload.organizationId, payload.feature);
  }

  /**
   * Clear all cached predictions for an org+feature
   */
  async invalidatePredictionCache(
    organizationId: string,
    feature: AiFeature,
  ): Promise<{ deleted: number }> {
    const result = await this.prisma.aiPrediction.deleteMany({
      where: { organizationId, feature },
    });

    if (result.count > 0) {
      this.logger.log(
        `Invalidated ${result.count} cached predictions for ${feature} in org ${organizationId}`,
      );
    }

    return { deleted: result.count };
  }

  /**
   * Get retraining threshold for a feature
   */
  getRetrainingThreshold(feature: AiFeature): number {
    return RETRAINING_THRESHOLDS[feature];
  }

  /**
   * Delete old predictions (for data retention)
   */
  async deleteOldPredictions(
    organizationId: string,
    olderThan: Date,
  ): Promise<{ deleted: number }> {
    const result = await this.prisma.aiPrediction.deleteMany({
      where: {
        organizationId,
        createdAt: { lt: olderThan },
      },
    });

    return { deleted: result.count };
  }
}
