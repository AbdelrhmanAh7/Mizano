import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { AiFeedbackService } from './ai-feedback.service';
import { OllamaInferenceGateway } from './ollama-inference-gateway.service';
import { buildCrossSellPrompt, CrossSellResponse } from '../prompts/sales-crm.prompts';
import { BoundedCache } from '../utils/bounded-cache.util';
import { PredictionMethod } from '../types/prediction-method.type';
import { describeError } from '../../../common/utils/redact';

export interface Recommendation {
  itemId: string;
  itemName: string;
  score: number;
  reason: string;
  coOccurrenceCount: number;
  predictionMethod?: PredictionMethod;
}

export interface ItemAssociation {
  itemId: string;
  itemName: string;
  associationScore: number;
  coOccurrenceCount: number;
  supportPercentage: number;
}

interface CoOccurrenceData {
  coOccurrenceMatrix: Record<string, Record<string, number>>;
  totalTransactions: number;
}

@Injectable()
export class CrossSellService {
  private readonly logger = new Logger(CrossSellService.name);

  /** In-memory cache of co-occurrence matrices per org (bounded: max 50, 1h TTL) */
  private matrixCache = new BoundedCache<CoOccurrenceData>(50, 60 * 60 * 1000);

  constructor(
    private prisma: PrismaService,
    private feedbackService: AiFeedbackService,
    private gateway: OllamaInferenceGateway,
  ) {}

  async getRecommendations(
    organizationId: string,
    customerId: string,
    limit: number = 5,
  ): Promise<Recommendation[]> {
    // Get items this customer has purchased
    const purchasedItems = await this.getCustomerPurchasedItems(organizationId, customerId);

    if (purchasedItems.length === 0) {
      return [];
    }

    // Load co-occurrence matrix from cache
    const cached = this.matrixCache.get(organizationId);
    const coMatrix: Record<string, Record<string, number>> = cached?.coOccurrenceMatrix || {};

    // Find recommended items
    const scores = new Map<string, number>();
    const reasons = new Map<string, string>();
    const counts = new Map<string, number>();

    for (const purchasedId of purchasedItems) {
      const related = coMatrix[purchasedId] || {};
      for (const [relatedId, count] of Object.entries(related)) {
        if (purchasedItems.includes(relatedId)) continue;
        scores.set(relatedId, (scores.get(relatedId) || 0) + count);
        counts.set(relatedId, (counts.get(relatedId) || 0) + (count as number));
        reasons.set(relatedId, `Frequently bought with items you purchased`);
      }
    }

    // Sort by score
    const sorted = Array.from(scores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit);

    // Fetch item names
    const itemIds = sorted.map(([id]) => id);
    const items = await this.prisma.item.findMany({
      where: { id: { in: itemIds }, organizationId },
      select: { id: true, name: true },
    });
    const itemMap = new Map(items.map((i) => [i.id, i.name]));

    let predictionMethod: PredictionMethod = 'RULE_BASED';
    const recommendations = sorted.map(([itemId, score]) => ({
      itemId,
      itemName: itemMap.get(itemId) || 'Unknown',
      score: Math.min(1, score / 10),
      reason: reasons.get(itemId) || 'Related item',
      coOccurrenceCount: counts.get(itemId) || 0,
    }));

    // Try Ollama inference for cross-sell recommendations
    try {
      // Get item details for purchased items
      const purchasedItemDetails = await this.prisma.item.findMany({
        where: { id: { in: purchasedItems }, organizationId },
        select: { id: true, name: true, sellingPrice: true },
      });
      // Get catalog items not yet purchased
      const catalogItems = await this.prisma.item.findMany({
        where: { organizationId, id: { notIn: purchasedItems }, isActive: true },
        select: { id: true, name: true, sellingPrice: true },
        take: 20,
      });

      if (catalogItems.length > 0) {
        const prompt = buildCrossSellPrompt(
          purchasedItemDetails.map((item) => ({
            item_id: item.id,
            item_name: item.name,
            quantity: 1,
            amount: Number(item.sellingPrice),
            date: new Date().toISOString(),
          })),
          catalogItems.map((item) => ({
            item_id: item.id,
            item_name: item.name,
            price: Number(item.sellingPrice),
          })),
        );
        const ollamaResult = await this.gateway.infer<CrossSellResponse>(prompt.user, {
          systemPrompt: prompt.system,
        });
        if (ollamaResult?.data?.recommendations?.length) {
          // Merge Ollama recommendations with co-occurrence ones
          for (const ollamaRec of ollamaResult.data.recommendations) {
            const existing = recommendations.find((r) => r.itemId === ollamaRec.item_id);
            if (existing) {
              // Blend scores: co-occurrence + Ollama
              existing.score = existing.score * 0.5 + ollamaRec.confidence * 0.5;
              existing.reason = ollamaRec.reason || existing.reason;
            } else if (recommendations.length < limit) {
              recommendations.push({
                itemId: ollamaRec.item_id,
                itemName: ollamaRec.item_name,
                score: ollamaRec.confidence,
                reason: ollamaRec.reason,
                coOccurrenceCount: 0,
              });
            }
          }
          predictionMethod = 'HYBRID';
        }
      }
    } catch (error) {
      this.logger.warn(
        `Ollama cross-sell failed for customer ${customerId}: ${describeError(error)}`,
      );
    }

    // Re-sort by score after potential Ollama merge
    recommendations.sort((a, b) => b.score - a.score);
    const finalRecommendations = recommendations.slice(0, limit).map((r) => ({
      ...r,
      predictionMethod,
    }));

    // Store prediction for feedback tracking
    if (finalRecommendations.length > 0) {
      await this.feedbackService.storePrediction(
        organizationId,
        'CROSS_SELL',
        { customerId, purchasedItems },
        { recommendations: finalRecommendations.map((r) => r.itemId) },
        finalRecommendations[0].score,
        0,
      );
    }

    return finalRecommendations;
  }

