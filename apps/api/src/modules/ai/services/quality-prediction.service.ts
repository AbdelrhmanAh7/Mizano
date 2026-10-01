import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { AiFeedbackService } from './ai-feedback.service';
import { OllamaInferenceGateway } from './ollama-inference-gateway.service';
import { buildQualityPrompt } from '../prompts/hr.prompts';
import { PredictionMethod } from '../types/prediction-method.type';
import { describeError } from '../../../common/utils/redact';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DecisionTreeClassifier } = require('ml-cart');

export interface QualityPrediction {
  workOrderId: string;
  defectRisk: number;
  riskLevel: 'HIGH' | 'MEDIUM' | 'LOW';
  factors: Array<{ name: string; impact: number; description: string }>;
  confidence: number;
  recommendations: string[];
  predictionMethod: PredictionMethod;
}

export interface BomQualityMetrics {
  bomId: string;
  bomName: string;
  totalProduced: number;
  totalWaste: number;
  defectRate: number;
  avgCompletionDays: number;
  workOrderCount: number;
}

export interface QualityTrend {
  month: string;
  totalProduced: number;
  totalWaste: number;
  defectRate: number;
  workOrderCount: number;
}

interface QualityFeatureVector {
  batchSize: number;
  bomComplexity: number;
  historicalDefectRate: number;
  dayOfWeek: number;
  productionRateVariance: number;
}

@Injectable()
export class QualityPredictionService {
  private readonly logger = new Logger(QualityPredictionService.name);
  private readonly DEFECT_THRESHOLD = 0.05; // 5% waste = defect

  constructor(
    private prisma: PrismaService,
    private feedbackService: AiFeedbackService,
    private gateway: OllamaInferenceGateway,
  ) {}

  /**
   * Predict defect risk for a work order
   */
  async predictWorkOrderQuality(
    organizationId: string,
    workOrderId: string,
  ): Promise<QualityPrediction> {
    const workOrder = await this.prisma.workOrder.findFirst({
      where: { id: workOrderId, organizationId },
      include: {
        bom: { include: { items: true } },
        productionEntries: true,
      },
    });

    if (!workOrder) {
      throw new NotFoundException(`Work order ${workOrderId} not found`);
    }

    const features = await this.extractQualityFeatures(organizationId, workOrderId);

    // Rule-based prediction (ML model registry removed)
    let defectRisk: number = this.calculateRuleBasedRisk(features);
    const confidence = 0.5;

    defectRisk = Math.max(0, Math.min(1, defectRisk));
    const riskLevel = defectRisk >= 0.7 ? 'HIGH' : defectRisk >= 0.4 ? 'MEDIUM' : 'LOW';

    const factors = this.identifyRiskFactors(features);
    let recommendations = this.generateRecommendations(riskLevel, features, factors);
    let predictionMethod: PredictionMethod = 'RULE_BASED';

    // --- Ollama enhancement ---
    {
      try {
        const prompt = buildQualityPrompt(
          {
            defectRisk,
            riskLevel,
            batchSize: features.batchSize,
            bomComplexity: features.bomComplexity,
          },
          {
            historicalDefectRate: features.historicalDefectRate,
            productionRateVariance: features.productionRateVariance,
          },
        );
        const ollamaResult = await this.gateway.infer<{
          prediction: number;
          factors: Array<{ factor: string; impact: number }>;
          improvements: string[];
        }>(prompt);

        if (ollamaResult) {
          // Blend defect risk: 50% existing + 50% Ollama
          if (typeof ollamaResult.data.prediction === 'number') {
            const ollamaRisk = ollamaResult.data.prediction / 100; // Ollama returns 0-100
            defectRisk = defectRisk * 0.5 + ollamaRisk * 0.5;
            defectRisk = Math.max(0, Math.min(1, defectRisk));
          }

          // Prefer Ollama recommendations if available
          if (ollamaResult.data.improvements?.length > 0) {
            recommendations = ollamaResult.data.improvements;
          }
          predictionMethod = 'HYBRID';

          // Store as training data
        }
      } catch (error) {
        this.logger.warn(
          `Ollama quality prediction failed, using existing: ${describeError(error)}`,
        );
      }
    }

    const result: QualityPrediction = {
      workOrderId,
      defectRisk: Math.round(defectRisk * 1000) / 1000,
      riskLevel,
      factors,
      confidence: Math.round(confidence * 100) / 100,
      recommendations,
      predictionMethod,
    };

    // Store prediction for feedback tracking
    await this.feedbackService.storePrediction(
      organizationId,
      'QUALITY_PREDICTION',
      { workOrderId },
      { defectRisk: result.defectRisk, riskLevel },
      result.confidence,
      0,
    );

    return result;
  }

