import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { OllamaInferenceGateway } from './ollama-inference-gateway.service';
import { buildSentimentPrompt } from '../prompts/nlp.prompts';
import { PredictionMethod } from '../types/prediction-method.type';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const Sentiment = require('sentiment');

/**
 * Sentiment label derived from the comparative score.
 */
export type SentimentLabel = 'positive' | 'negative' | 'neutral';

export interface SentimentResult {
  /** Raw AFINN score (sum of word scores) */
  score: number;
  /** Normalized score from -1 to 1 */
  comparative: number;
  /** Words contributing positively */
  positive: string[];
  /** Words contributing negatively */
  negative: string[];
  /** Overall sentiment label */
  sentiment: SentimentLabel;
  /** How the prediction was generated */
  predictionMethod?: PredictionMethod;
}

export interface EntitySentimentResult {
  /** Average normalized sentiment across all texts */
  averageSentiment: number;
  /** Overall label */
  sentiment: SentimentLabel;
  /** Number of texts analyzed */
  sampleCount: number;
  /** Breakdown of positive / neutral / negative counts */
  distribution: {
    positive: number;
    neutral: number;
    negative: number;
  };
  /** Individual text results (most recent first, capped) */
  details: Array<{
    source: string;
    text: string;
    sentiment: SentimentLabel;
    comparative: number;
    date: Date;
  }>;
}

export interface SentimentTrendPoint {
  period: string;
  averageSentiment: number;
  sentiment: SentimentLabel;
  sampleCount: number;
}

export type EntityType = 'customer' | 'vendor' | 'lead' | 'deal';
export type TrendPeriod = 'weekly' | 'monthly' | 'quarterly';

/** Threshold below which comparative score is considered negative */
const NEGATIVE_THRESHOLD = -0.05;
/** Threshold above which comparative score is considered positive */
const POSITIVE_THRESHOLD = 0.05;
/** Maximum individual detail records returned */
const MAX_DETAILS = 50;

@Injectable()
export class SentimentAnalysisService {
  private readonly logger = new Logger(SentimentAnalysisService.name);
  private readonly analyzer: {
    analyze(text: string): {
      score: number;
      comparative: number;
      words: string[];
      positive: string[];
      negative: string[];
    };
  };

