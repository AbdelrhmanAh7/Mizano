import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../prisma/prisma.service';
import { AiFeature, AiModelStatus, Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

export interface SavedModel {
  id: string;
  version: number;
  modelData: Record<string, unknown>;
  accuracy: number;
  sampleCount: number;
  status: AiModelStatus;
  trainedAt: Date | null;
}

export interface ModelHistory {
  version: number;
  accuracy: number;
  sampleCount: number;
  trainedAt: Date | null;
  status: AiModelStatus;
  createdAt: Date;
}

export interface SaveModelValidationResult {
  id: string;
  version: number;
  promoted: boolean;
  reason?: string;
}

export interface AccuracyTrend {
  trend: 'improving' | 'stable' | 'degrading';
  history: Array<{ version: number; accuracy: number; trainedAt: Date | null }>;
  currentAccuracy: number | null;
  avgAccuracy: number;
  degradationDetected: boolean;
}

@Injectable()
export class ModelRegistryService {
  private readonly logger = new Logger(ModelRegistryService.name);

  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
  ) {}

  /**
   * Save a new model version
   */
  async saveModel(
    organizationId: string,
    feature: AiFeature,
    modelData: Record<string, unknown>,
    accuracy: number,
    sampleCount: number,
  ): Promise<{ id: string; version: number }> {
    const result = await this.prisma.$transaction(async (tx) => {
      // Compute next version inside the transaction for atomicity
      const lastModel = await tx.aiModel.findFirst({
        where: { organizationId, feature },
        orderBy: { version: 'desc' },
        select: { version: true },
      });
      const nextVersion = (lastModel?.version || 0) + 1;

      // Deactivate current active model
      await tx.aiModel.updateMany({
        where: {
          organizationId,
          feature,
          status: 'ACTIVE',
        },
        data: {
          status: 'RETIRED',
        },
      });

      // Create new model
      const model = await tx.aiModel.create({
        data: {
          organizationId,
          feature,
          version: nextVersion,
          modelData: modelData as Prisma.InputJsonValue,
          accuracy: new Decimal(accuracy),
          sampleCount,
          status: 'ACTIVE',
          trainedAt: new Date(),
        },
      });

      return { id: model.id, version: model.version };
    });

    this.logger.log(
      `Saved model v${result.version} for ${feature} in org ${organizationId} with accuracy ${accuracy}`,
    );

    this.eventEmitter.emit('ai.model.activated', {
      organizationId,
      feature,
      version: result.version,
    });

    return result;
  }

  /**
   * Load the active model for a feature
   */
  async loadActiveModel(organizationId: string, feature: AiFeature): Promise<SavedModel | null> {
    const model = await this.prisma.aiModel.findFirst({
      where: {
        organizationId,
        feature,
        status: 'ACTIVE',
      },
      orderBy: { version: 'desc' },
    });

    if (!model) {
      return null;
    }

    return {
      id: model.id,
      version: model.version,
      modelData: model.modelData as Record<string, unknown>,
      accuracy: Number(model.accuracy),
      sampleCount: model.sampleCount,
      status: model.status,
      trainedAt: model.trainedAt,
    };
  }

  /**
   * Load a specific model version
   */
  async loadModelByVersion(
    organizationId: string,
    feature: AiFeature,
    version: number,
  ): Promise<SavedModel | null> {
    const model = await this.prisma.aiModel.findUnique({
      where: {
        organizationId_feature_version: {
          organizationId,
          feature,
          version,
        },
      },
    });

    if (!model) {
      return null;
    }

    return {
      id: model.id,
      version: model.version,
      modelData: model.modelData as Record<string, unknown>,
      accuracy: Number(model.accuracy),
      sampleCount: model.sampleCount,
      status: model.status,
      trainedAt: model.trainedAt,
    };
  }

  /**
   * Get model history for a feature
   */
  async getModelHistory(
    organizationId: string,
    feature: AiFeature,
    limit: number = 10,
  ): Promise<ModelHistory[]> {
    const models = await this.prisma.aiModel.findMany({
      where: {
        organizationId,
        feature,
      },
      orderBy: { version: 'desc' },
      take: limit,
      select: {
        version: true,
        accuracy: true,
        sampleCount: true,
        trainedAt: true,
        status: true,
        createdAt: true,
      },
    });

    return models.map((m) => ({
      version: m.version,
      accuracy: Number(m.accuracy),
      sampleCount: m.sampleCount,
      trainedAt: m.trainedAt,
      status: m.status,
      createdAt: m.createdAt,
    }));
  }

  /**
   * Retire old models (keep last N versions)
   */
  async retireOldModels(
    organizationId: string,
    feature: AiFeature,
    keepVersions: number = 3,
  ): Promise<{ retired: number }> {
    // Get versions to keep
    const modelsToKeep = await this.prisma.aiModel.findMany({
      where: {
        organizationId,
        feature,
      },
      orderBy: { version: 'desc' },
      take: keepVersions,
      select: { version: true },
    });

    const versionsToKeep = modelsToKeep.map((m) => m.version);

    // Retire others
    const result = await this.prisma.aiModel.updateMany({
      where: {
        organizationId,
        feature,
        version: {
          notIn: versionsToKeep,
        },
        status: {
          not: 'RETIRED',
        },
      },
      data: {
        status: 'RETIRED',
      },
    });

    if (result.count > 0) {
      this.logger.log(`Retired ${result.count} old models for ${feature} in org ${organizationId}`);
    }

    return { retired: result.count };
  }

  /**
   * Activate a specific model version
   */
  async activateModel(organizationId: string, feature: AiFeature, version: number): Promise<void> {
    // Check if model exists
    const model = await this.prisma.aiModel.findUnique({
      where: {
        organizationId_feature_version: {
          organizationId,
          feature,
          version,
        },
      },
    });

    if (!model) {
      throw new NotFoundException(`Model version ${version} not found for ${feature}`);
    }

    await this.prisma.$transaction(async (tx) => {
      // Deactivate current active model
      await tx.aiModel.updateMany({
        where: {
          organizationId,
          feature,
          status: 'ACTIVE',
        },
        data: {
          status: 'RETIRED',
        },
      });

      // Activate specified version
      await tx.aiModel.update({
        where: {
          organizationId_feature_version: {
            organizationId,
            feature,
            version,
          },
        },
        data: {
          status: 'ACTIVE',
        },
      });
    });

    this.logger.log(`Activated model v${version} for ${feature} in org ${organizationId}`);

    this.eventEmitter.emit('ai.model.activated', {
      organizationId,
      feature,
      version,
    });
  }

  /**
   * Update model status to training
   */
  async setTrainingStatus(
    organizationId: string,
    feature: AiFeature,
  ): Promise<{ version: number }> {
    const nextVersion = await this.getNextVersion(organizationId, feature);

    await this.prisma.aiModel.create({
      data: {
        organizationId,
        feature,
        version: nextVersion,
        modelData: {},
        accuracy: new Decimal(0),
        sampleCount: 0,
        status: 'TRAINING',
      },
    });

    return { version: nextVersion };
  }

  /**
   * Complete model training
   */
  async completeTraining(
    organizationId: string,
    feature: AiFeature,
    version: number,
    modelData: Record<string, unknown>,
    accuracy: number,
    sampleCount: number,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // Deactivate current active model
      await tx.aiModel.updateMany({
        where: {
          organizationId,
          feature,
          status: 'ACTIVE',
        },
        data: {
          status: 'RETIRED',
        },
      });

      // Update training model to active
      await tx.aiModel.update({
        where: {
          organizationId_feature_version: {
            organizationId,
            feature,
            version,
          },
        },
        data: {
          modelData: modelData as Prisma.InputJsonValue,
          accuracy: new Decimal(accuracy),
          sampleCount,
          status: 'ACTIVE',
          trainedAt: new Date(),
        },
      });
    });

    this.logger.log(
      `Completed training for model v${version} of ${feature} in org ${organizationId}`,
    );

    this.eventEmitter.emit('ai.model.activated', {
      organizationId,
      feature,
      version,
    });
  }

  /**
   * Get model status for a feature
   */
  async getModelStatus(
    organizationId: string,
    feature: AiFeature,
  ): Promise<{
    hasActiveModel: boolean;
    activeVersion: number | null;
    isTraining: boolean;
    trainingVersion: number | null;
    lastTrainedAt: Date | null;
  }> {
    const [activeModel, trainingModel] = await Promise.all([
      this.prisma.aiModel.findFirst({
        where: {
          organizationId,
          feature,
          status: 'ACTIVE',
        },
        orderBy: { version: 'desc' },
        select: { version: true, trainedAt: true },
      }),
      this.prisma.aiModel.findFirst({
        where: {
          organizationId,
          feature,
          status: 'TRAINING',
        },
        orderBy: { version: 'desc' },
        select: { version: true },
      }),
    ]);

    return {
      hasActiveModel: !!activeModel,
      activeVersion: activeModel?.version || null,
      isTraining: !!trainingModel,
      trainingVersion: trainingModel?.version || null,
      lastTrainedAt: activeModel?.trainedAt || null,
    };
  }

  /**
   * Save a new model with accuracy validation.
   * Will NOT promote the model if accuracy regresses beyond tolerance.
   */
  async saveModelWithValidation(
    organizationId: string,
    feature: AiFeature,
    modelData: Record<string, unknown>,
    accuracy: number,
    sampleCount: number,
    options?: { accuracyTolerance?: number; forceActivate?: boolean },
  ): Promise<SaveModelValidationResult> {
    const tolerance = options?.accuracyTolerance ?? 0.05;

    // Load current active model for comparison
    const currentModel = await this.loadActiveModel(organizationId, feature);

    if (currentModel && !options?.forceActivate) {
      const currentAccuracy = currentModel.accuracy;
      if (accuracy < currentAccuracy - tolerance) {
        // Save as RETIRED — do NOT promote
        const result = await this.prisma.$transaction(async (tx) => {
          const lastModel = await tx.aiModel.findFirst({
            where: { organizationId, feature },
            orderBy: { version: 'desc' },
            select: { version: true },
          });
          const nextVersion = (lastModel?.version || 0) + 1;

          const model = await tx.aiModel.create({
            data: {
              organizationId,
              feature,
              version: nextVersion,
              modelData: modelData as Prisma.InputJsonValue,
              accuracy: new Decimal(accuracy),
              sampleCount,
              status: 'RETIRED',
              trainedAt: new Date(),
            },
          });

          return { id: model.id, version: model.version };
        });

        this.logger.warn(
          `Model v${result.version} for ${feature} NOT promoted: accuracy ${(accuracy * 100).toFixed(1)}% < current ${(currentAccuracy * 100).toFixed(1)}% - ${(tolerance * 100).toFixed(1)}% tolerance`,
        );

        return { ...result, promoted: false, reason: 'accuracy_regression' };
      }
    }

    // Normal flow: promote to ACTIVE
    const result = await this.saveModel(organizationId, feature, modelData, accuracy, sampleCount);

    return { ...result, promoted: true };
  }

  /**
   * Rollback to a previous model version
   */
  async rollbackModel(
    organizationId: string,
    feature: AiFeature,
    toVersion?: number,
  ): Promise<{ version: number }> {
    if (toVersion) {
      await this.activateModel(organizationId, feature, toVersion);
      return { version: toVersion };
    }

    // Find the most recent RETIRED model with highest accuracy
    const bestRetired = await this.prisma.aiModel.findFirst({
      where: {
        organizationId,
        feature,
        status: 'RETIRED',
        trainedAt: { not: null },
      },
      orderBy: [{ accuracy: 'desc' }, { version: 'desc' }],
      select: { version: true },
    });

    if (!bestRetired) {
      throw new NotFoundException(`No retired model found to rollback to for ${feature}`);
    }

    await this.activateModel(organizationId, feature, bestRetired.version);
    return { version: bestRetired.version };
  }

  /**
   * Get accuracy trend for a feature
   */
  async getAccuracyTrend(
    organizationId: string,
    feature: AiFeature,
    limit: number = 10,
  ): Promise<AccuracyTrend> {
    const models = await this.prisma.aiModel.findMany({
      where: {
        organizationId,
        feature,
        trainedAt: { not: null },
      },
      orderBy: { version: 'desc' },
      take: limit,
      select: {
        version: true,
        accuracy: true,
        trainedAt: true,
      },
    });

    const history = models.map((m) => ({
      version: m.version,
      accuracy: Number(m.accuracy),
      trainedAt: m.trainedAt,
    }));

    if (history.length === 0) {
      return {
        trend: 'stable',
        history: [],
        currentAccuracy: null,
        avgAccuracy: 0,
        degradationDetected: false,
      };
    }

    const currentAccuracy = history[0].accuracy;
    const avgAccuracy = history.reduce((sum, h) => sum + h.accuracy, 0) / history.length;

    // Compare recent 3 vs older 3
    let trend: 'improving' | 'stable' | 'degrading' = 'stable';
    let degradationDetected = false;

    if (history.length >= 4) {
      const recentCount = Math.min(3, Math.floor(history.length / 2));
      const recent = history.slice(0, recentCount);
      const older = history.slice(recentCount, recentCount * 2);

      const recentAvg = recent.reduce((s, h) => s + h.accuracy, 0) / recent.length;
      const olderAvg = older.reduce((s, h) => s + h.accuracy, 0) / older.length;

      const diff = recentAvg - olderAvg;
      if (diff > 0.02) {
        trend = 'improving';
      } else if (diff < -0.02) {
        trend = 'degrading';
        degradationDetected = true;
      }
    }

    // Also flag if current is significantly below average
    if (currentAccuracy < avgAccuracy - 0.1) {
      degradationDetected = true;
    }

    return {
      trend,
      history,
      currentAccuracy,
      avgAccuracy,
      degradationDetected,
    };
  }

  /**
   * Delete all models for a feature (for testing/reset)
   */
  async deleteAllModels(organizationId: string, feature: AiFeature): Promise<{ deleted: number }> {
    const result = await this.prisma.aiModel.deleteMany({
      where: {
        organizationId,
        feature,
      },
    });

    this.logger.log(`Deleted ${result.count} models for ${feature} in org ${organizationId}`);

    return { deleted: result.count };
  }

  /**
   * Get the next version number for a feature
   */
  private async getNextVersion(organizationId: string, feature: AiFeature): Promise<number> {
    const lastModel = await this.prisma.aiModel.findFirst({
      where: {
        organizationId,
        feature,
      },
      orderBy: { version: 'desc' },
      select: { version: true },
    });

    return (lastModel?.version || 0) + 1;
  }
}
