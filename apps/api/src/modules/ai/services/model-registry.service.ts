import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { AiFeature, AiModelStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

export interface SavedModel {
  id: string;
  version: number;
  modelData: any;
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

@Injectable()
export class ModelRegistryService {
  private readonly logger = new Logger(ModelRegistryService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Save a new model version
   */
  async saveModel(
    organizationId: string,
    feature: AiFeature,
    modelData: Record<string, any>,
    accuracy: number,
    sampleCount: number,
  ): Promise<{ id: string; version: number }> {
    const nextVersion = await this.getNextVersion(organizationId, feature);

    // Deactivate current active model
    await this.prisma.aiModel.updateMany({
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
    const model = await this.prisma.aiModel.create({
      data: {
        organizationId,
        feature,
        version: nextVersion,
        modelData,
        accuracy: new Decimal(accuracy),
        sampleCount,
        status: 'ACTIVE',
        trainedAt: new Date(),
      },
    });

    this.logger.log(
      `Saved model v${nextVersion} for ${feature} in org ${organizationId} with accuracy ${accuracy}`,
    );

    return { id: model.id, version: model.version };
  }

  /**
   * Load the active model for a feature
   */
  async loadActiveModel(
    organizationId: string,
    feature: AiFeature,
  ): Promise<SavedModel | null> {
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
      modelData: model.modelData,
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
      modelData: model.modelData,
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
      this.logger.log(
        `Retired ${result.count} old models for ${feature} in org ${organizationId}`,
      );
    }

    return { retired: result.count };
  }

  /**
   * Activate a specific model version
   */
  async activateModel(
    organizationId: string,
    feature: AiFeature,
    version: number,
  ): Promise<void> {
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
      throw new NotFoundException(
        `Model version ${version} not found for ${feature}`,
      );
    }

    // Deactivate current active model
    await this.prisma.aiModel.updateMany({
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
    await this.prisma.aiModel.update({
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

    this.logger.log(
      `Activated model v${version} for ${feature} in org ${organizationId}`,
    );
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
    modelData: Record<string, any>,
    accuracy: number,
    sampleCount: number,
  ): Promise<void> {
    // Deactivate current active model
    await this.prisma.aiModel.updateMany({
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
    await this.prisma.aiModel.update({
      where: {
        organizationId_feature_version: {
          organizationId,
          feature,
          version,
        },
      },
      data: {
        modelData,
        accuracy: new Decimal(accuracy),
        sampleCount,
        status: 'ACTIVE',
        trainedAt: new Date(),
      },
    });

    this.logger.log(
      `Completed training for model v${version} of ${feature} in org ${organizationId}`,
    );
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
   * Delete all models for a feature (for testing/reset)
   */
  async deleteAllModels(
    organizationId: string,
    feature: AiFeature,
  ): Promise<{ deleted: number }> {
    const result = await this.prisma.aiModel.deleteMany({
      where: {
        organizationId,
        feature,
      },
    });

    this.logger.log(
      `Deleted ${result.count} models for ${feature} in org ${organizationId}`,
    );

    return { deleted: result.count };
  }

  /**
   * Get the next version number for a feature
   */
  private async getNextVersion(
    organizationId: string,
    feature: AiFeature,
  ): Promise<number> {
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