  /**
   * Get historical quality metrics for a BOM
   */
  async getBomQualityMetrics(organizationId: string, bomId: string): Promise<BomQualityMetrics> {
    const bom = await this.prisma.bOM.findFirst({
      where: { id: bomId, organizationId },
      select: { id: true, name: true },
    });

    if (!bom) {
      throw new NotFoundException(`BOM ${bomId} not found`);
    }

    const workOrders = await this.prisma.workOrder.findMany({
      where: {
        organizationId,
        bomId,
        status: 'COMPLETED',
      },
      include: {
        productionEntries: true,
      },
    });

    let totalProduced = 0;
    let totalWaste = 0;
    let totalCompletionDays = 0;
    let completedWithDates = 0;

    for (const wo of workOrders) {
      for (const entry of wo.productionEntries) {
        totalProduced += entry.quantityProduced;
        totalWaste += entry.wastageQuantity + entry.quantityRejected;
      }

      if (wo.completedDate && wo.actualStartDate) {
        const days =
          (wo.completedDate.getTime() - wo.actualStartDate.getTime()) / (1000 * 60 * 60 * 24);
        totalCompletionDays += days;
        completedWithDates++;
      }
    }

    const defectRate = totalProduced > 0 ? totalWaste / (totalProduced + totalWaste) : 0;
    const avgCompletionDays = completedWithDates > 0 ? totalCompletionDays / completedWithDates : 0;

    return {
      bomId,
      bomName: bom.name,
      totalProduced,
      totalWaste,
      defectRate: Math.round(defectRate * 10000) / 10000,
      avgCompletionDays: Math.round(avgCompletionDays * 10) / 10,
      workOrderCount: workOrders.length,
    };
  }

  /**
   * Get monthly quality trends across all work orders
   */
  async getQualityTrends(organizationId: string): Promise<QualityTrend[]> {
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    const workOrders = await this.prisma.workOrder.findMany({
      where: {
        organizationId,
        status: 'COMPLETED',
        completedDate: { gte: twelveMonthsAgo },
      },
      include: {
        productionEntries: true,
      },
      orderBy: { completedDate: 'asc' },
    });

    const monthlyData = new Map<string, { produced: number; waste: number; count: number }>();

    for (const wo of workOrders) {
      if (!wo.completedDate) continue;

      const monthKey = `${wo.completedDate.getFullYear()}-${String(wo.completedDate.getMonth() + 1).padStart(2, '0')}`;

      if (!monthlyData.has(monthKey)) {
        monthlyData.set(monthKey, { produced: 0, waste: 0, count: 0 });
      }

      const data = monthlyData.get(monthKey)!;
      data.count++;

      for (const entry of wo.productionEntries) {
        data.produced += entry.quantityProduced;
        data.waste += entry.wastageQuantity + entry.quantityRejected;
      }
    }

    const trends: QualityTrend[] = [];
    const sortedKeys = Array.from(monthlyData.keys()).sort();

    for (const key of sortedKeys) {
      const data = monthlyData.get(key)!;
      const total = data.produced + data.waste;
      trends.push({
        month: key,
        totalProduced: data.produced,
        totalWaste: data.waste,
        defectRate: total > 0 ? Math.round((data.waste / total) * 10000) / 10000 : 0,
        workOrderCount: data.count,
      });
    }

    return trends;
  }

