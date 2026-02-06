import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { LeadTier } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import {
  defaultScoringConfig,
  ScoringConfig,
  ScoringRule,
  ScoringCondition,
  getTierFromScore,
  getDecayMultiplier,
  estimateConversionProbability,
  getRecommendedAction,
  getReengagementSuggestion,
} from '../config/lead-scoring.config';

export interface ScoreBreakdown {
  category: string;
  rule: string;
  field: string;
  score: number;
  maxScore: number;
}

export interface LeadScoreResult {
  totalScore: number;
  demographicScore: number;
  behavioralScore: number;
  engagementScore: number;
  tier: LeadTier;
  conversionProbability: number;
  breakdown: ScoreBreakdown[];
}

export interface HotLead {
  leadId: string;
  leadName: string;
  company: string | null;
  score: number;
  tier: LeadTier;
  conversionProbability: number;
  lastActivity: Date | null;
  recommendedAction: string;
}

export interface ColdLead {
  leadId: string;
  leadName: string;
  score: number;
  daysInactive: number;
  reengagementSuggestion: string;
}

export interface ConversionPrediction {
  probability: number;
  confidence: 'high' | 'medium' | 'low';
  factors: Array<{
    factor: string;
    impact: 'positive' | 'negative' | 'neutral';
    weight: number;
  }>;
  recommendation: string;
}

export interface ScoreHistoryEntry {
  date: Date;
  score: number;
  change: number;
  reason: string;
}

export interface LeadData {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  source: string;
  status: string;
  createdAt: Date;
  // Extended fields (may come from custom fields or CRM)
  companySize?: string;
  industry?: string;
  country?: string;
  estimatedBudget?: number;
  websiteVisits30d?: number;
  contentType?: string;
  demoRequested?: boolean;
  trialStatus?: string;
  lastActivityAt?: Date | null;
}

@Injectable()
export class LeadScoringService {
  private readonly logger = new Logger(LeadScoringService.name);
  private config: ScoringConfig = defaultScoringConfig;

  constructor(private prisma: PrismaService) {}

  /**
   * Score a single lead
   */
  async scoreLead(
    organizationId: string,
    leadId: string,
  ): Promise<LeadScoreResult> {
    // Get lead with extended data
    const lead = await this.getLeadWithExtendedData(organizationId, leadId);

    if (!lead) {
      throw new NotFoundException(`Lead ${leadId} not found`);
    }

    // Calculate scores for each category
    const demographicResult = this.calculateCategoryScore(
      lead,
      this.config.demographic,
    );
    const behavioralResult = this.calculateCategoryScore(
      lead,
      this.config.behavioral,
    );
    const engagementResult = this.calculateCategoryScore(
      lead,
      this.config.engagement,
    );

    // Apply decay for inactivity
    const weeksInactive = this.calculateWeeksInactive(lead.lastActivityAt);
    const decayMultiplier = getDecayMultiplier(weeksInactive, this.config);

    // Calculate total score
    const rawScore =
      demographicResult.score +
      behavioralResult.score +
      engagementResult.score;
    const totalScore = Math.round(rawScore * decayMultiplier);

    // Determine tier
    const tier = getTierFromScore(totalScore);

    // Estimate conversion probability
    const conversionProbability = estimateConversionProbability(totalScore, tier);

    // Combine breakdowns
    const breakdown: ScoreBreakdown[] = [
      ...demographicResult.breakdown,
      ...behavioralResult.breakdown,
      ...engagementResult.breakdown,
    ];

    // Store the score
    await this.upsertLeadScore(organizationId, leadId, {
      totalScore,
      demographicScore: demographicResult.score,
      behavioralScore: behavioralResult.score,
      engagementScore: engagementResult.score,
      tier,
      conversionProbability,
      lastActivityAt: lead.lastActivityAt || null,
    });

    return {
      totalScore,
      demographicScore: demographicResult.score,
      behavioralScore: behavioralResult.score,
      engagementScore: engagementResult.score,
      tier,
      conversionProbability,
      breakdown,
    };
  }

  /**
   * Score all leads in an organization
   */
  async scoreAllLeads(organizationId: string): Promise<{
    processed: number;
    byTier: { hot: number; warm: number; cool: number; cold: number };
  }> {
    const leads = await this.prisma.lead.findMany({
      where: { organizationId },
      select: { id: true },
    });

    const counts = { hot: 0, warm: 0, cool: 0, cold: 0 };
    let processed = 0;

    for (const lead of leads) {
      try {
        const result = await this.scoreLead(organizationId, lead.id);
        processed++;

        switch (result.tier) {
          case 'HOT':
            counts.hot++;
            break;
          case 'WARM':
            counts.warm++;
            break;
          case 'COOL':
            counts.cool++;
            break;
          case 'COLD':
            counts.cold++;
            break;
        }
      } catch (error) {
        this.logger.error(`Failed to score lead ${lead.id}: ${error}`);
      }
    }

    return { processed, byTier: counts };
  }

