import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { LeadTier } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { BoundedCache } from '../utils/bounded-cache.util';
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
import { OllamaInferenceGateway } from './ollama-inference-gateway.service';
import {
  trainLogisticRegression,
  predictProbability,
  LogisticRegressionModel,
} from '../utils/logistic-regression.util';
import { buildLeadScoringPrompt, LeadScoringResponse } from '../prompts/sales-crm.prompts';
import { PredictionMethod } from '../types/prediction-method.type';
import { describeError } from '../../../common/utils/redact';

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
  predictionMethod: PredictionMethod;
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

export interface MLModelStatus {
  hasModel: boolean;
  version: number | null;
  accuracy: number | null;
  sampleCount: number | null;
  trainedAt: Date | null;
  blendWeight: number;
}

export interface MLTrainingResult {
  version: number;
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  sampleCount: number;
  message: string;
}

@Injectable()
export class LeadScoringService {
  private readonly logger = new Logger(LeadScoringService.name);
  private config: ScoringConfig = defaultScoringConfig;
  private readonly ML_BLEND_WEIGHT = 0.3; // 30% ML, 70% rule-based
  private readonly MIN_TRAINING_SAMPLES = 50;
  private mlModelCache = new BoundedCache<LogisticRegressionModel>(50, 60 * 60 * 1000);

  constructor(
    private prisma: PrismaService,
    private gateway: OllamaInferenceGateway,
  ) {}

  /**
   * Score a single lead
   */
  async scoreLead(organizationId: string, leadId: string): Promise<LeadScoreResult> {
    // Get lead with extended data
    const lead = await this.getLeadWithExtendedData(organizationId, leadId);

    if (!lead) {
      throw new NotFoundException(`Lead ${leadId} not found`);
    }

    // Calculate scores for each category
    const demographicResult = this.calculateCategoryScore(lead, this.config.demographic);
    const behavioralResult = this.calculateCategoryScore(lead, this.config.behavioral);
    const engagementResult = this.calculateCategoryScore(lead, this.config.engagement);

    // Apply decay for inactivity
    const weeksInactive = this.calculateWeeksInactive(lead.lastActivityAt);
    const decayMultiplier = getDecayMultiplier(weeksInactive, this.config);

    // Calculate rule-based score
    const rawScore = demographicResult.score + behavioralResult.score + engagementResult.score;
    let totalScore = Math.round(rawScore * decayMultiplier);

    // Blend with ML score if model available
    let mlProbability: number | null = null;
    let predictionMethod: PredictionMethod = 'RULE_BASED';
    try {
      const mlModel = await this.loadMLModel(organizationId);
      if (mlModel) {
        const features = this.extractMLFeatures(lead, {
          demographicScore: demographicResult.score,
          behavioralScore: behavioralResult.score,
          engagementScore: engagementResult.score,
        });
        mlProbability = predictProbability(mlModel, features);
      }
    } catch (error) {
      this.logger.warn(
        `ML scoring failed for lead ${leadId}, falling back to rule-based: ${describeError(error)}`,
      );
    }

    // Try Ollama inference
    let ollamaScore: number | null = null;
    try {
      const prompt = buildLeadScoringPrompt(
        {
          lead_id: lead.id,
          company_name: lead.company ?? undefined,
          contact_name: lead.name,
          industry: lead.industry,
          company_size: lead.companySize,
          source: lead.source,
          created_at: lead.createdAt.toISOString(),
        },
        [], // interactions not readily available in the lead data
      );
      const ollamaResult = await this.gateway.infer<LeadScoringResponse>(prompt.user, {
        systemPrompt: prompt.system,
      });
      if (ollamaResult?.data?.score != null) {
        ollamaScore = Math.max(0, Math.min(100, ollamaResult.data.score));
        // Store as training data for custom model
      }
    } catch (error) {
      this.logger.warn(`Ollama lead scoring failed for lead ${leadId}: ${describeError(error)}`);
    }

    // Blend scores: custom model (graduated) + Ollama + rule-based
    const mlScore = mlProbability !== null ? Math.round(mlProbability * 100) : null;
    if (mlScore !== null && ollamaScore !== null) {
      totalScore = Math.round(mlScore * 0.4 + ollamaScore * 0.3 + totalScore * 0.3);
      predictionMethod = 'HYBRID';
    } else if (ollamaScore !== null) {
      totalScore = Math.round(ollamaScore * 0.5 + totalScore * 0.5);
      predictionMethod = 'HYBRID';
    } else if (mlScore !== null) {
      totalScore = Math.round(
        totalScore * (1 - this.ML_BLEND_WEIGHT) + mlScore * this.ML_BLEND_WEIGHT,
      );
      predictionMethod = 'ML';
    }
    // else: rules only, predictionMethod stays 'RULE_BASED'

    // Determine tier
    const tier = getTierFromScore(totalScore);

    // Estimate conversion probability (use ML if available, else rule-based)
    const conversionProbability =
      mlProbability !== null ? mlProbability : estimateConversionProbability(totalScore, tier);

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
      predictionMethod,
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
    const BATCH_SIZE = 10;

    // Process in parallel batches instead of sequentially
    for (let i = 0; i < leads.length; i += BATCH_SIZE) {
      const batch = leads.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map((lead) => this.scoreLead(organizationId, lead.id)),
      );

      for (const result of results) {
        if (result.status === 'fulfilled') {
          processed++;
          switch (result.value.tier) {
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
        }
      }
    }

    return { processed, byTier: counts };
  }