  /**
   * Train a DecisionTree model from completed work orders
   */
  async trainModel(organizationId: string): Promise<{
    accuracy: number;
    sampleCount: number;
    version: number;
  }> {
    this.logger.log(`Training quality prediction model for org ${organizationId}`);

    const completedOrders = await this.prisma.workOrder.findMany({
      where: {
        organizationId,
        status: 'COMPLETED',
      },
      include: {
        bom: { include: { items: true } },
        productionEntries: true,
      },
    });

    if (completedOrders.length < 10) {
      this.logger.warn(
        `Insufficient data for training: ${completedOrders.length} completed orders (need 10)`,
      );
      return { accuracy: 0, sampleCount: completedOrders.length, version: 0 };
    }

    // Build training data
    const features: number[][] = [];
    const labels: number[] = [];

    // Pre-compute historical defect rates per BOM
    const bomDefectRates = new Map<string, number>();
    for (const wo of completedOrders) {
      let produced = 0;
      let waste = 0;
      for (const entry of wo.productionEntries) {
        produced += entry.quantityProduced;
        waste += entry.wastageQuantity + entry.quantityRejected;
      }
      const total = produced + waste;
      const rate = total > 0 ? waste / total : 0;

      const existing = bomDefectRates.get(wo.bomId);
      if (existing !== undefined) {
        bomDefectRates.set(wo.bomId, (existing + rate) / 2);
      } else {
        bomDefectRates.set(wo.bomId, rate);
      }
    }

    // Pre-compute production rate variances per BOM
    const bomProductionRates = new Map<string, number[]>();
    for (const wo of completedOrders) {
      if (!bomProductionRates.has(wo.bomId)) {
        bomProductionRates.set(wo.bomId, []);
      }
      const totalProduced = wo.productionEntries.reduce((sum, e) => sum + e.quantityProduced, 0);
      const rate = wo.quantity > 0 ? totalProduced / wo.quantity : 0;
      bomProductionRates.get(wo.bomId)!.push(rate);
    }

    for (const wo of completedOrders) {
      const batchSize = wo.quantity;
      const bomComplexity = wo.bom.items.length;
      const historicalDefectRate = bomDefectRates.get(wo.bomId) || 0;
      const startDate = wo.actualStartDate || wo.createdAt;
      const dayOfWeek = startDate.getDay();

      const rates = bomProductionRates.get(wo.bomId) || [];
      let productionRateVariance = 0;
      if (rates.length > 1) {
        const avg = rates.reduce((a, b) => a + b, 0) / rates.length;
        productionRateVariance =
          rates.reduce((sum, r) => sum + Math.pow(r - avg, 2), 0) / rates.length;
      }

      features.push([
        batchSize,
        bomComplexity,
        historicalDefectRate,
        dayOfWeek,
        productionRateVariance,
      ]);

      // Label: 1 if defect rate > threshold
      let produced = 0;
      let waste = 0;
      for (const entry of wo.productionEntries) {
        produced += entry.quantityProduced;
        waste += entry.wastageQuantity + entry.quantityRejected;
      }
      const total = produced + waste;
      const defectRate = total > 0 ? waste / total : 0;
      labels.push(defectRate > this.DEFECT_THRESHOLD ? 1 : 0);
    }

    // Split data: 80% train, 20% test
    const splitIndex = Math.floor(features.length * 0.8);
    const trainFeatures = features.slice(0, splitIndex);
    const trainLabels = labels.slice(0, splitIndex);
    const testFeatures = features.slice(splitIndex);
    const testLabels = labels.slice(splitIndex);

    if (trainFeatures.length < 5) {
      this.logger.warn('Insufficient training data after split');
      return { accuracy: 0, sampleCount: features.length, version: 0 };
    }

    // Train DecisionTree
    const classifier = new DecisionTreeClassifier({
      maxDepth: 6,
      minNumSamples: 2,
    });
    classifier.train(trainFeatures, trainLabels);

    // Evaluate accuracy
    let correct = 0;
    if (testFeatures.length > 0) {
      const predictions = classifier.predict(testFeatures);
      for (let i = 0; i < testLabels.length; i++) {
        if (predictions[i] === testLabels[i]) correct++;
      }
    }
    const accuracy = testFeatures.length > 0 ? correct / testFeatures.length : 0.5;

    // Model registry removed — log result only
    this.logger.log(
      `Quality prediction model trained: accuracy=${accuracy.toFixed(3)}, samples=${features.length}`,
    );

    return {
      accuracy: Math.round(accuracy * 1000) / 1000,
      sampleCount: features.length,
      version: 1,
    };
  }

