import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { AiFeature, AiTrainingSource, Prisma } from '@prisma/client';
import * as crypto from 'crypto';

export interface TrainingDataRecord {
  id: string;
  feature: AiFeature;
  inputData: Record<string, unknown>;
  label: string;
  source: AiTrainingSource;
  createdAt: Date;
}

export interface TrainingDataOptions {
  limit?: number;
  offset?: number;
  source?: AiTrainingSource;
  startDate?: Date;
  endDate?: Date;
}

export interface TrainingReadiness {
  isReady: boolean;
  currentSamples: number;
  minimumRequired: number;
  labelDistribution: Record<string, number>;
  warnings: string[];
}

// Minimum training samples required per feature before training
const MINIMUM_TRAINING_SAMPLES: Partial<Record<AiFeature, number>> = {
  CATEGORIZATION: 20,
  RECONCILIATION: 15,
  OCR_LAYOUT: 10,
  DEMAND_FORECAST: 12,
  LEAD_SCORING: 50,
  ANOMALY: 10,
  REORDER: 10,
  PAYMENT_PREDICTION: 3,
  CASH_FLOW: 5,
  PATTERN_DETECTION: 3,
  CHURN_PREDICTION: 30,
  CLV_ANALYSIS: 30,
  FRAUD_DETECTION: 50,
  QUALITY_PREDICTION: 20,
  DOCUMENT_CLASSIFICATION: 15,
  PIPELINE_FORECAST: 20,
};

const DEFAULT_MIN_SAMPLES = 20;

@Injectable()
export class AiTrainingService {
  private readonly logger = new Logger(AiTrainingService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Add a new training data record
   */
  async addTrainingData(
    organizationId: string,
    feature: AiFeature,
    inputData: Record<string, unknown>,
    label: string,
    source: AiTrainingSource = 'USER',
  ): Promise<{ id: string }> {
    const record = await this.prisma.aiTrainingData.create({
      data: {
        organizationId,
        feature,
        inputData,
        label,
        source,
      },
    });

    this.logger.debug(`Added training data for ${feature} in org ${organizationId}`);

    return { id: record.id };
  }

  /**
   * Get training data for a specific feature
   */
  async getTrainingData(
    organizationId: string,
    feature: AiFeature,
    options: TrainingDataOptions = {},
  ): Promise<{ data: TrainingDataRecord[]; total: number }> {
    const { limit = 1000, offset = 0, source, startDate, endDate } = options;

    const where: Prisma.AiTrainingDataWhereInput = {
      organizationId,
      feature,
      ...(source && { source }),
      ...(startDate || endDate
        ? {
            createdAt: {
              ...(startDate && { gte: startDate }),
              ...(endDate && { lte: endDate }),
            },
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.aiTrainingData.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
      }),
      this.prisma.aiTrainingData.count({ where }),
    ]);

    return {
      data: data as TrainingDataRecord[],
      total,
    };
  }

  /**
   * Count corrections since the last model training
   */
  async countCorrectionsSinceLastTraining(
    organizationId: string,
    feature: AiFeature,
  ): Promise<number> {
    // Get the last trained model's timestamp
    const lastModel = await this.prisma.aiModel.findFirst({
      where: {
        organizationId,
        feature,
        status: 'ACTIVE',
      },
      orderBy: { trainedAt: 'desc' },
      select: { trainedAt: true },
    });

    const sinceDate = lastModel?.trainedAt || new Date(0);

    // Count corrections since that date
    const count = await this.prisma.aiTrainingData.count({
      where: {
        organizationId,
        feature,
        source: 'CORRECTION',
        createdAt: { gt: sinceDate },
      },
    });

    return count;
  }

  /**
   * Get training and test data split for cross-validation
   */
  async getTrainTestSplit(
    organizationId: string,
    feature: AiFeature,
    testRatio: number = 0.2,
  ): Promise<{ train: TrainingDataRecord[]; test: TrainingDataRecord[] }> {
    const allData = await this.prisma.aiTrainingData.findMany({
      where: {
        organizationId,
        feature,
      },
      orderBy: { createdAt: 'asc' },
    });

    // Shuffle array using Fisher-Yates algorithm
    const shuffled = [...allData];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    const splitIndex = Math.floor(shuffled.length * (1 - testRatio));
    return {
      train: shuffled.slice(0, splitIndex) as TrainingDataRecord[],
      test: shuffled.slice(splitIndex) as TrainingDataRecord[],
    };
  }