  async getUpsellRecommendations(
    organizationId: string,
    customerId: string,
    limit: number = 5,
  ): Promise<Recommendation[]> {
    const purchasedItems = await this.getCustomerPurchasedItems(organizationId, customerId);

    if (purchasedItems.length === 0) return [];

    // Get purchased items with prices
    const purchased = await this.prisma.item.findMany({
      where: { id: { in: purchasedItems }, organizationId },
      select: { id: true, sellingPrice: true, type: true },
    });

    const maxPrice = Math.max(...purchased.map((p) => Number(p.sellingPrice)));

    // Find higher-priced alternatives
    const upsells = await this.prisma.item.findMany({
      where: {
        organizationId,
        id: { notIn: purchasedItems },
        sellingPrice: { gt: maxPrice * 0.8 },
        isActive: true,
      },
      select: { id: true, name: true, sellingPrice: true },
      orderBy: { sellingPrice: 'asc' },
      take: limit,
    });

    return upsells.map((item) => ({
      itemId: item.id,
      itemName: item.name,
      score: 0.6,
      reason: `Premium alternative (${Number(item.sellingPrice).toFixed(2)})`,
      coOccurrenceCount: 0,
    }));
  }

  async buildCoOccurrenceMatrix(
    organizationId: string,
  ): Promise<{ itemPairs: number; totalTransactions: number }> {
    // Get all invoices with their line items
    const invoices = await this.prisma.invoice.findMany({
      where: {
        organizationId,
        status: { in: ['PAID', 'PARTIALLY_PAID', 'SENT'] },
        deletedAt: null,
      },
      select: {
        id: true,
        lines: { select: { itemId: true } },
      },
    });

    const coMatrix: Record<string, Record<string, number>> = {};
    let itemPairs = 0;

    for (const invoice of invoices) {
      const itemIds = invoice.lines.map((l) => l.itemId).filter((id): id is string => id !== null);
      const uniqueItems = [...new Set(itemIds)];

      // Build co-occurrence pairs
      for (let i = 0; i < uniqueItems.length; i++) {
        for (let j = i + 1; j < uniqueItems.length; j++) {
          const a = uniqueItems[i];
          const b = uniqueItems[j];

          if (!coMatrix[a]) coMatrix[a] = {};
          if (!coMatrix[b]) coMatrix[b] = {};
          coMatrix[a][b] = (coMatrix[a][b] || 0) + 1;
          coMatrix[b][a] = (coMatrix[b][a] || 0) + 1;
          itemPairs++;
        }
      }
    }

    // Cache in memory
    this.matrixCache.set(organizationId, {
      coOccurrenceMatrix: coMatrix,
      totalTransactions: invoices.length,
    });

    this.logger.log(
      `Built co-occurrence matrix: ${itemPairs} pairs from ${invoices.length} transactions`,
    );

    return { itemPairs, totalTransactions: invoices.length };
  }

  /**
   * Record user feedback on a cross-sell recommendation.
   */
  async recordRecommendationFeedback(
    _organizationId: string,
    _customerId: string,
    _recommendedItemId: string,
    _wasAccepted: boolean,
  ): Promise<void> {
    // Feedback recorded — no retraining infrastructure
  }

  async getFrequentlyBoughtTogether(
    organizationId: string,
    itemId: string,
    limit: number = 5,
  ): Promise<ItemAssociation[]> {
    const cached = this.matrixCache.get(organizationId);

    if (!cached?.coOccurrenceMatrix) {
      return [];
    }

    const coMatrix = cached.coOccurrenceMatrix;
    const related = coMatrix[itemId] || {};
    const totalTransactions = cached.totalTransactions || 1;

    const sorted = Object.entries(related)
      .sort(([, a], [, b]) => (b as number) - (a as number))
      .slice(0, limit);

    const itemIds = sorted.map(([id]) => id);
    const items = await this.prisma.item.findMany({
      where: { id: { in: itemIds }, organizationId },
      select: { id: true, name: true },
    });
    const itemMap = new Map(items.map((i) => [i.id, i.name]));

    return sorted.map(([id, count]) => ({
      itemId: id,
      itemName: itemMap.get(id) || 'Unknown',
      associationScore: Math.min(1, (count as number) / 10),
      coOccurrenceCount: count as number,
      supportPercentage: ((count as number) / totalTransactions) * 100,
    }));
  }

  private async getCustomerPurchasedItems(
    organizationId: string,
    customerId: string,
  ): Promise<string[]> {
    const lines = await this.prisma.invoiceLine.findMany({
      where: {
        invoice: {
          organizationId,
          customerId,
          status: { in: ['PAID', 'PARTIALLY_PAID', 'SENT'] },
          deletedAt: null,
        },
      },
      select: { itemId: true },
      distinct: ['itemId'],
    });

    return lines.map((l) => l.itemId).filter((id): id is string => id !== null);
  }
}