  /**
   * Get hot leads
   */
  async getHotLeads(
    organizationId: string,
    limit: number = 10,
  ): Promise<HotLead[]> {
    const scores = await this.prisma.leadScore.findMany({
      where: {
        organizationId,
        tier: 'HOT',
      },
      orderBy: { totalScore: 'desc' },
      take: limit,
      include: {
        lead: {
          select: {
            id: true,
            leadName: true,
            companyName: true,
          },
        },
      },
    });

    return scores.map((score) => {
      const daysInactive = score.lastActivityAt
        ? Math.floor(
            (Date.now() - score.lastActivityAt.getTime()) / (1000 * 60 * 60 * 24),
          )
        : 999;

      return {
        leadId: score.leadId,
        leadName: score.lead.leadName,
        company: score.lead.companyName,
        score: score.totalScore,
        tier: score.tier,
        conversionProbability: Number(score.conversionProbability),
        lastActivity: score.lastActivityAt,
        recommendedAction: getRecommendedAction(
          score.tier,
          score.totalScore,
          daysInactive,
        ),
      };
    });
  }

  /**
   * Get cold leads
   */
  async getColdLeads(
    organizationId: string,
    limit: number = 20,
  ): Promise<ColdLead[]> {
    const scores = await this.prisma.leadScore.findMany({
      where: {
        organizationId,
        tier: 'COLD',
      },
      orderBy: { totalScore: 'asc' },
      take: limit,
      include: {
        lead: {
          select: {
            id: true,
            leadName: true,
          },
        },
      },
    });

    return scores.map((score) => {
      const daysInactive = score.lastActivityAt
        ? Math.floor(
            (Date.now() - score.lastActivityAt.getTime()) / (1000 * 60 * 60 * 24),
          )
        : 999;

      return {
        leadId: score.leadId,
        leadName: score.lead.leadName,
        score: score.totalScore,
        daysInactive,
        reengagementSuggestion: getReengagementSuggestion(daysInactive, []),
      };
    });
  }

  /**
   * Get conversion prediction for a lead
   */
  async getConversionPrediction(
    organizationId: string,
    leadId: string,
  ): Promise<ConversionPrediction> {
    const score = await this.prisma.leadScore.findFirst({
      where: { organizationId, leadId },
    });

    if (!score) {
      // Score the lead first
      const result = await this.scoreLead(organizationId, leadId);
      return this.buildConversionPrediction(result);
    }

    return this.buildConversionPrediction({
      totalScore: score.totalScore,
      tier: score.tier,
      demographicScore: score.demographicScore,
      behavioralScore: score.behavioralScore,
      engagementScore: score.engagementScore,
      conversionProbability: Number(score.conversionProbability),
      breakdown: [],
    });
  }

  /**
   * Get score history for a lead
   */
  async getLeadScoreHistory(
    organizationId: string,
    leadId: string,
  ): Promise<ScoreHistoryEntry[]> {
    const score = await this.prisma.leadScore.findFirst({
      where: { organizationId, leadId },
      select: { scoreHistory: true },
    });

    if (!score?.scoreHistory) {
      return [];
    }

    return score.scoreHistory as unknown as ScoreHistoryEntry[];
  }

  /**
   * Update scores with decay (for weekly cron job)
   */
  async updateScores(organizationId: string): Promise<{
    updated: number;
    decayed: number;
  }> {
    const leads = await this.prisma.lead.findMany({
      where: { organizationId },
      select: { id: true },
    });

    let updated = 0;
    let decayed = 0;

    for (const lead of leads) {
      try {
        const existingScore = await this.prisma.leadScore.findFirst({
          where: { organizationId, leadId: lead.id },
        });

        const newResult = await this.scoreLead(organizationId, lead.id);
        updated++;

        if (existingScore && newResult.totalScore < existingScore.totalScore) {
          decayed++;
        }
      } catch (error) {
        this.logger.error(`Failed to update score for lead ${lead.id}: ${error}`);
      }
    }

    return { updated, decayed };
  }