  constructor(
    private prisma: PrismaService,
    private gateway: OllamaInferenceGateway,
  ) {
    this.analyzer = new Sentiment();
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Analyze the sentiment of a single text string.
   * Uses the AFINN-165 wordlist via the `sentiment` library.
   * The comparative score (per-word average) is normalized to the -1..1 range.
   */
  analyzeText(text: string): SentimentResult {
    if (!text || text.trim().length === 0) {
      return {
        score: 0,
        comparative: 0,
        positive: [],
        negative: [],
        sentiment: 'neutral',
      };
    }

    const result = this.analyzer.analyze(text);

    const comparative = this.clamp(result.comparative, -1, 1);

    return {
      score: result.score,
      comparative,
      positive: result.positive || [],
      negative: result.negative || [],
      sentiment: this.labelFromComparative(comparative),
    };
  }

  /**
   * Async sentiment analysis that tries Ollama first, then falls back to AFINN.
   * Use this method when async is acceptable (e.g., API handlers).
   */
  async analyzeTextAsync(text: string): Promise<SentimentResult> {
    if (!text || text.trim().length === 0) {
      return {
        score: 0,
        comparative: 0,
        positive: [],
        negative: [],
        sentiment: 'neutral',
        predictionMethod: 'RULE_BASED',
      };
    }

    // --- Ollama-first inference path ---
    try {
      const prompt = buildSentimentPrompt(text);
      const ollamaResult = await this.gateway.infer<{
        score: number;
        comparative: number;
        sentiment: string;
        positive_words: string[];
        negative_words: string[];
      }>(prompt);

      if (ollamaResult) {
        const d = ollamaResult.data;
        const comparative = this.clamp(d.comparative ?? 0, -1, 1);
        const result: SentimentResult = {
          score: d.score ?? 0,
          comparative,
          positive: d.positive_words || [],
          negative: d.negative_words || [],
          sentiment: (d.sentiment as SentimentLabel) || this.labelFromComparative(comparative),
          predictionMethod: 'OLLAMA',
        };
        return result;
      }
    } catch (error) {
      this.logger.warn(
        `Ollama sentiment analysis failed, falling back to AFINN: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // --- Existing AFINN fallback ---
    return { ...this.analyzeText(text), predictionMethod: 'RULE_BASED' };
  }

  /**
   * Aggregate sentiment for a specific customer.
   * Pulls text from Invoice.notes and ActivityLog descriptions
   * linked to the customer's invoices.
   */
  async analyzeCustomerSentiment(
    organizationId: string,
    customerId: string,
  ): Promise<EntitySentimentResult> {
    // Fetch invoice notes
    const invoices = await this.prisma.invoice.findMany({
      where: {
        organizationId,
        customerId,
        deletedAt: null,
        notes: { not: null },
      },
      select: { notes: true, date: true },
      orderBy: { date: 'desc' },
      take: MAX_DETAILS,
    });

    // Fetch activity logs linked to deals/leads for this customer
    const deals = await this.prisma.deal.findMany({
      where: {
        organizationId,
        customerId,
        deletedAt: null,
      },
      select: { id: true },
    });

    const dealIds = deals.map((d) => d.id);

    const activities =
      dealIds.length > 0
        ? await this.prisma.activityLog.findMany({
            where: {
              organizationId,
              dealId: { in: dealIds },
            },
            select: { description: true, date: true },
            orderBy: { date: 'desc' },
            take: MAX_DETAILS,
          })
        : [];

    // Build text entries
    const entries: Array<{ source: string; text: string; date: Date }> = [];

    for (const inv of invoices) {
      if (inv.notes) {
        entries.push({
          source: 'invoice',
          text: inv.notes,
          date: inv.date,
        });
      }
    }

    for (const act of activities) {
      if (act.description) {
        entries.push({
          source: 'activity',
          text: act.description,
          date: act.date,
        });
      }
    }

    return this.aggregateSentiment(entries);
  }

  /**
   * Aggregate sentiment for a specific vendor.
   * Pulls text from Bill.notes and ActivityLog descriptions
   * associated with the vendor's bills.
   */
  async analyzeVendorSentiment(
    organizationId: string,
    vendorId: string,
  ): Promise<EntitySentimentResult> {
    // Fetch bill notes
    const bills = await this.prisma.bill.findMany({
      where: {
        organizationId,
        vendorId,
        deletedAt: null,
        notes: { not: null },
      },
      select: { notes: true, date: true },
      orderBy: { date: 'desc' },
      take: MAX_DETAILS,
    });

    // Build text entries
    const entries: Array<{ source: string; text: string; date: Date }> = [];

    for (const bill of bills) {
      if (bill.notes) {
        entries.push({
          source: 'bill',
          text: bill.notes,
          date: bill.date,
        });
      }
    }

    return this.aggregateSentiment(entries);
  }

  /**
   * Get sentiment trends over time for a given entity type.
   * Groups texts by the specified period (weekly / monthly / quarterly)
   * and computes the average sentiment for each bucket.
   */
  async getSentimentTrends(
    organizationId: string,
    entityType: EntityType,
    period: TrendPeriod = 'monthly',
  ): Promise<SentimentTrendPoint[]> {
    const entries = await this.fetchEntriesByEntityType(organizationId, entityType);

    if (entries.length === 0) {
      return [];
    }

    // Group by period
    const buckets = new Map<string, { totalComparative: number; count: number }>();

    for (const entry of entries) {
      const key = this.periodKey(entry.date, period);
      const bucket = buckets.get(key) || { totalComparative: 0, count: 0 };
      const result = this.analyzeText(entry.text);
      bucket.totalComparative += result.comparative;
      bucket.count++;
      buckets.set(key, bucket);
    }

    // Sort by period key and build results
    const sortedKeys = [...buckets.keys()].sort();
    return sortedKeys.map((key) => {
      const bucket = buckets.get(key)!;
      const avg = bucket.count > 0 ? bucket.totalComparative / bucket.count : 0;
      return {
        period: key,
        averageSentiment: Math.round(avg * 1000) / 1000,
        sentiment: this.labelFromComparative(avg),
        sampleCount: bucket.count,
      };
    });
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Aggregate sentiment results from a list of text entries.
   */
  private aggregateSentiment(
    entries: Array<{ source: string; text: string; date: Date }>,
  ): EntitySentimentResult {
    if (entries.length === 0) {
      return {
        averageSentiment: 0,
        sentiment: 'neutral',
        sampleCount: 0,
        distribution: { positive: 0, neutral: 0, negative: 0 },
        details: [],
      };
    }

    let totalComparative = 0;
    const distribution = { positive: 0, neutral: 0, negative: 0 };
    const details: EntitySentimentResult['details'] = [];

    for (const entry of entries) {
      const result = this.analyzeText(entry.text);
      totalComparative += result.comparative;
      distribution[result.sentiment]++;

      details.push({
        source: entry.source,
        text: entry.text.length > 200 ? entry.text.substring(0, 200) + '...' : entry.text,
        sentiment: result.sentiment,
        comparative: result.comparative,
        date: entry.date,
      });
    }

    const averageSentiment = totalComparative / entries.length;

    return {
      averageSentiment: Math.round(averageSentiment * 1000) / 1000,
      sentiment: this.labelFromComparative(averageSentiment),
      sampleCount: entries.length,
      distribution,
      details: details.slice(0, MAX_DETAILS),
    };
  }

  /**
   * Fetch text entries for a given entity type across the organization.
   */
  private async fetchEntriesByEntityType(
    organizationId: string,
    entityType: EntityType,
  ): Promise<Array<{ text: string; date: Date }>> {
    const entries: Array<{ text: string; date: Date }> = [];

    switch (entityType) {
      case 'customer': {
        const invoices = await this.prisma.invoice.findMany({
          where: {
            organizationId,
            deletedAt: null,
            notes: { not: null },
          },
          select: { notes: true, date: true },
          orderBy: { date: 'desc' },
        });
        for (const inv of invoices) {
          if (inv.notes) entries.push({ text: inv.notes, date: inv.date });
        }
        break;
      }

      case 'vendor': {
        const bills = await this.prisma.bill.findMany({
          where: {
            organizationId,
            deletedAt: null,
            notes: { not: null },
          },
          select: { notes: true, date: true },
          orderBy: { date: 'desc' },
        });
        for (const bill of bills) {
          if (bill.notes) entries.push({ text: bill.notes, date: bill.date });
        }
        break;
      }

      case 'lead': {
        const leads = await this.prisma.lead.findMany({
          where: {
            organizationId,
            deletedAt: null,
            notes: { not: null },
          },
          select: { notes: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
        });
        for (const lead of leads) {
          if (lead.notes) entries.push({ text: lead.notes, date: lead.createdAt });
        }
        break;
      }

      case 'deal': {
        const deals = await this.prisma.deal.findMany({
          where: {
            organizationId,
            deletedAt: null,
          },
          select: { lostReason: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
        });
        for (const deal of deals) {
          if (deal.lostReason) entries.push({ text: deal.lostReason, date: deal.createdAt });
        }
        break;
      }
    }

    return entries;
  }

  /**
   * Map a comparative score to a sentiment label.
   */
  private labelFromComparative(comparative: number): SentimentLabel {
    if (comparative > POSITIVE_THRESHOLD) return 'positive';
    if (comparative < NEGATIVE_THRESHOLD) return 'negative';
    return 'neutral';
  }

  /**
   * Clamp a number to a min/max range.
   */
  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  /**
   * Generate a period key string for grouping.
   * - weekly:    "2024-W03"
   * - monthly:   "2024-01"
   * - quarterly: "2024-Q1"
   */
  private periodKey(date: Date, period: TrendPeriod): string {
    const year = date.getFullYear();
    const month = date.getMonth(); // 0-indexed

    switch (period) {
      case 'weekly': {
        const startOfYear = new Date(year, 0, 1);
        const dayOfYear = Math.floor(
          (date.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000),
        );
        const weekNumber = Math.ceil((dayOfYear + 1) / 7);
        return `${year}-W${String(weekNumber).padStart(2, '0')}`;
      }
      case 'monthly':
        return `${year}-${String(month + 1).padStart(2, '0')}`;
      case 'quarterly': {
        const quarter = Math.floor(month / 3) + 1;
        return `${year}-Q${quarter}`;
      }
    }
  }
}
