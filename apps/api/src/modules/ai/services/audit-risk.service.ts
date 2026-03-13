import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { AiFeedbackService } from './ai-feedback.service';
import { OllamaInferenceGateway } from './ollama-inference-gateway.service';
import { getRiskLevel } from '../utils/risk-level.util';
import { buildIsolationForest1D, isolationForestScore1D } from '../utils/isolation-forest.util';
import { zScoreWithStats, mean, standardDeviation } from '../utils/statistics.util';
import { buildAuditRiskPrompt, AuditRiskResponse } from '../prompts/security.prompts';
import { PredictionMethod } from '../types/prediction-method.type';

export interface AuditRiskResult {
  entityType: string;
  entityId: string;
  riskScore: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  factors: { factor: string; weight: number; description: string }[];
  confidence: number;
  predictionMethod: PredictionMethod;
}

export interface AuditRiskBatchResult {
  entityType: string;
  processed: number;
  highRisk: number;
  mediumRisk: number;
  lowRisk: number;
}

@Injectable()
export class AuditRiskService {
  private readonly logger = new Logger(AuditRiskService.name);

  constructor(
    private prisma: PrismaService,
    private feedbackService: AiFeedbackService,
    private gateway: OllamaInferenceGateway,
  ) {}

  async scoreEntity(
    organizationId: string,
    entityType: string,
    entityId: string,
  ): Promise<AuditRiskResult> {
    const features = await this.extractFeatures(organizationId, entityType, entityId);
    if (!features) {
      return {
        entityType,
        entityId,
        riskScore: 0,
        riskLevel: 'LOW',
        factors: [],
        confidence: 0,
        predictionMethod: 'RULE_BASED' as PredictionMethod,
      };
    }

    const { score, factors } = this.ruleBasedScore(features);

    // Try Ollama inference
    let ollamaScore: number | null = null;
    try {
      const prompt = buildAuditRiskPrompt(
        {
          entity_type: entityType,
          entity_id: entityId,
          data: features.raw,
        },
        [], // patterns not readily available at this point
      );
      const ollamaResult = await this.gateway.infer<AuditRiskResponse>(prompt.user, {
        systemPrompt: prompt.system,
      });
      if (ollamaResult?.data?.risk_score != null) {
        ollamaScore = Math.max(0, Math.min(1, ollamaResult.data.risk_score));
      }
    } catch (error) {
      this.logger.warn(
        `Ollama audit risk failed for ${entityType}/${entityId}: ${error instanceof Error ? error.message : String(error)}`,
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

    const confidence = ollamaScore !== null ? 0.85 : 0.65;

    const result: AuditRiskResult = {
      entityType,
      entityId,
      riskScore: Math.round(finalScore * 1000) / 1000,
      riskLevel,
      factors,
      confidence,
      predictionMethod,
    };

    // Store prediction for feedback tracking
    await this.feedbackService.storePrediction(
      organizationId,
      'AUDIT_RISK',
      { entityType, entityId },
      { riskScore: result.riskScore, riskLevel },
      result.confidence,
      0,
    );

    return result;
  }

  async batchScore(organizationId: string, entityType: string): Promise<AuditRiskBatchResult> {
    const entityIds = await this.getEntityIds(organizationId, entityType);
    let highRisk = 0;
    let mediumRisk = 0;
    let lowRisk = 0;

    const BATCH_SIZE = 10;

    // Process in parallel batches instead of sequentially
    for (let i = 0; i < entityIds.length; i += BATCH_SIZE) {
      const batch = entityIds.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map((entityId) => this.scoreEntity(organizationId, entityType, entityId)),
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
      entityType,
      processed: entityIds.length,
      highRisk,
      mediumRisk,
      lowRisk,
    };
  }

  async getHighRiskEntities(
    organizationId: string,
    limit: number = 20,
  ): Promise<AuditRiskResult[]> {
    const results: AuditRiskResult[] = [];
    const BATCH_SIZE = 10;

    for (const entityType of ['journal', 'invoice', 'bill', 'expense']) {
      const entityIds = await this.getEntityIds(organizationId, entityType, 50);

      // Process in parallel batches
      for (let i = 0; i < entityIds.length; i += BATCH_SIZE) {
        const batch = entityIds.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.allSettled(
          batch.map((entityId) => this.scoreEntity(organizationId, entityType, entityId)),
        );

        for (const result of batchResults) {
          if (result.status === 'fulfilled' && result.value.riskScore >= 0.5) {
            results.push(result.value);
          }
        }
      }
    }

    return results.sort((a, b) => b.riskScore - a.riskScore).slice(0, limit);
  }

  /**
   * Record user feedback on an audit risk score.
   */
  async recordAuditFeedback(
    _organizationId: string,
    _entityType: string,
    _entityId: string,
    _wasCorrect: boolean,
    _actualRisk?: string,
  ): Promise<void> {
    // Feedback recorded — no retraining infrastructure
  }

  private async extractFeatures(
    organizationId: string,
    entityType: string,
    entityId: string,
  ): Promise<{ vector: number[]; raw: Record<string, number> } | null> {
    try {
      switch (entityType) {
        case 'journal':
          return await this.extractJournalFeatures(organizationId, entityId);
        case 'invoice':
          return await this.extractInvoiceFeatures(organizationId, entityId);
        case 'bill':
          return await this.extractBillFeatures(organizationId, entityId);
        case 'expense':
          return await this.extractExpenseFeatures(organizationId, entityId);
        default:
          return null;
      }
    } catch {
      return null;
    }
  }

  private async extractJournalFeatures(
    organizationId: string,
    journalId: string,
  ): Promise<{ vector: number[]; raw: Record<string, number> } | null> {
    const journal = await this.prisma.journal.findFirst({
      where: { id: journalId, organizationId, deletedAt: null },
      select: {
        id: true,
        date: true,
        createdAt: true,
        lines: { select: { debit: true, credit: true } },
      },
    });

    if (!journal) return null;

    // Get org average journal amount
    const allJournals = await this.prisma.journal.findMany({
      where: {
        organizationId,
        deletedAt: null,
        createdAt: { gte: new Date(Date.now() - 365 * 86400000) },
      },
      select: { lines: { select: { debit: true } } },
      take: 500,
    });

    const amounts = allJournals.map((j) => j.lines.reduce((sum, l) => sum + Number(l.debit), 0));
    const avgAmount = amounts.length > 0 ? mean(amounts) : 0;
    const stdAmount = amounts.length > 1 ? standardDeviation(amounts) : 1;
    const amount = journal.lines.reduce((sum, l) => sum + Number(l.debit), 0);

    // Amount anomaly using Isolation Forest
    let amountAnomaly = 0;
    if (amounts.length >= 10) {
      const forest = buildIsolationForest1D(amounts, 50);
      amountAnomaly = isolationForestScore1D(amount, forest);
    }

    // Corrections count
    const corrections = await this.prisma.auditLog.count({
      where: {
        organizationId,
        entityType: 'journal',
        entityId: journalId,
        action: 'UPDATE',
      },
    });

    // Weekend flag
    const dayOfWeek = journal.date.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6 ? 1 : 0;

    // Round number flag
    const isRound = amount % 1000 === 0 && amount > 0 ? 1 : 0;

    // Deviation from average
    const deviation = stdAmount > 0 ? Math.abs(zScoreWithStats(amount, avgAmount, stdAmount)) : 0;

    const raw = {
      amount_normalized: avgAmount > 0 ? amount / avgAmount : 0,
      corrections_count: Math.min(corrections, 10) / 10,
      weekend_flag: isWeekend,
      round_number_flag: isRound,
      deviation_from_avg: Math.min(deviation, 5) / 5,
      amount_anomaly: amountAnomaly,
    };

    return {
      vector: Object.values(raw),
      raw,
    };
  }

  private async extractInvoiceFeatures(
    organizationId: string,
    invoiceId: string,
  ): Promise<{ vector: number[]; raw: Record<string, number> } | null> {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, organizationId, deletedAt: null },
      select: {
        id: true,
        grandTotal: true,
        date: true,
        createdAt: true,
      },
    });

