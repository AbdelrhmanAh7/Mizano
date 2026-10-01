import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { OllamaInferenceGateway } from './ollama-inference-gateway.service';
import { buildDynamicPricingPrompt, DynamicPricingResponse } from '../prompts/sales-crm.prompts';
import { PredictionMethod } from '../types/prediction-method.type';
import { describeError } from '../../../common/utils/redact';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const ss = require('simple-statistics');

export interface ElasticityResult {
  itemId: string;
  itemName: string;
  elasticity: number;
  isElastic: boolean;
  priceRange: { min: number; max: number };
  quantityRange: { min: number; max: number };
  dataPoints: number;
  rSquared: number;
  confidence: number;
}

export interface PriceSuggestion {
  itemId: string;
  itemName: string;
  currentPrice: number;
  suggestedPrice: number;
  costPrice: number;
  currentMargin: number;
  suggestedMargin: number;
  expectedRevenueChange: number;
  confidence: number;
  reason: string;
  predictionMethod: PredictionMethod;
}

export interface PricingInsight {
  itemId: string;
  itemName: string;
  type: 'OVERPRICED' | 'UNDERPRICED' | 'OPTIMAL' | 'LOW_DATA';
  currentPrice: number;
  suggestedPrice: number | null;
  potentialImpact: number;
  description: string;
}

@Injectable()
export class DynamicPricingService {
  private readonly logger = new Logger(DynamicPricingService.name);

  constructor(
    private prisma: PrismaService,
    private gateway: OllamaInferenceGateway,
  ) {}

  async estimateElasticity(organizationId: string, itemId: string): Promise<ElasticityResult> {
    const item = await this.prisma.item.findFirst({
      where: { id: itemId, organizationId },
    });
    if (!item) throw new Error(`Item ${itemId} not found`);

    // Get price-quantity data from invoice lines
    const lines = await this.prisma.invoiceLine.findMany({
      where: {
        itemId,
        invoice: {
          organizationId,
          status: { in: ['PAID', 'PARTIALLY_PAID', 'SENT'] },
          deletedAt: null,
        },
      },
      select: { rate: true, quantity: true, invoice: { select: { date: true } } },
      orderBy: { invoice: { date: 'asc' } },
    });

    const dataPoints = lines.map((l) => ({
      price: Number(l.rate),
      quantity: Number(l.quantity),
    }));

    if (dataPoints.length < 5) {
      return {
        itemId,
        itemName: item.name,
        elasticity: 0,
        isElastic: false,
        priceRange: { min: 0, max: 0 },
        quantityRange: { min: 0, max: 0 },
        dataPoints: dataPoints.length,
        rSquared: 0,
        confidence: 0.1,
      };
    }

    const prices = dataPoints.map((d) => d.price);
    const quantities = dataPoints.map((d) => d.quantity);

    // Group by price point and average quantities
    const priceMap = new Map<number, number[]>();
    for (const d of dataPoints) {
      const rounded = Math.round(d.price * 100) / 100;
      if (!priceMap.has(rounded)) priceMap.set(rounded, []);
      priceMap.get(rounded)!.push(d.quantity);
    }

    const pairs: [number, number][] = [];
    for (const [price, qtys] of priceMap) {
      pairs.push([price, ss.mean(qtys)]);
    }

    let elasticity = 0;
    let rSquared = 0;

    if (pairs.length >= 3) {
      // Linear regression: quantity = a + b * price
      const regression = ss.linearRegression(pairs);
      const regressionLine = ss.linearRegressionLine(regression);
      rSquared = ss.rSquared(pairs, regressionLine);

      // Price elasticity = (dQ/dP) * (P/Q) at mean price
      const meanPrice = ss.mean(prices);
      const meanQuantity = ss.mean(quantities);
      if (meanQuantity !== 0) {
        elasticity = (regression.m * meanPrice) / meanQuantity;
      }
    }

    return {
      itemId,
      itemName: item.name,
      elasticity,
      isElastic: Math.abs(elasticity) > 1,
      priceRange: { min: ss.min(prices), max: ss.max(prices) },
      quantityRange: { min: ss.min(quantities), max: ss.max(quantities) },
      dataPoints: dataPoints.length,
      rSquared,
      confidence: Math.min(0.95, 0.2 + dataPoints.length * 0.03 + rSquared * 0.3),
    };
  }