  /**
   * Generate a hash for input data (used for caching predictions)
   */
  generateInputHash(inputData: Record<string, unknown>): string {
    const normalized = JSON.stringify(inputData, Object.keys(inputData).sort());
    return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 16);
  }

  /**
   * Bulk insert training data (for seeding)
   */
  async seedTrainingData(
    organizationId: string,
    feature: AiFeature,
    records: Array<{ inputData: Record<string, unknown>; label: string }>,
  ): Promise<{ inserted: number }> {
    const data = records.map((record) => ({
      organizationId,
      feature,
      inputData: record.inputData,
      label: record.label,
      source: 'SEED' as AiTrainingSource,
    }));

    const result = await this.prisma.aiTrainingData.createMany({
      data,
      skipDuplicates: true,
    });

    this.logger.log(
      `Seeded ${result.count} training records for ${feature} in org ${organizationId}`,
    );

    return { inserted: result.count };
  }

  /**
   * Delete old training data (for data retention)
   */
  async deleteOldTrainingData(
    organizationId: string,
    feature: AiFeature,
    olderThan: Date,
  ): Promise<{ deleted: number }> {
    const result = await this.prisma.aiTrainingData.deleteMany({
      where: {
        organizationId,
        feature,
        createdAt: { lt: olderThan },
        // Only delete SEED data, keep USER and CORRECTION
        source: 'SEED',
      },
    });

    this.logger.log(
      `Deleted ${result.count} old training records for ${feature} in org ${organizationId}`,
    );

    return { deleted: result.count };
  }

  /**
   * Get statistics about training data
   */
  async getTrainingStats(
    organizationId: string,
    feature: AiFeature,
  ): Promise<{
    total: number;
    bySource: Record<AiTrainingSource, number>;
    uniqueLabels: number;
    oldestRecord: Date | null;
    newestRecord: Date | null;
  }> {
    const [total, bySourceResult, labels, oldest, newest] = await Promise.all([
      this.prisma.aiTrainingData.count({
        where: { organizationId, feature },
      }),
      this.prisma.aiTrainingData.groupBy({
        by: ['source'],
        where: { organizationId, feature },
        _count: true,
      }),
      this.prisma.aiTrainingData.findMany({
        where: { organizationId, feature },
        distinct: ['label'],
        select: { label: true },
      }),
      this.prisma.aiTrainingData.findFirst({
        where: { organizationId, feature },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),
      this.prisma.aiTrainingData.findFirst({
        where: { organizationId, feature },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
    ]);

    const bySource: Record<AiTrainingSource, number> = {
      USER: 0,
      SEED: 0,
      CORRECTION: 0,
    };

    for (const item of bySourceResult) {
      bySource[item.source] = item._count;
    }

    return {
      total,
      bySource,
      uniqueLabels: labels.length,
      oldestRecord: oldest?.createdAt || null,
      newestRecord: newest?.createdAt || null,
    };
  }

  /**
   * Get label distribution for a feature
   */
  async getLabelDistribution(
    organizationId: string,
    feature: AiFeature,
  ): Promise<Record<string, number>> {
    const distribution = await this.prisma.aiTrainingData.groupBy({
      by: ['label'],
      where: { organizationId, feature },
      _count: true,
    });

    return distribution.reduce(
      (acc, item) => {
        acc[item.label] = item._count;
        return acc;
      },
      {} as Record<string, number>,
    );
  }

  /**
   * Validate whether there is enough quality data to train a model
   */
  async validateTrainingReadiness(
    organizationId: string,
    feature: AiFeature,
  ): Promise<TrainingReadiness> {
    const minimumRequired = MINIMUM_TRAINING_SAMPLES[feature] ?? DEFAULT_MIN_SAMPLES;
    const warnings: string[] = [];

    const [total, distribution] = await Promise.all([
      this.prisma.aiTrainingData.count({
        where: { organizationId, feature },
      }),
      this.getLabelDistribution(organizationId, feature),
    ]);

    // Check total sample count
    if (total < minimumRequired) {
      warnings.push(`Insufficient training data: ${total}/${minimumRequired} samples`);
      return {
        isReady: false,
        currentSamples: total,
        minimumRequired,
        labelDistribution: distribution,
        warnings,
      };
    }

    // Check label distribution balance
    const labels = Object.entries(distribution);
    if (labels.length > 0) {
      const maxCount = Math.max(...labels.map(([, c]) => c));
      const dominantPct = maxCount / total;

      if (dominantPct > 0.9) {
        warnings.push(
          `Severe class imbalance: dominant class has ${(dominantPct * 100).toFixed(0)}% of samples`,
        );
      } else if (dominantPct > 0.8) {
        warnings.push(
          `Class imbalance warning: dominant class has ${(dominantPct * 100).toFixed(0)}% of samples`,
        );
      }

      // Check minimum samples per class
      const tooFew = labels.filter(([, c]) => c < 3);
      if (tooFew.length > 0) {
        warnings.push(
          `${tooFew.length} class(es) have fewer than 3 samples: ${tooFew.map(([l]) => l).join(', ')}`,
        );
      }
    }

    // Still ready if warnings are non-fatal (total >= minimum)
    return {
      isReady: true,
      currentSamples: total,
      minimumRequired,
      labelDistribution: distribution,
      warnings,
    };
  }
}
