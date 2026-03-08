import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../prisma/prisma.service';
import { ModelRegistryService } from './model-registry.service';
import { AiFeedbackService } from './ai-feedback.service';
import { AiTrainingService } from './ai-training.service';

export interface Recommendation {
  itemId: string;
  itemName: string;
  score: number;
  reason: string;
  coOccurrenceCount: number;
}

export interface ItemAssociation {
  itemId: string;
  itemName: string;
  associationScore: number;
  coOccurrenceCount: number;
  supportPercentage: number;
}

@Injectable()
export class CrossSellService {
  private readonly logger = new Logger(CrossSellService.name);

  constructor(
    private prisma: PrismaService,
    private modelRegistry: ModelRegistryService,
    private feedbackService: AiFeedbackService,
    private trainingService: AiTrainingService,
    private eventEmitter: EventEmitter2,
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

    // Load co-occurrence matrix
    const model = await this.modelRegistry.loadActiveModel(organizationId, 'CROSS_SELL');

    const coMatrix: Record<string, Record<string, number>> = (model?.modelData
      ?.coOccurrenceMatrix as Record<string, Record<string, number>>) || {};

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

    const recommendations = sorted.map(([itemId, score]) => ({
      itemId,
      itemName: itemMap.get(itemId) || 'Unknown',
      score: Math.min(1, score / 10),
      reason: reasons.get(itemId) || 'Related item',
      coOccurrenceCount: counts.get(itemId) || 0,
    }));

    // Store prediction for feedback tracking
    if (recommendations.length > 0) {
      await this.feedbackService.storePrediction(
        organizationId,
        'CROSS_SELL',
        { customerId, purchasedItems },
        { recommendations: recommendations.map((r) => r.itemId) },
        recommendations[0].score,
        0,
      );
    }

    return recommendations;
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

    // Save via ModelRegistry
    await this.modelRegistry.saveModel(
      organizationId,
      'CROSS_SELL',
      { coOccurrenceMatrix: coMatrix, totalTransactions: invoices.length },
      1.0,
      invoices.length,
    );

    this.logger.log(
      `Built co-occurrence matrix: ${itemPairs} pairs from ${invoices.length} transactions`,
    );

    return { itemPairs, totalTransactions: invoices.length };
  }

  /**
   * Record user feedback on a cross-sell recommendation.
   */
  async recordRecommendationFeedback(
    organizationId: string,
    customerId: string,
    recommendedItemId: string,
    wasAccepted: boolean,
  ): Promise<void> {
    const label = wasAccepted ? 'ACCEPTED' : 'REJECTED';

    await this.trainingService.addTrainingData(
      organizationId,
      'CROSS_SELL',
      { customerId, recommendedItemId },
      label,
      wasAccepted ? 'USER' : 'CORRECTION',
    );

    if (!wasAccepted) {
      const { shouldRetrain } = await this.feedbackService.checkRetrainingThreshold(
        organizationId,
        'CROSS_SELL',
      );

      if (shouldRetrain) {
        this.logger.log(`Cross-sell retraining threshold reached for org ${organizationId}`);
        this.eventEmitter.emit('ai.retraining.needed', {
          organizationId,
          feature: 'CROSS_SELL',
        });
      }
    }
  }

  async getFrequentlyBoughtTogether(
    organizationId: string,
    itemId: string,
    limit: number = 5,
  ): Promise<ItemAssociation[]> {
    const model = await this.modelRegistry.loadActiveModel(organizationId, 'CROSS_SELL');

    if (!model?.modelData?.coOccurrenceMatrix) {
      return [];
    }

    const coMatrix = model.modelData.coOccurrenceMatrix as Record<string, Record<string, number>>;
    const related = coMatrix[itemId] || {};
    const totalTransactions = (model.modelData.totalTransactions as number) || 1;

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
