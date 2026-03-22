import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { holtWinters } from '../utils/holt-winters.util';
import { OllamaInferenceGateway } from './ollama-inference-gateway.service';
import {
  buildPipelineNarrativePrompt,
  PipelineNarrativeResponse,
} from '../prompts/forecasting.prompts';
import { PredictionMethod } from '../types/prediction-method.type';

export interface PipelineForecast {
  totalWeighted: number;
  totalUnweighted: number;
  forecastByMonth: { month: string; predicted: number; confidence: number }[];
  activeDeals: number;
  avgDealSize: number;
  avgDaysToClose: number;
  narrative?: {
    insights: string[];
    riskDeals: { dealName: string; risk: string; recommendation: string }[];
    adjustedForecast?: number;
  };
  predictionMethod: PredictionMethod;
}

export interface WeightedPipelineStage {
  stage: string;
  dealCount: number;
  totalValue: number;
  weightedValue: number;
  historicalWinRate: number;
  avgDaysInStage: number;
}

export interface StageConversionRate {
  stage: string;
  totalDeals: number;
  wonDeals: number;
  lostDeals: number;
  winRate: number;
  avgAmount: number;
}

export interface DealTimelineForecast {
  dealId: string;
  dealName: string;
  currentStage: string;
  expectedCloseDate: Date | null;
  predictedCloseDate: Date | null;
  winProbability: number;
  daysInCurrentStage: number;
  confidence: number;
}

@Injectable()
export class PipelineForecastService {
  private readonly logger = new Logger(PipelineForecastService.name);

  private readonly STAGE_WEIGHTS: Record<string, number> = {
    NEW: 0.1,
    QUALIFIED: 0.25,
    PROPOSAL: 0.5,
    NEGOTIATION: 0.75,
    WON: 1.0,
    LOST: 0,
  };

  constructor(
    private prisma: PrismaService,
    private ollamaGateway: OllamaInferenceGateway,
  ) {}

