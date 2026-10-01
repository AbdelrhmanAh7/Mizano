import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';
import { holtWinters, simpleExponentialSmoothing } from '../utils/holt-winters.util';
import { OllamaInferenceGateway } from './ollama-inference-gateway.service';
import { buildMaintenancePrompt } from '../prompts/hr.prompts';
import { PredictionMethod } from '../types/prediction-method.type';
import { describeError } from '../../../common/utils/redact';

export interface AssetHealthPrediction {
  assetId: string;
  assetName: string;
  healthScore: number;
  riskScore: number;
  predictedFailureDate: Date | null;
  factors: Array<{ name: string; value: number; description: string }>;
  recommendedAction: string;
  predictionMethod: PredictionMethod;
}

export interface MaintenanceScheduleEntry {
  assetId: string;
  assetName: string;
  assetNumber: string;
  riskScore: number;
  healthScore: number;
  predictedFailureDate: Date | null;
  recommendedAction: string;
  calculatedAt: Date;
}

export interface AssetHealthScore {
  assetId: string;
  assetName: string;
  assetNumber: string;
  healthScore: number;
  status: string;
  ageMonths: number;
  usefulLifeMonths: number;
}

export interface BatchPredictionResult {
  processed: number;
  critical: number;
  warning: number;
  healthy: number;
}

@Injectable()
export class PredictiveMaintenanceService {
  private readonly logger = new Logger(PredictiveMaintenanceService.name);

  constructor(
    private prisma: PrismaService,
    private gateway: OllamaInferenceGateway,
  ) {}