  /**
   * Get hot leads
   */
  async getHotLeads(organizationId: string, limit: number = 10): Promise<HotLead[]> {
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
        ? Math.floor((Date.now() - score.lastActivityAt.getTime()) / (1000 * 60 * 60 * 24))
        : 999;

      return {
        leadId: score.leadId,
        leadName: score.lead.leadName,
        company: score.lead.companyName,
        score: score.totalScore,
        tier: score.tier,
        conversionProbability: Number(score.conversionProbability),
        lastActivity: score.lastActivityAt,
        recommendedAction: getRecommendedAction(score.tier, score.totalScore, daysInactive),
      };
    });
  }

  /**
   * Get cold leads
   */
  async getColdLeads(organizationId: string, limit: number = 20): Promise<ColdLead[]> {
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
        ? Math.floor((Date.now() - score.lastActivityAt.getTime()) / (1000 * 60 * 60 * 24))
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
      predictionMethod: 'RULE_BASED',
    });
  }

  /**
   * Get score history for a lead
   */
  async getLeadScoreHistory(organizationId: string, leadId: string): Promise<ScoreHistoryEntry[]> {
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
    const BATCH_SIZE = 10;

    // Pre-fetch all existing scores in one query
    const existingScores = await this.prisma.leadScore.findMany({
      where: { organizationId },
      select: { leadId: true, totalScore: true },
    });
    const scoreMap = new Map(existingScores.map((s) => [s.leadId, s.totalScore]));

    // Process in parallel batches
    for (let i = 0; i < leads.length; i += BATCH_SIZE) {
      const batch = leads.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(async (lead) => {
          const newResult = await this.scoreLead(organizationId, lead.id);
          return { leadId: lead.id, newScore: newResult.totalScore };
        }),
      );

      for (const result of results) {
        if (result.status === 'fulfilled') {
          updated++;
          const oldScore = scoreMap.get(result.value.leadId);
          if (oldScore !== undefined && result.value.newScore < oldScore) {
            decayed++;
          }
        }
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
        ? (sortedScores[sortedScores.length / 2 - 1] + sortedScores[sortedScores.length / 2]) / 2
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
      companySize: this.inferCompanySize(lead as unknown as Record<string, unknown>),
      industry: this.inferIndustry(lead as unknown as Record<string, unknown>),
      country: this.inferCountry(lead as unknown as Record<string, unknown>),
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
  private getFieldValue(lead: LeadData, field: string): string | number | boolean | undefined {
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
        return Math.floor((Date.now() - lead.lastActivityAt.getTime()) / (1000 * 60 * 60 * 24));
      default:
        return undefined;
    }
  }

  /**
   * Evaluate a scoring condition
   */
  private evaluateCondition(
    value: string | number | boolean | undefined,
    condition: ScoringCondition,
  ): boolean {
    if (value === undefined || value === null) return false;

    switch (condition.operator) {
      case 'eq':
        return value === condition.value;
      case 'gt':
        return value > (condition.value as string | number | boolean);
      case 'lt':
        return value < (condition.value as string | number | boolean);
      case 'gte':
        return value >= (condition.value as string | number | boolean);
      case 'lte':
        return value <= (condition.value as string | number | boolean);
      case 'in':
        return Array.isArray(condition.value) && condition.value.includes(value);
      case 'contains':
        return (
          typeof value === 'string' &&
          value.toLowerCase().includes((condition.value as string).toLowerCase())
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

    const initialHistoryForJson = [
      {
        date: historyEntry.date.toISOString(),
        score: historyEntry.score,
        change: historyEntry.change,
        reason: historyEntry.reason,
      },
    ];

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
  private buildConversionPrediction(result: LeadScoreResult): ConversionPrediction {
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

  // ─── ML MODEL METHODS ───

  /**
   * Train a logistic regression ML model from historical lead outcomes.
   * Requires at least 50 leads with WON/LOST status.
   */
  async trainMLModel(organizationId: string): Promise<MLTrainingResult> {
    // Fetch leads with conversion outcomes
    const leads = await this.prisma.lead.findMany({
      where: {
        organizationId,
        status: { in: ['WON', 'LOST'] },
      },
    });

    if (leads.length < this.MIN_TRAINING_SAMPLES) {
      return {
        version: 0,
        accuracy: 0,
        precision: 0,
        recall: 0,
        f1Score: 0,
        sampleCount: leads.length,
        message: `Insufficient data: ${leads.length} leads, need ${this.MIN_TRAINING_SAMPLES}`,
      };
    }

    this.logger.log(
      `Training lead scoring ML model for org ${organizationId} with ${leads.length} samples`,
    );

    // Extract features and labels
    const features: number[][] = [];
    const labels: number[] = [];

    for (const lead of leads) {
      const leadData = this.buildLeadDataFromRecord(lead);

      // Get rule-based scores to use as features
      const demographicResult = this.calculateCategoryScore(leadData, this.config.demographic);
      const behavioralResult = this.calculateCategoryScore(leadData, this.config.behavioral);
      const engagementResult = this.calculateCategoryScore(leadData, this.config.engagement);

      const featureVector = this.extractMLFeatures(leadData, {
        demographicScore: demographicResult.score,
        behavioralScore: behavioralResult.score,
        engagementScore: engagementResult.score,
      });

      features.push(featureVector);
      labels.push(lead.status === 'WON' ? 1 : 0);
    }

    const featureNames = [
      'demographicScore',
      'behavioralScore',
      'engagementScore',
      'daysSinceCreation',
      'daysInactive',
      'sourceEncoded',
    ];

    // Train the model
    const result = trainLogisticRegression(features, labels, featureNames);

    // Model registry removed — clear cache and log result
    this.mlModelCache.delete(organizationId);

    this.logger.log(
      `Lead scoring ML model trained: accuracy=${(result.accuracy * 100).toFixed(1)}%, ` +
        `precision=${(result.precision * 100).toFixed(1)}%, recall=${(result.recall * 100).toFixed(1)}%`,
    );

    return {
      version: 1,
      accuracy: result.accuracy,
      precision: result.precision,
      recall: result.recall,
      f1Score: result.f1Score,
      sampleCount: leads.length,
      message: `Model trained successfully with ${leads.length} samples`,
    };
  }

  /**
   * Get the status of the ML model for an organization.
   */
  async getMLModelStatus(_organizationId: string): Promise<MLModelStatus> {
    // Model registry removed — check in-memory cache only
    return {
      hasModel: false,
      version: null,
      accuracy: null,
      sampleCount: null,
      trainedAt: null,
      blendWeight: this.ML_BLEND_WEIGHT,
    };
  }

  /**
   * Load ML model from cache or database.
   */
  private async loadMLModel(organizationId: string): Promise<LogisticRegressionModel | null> {
    // Check cache (BoundedCache handles TTL expiry)
    const cached = this.mlModelCache.get(organizationId);
    if (cached) {
      return cached;
    }

    // Model registry removed — no persisted models to load
    return null;
  }

  /**
   * Extract ML features from a lead for model input.
   */
  private extractMLFeatures(
    lead: LeadData,
    scores: {
      demographicScore: number;
      behavioralScore: number;
      engagementScore: number;
    },
  ): number[] {
    const maxDemographic = this.config.demographic.maxScore;
    const maxBehavioral = this.config.behavioral.maxScore;
    const maxEngagement = this.config.engagement.maxScore;

    const daysSinceCreation = Math.floor(
      (Date.now() - lead.createdAt.getTime()) / (1000 * 60 * 60 * 24),
    );
    const daysInactive = lead.lastActivityAt
      ? Math.floor((Date.now() - lead.lastActivityAt.getTime()) / (1000 * 60 * 60 * 24))
      : 999;

    return [
      scores.demographicScore / maxDemographic, // Normalized 0-1
      scores.behavioralScore / maxBehavioral, // Normalized 0-1
      scores.engagementScore / maxEngagement, // Normalized 0-1
      Math.log1p(daysSinceCreation), // Log-normalized
      Math.log1p(daysInactive), // Log-normalized
      this.encodeSource(lead.source), // Numeric encoding
    ];
  }

  /**
   * Encode lead source as a numeric value.
   */
  private encodeSource(source: string): number {
    const sourceMap: Record<string, number> = {
      referral: 1.0,
      website: 0.8,
      social_media: 0.6,
      email: 0.5,
      advertisement: 0.4,
      cold_call: 0.3,
      event: 0.7,
      partner: 0.9,
      other: 0.2,
    };
    return sourceMap[source?.toLowerCase()] || 0.2;
  }

  /**
   * Build LeadData from a Prisma lead record.
   */
  private buildLeadDataFromRecord(lead: Record<string, unknown>): LeadData {
    const notes = lead.notes as string | null | undefined;
    return {
      id: lead.id as string,
      name: lead.leadName as string,
      company: lead.companyName as string | null,
      email: lead.email as string | null,
      source: lead.source as string,
      status: lead.status as string,
      createdAt: lead.createdAt as Date,
      companySize: this.inferCompanySize(lead),
      industry: this.inferIndustry(lead),
      country: this.inferCountry(lead),
      estimatedBudget: 0,
      websiteVisits30d: 0,
      contentType: undefined,
      demoRequested: notes?.toLowerCase().includes('demo') || false,
      trialStatus: undefined,
      lastActivityAt: lead.updatedAt as Date,
    };
  }

  // Inference helpers (simplified - in production would use ML or lookup tables)
  private inferCompanySize(_lead: Record<string, unknown>): string | undefined {
    return undefined;
  }

  private inferIndustry(_lead: Record<string, unknown>): string | undefined {
    return undefined;
  }

  private inferCountry(_lead: Record<string, unknown>): string | undefined {
    return undefined;
  }
}