  /**
   * Record user feedback on a quality prediction.
   */
  async recordQualityFeedback(
    _organizationId: string,
    _workOrderId: string,
    _wasCorrect: boolean,
    _actualDefects?: number,
  ): Promise<void> {
    // Feedback is recorded via AiFeedbackService.processFeedback
  }

  // ── Private helpers ──────────────────────────────────────────────

  /**
   * Extract feature vector for a work order
   */
  private async extractQualityFeatures(
    organizationId: string,
    workOrderId: string,
  ): Promise<QualityFeatureVector> {
    const workOrder = await this.prisma.workOrder.findFirst({
      where: { id: workOrderId, organizationId },
      include: {
        bom: { include: { items: true } },
        productionEntries: true,
      },
    });

    if (!workOrder) {
      return {
        batchSize: 0,
        bomComplexity: 0,
        historicalDefectRate: 0,
        dayOfWeek: 0,
        productionRateVariance: 0,
      };
    }

    const batchSize = workOrder.quantity;
    const bomComplexity = workOrder.bom.items.length;

    // Historical defect rate for this BOM
    const historicalOrders = await this.prisma.workOrder.findMany({
      where: {
        organizationId,
        bomId: workOrder.bomId,
        status: 'COMPLETED',
        id: { not: workOrderId },
      },
      include: { productionEntries: true },
    });

    let totalProduced = 0;
    let totalWaste = 0;
    const completionRates: number[] = [];

    for (const ho of historicalOrders) {
      let produced = 0;
      let waste = 0;
      for (const entry of ho.productionEntries) {
        produced += entry.quantityProduced;
        waste += entry.wastageQuantity + entry.quantityRejected;
      }
      totalProduced += produced;
      totalWaste += waste;

      const rate = ho.quantity > 0 ? produced / ho.quantity : 0;
      completionRates.push(rate);
    }

    const totalOutput = totalProduced + totalWaste;
    const historicalDefectRate = totalOutput > 0 ? totalWaste / totalOutput : 0;

    const startDate = workOrder.actualStartDate || workOrder.plannedStartDate || new Date();
    const dayOfWeek = startDate.getDay();

    // Production rate variance
    let productionRateVariance = 0;
    if (completionRates.length > 1) {
      const avg = completionRates.reduce((a, b) => a + b, 0) / completionRates.length;
      productionRateVariance =
        completionRates.reduce((sum, r) => sum + Math.pow(r - avg, 2), 0) / completionRates.length;
    }

    return {
      batchSize,
      bomComplexity,
      historicalDefectRate,
      dayOfWeek,
      productionRateVariance,
    };
  }

