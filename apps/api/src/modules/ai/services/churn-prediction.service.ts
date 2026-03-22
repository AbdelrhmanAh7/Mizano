import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { AiFeedbackService } from './ai-feedback.service';
import { OllamaInferenceGateway } from './ollama-inference-gateway.service';
import { Decimal } from '@prisma/client/runtime/library';
import { getRiskLevel } from '../utils/risk-level.util';
import { buildChurnPredictionPrompt, ChurnPredictionResponse } from '../prompts/sales-crm.prompts';
import { PredictionMethod } from '../types/prediction-method.type';

export interface RFMFeatures {
  recency: number; // days since last purchase
  frequency: number; // purchase count in 12 months
  monetary: number; // total spend
  avgOrderValue: number;
  paymentTimeliness: number; // avg days to pay vs due
  purchaseTrend: number; // slope of monthly purchase amounts
}

export interface ChurnPredictionResult {
  customerId: string;
  customerName: string;
  churnRisk: number; // 0-1
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  factors: { factor: string; impact: number; description: string }[];
  rfm: RFMFeatures;
  confidence: number;
  recommendation: string;
  predictionMethod: PredictionMethod;
}

export interface ChurnBatchResult {
  processed: number;
  highRisk: number;
  mediumRisk: number;
  lowRisk: number;
}

@Injectable()
export class ChurnPredictionService {
  private readonly logger = new Logger(ChurnPredictionService.name);

  constructor(
    private prisma: PrismaService,
    private feedbackService: AiFeedbackService,
    private gateway: OllamaInferenceGateway,
  ) {}