  async suggestPrice(
    organizationId: string,
    itemId: string,
    targetMargin?: number,
  ): Promise<PriceSuggestion> {
    const item = await this.prisma.item.findFirst({
      where: { id: itemId, organizationId },
    });
    if (!item) throw new Error(`Item ${itemId} not found`);

    const currentPrice = Number(item.sellingPrice);
    const costPrice = Number(item.costPrice);
    const currentMargin = costPrice > 0 ? (currentPrice - costPrice) / currentPrice : 0;
    const target = targetMargin ?? 0.3;

    const elasticity = await this.estimateElasticity(organizationId, itemId);

    let suggestedPrice = currentPrice;
    let reason = 'No significant data for price optimization';

    if (elasticity.dataPoints >= 5 && elasticity.rSquared > 0.1) {
      if (elasticity.isElastic) {
        // Elastic: lowering price increases revenue
        suggestedPrice = currentPrice * 0.95;
        reason = 'Price-sensitive item: small decrease could increase volume';
      } else {
        // Inelastic: can raise price
        suggestedPrice = currentPrice * 1.05;
        reason = "Price-insensitive item: moderate increase won't reduce volume";
      }
    }

    // Try Ollama inference for pricing suggestion
    let ollamaPrice: number | null = null;
    let predictionMethod: PredictionMethod = 'RULE_BASED';
    try {
      const prompt = buildDynamicPricingPrompt(
        {
          item_id: itemId,
          item_name: item.name,
          current_price: currentPrice,
          cost: costPrice,
          sales_velocity: elasticity.dataPoints,
        },
        {
          market_trend: 'STABLE',
        },
        {
          recent_sales_count: elasticity.dataPoints,
          trend_direction:
            elasticity.elasticity < -0.5 ? 'DOWN' : elasticity.elasticity > 0.5 ? 'UP' : 'FLAT',
        },
      );
      const ollamaResult = await this.gateway.infer<DynamicPricingResponse>(prompt.user, {
        systemPrompt: prompt.system,
      });
      if (ollamaResult?.data?.suggested_price != null && ollamaResult.data.suggested_price > 0) {
        ollamaPrice = ollamaResult.data.suggested_price;
        if (ollamaResult.data.reasoning) {
          reason = ollamaResult.data.reasoning;
        }
      }
    } catch (error) {
      this.logger.warn(`Ollama pricing failed for item ${itemId}: ${describeError(error)}`);
    }

    // Blend: Ollama + rule-based
    if (ollamaPrice !== null) {
      suggestedPrice = ollamaPrice * 0.5 + suggestedPrice * 0.5;
      predictionMethod = 'HYBRID';
    }

    // Apply margin constraint
    const minPrice = costPrice > 0 ? costPrice / (1 - target) : 0;
    suggestedPrice = Math.max(suggestedPrice, minPrice);

    const suggestedMargin = suggestedPrice > 0 ? (suggestedPrice - costPrice) / suggestedPrice : 0;
    const expectedRevenueChange = ((suggestedPrice - currentPrice) / currentPrice) * 100;

    return {
      itemId,
      itemName: item.name,
      currentPrice,
      suggestedPrice: Math.round(suggestedPrice * 100) / 100,
      costPrice,
      currentMargin,
      suggestedMargin,
      expectedRevenueChange,
      confidence:
        ollamaPrice !== null ? Math.min(0.95, elasticity.confidence + 0.1) : elasticity.confidence,
      reason,
      predictionMethod,
    };
  }

  async analyzeAllPricing(
    organizationId: string,
  ): Promise<{ analyzed: number; suggestions: number }> {
    const items = await this.prisma.item.findMany({
      where: { organizationId, isActive: true },
      select: { id: true },
    });

    let suggestions = 0;
    for (const item of items) {
      try {
        const result = await this.suggestPrice(organizationId, item.id);
        if (Math.abs(result.suggestedPrice - result.currentPrice) > result.currentPrice * 0.02) {
          suggestions++;
        }
      } catch {
        // skip
      }
    }

    return { analyzed: items.length, suggestions };
  }

  async getPricingInsights(organizationId: string): Promise<PricingInsight[]> {
    const items = await this.prisma.item.findMany({
      where: { organizationId, isActive: true },
      select: { id: true, name: true, sellingPrice: true, costPrice: true },
    });

    const insights: PricingInsight[] = [];

    for (const item of items) {
      const currentPrice = Number(item.sellingPrice);
      const costPrice = Number(item.costPrice);

      if (costPrice <= 0 || currentPrice <= 0) continue;

      const margin = (currentPrice - costPrice) / currentPrice;

      try {
        const elasticity = await this.estimateElasticity(organizationId, item.id);

        if (elasticity.dataPoints < 5) {
          insights.push({
            itemId: item.id,
            itemName: item.name,
            type: 'LOW_DATA',
            currentPrice,
            suggestedPrice: null,
            potentialImpact: 0,
            description: 'Insufficient sales data for pricing analysis',
          });
          continue;
        }

        if (margin > 0.6 && elasticity.isElastic) {
          insights.push({
            itemId: item.id,
            itemName: item.name,
            type: 'OVERPRICED',
            currentPrice,
            suggestedPrice: currentPrice * 0.9,
            potentialImpact: currentPrice * 0.1,
            description: `High margin (${(margin * 100).toFixed(0)}%) with elastic demand. Price reduction may increase revenue.`,
          });
        } else if (margin < 0.15 && !elasticity.isElastic) {
          insights.push({
            itemId: item.id,
            itemName: item.name,
            type: 'UNDERPRICED',
            currentPrice,
            suggestedPrice: currentPrice * 1.1,
            potentialImpact: currentPrice * 0.1,
            description: `Low margin (${(margin * 100).toFixed(0)}%) with inelastic demand. Price increase is possible.`,
          });
        } else {
          insights.push({
            itemId: item.id,
            itemName: item.name,
            type: 'OPTIMAL',
            currentPrice,
            suggestedPrice: null,
            potentialImpact: 0,
            description: `Pricing appears optimal for current demand patterns.`,
          });
        }
      } catch {
        continue;
      }
    }

    return insights.sort((a, b) => b.potentialImpact - a.potentialImpact);
  }
}