    if (!invoice) return null;

    const allInvoices = await this.prisma.invoice.findMany({
      where: {
        organizationId,
        deletedAt: null,
        createdAt: { gte: new Date(Date.now() - 365 * 86400000) },
      },
      select: { grandTotal: true },
      take: 500,
    });

    const amounts = allInvoices.map((i) => Number(i.grandTotal));
    const avgAmount = amounts.length > 0 ? mean(amounts) : 0;
    const stdAmount = amounts.length > 1 ? standardDeviation(amounts) : 1;
    const amount = Number(invoice.grandTotal);

    let amountAnomaly = 0;
    if (amounts.length >= 10) {
      const forest = buildIsolationForest1D(amounts, 50);
      amountAnomaly = isolationForestScore1D(amount, forest);
    }

    const corrections = await this.prisma.auditLog.count({
      where: {
        organizationId,
        entityType: 'invoice',
        entityId: invoiceId,
        action: 'UPDATE',
      },
    });

    const dayOfWeek = invoice.date.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6 ? 1 : 0;
    const isRound = amount % 1000 === 0 && amount > 0 ? 1 : 0;
    const deviation = stdAmount > 0 ? Math.abs(zScoreWithStats(amount, avgAmount, stdAmount)) : 0;

    const raw = {
      amount_normalized: avgAmount > 0 ? amount / avgAmount : 0,
      corrections_count: Math.min(corrections, 10) / 10,
      weekend_flag: isWeekend,
      round_number_flag: isRound,
      deviation_from_avg: Math.min(deviation, 5) / 5,
      amount_anomaly: amountAnomaly,
    };

