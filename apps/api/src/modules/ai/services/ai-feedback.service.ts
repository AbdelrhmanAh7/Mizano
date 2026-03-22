import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { AiFeature, AiFeedbackAction, Prisma } from '@prisma/client';
import * as crypto from 'crypto';

export interface FeedbackDto {
  feature: AiFeature;
  predictionId?: string;
  aiSuggestion: Record<string, unknown>;
  userAction: AiFeedbackAction;
  userAnswer?: string;
  inputData: Record<string, unknown>;
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

@Injectable()
export class AiFeedbackService {
  private readonly logger = new Logger(AiFeedbackService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Process user feedback (accept/reject/correct)
   */
  async processFeedback(organizationId: string, dto: FeedbackDto): Promise<{ id: string }> {
    // Store the feedback
    const feedback = await this.prisma.aiFeedback.create({
      data: {
        organizationId,
        feature: dto.feature,
        predictionId: dto.predictionId,
        aiSuggestion: dto.aiSuggestion as Prisma.InputJsonValue,
        userAction: dto.userAction,
        userAnswer: dto.userAnswer,
        inputData: dto.inputData as Prisma.InputJsonValue,
      },
    });

    this.logger.debug(
      `Received ${dto.userAction} feedback for ${dto.feature} in org ${organizationId}`,
    );

    return { id: feedback.id };
  }

  /**
   * Get feedback statistics for a feature
   */
  async getFeedbackStats(
    organizationId: string,
    feature: AiFeature,
    options?: { startDate?: Date; endDate?: Date },
  ): Promise<FeedbackStats> {
    const where: Prisma.AiFeedbackWhereInput = {
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
      aiSuggestion: Prisma.JsonValue;
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
   * Store a prediction for tracking
   */
  async storePrediction(
    organizationId: string,
    feature: AiFeature,
    inputData: Record<string, unknown>,
    prediction: Record<string, unknown>,
    confidence: number,
    modelVersion: number,
  ): Promise<{ id: string; inputHash: string }> {
    const inputHash = this.generateInputHash(inputData);

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
        prediction: prediction as Prisma.InputJsonValue,
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
    inputData: Record<string, unknown>,
    maxAgeMinutes: number = 60,
  ): Promise<{
    prediction: Prisma.JsonValue;
    confidence: number;
    modelVersion: number;
    predictionId: string;
  } | null> {
    const inputHash = this.generateInputHash(inputData);
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

  /**
   * Generate a deterministic hash from input data for deduplication.
   * Replaces the removed AiTrainingService.generateInputHash.
   */
  private generateInputHash(inputData: Record<string, unknown>): string {
    const normalized = JSON.stringify(inputData, Object.keys(inputData).sort());
    return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 16);
  }
}