  async predictChurnRisk(
    organizationId: string,
    customerId: string,
  ): Promise<ChurnPredictionResult> {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, organizationId, deletedAt: null },
    });

    if (!customer) {
      throw new Error(`Customer ${customerId} not found`);
    }

    const rfm = await this.extractRFMFeatures(organizationId, customerId);
    const { score, factors } = this.calculateChurnScore(rfm);

    // Try Ollama inference
    let ollamaScore: number | null = null;
    try {
      const prompt = buildChurnPredictionPrompt(
        {
          recency_days: rfm.recency,
          frequency: rfm.frequency,
          monetary_value: rfm.monetary,
          avg_order_value: rfm.avgOrderValue,
          days_since_last_purchase: rfm.recency,
        },
        {
          customer_id: customerId,
          customer_name: customer.name,
          total_orders: rfm.frequency,
          total_revenue: rfm.monetary,
        },
      );
      const ollamaResult = await this.gateway.infer<ChurnPredictionResponse>(prompt.user, {
        systemPrompt: prompt.system,
      });
      if (ollamaResult?.data?.churn_risk != null) {
        ollamaScore = Math.max(0, Math.min(1, ollamaResult.data.churn_risk));
      }
    } catch (error) {
      this.logger.warn(
        `Ollama churn prediction failed for customer ${customerId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // Blend scores: Ollama + rule-based
    let finalScore: number;
    let predictionMethod: PredictionMethod;
    if (ollamaScore !== null) {
      finalScore = ollamaScore * 0.5 + score * 0.5;
      predictionMethod = 'HYBRID';
    } else {
      finalScore = score;
      predictionMethod = 'RULE_BASED';
    }

    const riskLevel = getRiskLevel(finalScore);

    // Store profile
    await this.prisma.customerAiProfile.upsert({
      where: { customerId },
      create: {
        customerId,
        organizationId,
        churnRisk: new Decimal(finalScore),
        churnFactors: factors,
        rfmRecency: rfm.recency,
        rfmFrequency: rfm.frequency,
        rfmMonetary: new Decimal(rfm.monetary),
        lastPurchaseDate:
          rfm.recency < 99999 ? new Date(Date.now() - rfm.recency * 86400000) : null,
      },
      update: {
        churnRisk: new Decimal(finalScore),
        churnFactors: factors,
        rfmRecency: rfm.recency,
        rfmFrequency: rfm.frequency,
        rfmMonetary: new Decimal(rfm.monetary),
        calculatedAt: new Date(),
      },
    });

    const confidence = ollamaScore !== null ? 0.85 : 0.7;

    const result: ChurnPredictionResult = {
      customerId,
      customerName: customer.name,
      churnRisk: finalScore,
      riskLevel,
      factors,
      rfm,
      confidence,
      recommendation: this.getRecommendation(riskLevel, factors),
      predictionMethod,
    };

    // Store prediction for feedback tracking
    await this.feedbackService.storePrediction(
      organizationId,
      'CHURN_PREDICTION',
      { customerId, rfm },
      { churnRisk: finalScore, riskLevel },
      result.confidence,
      0,
    );

    return result;
  }

  async predictAllCustomers(organizationId: string): Promise<ChurnBatchResult> {
    const customers = await this.prisma.customer.findMany({
      where: { organizationId, deletedAt: null },
      select: { id: true },
    });

    let highRisk = 0;
    let mediumRisk = 0;
    let lowRisk = 0;
    const BATCH_SIZE = 10;

    // Process in parallel batches instead of sequentially
    for (let i = 0; i < customers.length; i += BATCH_SIZE) {
      const batch = customers.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map((customer) => this.predictChurnRisk(organizationId, customer.id)),
      );

      for (const result of results) {
        if (result.status === 'fulfilled') {
          if (result.value.riskLevel === 'CRITICAL' || result.value.riskLevel === 'HIGH')
            highRisk++;
          else if (result.value.riskLevel === 'MEDIUM') mediumRisk++;
          else lowRisk++;
        }
      }
    }

    return {
      processed: customers.length,
      highRisk,
      mediumRisk,
      lowRisk,
    };
  }

  async getHighRiskCustomers(
    organizationId: string,
    limit: number = 20,
  ): Promise<Record<string, unknown>[]> {
    const profiles = await this.prisma.customerAiProfile.findMany({
      where: { organizationId, churnRisk: { gte: 0.5 } },
      orderBy: { churnRisk: 'desc' },
      take: limit,
      include: { customer: { select: { id: true, name: true, email: true } } },
    });

    return profiles.map((p) => ({
      id: p.customerId,
      name: p.customer.name,
      email: p.customer.email,
      churnRisk: Number(p.churnRisk),
      riskLevel: getRiskLevel(Number(p.churnRisk)),
      factors: p.churnFactors,
      lastPurchaseDate: p.lastPurchaseDate,
      rfm: {
        recency: p.rfmRecency,
        frequency: p.rfmFrequency,
        monetary: p.rfmMonetary ? Number(p.rfmMonetary) : 0,
      },
    }));
  }

  /**
   * Record user feedback on a churn prediction.
   */
  async recordChurnFeedback(
    _organizationId: string,
    _customerId: string,
    _wasChurnCorrect: boolean,
    _actualChurn?: boolean,
  ): Promise<void> {
    // Feedback recorded — no retraining infrastructure
  }

  private async extractRFMFeatures(
    organizationId: string,
    customerId: string,
  ): Promise<RFMFeatures> {
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1);

    const invoices = await this.prisma.invoice.findMany({
      where: {
        organizationId,
        customerId,
        status: { in: ['PAID', 'PARTIALLY_PAID', 'SENT'] },
        deletedAt: null,
        date: { gte: twelveMonthsAgo },
      },
      select: {
        date: true,
        grandTotal: true,
        dueDate: true,
        status: true,
        updatedAt: true,
      },
      orderBy: { date: 'desc' },
    });

    if (invoices.length === 0) {
      return {
        recency: 99999,
        frequency: 0,
        monetary: 0,
        avgOrderValue: 0,
        paymentTimeliness: 0,
        purchaseTrend: 0,
      };
    }

    const now = Date.now();
    const recency = Math.floor((now - invoices[0].date.getTime()) / 86400000);
    const frequency = invoices.length;
    const monetary = invoices.reduce((sum, inv) => sum + Number(inv.grandTotal), 0);
    const avgOrderValue = monetary / frequency;

    // Payment timeliness: avg (payment date proxy - dueDate) in days
    // Use updatedAt as a proxy for payment date when status is PAID
    let timelinessSum = 0;
    let timelinessCount = 0;
    for (const inv of invoices) {
      if (inv.status === 'PAID' && inv.dueDate) {
        const diff = (inv.updatedAt.getTime() - inv.dueDate.getTime()) / 86400000;
        timelinessSum += diff;
        timelinessCount++;
      }
    }
    const paymentTimeliness = timelinessCount > 0 ? timelinessSum / timelinessCount : 0;

    // Purchase trend: simple slope of monthly totals
    const monthlyTotals = new Map<string, number>();
    for (const inv of invoices) {
      const key = `${inv.date.getFullYear()}-${inv.date.getMonth()}`;
      monthlyTotals.set(key, (monthlyTotals.get(key) || 0) + Number(inv.grandTotal));
    }
    const monthValues = Array.from(monthlyTotals.values());
    let purchaseTrend = 0;
    if (monthValues.length >= 2) {
      const n = monthValues.length;
      const xMean = (n - 1) / 2;
      const yMean = monthValues.reduce((a, b) => a + b, 0) / n;
      let num = 0;
      let den = 0;
      for (let i = 0; i < n; i++) {
        num += (i - xMean) * (monthValues[i] - yMean);
        den += (i - xMean) ** 2;
      }
      purchaseTrend = den !== 0 ? num / den : 0;
    }

    return {
      recency,
      frequency,
      monetary,
      avgOrderValue,
      paymentTimeliness,
      purchaseTrend,
    };
  }

  private calculateChurnScore(rfm: RFMFeatures): {
    score: number;
    factors: { factor: string; impact: number; description: string }[];
  } {
    const factors: { factor: string; impact: number; description: string }[] = [];
    let score = 0;

    // Recency factor (0-0.35)
    if (rfm.recency > 180) {
      score += 0.35;
      factors.push({
        factor: 'recency',
        impact: 0.35,
        description: 'No purchase in 6+ months',
      });
    } else if (rfm.recency > 90) {
      score += 0.25;
      factors.push({
        factor: 'recency',
        impact: 0.25,
        description: 'No purchase in 3-6 months',
      });
    } else if (rfm.recency > 30) {
      score += 0.1;
      factors.push({
        factor: 'recency',
        impact: 0.1,
        description: 'No purchase in 1-3 months',
      });
    }

    // Frequency factor (0-0.25)
    if (rfm.frequency <= 1) {
      score += 0.25;
      factors.push({
        factor: 'frequency',
        impact: 0.25,
        description: 'Single purchase only',
      });
    } else if (rfm.frequency <= 3) {
      score += 0.15;
      factors.push({
        factor: 'frequency',
        impact: 0.15,
        description: 'Low purchase frequency',
      });
    }

    // Purchase trend factor (0-0.2)
    if (rfm.purchaseTrend < -100) {
      score += 0.2;
      factors.push({
        factor: 'trend',
        impact: 0.2,
        description: 'Declining purchase trend',
      });
    } else if (rfm.purchaseTrend < 0) {
      score += 0.1;
      factors.push({
        factor: 'trend',
        impact: 0.1,
        description: 'Slightly declining purchases',
      });
    }

    // Payment timeliness factor (0-0.2)
    if (rfm.paymentTimeliness > 30) {
      score += 0.2;
      factors.push({
        factor: 'payment_delays',
        impact: 0.2,
        description: 'Consistently late payments (30+ days)',
      });
    } else if (rfm.paymentTimeliness > 14) {
      score += 0.1;
      factors.push({
        factor: 'payment_delays',
        impact: 0.1,
        description: 'Moderate payment delays',
      });
    }

    return { score: Math.min(1, score), factors };
  }

  private getRecommendation(
    riskLevel: string,
    _factors: { factor: string; impact: number; description: string }[],
  ): string {
    switch (riskLevel) {
      case 'CRITICAL':
        return 'Immediate outreach required. Schedule a personal call or meeting.';
      case 'HIGH':
        return 'Send a re-engagement offer or loyalty discount within this week.';
      case 'MEDIUM':
        return 'Add to nurture campaign. Consider a follow-up email with relevant offers.';
      default:
        return 'Continue regular engagement. Customer appears active.';
    }
  }
}