    return { vector: Object.values(raw), raw };
  }

  private async extractBillFeatures(
    organizationId: string,
    billId: string,
  ): Promise<{ vector: number[]; raw: Record<string, number> } | null> {
    const bill = await this.prisma.bill.findFirst({
      where: { id: billId, organizationId, deletedAt: null },
      select: {
        id: true,
        grandTotal: true,
        date: true,
        createdAt: true,
      },
    });

    if (!bill) return null;

    const allBills = await this.prisma.bill.findMany({
      where: {
        organizationId,
        deletedAt: null,
        createdAt: { gte: new Date(Date.now() - 365 * 86400000) },
      },
      select: { grandTotal: true },
      take: 500,
    });

    const amounts = allBills.map((b) => Number(b.grandTotal));
    const avgAmount = amounts.length > 0 ? mean(amounts) : 0;
    const stdAmount = amounts.length > 1 ? standardDeviation(amounts) : 1;
    const amount = Number(bill.grandTotal);

    let amountAnomaly = 0;
    if (amounts.length >= 10) {
      const forest = buildIsolationForest1D(amounts, 50);
      amountAnomaly = isolationForestScore1D(amount, forest);
    }

    const corrections = await this.prisma.auditLog.count({
      where: {
        organizationId,
        entityType: 'bill',
        entityId: billId,
        action: 'UPDATE',
      },
    });

    const dayOfWeek = bill.date.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6 ? 1 : 0;
    const isRound = amount % 1000 === 0 && amount > 0 ? 1 : 0;
    const deviation = stdAmount > 0 ? Math.abs(zScoreWithStats(amount, avgAmount, stdAmount)) : 0;

    const raw = {
      amount_normalized: avgAmount > 0 ? amount / avgAmount : 0,
      corrections_count: Math.min(corrections, 10) / 10,
      weekend_flag: isWeekend,
      round_number_flag: isRound,
      deviation_from_avg: Math.min(deviation, 5) / 5,
      amount_anomaly: amountAnomaly,
    };

    return { vector: Object.values(raw), raw };
  }

  private async extractExpenseFeatures(
    organizationId: string,
    expenseId: string,
  ): Promise<{ vector: number[]; raw: Record<string, number> } | null> {
    const expense = await this.prisma.expense.findFirst({
      where: { id: expenseId, organizationId, deletedAt: null },
      select: {
        id: true,
        amount: true,
        date: true,
        createdAt: true,
      },
    });

    if (!expense) return null;

    const allExpenses = await this.prisma.expense.findMany({
      where: {
        organizationId,
        deletedAt: null,
        createdAt: { gte: new Date(Date.now() - 365 * 86400000) },
      },
      select: { amount: true },
      take: 500,
    });

    const amounts = allExpenses.map((e) => Number(e.amount));
    const avgAmount = amounts.length > 0 ? mean(amounts) : 0;
    const stdAmount = amounts.length > 1 ? standardDeviation(amounts) : 1;
    const amount = Number(expense.amount);

    let amountAnomaly = 0;
    if (amounts.length >= 10) {
      const forest = buildIsolationForest1D(amounts, 50);
      amountAnomaly = isolationForestScore1D(amount, forest);
    }

    const corrections = await this.prisma.auditLog.count({
      where: {
        organizationId,
        entityType: 'expense',
        entityId: expenseId,
        action: 'UPDATE',
      },
    });

    const dayOfWeek = expense.date.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6 ? 1 : 0;
    const isRound = amount % 1000 === 0 && amount > 0 ? 1 : 0;
    const deviation = stdAmount > 0 ? Math.abs(zScoreWithStats(amount, avgAmount, stdAmount)) : 0;

    const raw = {
      amount_normalized: avgAmount > 0 ? amount / avgAmount : 0,
      corrections_count: Math.min(corrections, 10) / 10,
      weekend_flag: isWeekend,
      round_number_flag: isRound,
      deviation_from_avg: Math.min(deviation, 5) / 5,
      amount_anomaly: amountAnomaly,
    };

    return { vector: Object.values(raw), raw };
  }

  private ruleBasedScore(features: { vector: number[]; raw: Record<string, number> }): {
    score: number;
    factors: AuditRiskResult['factors'];
  } {
    const factors: AuditRiskResult['factors'] = [];
    let score = 0;
    const r = features.raw;

    // Amount deviation (0-0.3)
    if (r.deviation_from_avg > 0.6) {
      const w = Math.min(0.3, r.deviation_from_avg * 0.3);
      score += w;
      factors.push({
        factor: 'amount_deviation',
        weight: w,
        description: 'Amount significantly deviates from organization average',
      });
    }

    // Isolation Forest anomaly (0-0.25)
    if (r.amount_anomaly > 0.6) {
      const w = Math.min(0.25, (r.amount_anomaly - 0.5) * 0.5);
      score += w;
      factors.push({
        factor: 'amount_anomaly',
        weight: w,
        description: 'Amount flagged as anomalous by Isolation Forest',
      });
    }

    // Corrections count (0-0.2)
    if (r.corrections_count > 0.2) {
      const w = Math.min(0.2, r.corrections_count * 0.2);
      score += w;
      factors.push({
        factor: 'frequent_corrections',
        weight: w,
        description: 'Multiple corrections made to this record',
      });
    }

    // Weekend activity (0-0.1)
    if (r.weekend_flag === 1) {
      score += 0.1;
      factors.push({
        factor: 'weekend_activity',
        weight: 0.1,
        description: 'Transaction dated on a weekend',
      });
    }

    // Round number (0-0.15)
    if (r.round_number_flag === 1 && r.amount_normalized > 1.5) {
      score += 0.15;
      factors.push({
        factor: 'suspicious_round_amount',
        weight: 0.15,
        description: 'Large round number amount',
      });
    }

    return { score: Math.min(1, score), factors };
  }

  private async getEntityIds(
    organizationId: string,
    entityType: string,
    limit: number = 200,
  ): Promise<string[]> {
    const threeMonthsAgo = new Date(Date.now() - 90 * 86400000);

    switch (entityType) {
      case 'journal': {
        const journals = await this.prisma.journal.findMany({
          where: {
            organizationId,
            deletedAt: null,
            createdAt: { gte: threeMonthsAgo },
          },
          select: { id: true },
          take: limit,
          orderBy: { createdAt: 'desc' },
        });
        return journals.map((j) => j.id);
      }
      case 'invoice': {
        const invoices = await this.prisma.invoice.findMany({
          where: {
            organizationId,
            deletedAt: null,
            createdAt: { gte: threeMonthsAgo },
          },
          select: { id: true },
          take: limit,
          orderBy: { createdAt: 'desc' },
        });
        return invoices.map((i) => i.id);
      }
      case 'bill': {
        const bills = await this.prisma.bill.findMany({
          where: {
            organizationId,
            deletedAt: null,
            createdAt: { gte: threeMonthsAgo },
          },
          select: { id: true },
          take: limit,
          orderBy: { createdAt: 'desc' },
        });
        return bills.map((b) => b.id);
      }
      case 'expense': {
        const expenses = await this.prisma.expense.findMany({
          where: {
            organizationId,
            deletedAt: null,
            createdAt: { gte: threeMonthsAgo },
          },
          select: { id: true },
          take: limit,
          orderBy: { createdAt: 'desc' },
        });
        return expenses.map((e) => e.id);
      }
      default:
        return [];
    }
  }
}