  /**
   * Get score distribution
   */
  async getScoreDistribution(organizationId: string): Promise<{
    byTier: { tier: LeadTier; count: number; percentage: number }[];
    avgScore: number;
    medianScore: number;
  }> {
    const scores = await this.prisma.leadScore.findMany({
      where: { organizationId },
      select: { totalScore: true, tier: true },
    });

    if (scores.length === 0) {
      return {
        byTier: [
          { tier: 'HOT', count: 0, percentage: 0 },
          { tier: 'WARM', count: 0, percentage: 0 },
          { tier: 'COOL', count: 0, percentage: 0 },
          { tier: 'COLD', count: 0, percentage: 0 },
        ],
        avgScore: 0,
        medianScore: 0,
      };
    }

    const tierCounts: Record<LeadTier, number> = {
      HOT: 0,
      WARM: 0,
      COOL: 0,
      COLD: 0,
    };

    const allScores: number[] = [];
    for (const score of scores) {
      tierCounts[score.tier]++;
      allScores.push(score.totalScore);
    }

    const total = scores.length;
    const byTier = Object.entries(tierCounts).map(([tier, count]) => ({
      tier: tier as LeadTier,
      count,
      percentage: (count / total) * 100,
    }));

    const sortedScores = allScores.sort((a, b) => a - b);
    const avgScore = allScores.reduce((a, b) => a + b, 0) / allScores.length;
    const medianScore =
      sortedScores.length % 2 === 0
        ? (sortedScores[sortedScores.length / 2 - 1] +
            sortedScores[sortedScores.length / 2]) /
          2
        : sortedScores[Math.floor(sortedScores.length / 2)];

    return { byTier, avgScore, medianScore };
  }

  // Private helper methods