  /**
   * Rule-based risk scoring
   */
  private calculateRuleBasedRisk(features: QualityFeatureVector): number {
    let risk = 0;

    // High historical defect rate increases risk
    if (features.historicalDefectRate > 0.1) {
      risk += 0.35;
    } else if (features.historicalDefectRate > 0.05) {
      risk += 0.2;
    } else if (features.historicalDefectRate > 0.02) {
      risk += 0.1;
    }

    // Large batch sizes have higher risk
    if (features.batchSize > 1000) {
      risk += 0.15;
    } else if (features.batchSize > 500) {
      risk += 0.1;
    } else if (features.batchSize > 100) {
      risk += 0.05;
    }

    // High BOM complexity increases risk
    if (features.bomComplexity > 15) {
      risk += 0.15;
    } else if (features.bomComplexity > 8) {
      risk += 0.1;
    } else if (features.bomComplexity > 4) {
      risk += 0.05;
    }

    // High production rate variance indicates instability
    if (features.productionRateVariance > 0.1) {
      risk += 0.2;
    } else if (features.productionRateVariance > 0.05) {
      risk += 0.1;
    }

    // Weekend production slightly higher risk
    if (features.dayOfWeek === 0 || features.dayOfWeek === 6) {
      risk += 0.05;
    }

    return Math.min(1, risk);
  }

  /**
   * Identify top contributing risk factors
   */
  private identifyRiskFactors(
    features: QualityFeatureVector,
  ): Array<{ name: string; impact: number; description: string }> {
    const factors: Array<{ name: string; impact: number; description: string }> = [];

    if (features.historicalDefectRate > 0.02) {
      factors.push({
        name: 'Historical Defect Rate',
        impact: Math.min(1, features.historicalDefectRate * 5),
        description: `This BOM has a ${(features.historicalDefectRate * 100).toFixed(1)}% historical defect rate`,
      });
    }

    if (features.batchSize > 100) {
      factors.push({
        name: 'Batch Size',
        impact: Math.min(1, features.batchSize / 2000),
        description: `Large batch size of ${features.batchSize} units increases defect probability`,
      });
    }

    if (features.bomComplexity > 4) {
      factors.push({
        name: 'BOM Complexity',
        impact: Math.min(1, features.bomComplexity / 20),
        description: `BOM has ${features.bomComplexity} components, increasing complexity`,
      });
    }

    if (features.productionRateVariance > 0.02) {
      factors.push({
        name: 'Production Rate Variance',
        impact: Math.min(1, features.productionRateVariance * 5),
        description: 'Inconsistent production rates indicate process instability',
      });
    }

    if (features.dayOfWeek === 0 || features.dayOfWeek === 6) {
      factors.push({
        name: 'Weekend Production',
        impact: 0.15,
        description: 'Weekend production historically shows slightly higher defect rates',
      });
    }

    return factors.sort((a, b) => b.impact - a.impact);
  }

  /**
   * Generate actionable recommendations based on risk analysis
   */
  private generateRecommendations(
    riskLevel: 'HIGH' | 'MEDIUM' | 'LOW',
    features: QualityFeatureVector,
    _factors: Array<{ name: string; impact: number; description: string }>,
  ): string[] {
    const recommendations: string[] = [];

    if (riskLevel === 'HIGH') {
      recommendations.push(
        'Consider splitting this work order into smaller batches to reduce risk',
      );
      recommendations.push('Schedule additional quality inspection checkpoints during production');
    }

    if (features.historicalDefectRate > 0.1) {
      recommendations.push(
        'Review BOM specifications and component quality - this BOM has consistently high defect rates',
      );
    }

    if (features.bomComplexity > 10) {
      recommendations.push(
        'Complex BOM detected - ensure all component materials pass incoming quality checks',
      );
    }

    if (features.productionRateVariance > 0.1) {
      recommendations.push(
        'High production rate variance detected - standardize production procedures and operator training',
      );
    }

    if (features.batchSize > 500) {
      recommendations.push('Large batch size - implement in-process sampling at regular intervals');
    }

    if (features.dayOfWeek === 0 || features.dayOfWeek === 6) {
      recommendations.push(
        'Weekend production scheduled - ensure experienced operators are assigned',
      );
    }

    if (riskLevel === 'LOW' && recommendations.length === 0) {
      recommendations.push(
        'No significant risk factors identified - proceed with standard quality controls',
      );
    }

    return recommendations;
  }
}