  /**
   * Predict maintenance needs for a single asset
   */
  async predictAssetHealth(
    organizationId: string,
    assetId: string,
  ): Promise<AssetHealthPrediction> {
    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId, organizationId, deletedAt: null },
    });

    if (!asset) {
      throw new NotFoundException(`Asset ${assetId} not found`);
    }

    // Calculate age in months
    const now = new Date();
    const ageMonths =
      (now.getFullYear() - asset.purchaseDate.getFullYear()) * 12 +
      (now.getMonth() - asset.purchaseDate.getMonth());
    const usefulLifeMonths = asset.usefulLifeYears * 12;

    // Age ratio (0 = new, 1+ = past useful life)
    const ageRatio = usefulLifeMonths > 0 ? ageMonths / usefulLifeMonths : 1;

    // Depreciation progression
    const purchasePrice = Number(asset.purchasePrice);
    const accumulatedDepreciation = Number(asset.accumulatedDepreciation);
    const depreciationRatio = purchasePrice > 0 ? accumulatedDepreciation / purchasePrice : 1;

    // Book value ratio
    const currentBookValue = Number(asset.currentBookValue);
    const bookValueRatio = purchasePrice > 0 ? currentBookValue / purchasePrice : 0;

    // Maintenance flag based on status
    const maintenanceFlag = asset.status === 'FULLY_DEPRECIATED' ? 1 : 0;

    // Health score calculation
    const healthScore = Math.max(
      0,
      Math.min(1, 1 - (ageRatio * 0.4 + depreciationRatio * 0.4 + maintenanceFlag * 0.2)),
    );
    const riskScore = 1 - healthScore;

    // Use depreciation schedule to forecast future trajectory
    const depreciationSchedule = await this.prisma.depreciationSchedule.findMany({
      where: { assetId, organizationId },
      orderBy: [{ year: 'asc' }, { month: 'asc' }],
    });

    let predictedFailureDate: Date | null = null;

    if (depreciationSchedule.length >= 6) {
      const bookValues = depreciationSchedule.map((d) => Number(d.bookValue));
      const salvageValue = Number(asset.salvageValue);

      try {
        // Use Holt-Winters if enough data, else simple exponential smoothing
        let forecasts: number[];

        if (bookValues.length >= 24) {
          const result = holtWinters(bookValues, 24, {
            alpha: 0.3,
            beta: 0.1,
            gamma: 0.3,
            seasonLength: 12,
            type: 'additive',
          });
          forecasts = result.forecasts;
        } else {
          forecasts = simpleExponentialSmoothing(bookValues, 0.3, 24);
        }

        // Find when book value approaches salvage value or health drops below 0.2
        const lastScheduleDate = depreciationSchedule[depreciationSchedule.length - 1];
        const startDate = new Date(lastScheduleDate.year, lastScheduleDate.month - 1, 1);

        for (let i = 0; i < forecasts.length; i++) {
          if (forecasts[i] <= salvageValue * 1.1 || forecasts[i] <= purchasePrice * 0.1) {
            predictedFailureDate = new Date(startDate);
            predictedFailureDate.setMonth(predictedFailureDate.getMonth() + i + 1);
            break;
          }
        }
      } catch (error) {
        this.logger.warn(`Forecast failed for asset ${assetId}: ${describeError(error)}`);
      }
    }

    // If no forecast-based prediction, estimate from linear depreciation
    if (!predictedFailureDate && healthScore < 0.8) {
      const remainingMonths = Math.max(0, usefulLifeMonths - ageMonths);
      if (remainingMonths > 0 && remainingMonths < 120) {
        predictedFailureDate = new Date();
        predictedFailureDate.setMonth(predictedFailureDate.getMonth() + remainingMonths);
      }
    }

    // Build factors
    const factors: Array<{ name: string; value: number; description: string }> = [];

    factors.push({
      name: 'Age Ratio',
      value: Math.round(ageRatio * 1000) / 1000,
      description: `Asset is ${ageMonths} months old out of ${usefulLifeMonths} months useful life`,
    });

    factors.push({
      name: 'Depreciation Ratio',
      value: Math.round(depreciationRatio * 1000) / 1000,
      description: `${(depreciationRatio * 100).toFixed(1)}% of purchase price has been depreciated`,
    });

    factors.push({
      name: 'Book Value Ratio',
      value: Math.round(bookValueRatio * 1000) / 1000,
      description: `Current book value is ${(bookValueRatio * 100).toFixed(1)}% of purchase price`,
    });

    if (maintenanceFlag) {
      factors.push({
        name: 'Fully Depreciated',
        value: 1,
        description: 'Asset is fully depreciated and may need replacement',
      });
    }

    // Determine recommended action
    let recommendedAction = this.determineRecommendedAction(
      healthScore,
      ageRatio,
      predictedFailureDate,
    );
    let predictionMethod: PredictionMethod = 'RULE_BASED';

    // --- Ollama enhancement ---
    try {
      const prompt = buildMaintenancePrompt(
        {
          name: asset.name,
          ageMonths,
          usefulLifeMonths,
          healthScore,
          purchasePrice,
          currentBookValue,
          status: asset.status,
        },
        {
          depreciationRatio,
          ageRatio,
          maintenanceFlag,
        },
      );
      const ollamaResult = await this.gateway.infer<{
        prediction: { failure_probability: number; estimated_date: string | null };
        urgency: string;
        schedule: string[];
      }>(prompt);

      if (ollamaResult) {
        // Use Ollama's recommended schedule as the action
        if (ollamaResult.data.schedule?.length > 0) {
          recommendedAction = ollamaResult.data.schedule.join('. ');
        }

        // Use Ollama's predicted failure date if we don't have one
        if (!predictedFailureDate && ollamaResult.data.prediction?.estimated_date) {
          const ollamaDate = new Date(ollamaResult.data.prediction.estimated_date);
          if (!isNaN(ollamaDate.getTime())) {
            predictedFailureDate = ollamaDate;
          }
        }

        predictionMethod = 'HYBRID';
      }
    } catch (error) {
      this.logger.warn(
        `Ollama maintenance prediction failed, using rule-based: ${describeError(error)}`,
      );
    }

    // Store prediction in database
    await this.prisma.assetMaintenancePrediction.upsert({
      where: {
        id: await this.getExistingPredictionId(organizationId, assetId),
      },
      update: {
        predictedFailureDate,
        riskScore: new Decimal(riskScore),
        healthScore: new Decimal(healthScore),
        factors: factors as import('@prisma/client').Prisma.InputJsonValue,
        recommendedAction,
        calculatedAt: new Date(),
      },
      create: {
        assetId,
        organizationId,
        predictedFailureDate,
        riskScore: new Decimal(riskScore),
        healthScore: new Decimal(healthScore),
        factors: factors as import('@prisma/client').Prisma.InputJsonValue,
        recommendedAction,
        calculatedAt: new Date(),
      },
    });

    return {
      assetId,
      assetName: asset.name,
      healthScore: Math.round(healthScore * 1000) / 1000,
      riskScore: Math.round(riskScore * 1000) / 1000,
      predictedFailureDate,
      factors,
      recommendedAction,
      predictionMethod,
    };
  }

  /**
   * Get all assets needing maintenance attention (riskScore >= 0.5)
   */
  async getMaintenanceSchedule(organizationId: string): Promise<MaintenanceScheduleEntry[]> {
    const predictions = await this.prisma.assetMaintenancePrediction.findMany({
      where: {
        organizationId,
        riskScore: { gte: new Decimal(0.5) },
      },
      include: {
        asset: {
          select: { name: true, assetNumber: true },
        },
      },
      orderBy: { riskScore: 'desc' },
    });

    return predictions.map((p) => ({
      assetId: p.assetId,
      assetName: p.asset.name,
      assetNumber: p.asset.assetNumber,
      riskScore: Number(p.riskScore),
      healthScore: Number(p.healthScore),
      predictedFailureDate: p.predictedFailureDate,
      recommendedAction: p.recommendedAction || 'Monitor',
      calculatedAt: p.calculatedAt,
    }));
  }

  /**
   * Get health scores for all active assets (lightweight calculation)
   */
  async getHealthScores(organizationId: string): Promise<AssetHealthScore[]> {
    const assets = await this.prisma.asset.findMany({
      where: {
        organizationId,
        status: 'ACTIVE',
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        assetNumber: true,
        purchaseDate: true,
        purchasePrice: true,
        accumulatedDepreciation: true,
        usefulLifeYears: true,
        status: true,
      },
    });

    const now = new Date();

    return assets.map((asset) => {
      const ageMonths =
        (now.getFullYear() - asset.purchaseDate.getFullYear()) * 12 +
        (now.getMonth() - asset.purchaseDate.getMonth());
      const usefulLifeMonths = asset.usefulLifeYears * 12;
      const ageRatio = usefulLifeMonths > 0 ? ageMonths / usefulLifeMonths : 1;

      const purchasePrice = Number(asset.purchasePrice);
      const accumulatedDepreciation = Number(asset.accumulatedDepreciation);
      const depreciationRatio = purchasePrice > 0 ? accumulatedDepreciation / purchasePrice : 1;

      const healthScore = Math.max(0, Math.min(1, 1 - (ageRatio * 0.4 + depreciationRatio * 0.4)));

      return {
        assetId: asset.id,
        assetName: asset.name,
        assetNumber: asset.assetNumber,
        healthScore: Math.round(healthScore * 1000) / 1000,
        status: asset.status,
        ageMonths,
        usefulLifeMonths,
      };
    });
  }

  /**
   * Batch predict health for all active assets
   */
  async predictAll(organizationId: string): Promise<BatchPredictionResult> {
    const assets = await this.prisma.asset.findMany({
      where: {
        organizationId,
        status: 'ACTIVE',
        deletedAt: null,
      },
      select: { id: true },
    });

    let processed = 0;
    let critical = 0;
    let warning = 0;
    let healthy = 0;

    for (const asset of assets) {
      try {
        const prediction = await this.predictAssetHealth(organizationId, asset.id);
        processed++;

        if (prediction.riskScore >= 0.7) {
          critical++;
        } else if (prediction.riskScore >= 0.4) {
          warning++;
        } else {
          healthy++;
        }
      } catch (error) {
        this.logger.error(`Failed to predict asset ${asset.id}: ${describeError(error)}`);
      }
    }

    this.logger.log(
      `Predicted ${processed} assets: ${critical} critical, ${warning} warning, ${healthy} healthy`,
    );

    return { processed, critical, warning, healthy };
  }

  // ── Private helpers ──────────────────────────────────────────────

  /**
   * Determine recommended action based on health indicators
   */
  private determineRecommendedAction(
    healthScore: number,
    ageRatio: number,
    predictedFailureDate: Date | null,
  ): string {
    if (healthScore < 0.2) {
      return 'Immediate replacement recommended - asset is near end of useful life';
    }

    if (healthScore < 0.4) {
      return 'Schedule replacement within the next quarter - asset health is critically low';
    }

    if (predictedFailureDate) {
      const monthsUntilFailure =
        (predictedFailureDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30);
      if (monthsUntilFailure <= 3) {
        return 'Plan replacement within 3 months - predicted end of service life approaching';
      }
      if (monthsUntilFailure <= 6) {
        return 'Begin evaluating replacement options - predicted maintenance needed within 6 months';
      }
    }

    if (ageRatio > 0.8) {
      return 'Monitor closely - asset is approaching end of expected useful life';
    }

    if (healthScore < 0.6) {
      return 'Schedule preventive maintenance inspection';
    }

    return 'No immediate action required - continue standard maintenance schedule';
  }

  /**
   * Get existing prediction ID for upsert, or generate a new cuid
   */
  private async getExistingPredictionId(organizationId: string, assetId: string): Promise<string> {
    const existing = await this.prisma.assetMaintenancePrediction.findFirst({
      where: { organizationId, assetId },
      select: { id: true },
    });

    // Return existing ID or a non-existent placeholder to trigger create
    return existing?.id || 'non-existent-id-for-create';
  }
}