  /**
   * Get lead with extended data
   */
  private async getLeadWithExtendedData(
    organizationId: string,
    leadId: string,
  ): Promise<LeadData | null> {
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, organizationId },
    });

    if (!lead) return null;

    // In a real implementation, you might fetch additional data
    // from custom fields, CRM integration, or analytics
    return {
      id: lead.id,
      name: lead.leadName,
      company: lead.companyName,
      email: lead.email,
      source: lead.source,
      status: lead.status,
      createdAt: lead.createdAt,
      // Extended fields - these would come from custom fields or integrations
      companySize: this.inferCompanySize(lead),
      industry: this.inferIndustry(lead),
      country: this.inferCountry(lead),
      estimatedBudget: 0,
      websiteVisits30d: 0,
      contentType: undefined,
      demoRequested: lead.notes?.toLowerCase().includes('demo') || false,
      trialStatus: undefined,
      lastActivityAt: lead.updatedAt,
    };
  }

  /**
   * Calculate score for a category
   */
  private calculateCategoryScore(
    lead: LeadData,
    category: {
      name: string;
      maxScore: number;
      rules: ScoringRule[];
    },
  ): { score: number; breakdown: ScoreBreakdown[] } {
    let totalScore = 0;
    const breakdown: ScoreBreakdown[] = [];

    for (const rule of category.rules) {
      const fieldValue = this.getFieldValue(lead, rule.field);
      let ruleScore = 0;

      // Find matching condition
      for (const condition of rule.conditions) {
        if (this.evaluateCondition(fieldValue, condition)) {
          ruleScore = Math.min(condition.score, rule.maxScore);
          break; // Use first matching condition
        }
      }

      totalScore += ruleScore;
      breakdown.push({
        category: category.name,
        rule: rule.description || rule.field,
        field: rule.field,
        score: ruleScore,
        maxScore: rule.maxScore,
      });
    }

    return { score: Math.min(totalScore, category.maxScore), breakdown };
  }

  /**
   * Get field value from lead data
   */
  private getFieldValue(lead: LeadData, field: string): any {
    switch (field) {
      case 'companySize':
        return lead.companySize;
      case 'industry':
        return lead.industry;
      case 'country':
        return lead.country;
      case 'estimatedBudget':
        return lead.estimatedBudget || 0;
      case 'websiteVisits30d':
        return lead.websiteVisits30d || 0;
      case 'contentType':
        return lead.contentType;
      case 'demoRequested':
        return lead.demoRequested;
      case 'trialStatus':
        return lead.trialStatus;
      case 'daysSinceLastActivity':
        if (!lead.lastActivityAt) return 999;
        return Math.floor(
          (Date.now() - lead.lastActivityAt.getTime()) / (1000 * 60 * 60 * 24),
        );
      default:
        return undefined;
    }
  }

  /**
   * Evaluate a scoring condition
   */
  private evaluateCondition(value: any, condition: ScoringCondition): boolean {
    if (value === undefined || value === null) return false;

    switch (condition.operator) {
      case 'eq':
        return value === condition.value;
      case 'gt':
        return value > condition.value;
      case 'lt':
        return value < condition.value;
      case 'gte':
        return value >= condition.value;
      case 'lte':
        return value <= condition.value;
      case 'in':
        return Array.isArray(condition.value) && condition.value.includes(value);
      case 'contains':
        return (
          typeof value === 'string' &&
          value.toLowerCase().includes(condition.value.toLowerCase())
        );
      default:
        return false;
    }
  }

  /**
   * Calculate weeks of inactivity
   */
  private calculateWeeksInactive(lastActivityAt: Date | null | undefined): number {
    if (!lastActivityAt) return 0;
    const daysInactive = Math.floor(
      (Date.now() - lastActivityAt.getTime()) / (1000 * 60 * 60 * 24),
    );
    return Math.floor(daysInactive / 7);
  }

  /**
   * Upsert lead score
   */
  private async upsertLeadScore(
    organizationId: string,
    leadId: string,
    data: {
      totalScore: number;
      demographicScore: number;
      behavioralScore: number;
      engagementScore: number;
      tier: LeadTier;
      conversionProbability: number;
      lastActivityAt: Date | null;
    },
  ): Promise<void> {
    const existing = await this.prisma.leadScore.findFirst({
      where: { leadId },
    });

    // Build score history entry
    const historyEntry: ScoreHistoryEntry = {
      date: new Date(),
      score: data.totalScore,
      change: existing ? data.totalScore - existing.totalScore : 0,
      reason: existing
        ? data.totalScore > existing.totalScore
          ? 'Score increased'
          : data.totalScore < existing.totalScore
            ? 'Score decreased (decay or reduced engagement)'
            : 'Score unchanged'
        : 'Initial scoring',
    };

    const existingHistory = (existing?.scoreHistory as unknown as ScoreHistoryEntry[]) || [];
    const updatedHistory = [...existingHistory, historyEntry].slice(-30); // Keep last 30 entries

    // Convert to JSON-serializable format for Prisma
    const historyForJson = updatedHistory.map((entry) => ({
      date: entry.date instanceof Date ? entry.date.toISOString() : entry.date,
      score: entry.score,
      change: entry.change,
      reason: entry.reason,
    }));

    const initialHistoryForJson = [{
      date: historyEntry.date.toISOString(),
      score: historyEntry.score,
      change: historyEntry.change,
      reason: historyEntry.reason,
    }];

    await this.prisma.leadScore.upsert({
      where: { leadId },
      update: {
        totalScore: data.totalScore,
        demographicScore: data.demographicScore,
        behavioralScore: data.behavioralScore,
        engagementScore: data.engagementScore,
        tier: data.tier,
        conversionProbability: new Decimal(data.conversionProbability),
        lastActivityAt: data.lastActivityAt,
        lastScoredAt: new Date(),
        scoreHistory: historyForJson,
      },
      create: {
        organizationId,
        leadId,
        totalScore: data.totalScore,
        demographicScore: data.demographicScore,
        behavioralScore: data.behavioralScore,
        engagementScore: data.engagementScore,
        tier: data.tier,
        conversionProbability: new Decimal(data.conversionProbability),
        lastActivityAt: data.lastActivityAt,
        scoreHistory: initialHistoryForJson,
      },
    });
  }

  /**
   * Build conversion prediction response
   */
  private buildConversionPrediction(
    result: LeadScoreResult,
  ): ConversionPrediction {
    const factors: ConversionPrediction['factors'] = [];

    // Analyze demographic score
    const demographicMax = this.config.demographic.maxScore;
    const demographicRatio = result.demographicScore / demographicMax;
    factors.push({
      factor: 'Company fit',
      impact: demographicRatio > 0.7 ? 'positive' : demographicRatio > 0.4 ? 'neutral' : 'negative',
      weight: demographicRatio,
    });

    // Analyze behavioral score
    const behavioralMax = this.config.behavioral.maxScore;
    const behavioralRatio = result.behavioralScore / behavioralMax;
    factors.push({
      factor: 'Engagement level',
      impact: behavioralRatio > 0.7 ? 'positive' : behavioralRatio > 0.4 ? 'neutral' : 'negative',
      weight: behavioralRatio,
    });

    // Analyze engagement score
    const engagementMax = this.config.engagement.maxScore;
    const engagementRatio = result.engagementScore / engagementMax;
    factors.push({
      factor: 'Recency of activity',
      impact: engagementRatio > 0.7 ? 'positive' : engagementRatio > 0.4 ? 'neutral' : 'negative',
      weight: engagementRatio,
    });

    // Determine confidence
    let confidence: 'high' | 'medium' | 'low';
    if (result.totalScore >= 70 || result.totalScore <= 20) {
      confidence = 'high'; // Clear signals
    } else if (result.totalScore >= 40) {
      confidence = 'medium';
    } else {
      confidence = 'low';
    }

    const recommendation = getRecommendedAction(result.tier, result.totalScore, 0);

    return {
      probability: result.conversionProbability,
      confidence,
      factors,
      recommendation,
    };
  }

  // Inference helpers (simplified - in production would use ML or lookup tables)
  private inferCompanySize(lead: any): string | undefined {
    // Could infer from email domain, company name, etc.
    return undefined;
  }

  private inferIndustry(lead: any): string | undefined {
    return undefined;
  }

  private inferCountry(lead: any): string | undefined {
    return undefined;
  }
}