  async forecastPipeline(organizationId: string, months: number = 6): Promise<PipelineForecast> {
    const activeDeals = await this.prisma.deal.findMany({
      where: {
        organizationId,
        stage: { notIn: ['WON', 'LOST'] },
        deletedAt: null,
      },
      select: {
        expectedAmount: true,
        stage: true,
        createdAt: true,
        expectedCloseDate: true,
      },
    });

    // Calculate weighted pipeline
    let totalWeighted = 0;
    let totalUnweighted = 0;
    for (const deal of activeDeals) {
      const amount = Number(deal.expectedAmount);
      totalUnweighted += amount;
      totalWeighted += amount * (this.STAGE_WEIGHTS[deal.stage] || 0);
    }

    const avgDealSize = activeDeals.length > 0 ? totalUnweighted / activeDeals.length : 0;

    // Calculate avg days to close from historical data
    const closedDeals = await this.prisma.deal.findMany({
      where: {
        organizationId,
        stage: 'WON',
        actualCloseDate: { not: null },
        deletedAt: null,
      },
      select: { createdAt: true, actualCloseDate: true },
    });

    const avgDaysToClose =
      closedDeals.length > 0
        ? closedDeals.reduce(
            (sum, d) => sum + (d.actualCloseDate!.getTime() - d.createdAt.getTime()) / 86400000,
            0,
          ) / closedDeals.length
        : 30;

    // Forecast by month using Holt-Winters on historical won amounts
    const monthlyWon = await this.getMonthlyWonAmounts(organizationId);
    let forecastByMonth: { month: string; predicted: number; confidence: number }[] = [];

    if (monthlyWon.length >= 6) {
      try {
        const hwResult = holtWinters(monthlyWon, months, { seasonLength: 12 });
        const now = new Date();
        forecastByMonth = hwResult.forecasts.map((val: number, i: number) => {
          const date = new Date(now);
          date.setMonth(date.getMonth() + i + 1);
          return {
            month: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
            predicted: Math.max(0, val),
            confidence: Math.max(0.3, 0.9 - i * 0.1),
          };
        });
      } catch {
        // Fallback: use average
        const avg =
          monthlyWon.length > 0 ? monthlyWon.reduce((a, b) => a + b, 0) / monthlyWon.length : 0;
        const now = new Date();
        forecastByMonth = Array.from({ length: months }, (_, i) => {
          const date = new Date(now);
          date.setMonth(date.getMonth() + i + 1);
          return {
            month: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
            predicted: avg,
            confidence: 0.4,
          };
        });
      }
    }

    // Try Ollama for deal-level risk assessment and insights
    let narrative: PipelineForecast['narrative'];
    let predictionMethod: PredictionMethod = 'ML';

    try {
      // Get stage data for the prompt
      const stageBreakdown = new Map<
        string,
        {
          count: number;
          value: number;
          deals: { name: string; value: number; daysInStage: number }[];
        }
      >();
      for (const deal of activeDeals) {
        const existing = stageBreakdown.get(deal.stage) || { count: 0, value: 0, deals: [] };
        existing.count++;
        existing.value += Number(deal.expectedAmount);
        const daysInStage = Math.floor((Date.now() - deal.createdAt.getTime()) / 86400000);
        existing.deals.push({
          name: `Deal-${deal.stage}-${existing.count}`,
          value: Number(deal.expectedAmount),
          daysInStage,
        });
        stageBreakdown.set(deal.stage, existing);
      }

      const stages = Array.from(stageBreakdown.entries()).map(([name, data]) => ({
        name,
        deals_count: data.count,
        total_value: data.value,
        avg_days_in_stage:
          data.deals.length > 0
            ? data.deals.reduce((s, d) => s + d.daysInStage, 0) / data.deals.length
            : 0,
        conversion_rate: this.STAGE_WEIGHTS[name] || 0,
        deals: data.deals.map((d) => ({
          deal_name: d.name,
          value: d.value,
          days_in_stage: d.daysInStage,
        })),
      }));

      const promptData = buildPipelineNarrativePrompt(
        {
          total_value: totalUnweighted,
          total_deals: activeDeals.length,
          weighted_value: totalWeighted,
          avg_deal_size: avgDealSize,
          avg_cycle_days: Math.round(avgDaysToClose),
        },
        stages,
      );

      const ollamaResult = await this.ollamaGateway.infer<PipelineNarrativeResponse>(
        promptData.user,
        { systemPrompt: promptData.system, timeoutMs: 15_000 },
      );

      if (ollamaResult?.data) {
        narrative = {
          insights: ollamaResult.data.insights || [],
          riskDeals: (ollamaResult.data.risk_deals || []).map((d) => ({
            dealName: d.deal_name,
            risk: d.risk,
            recommendation: d.recommendation,
          })),
          adjustedForecast: ollamaResult.data.forecast || undefined,
        };
        predictionMethod = 'HYBRID';
      }
    } catch (error) {
      this.logger.debug(
        `Ollama pipeline narrative unavailable: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return {
      totalWeighted,
      totalUnweighted,
      forecastByMonth,
      activeDeals: activeDeals.length,
      avgDealSize,
      avgDaysToClose: Math.round(avgDaysToClose),
      narrative,
      predictionMethod,
    };
  }

  async getWeightedPipeline(organizationId: string): Promise<WeightedPipelineStage[]> {
    const deals = await this.prisma.deal.findMany({
      where: {
        organizationId,
        stage: { notIn: ['WON', 'LOST'] },
        deletedAt: null,
      },
      select: { expectedAmount: true, stage: true, createdAt: true, updatedAt: true },
    });

    // Get historical win rates
    const historicalRates = await this.getStageConversionRates(organizationId);
    const rateMap = new Map(historicalRates.map((r) => [r.stage, r.winRate]));

    const stageMap = new Map<string, { count: number; total: number; daysSum: number }>();

    for (const deal of deals) {
      const existing = stageMap.get(deal.stage) || {
        count: 0,
        total: 0,
        daysSum: 0,
      };
      existing.count++;
      existing.total += Number(deal.expectedAmount);
      existing.daysSum += (Date.now() - deal.updatedAt.getTime()) / 86400000;
      stageMap.set(deal.stage, existing);
    }

    return Array.from(stageMap.entries()).map(([stage, data]) => ({
      stage,
      dealCount: data.count,
      totalValue: data.total,
      weightedValue: data.total * (rateMap.get(stage) ?? this.STAGE_WEIGHTS[stage] ?? 0),
      historicalWinRate: rateMap.get(stage) ?? this.STAGE_WEIGHTS[stage] ?? 0,
      avgDaysInStage: data.count > 0 ? data.daysSum / data.count : 0,
    }));
  }

  async getStageConversionRates(organizationId: string): Promise<StageConversionRate[]> {
    const deals = await this.prisma.deal.findMany({
      where: {
        organizationId,
        stage: { in: ['WON', 'LOST'] },
        deletedAt: null,
      },
      select: { stage: true, expectedAmount: true },
    });

    // For now, calculate overall win rate and apply stage weights
    const won = deals.filter((d) => d.stage === 'WON');
    const lost = deals.filter((d) => d.stage === 'LOST');
    const overallWinRate = deals.length > 0 ? won.length / deals.length : 0.3;

    const stages = ['NEW', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION'];
    return stages.map((stage) => {
      const baseRate = this.STAGE_WEIGHTS[stage] || 0;
      const adjustedRate = deals.length > 10 ? baseRate * (overallWinRate / 0.3) : baseRate;

      return {
        stage,
        totalDeals: deals.length,
        wonDeals: won.length,
        lostDeals: lost.length,
        winRate: Math.min(1, adjustedRate),
        avgAmount:
          won.length > 0 ? won.reduce((s, d) => s + Number(d.expectedAmount), 0) / won.length : 0,
      };
    });
  }

  async forecastDealTimeline(
    organizationId: string,
    dealId: string,
  ): Promise<DealTimelineForecast> {
    const deal = await this.prisma.deal.findFirst({
      where: { id: dealId, organizationId, deletedAt: null },
    });
    if (!deal) throw new Error(`Deal ${dealId} not found`);

    const winRate = this.STAGE_WEIGHTS[deal.stage] || 0;
    const daysInStage = Math.floor((Date.now() - deal.updatedAt.getTime()) / 86400000);

    // Predict close date based on historical avg
    const avgDays = await this.getAvgDaysToCloseFromStage(organizationId, deal.stage);
    const predictedClose = new Date();
    predictedClose.setDate(predictedClose.getDate() + Math.max(1, avgDays - daysInStage));

    return {
      dealId,
      dealName: deal.dealName,
      currentStage: deal.stage,
      expectedCloseDate: deal.expectedCloseDate,
      predictedCloseDate: predictedClose,
      winProbability: winRate,
      daysInCurrentStage: daysInStage,
      confidence: 0.6,
    };
  }

  private async getMonthlyWonAmounts(organizationId: string): Promise<number[]> {
    const deals = await this.prisma.deal.findMany({
      where: {
        organizationId,
        stage: 'WON',
        actualCloseDate: { not: null },
        deletedAt: null,
      },
      select: { actualCloseDate: true, expectedAmount: true },
      orderBy: { actualCloseDate: 'asc' },
    });

    if (deals.length === 0) return [];

    const monthlyMap = new Map<string, number>();
    for (const deal of deals) {
      const d = deal.actualCloseDate!;
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      monthlyMap.set(key, (monthlyMap.get(key) || 0) + Number(deal.expectedAmount));
    }

    return Array.from(monthlyMap.values());
  }

  private async getAvgDaysToCloseFromStage(organizationId: string, stage: string): Promise<number> {
    // Default estimates per stage
    const defaults: Record<string, number> = {
      NEW: 60,
      QUALIFIED: 45,
      PROPOSAL: 30,
      NEGOTIATION: 14,
    };
    return defaults[stage] || 30;
  }
}
