import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';
import type { AIInsight, AlertCategory, AlertSource, Prisma } from '@prisma/client';

interface RawInsight {
  type: string;
  title: string;
  message: string;
  priority: number;
  data?: Record<string, unknown>;
  actions?: string[];
}

export type InsightType =
  | 'ANOMALY'
  | 'TREND'
  | 'RECOMMENDATION'
  | 'FORECAST'
  | 'ALERT'
  | 'OPPORTUNITY';
export type InsightPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type InsightStatus = 'NEW' | 'VIEWED' | 'DISMISSED' | 'ACTIONED';

export interface FormattedInsight {
  id: string;
  type: InsightType;
  priority: InsightPriority;
  status: InsightStatus;
  title: string;
  description: string;
  impact?: string;
  recommendation?: string;
  data?: Record<string, unknown>;
  module?: string;
  entityType?: string;
  entityId?: string;
  confidence: number;
  createdAt: string;
  expiresAt?: string;
}

const TYPE_MAP: Record<string, InsightType> = {
  CASH_FLOW_WARNING: 'ALERT',
  CASH_FLOW_NEGATIVE: 'ALERT',
  REVENUE_GROWTH: 'TREND',
  REVENUE_DECLINE: 'TREND',
  EXPENSE_ANOMALY: 'ANOMALY',
  SLOW_PAYERS: 'RECOMMENDATION',
  LOW_STOCK: 'ALERT',
  PROJECT_OVER_BUDGET: 'ALERT',
};

const _MODULE_MAP: Record<string, string> = {
  CASH_FLOW_WARNING: 'banking',
  CASH_FLOW_NEGATIVE: 'banking',
  REVENUE_GROWTH: 'sales',
  REVENUE_DECLINE: 'sales',
  EXPENSE_ANOMALY: 'purchases',
  SLOW_PAYERS: 'sales',
  LOW_STOCK: 'inventory',
  PROJECT_OVER_BUDGET: 'projects',
};

function mapPriority(numericPriority: number): InsightPriority {
  if (numericPriority >= 9) return 'CRITICAL';
  if (numericPriority >= 7) return 'HIGH';
  if (numericPriority >= 5) return 'MEDIUM';
  return 'LOW';
}

@Injectable()
export class AiInsightsService {
  private readonly logger = new Logger(AiInsightsService.name);

  constructor(private prisma: PrismaService) {}

  async getInsights(
    organizationId: string,
    filters?: { type?: string; status?: string; limit?: number },
  ) {
    // First, generate fresh insights and persist any new ones
    await this.generateAndPersist(organizationId);

    // Query from database with filters
    const where: Prisma.AIInsightWhereInput = { organizationId };
    if (filters?.type) {
      where.type = filters.type;
    }
    if (filters?.status) {
      switch (filters.status) {
        case 'NEW':
          where.isDismissed = false;
          where.actionTaken = null;
          where.isRead = false;
          break;
        case 'VIEWED':
          where.isRead = true;
          where.isDismissed = false;
          where.actionTaken = null;
          break;
        case 'DISMISSED':
          where.isDismissed = true;
          break;
        case 'ACTIONED':
          where.actionTaken = { not: null };
          break;
      }
    }

    const insights = await this.prisma.aIInsight.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: filters?.limit || 50,
    });

    return {
      data: insights.map((i) => this.formatStoredInsight(i)),
    };
  }

  async getInsightById(organizationId: string, id: string) {
    const insight = await this.prisma.aIInsight.findFirst({
      where: { id, organizationId },
    });
    if (!insight) throw new NotFoundException('Insight not found');

    // Mark as read
    if (!insight.isRead) {
      await this.prisma.aIInsight.update({
        where: { id },
        data: { isRead: true },
      });
    }

    return { data: this.formatStoredInsight(insight) };
  }

  async dismissInsight(organizationId: string, id: string, userId?: string) {
    const insight = await this.prisma.aIInsight.findFirst({
      where: { id, organizationId },
    });
    if (!insight) throw new NotFoundException('Insight not found');

    await this.prisma.aIInsight.update({
      where: { id },
      data: {
        isDismissed: true,
        dismissedAt: new Date(),
        dismissedBy: userId,
      },
    });

    return { success: true };
  }

  async actionInsight(organizationId: string, id: string, action: string) {
    const insight = await this.prisma.aIInsight.findFirst({
      where: { id, organizationId },
    });
    if (!insight) throw new NotFoundException('Insight not found');

    await this.prisma.aIInsight.update({
      where: { id },
      data: {
        actionTaken: action,
        actionTakenAt: new Date(),
      },
    });

    return { success: true };
  }

  // Keep the legacy method for backward compat (used by old callers)
  async generateInsights(organizationId: string) {
    return this.getInsights(organizationId);
  }

  private async generateAndPersist(organizationId: string) {
    const rawInsights: RawInsight[] = [];
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    // Generate insights from analysis — each analyzer is wrapped individually
    // so that a single failure (e.g. missing DB column) doesn't crash all insights.
    const analyzers: Array<{ name: string; fn: () => Promise<RawInsight | null> }> = [
      { name: 'cashFlow', fn: () => this.analyzeCashFlow(organizationId, startOfMonth) },
      { name: 'revenueTrend', fn: () => this.analyzeRevenueTrend(organizationId) },
      { name: 'expenseAnomalies', fn: () => this.detectExpenseAnomalies(organizationId) },
      { name: 'paymentPatterns', fn: () => this.analyzePaymentPatterns(organizationId) },
      { name: 'inventory', fn: () => this.analyzeInventory(organizationId) },
      { name: 'projectProfitability', fn: () => this.analyzeProjectProfitability(organizationId) },
    ];

    for (const analyzer of analyzers) {
      try {
        const result = await analyzer.fn();
        if (result) rawInsights.push(result);
      } catch (error) {
        this.logger.warn(
          `Insight analyzer "${analyzer.name}" failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    // Persist new insights (avoid duplicates by checking title + type within last 24h)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    for (const raw of rawInsights) {
      const mappedType = TYPE_MAP[raw.type] || 'ALERT';
      const existing = await this.prisma.aIInsight.findFirst({
        where: {
          organizationId,
          title: raw.title,
          type: mappedType,
          createdAt: { gte: oneDayAgo },
        },
      });

      if (!existing) {
        await this.prisma.aIInsight.create({
          data: {
            type: mappedType,
            title: raw.title,
            description: raw.message,
            severity: this.mapSeverity(raw.priority),
            priority: mapPriority(raw.priority),
            data: (raw.data as Prisma.InputJsonValue) || undefined,
            impact: this.deriveImpact(raw),
            suggestedAction: raw.actions?.join(', '),
            category: this.mapCategory(raw.type) as AlertCategory,
            aiSource: this.mapSource(raw.type) as AlertSource,
            organizationId,
          },
        });
      }
    }
  }

  private formatStoredInsight(insight: AIInsight): FormattedInsight {
    const status: InsightStatus = insight.isDismissed
      ? 'DISMISSED'
      : insight.actionTaken
        ? 'ACTIONED'
        : insight.isRead
          ? 'VIEWED'
          : 'NEW';

    return {
      id: insight.id,
      type: (insight.type as InsightType) || 'ALERT',
      priority: (insight.priority as InsightPriority) || 'MEDIUM',
      status,
      title: insight.title,
      description: insight.description,
      impact: insight.impact || undefined,
      recommendation: insight.suggestedAction || undefined,
      data: (insight.data as Record<string, unknown>) || undefined,
      module: insight.sourceEntityType || undefined,
      entityType: insight.sourceEntityType || undefined,
      entityId: insight.sourceEntityId || undefined,
      confidence: 0.85,
      createdAt: insight.createdAt.toISOString(),
      expiresAt: insight.expiresAt?.toISOString() || undefined,
    };
  }

  private mapSeverity(priority: number): string {
    if (priority >= 9) return 'critical';
    if (priority >= 7) return 'warning';
    return 'info';
  }

  private mapCategory(rawType: string) {
    const map: Record<string, string> = {
      CASH_FLOW_WARNING: 'FINANCIAL',
      CASH_FLOW_NEGATIVE: 'FINANCIAL',
      REVENUE_GROWTH: 'FINANCIAL',
      REVENUE_DECLINE: 'FINANCIAL',
      EXPENSE_ANOMALY: 'FINANCIAL',
      SLOW_PAYERS: 'COLLECTION',
      LOW_STOCK: 'INVENTORY',
      PROJECT_OVER_BUDGET: 'FINANCIAL',
    };
    return map[rawType] || 'FINANCIAL';
  }

  private mapSource(rawType: string) {
    const map: Record<string, string> = {
      CASH_FLOW_WARNING: 'CASH_FLOW',
      CASH_FLOW_NEGATIVE: 'CASH_FLOW',
      REVENUE_GROWTH: 'ANOMALY',
      REVENUE_DECLINE: 'ANOMALY',
      EXPENSE_ANOMALY: 'ANOMALY',
      SLOW_PAYERS: 'PAYMENT_PREDICTION',
      LOW_STOCK: 'REORDER',
      PROJECT_OVER_BUDGET: 'ANOMALY',
    };
    return map[rawType] || 'ANOMALY';
  }

  private deriveImpact(raw: RawInsight): string | undefined {
    const d = raw.data as Record<string, number | unknown[] | undefined> | undefined;
    if (!d) return undefined;
    if (d.daysOfCash) {
      return `${d.daysOfCash} days of cash remaining`;
    }
    if (d.change) {
      return `${Math.abs(d.change as number).toFixed(1)}% change in revenue`;
    }
    if (Array.isArray(d.anomalies) && d.anomalies.length) {
      return `${d.anomalies.length} expense anomalies detected`;
    }
    if (Array.isArray(d.slowPayers) && d.slowPayers.length) {
      return `${d.slowPayers.length} customers with late payments`;
    }
    if (Array.isArray(d.items) && d.items.length) {
      return `${d.items.length} items below reorder point`;
    }
    if (Array.isArray(d.projects) && d.projects.length) {
      return `${d.projects.length} projects over budget`;
    }
    return undefined;
  }

  private async analyzeCashFlow(organizationId: string, startOfMonth: Date) {
    const today = new Date();

    // Skip if no financial data exists
    const txCount = await this.prisma.paymentReceived.count({ where: { organizationId } });
    const expCount = await this.prisma.expense.count({ where: { organizationId } });
    if (txCount === 0 && expCount === 0) return null;

    const paymentsReceived = await this.prisma.paymentReceived.aggregate({
      where: { organizationId, date: { gte: startOfMonth, lte: today } },
      _sum: { amount: true },
    });
    const cashIn = parseFloat(paymentsReceived._sum.amount?.toString() || '0');

    const paymentsMade = await this.prisma.paymentMade.aggregate({
      where: { organizationId, date: { gte: startOfMonth, lte: today } },
      _sum: { amount: true },
    });
    const expenses = await this.prisma.expense.aggregate({
      where: { organizationId, date: { gte: startOfMonth, lte: today } },
      _sum: { amount: true },
    });
    const cashOut =
      parseFloat(paymentsMade._sum.amount?.toString() || '0') +
      parseFloat(expenses._sum.amount?.toString() || '0');

    const netCashFlow = cashIn - cashOut;
    const burnRate = cashOut / today.getDate();

    const bankBalance = await this.getTotalBankBalance(organizationId);
    const daysOfCash = burnRate > 0 ? Math.floor(bankBalance / burnRate) : 999;

    if (daysOfCash < 30) {
      return {
        type: 'CASH_FLOW_WARNING',
        priority: 10,
        title: 'Cash Flow Alert',
        message: `At current burn rate, you have approximately ${daysOfCash} days of cash remaining. Consider accelerating collections or reducing expenses.`,
        data: { netCashFlow, burnRate, daysOfCash, bankBalance },
        actions: ['View upcoming payments', 'Send invoice reminders', 'Review expenses'],
      };
    } else if (netCashFlow < 0) {
      return {
        type: 'CASH_FLOW_NEGATIVE',
        priority: 7,
        title: 'Negative Cash Flow This Month',
        message: `Your cash outflows exceed inflows by $${Math.abs(netCashFlow).toFixed(2)} this month. Monitor spending closely.`,
        data: { cashIn, cashOut, netCashFlow },
        actions: ['View cash flow report', 'Review expenses'],
      };
    }
    return null;
  }

  private async analyzeRevenueTrend(organizationId: string) {
    // Skip if no invoices exist
    const invoiceCount = await this.prisma.invoice.count({
      where: { organizationId, deletedAt: null },
    });
    if (invoiceCount === 0) return null;

    const months: Array<{ month: string; revenue: number }> = [];
    const today = new Date();

    for (let i = 5; i >= 0; i--) {
      const start = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const end = new Date(today.getFullYear(), today.getMonth() - i + 1, 0);

      const invoices = await this.prisma.invoice.aggregate({
        where: { organizationId, deletedAt: null, date: { gte: start, lte: end } },
        _sum: { grandTotal: true },
      });
      months.push({
        month: start.toLocaleString('default', { month: 'short' }),
        revenue: parseFloat(invoices._sum.grandTotal?.toString() || '0'),
      });
    }

    const recent3Months = months.slice(-3).reduce((sum, m) => sum + m.revenue, 0) / 3;
    const prior3Months = months.slice(0, 3).reduce((sum, m) => sum + m.revenue, 0) / 3;

    if (prior3Months > 0) {
      const change = ((recent3Months - prior3Months) / prior3Months) * 100;

      if (change > 10) {
        return {
          type: 'REVENUE_GROWTH',
          priority: 5,
          title: 'Revenue Growing',
          message: `Your revenue has increased ${change.toFixed(1)}% compared to the previous quarter. Keep up the momentum!`,
          data: { months, change },
          actions: ['View revenue report'],
        };
      } else if (change < -10) {
        return {
          type: 'REVENUE_DECLINE',
          priority: 8,
          title: 'Revenue Declining',
          message: `Your revenue has decreased ${Math.abs(change).toFixed(1)}% compared to the previous quarter. Consider reviewing your sales pipeline.`,
          data: { months, change },
          actions: ['View sales pipeline', 'Contact inactive customers'],
        };
      }
    }
    return null;
  }

  private async detectExpenseAnomalies(organizationId: string) {
    const expenseCount = await this.prisma.expense.count({ where: { organizationId } });
    if (expenseCount === 0) return null;

    const today = new Date();
    const currentMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);

    const currentExpenses = await this.prisma.expense.groupBy({
      by: ['accountId'],
      where: { organizationId, date: { gte: currentMonth } },
      _sum: { amount: true },
    });

    const lastExpenses = await this.prisma.expense.groupBy({
      by: ['accountId'],
      where: { organizationId, date: { gte: lastMonth, lte: lastMonthEnd } },
      _sum: { amount: true },
    });

    const lastExpenseMap = new Map(
      lastExpenses.map((e) => [e.accountId, parseFloat(e._sum.amount?.toString() || '0')]),
    );

    const anomalies = [];
    for (const expense of currentExpenses) {
      const current = parseFloat(expense._sum.amount?.toString() || '0');
      const last = lastExpenseMap.get(expense.accountId) || 0;

      if (last > 0 && current > last * 1.5) {
        const account = await this.prisma.account.findUnique({ where: { id: expense.accountId } });
        anomalies.push({
          accountId: expense.accountId,
          accountName: account?.name,
          current,
          previous: last,
          increase: ((current - last) / last) * 100,
        });
      }
    }

    if (anomalies.length > 0) {
      const topAnomaly = anomalies.sort((a, b) => b.increase - a.increase)[0];
      return {
        type: 'EXPENSE_ANOMALY',
        priority: 7,
        title: 'Unusual Expense Increase',
        message: `${topAnomaly.accountName} expenses increased by ${topAnomaly.increase.toFixed(0)}% compared to last month.`,
        data: { anomalies },
        actions: ['Review expenses', 'View expense details'],
      };
    }
    return null;
  }

  private async analyzePaymentPatterns(organizationId: string) {
    const paidCount = await this.prisma.invoice.count({
      where: { organizationId, deletedAt: null, status: { in: ['PAID', 'PARTIALLY_PAID'] } },
    });
    if (paidCount === 0) return null;

    const paidInvoices = await this.prisma.invoice.findMany({
      where: {
        organizationId,
        deletedAt: null,
        status: { in: ['PAID', 'PARTIALLY_PAID'] },
      },
      include: { customer: { select: { id: true, name: true } } },
    });

    const payments = await this.prisma.paymentReceived.findMany({
      where: { organizationId },
      include: { allocations: true },
    });

    const customerPaymentDays: Record<string, { name: string; days: number[]; avgDays: number }> =
      {};

    for (const invoice of paidInvoices) {
      const invoicePayments = payments.filter((p) =>
        p.allocations.some((a) => a.invoiceId === invoice.id),
      );

      for (const payment of invoicePayments) {
        const daysToPay = Math.floor(
          (payment.date.getTime() - invoice.date.getTime()) / (1000 * 60 * 60 * 24),
        );

        if (!customerPaymentDays[invoice.customerId]) {
          customerPaymentDays[invoice.customerId] = {
            name: invoice.customer.name,
            days: [],
            avgDays: 0,
          };
        }
        customerPaymentDays[invoice.customerId].days.push(daysToPay);
      }
    }

    for (const customerId in customerPaymentDays) {
      const data = customerPaymentDays[customerId];
      data.avgDays = data.days.reduce((sum, d) => sum + d, 0) / data.days.length;
    }

    const slowPayers = Object.values(customerPaymentDays)
      .filter((c) => c.avgDays > 45)
      .sort((a, b) => b.avgDays - a.avgDays);

    if (slowPayers.length > 0) {
      return {
        type: 'SLOW_PAYERS',
        priority: 6,
        title: 'Slow Paying Customers Identified',
        message: `${slowPayers.length} customer(s) take over 45 days on average to pay. Consider adjusting payment terms.`,
        data: { slowPayers: slowPayers.slice(0, 5) },
        actions: ['View customer details', 'Update payment terms'],
      };
    }
    return null;
  }

  private async analyzeInventory(organizationId: string) {
    const items = await this.prisma.item.findMany({
      where: { organizationId, type: 'GOODS' },
    });

    if (items.length === 0) return null;

    const lowStockItems = [];
    for (const item of items) {
      const movements = await this.prisma.inventoryMovement.findMany({
        where: { itemId: item.id, organizationId },
      });
      const currentStock = movements.reduce((sum, m) => sum + parseFloat(m.quantity.toString()), 0);

      if (currentStock <= (item.reorderPoint ? parseFloat(item.reorderPoint.toString()) : 10)) {
        lowStockItems.push({
          id: item.id,
          name: item.name,
          sku: item.sku,
          currentStock,
          reorderPoint: item.reorderPoint ? parseFloat(item.reorderPoint.toString()) : 10,
        });
      }
    }

    if (lowStockItems.length > 0) {
      return {
        type: 'LOW_STOCK',
        priority: 8,
        title: 'Low Stock Alert',
        message: `${lowStockItems.length} item(s) are at or below reorder point. Consider placing orders.`,
        data: { items: lowStockItems.slice(0, 5) },
        actions: ['View inventory', 'Create purchase order'],
      };
    }
    return null;
  }

  private async analyzeProjectProfitability(organizationId: string) {
    const projects = await this.prisma.project.findMany({
      where: { organizationId, status: 'ACTIVE' },
      include: {
        timesheetEntries: true,
        tasks: true,
      },
    });

    if (projects.length === 0) return null;

    const unprofitableProjects: Array<{
      id: string;
      name: string;
      hoursLogged: number;
      estimatedRevenue: number;
      budget: number;
      budgetUsed: number;
    }> = [];
    for (const project of projects) {
      const hoursLogged = project.timesheetEntries.reduce(
        (sum: number, t: { duration: Decimal }) => sum + parseFloat(t.duration.toString()),
        0,
      );
      const avgTaskRate =
        project.tasks.length > 0
          ? project.tasks.reduce(
              (sum: number, t: { ratePerHour: Decimal }) =>
                sum + parseFloat(t.ratePerHour.toString()),
              0,
            ) / project.tasks.length
          : 0;
      const estimatedRevenue = hoursLogged * avgTaskRate;
      const budget = project.budgetAmount ? parseFloat(project.budgetAmount.toString()) : 0;

      if (budget > 0 && estimatedRevenue > budget * 0.8) {
        unprofitableProjects.push({
          id: project.id,
          name: project.name,
          hoursLogged,
          estimatedRevenue,
          budget,
          budgetUsed: (estimatedRevenue / budget) * 100,
        });
      }
    }

    if (unprofitableProjects.length > 0) {
      return {
        type: 'PROJECT_OVER_BUDGET',
        priority: 7,
        title: 'Projects Approaching Budget Limit',
        message: `${unprofitableProjects.length} project(s) have used over 80% of their budget. Review project scope.`,
        data: { projects: unprofitableProjects },
        actions: ['View project details', 'Update budget'],
      };
    }
    return null;
  }

  /**
   * Get model performance report for monitoring dashboard.
   * Returns per-model accuracy trends, correction rates, confidence distribution, and data volume.
   */
  async getModelPerformanceReport(organizationId: string): Promise<{
    models: Array<{
      feature: string;
      latestVersion: number;
      accuracy: number;
      sampleCount: number;
      status: string;
      trainedAt: string | null;
      correctionRate: number;
      totalPredictions: number;
      totalFeedback: number;
      acceptedCount: number;
      rejectedCount: number;
      correctedCount: number;
      avgConfidence: number;
      confidenceDistribution: { low: number; medium: number; high: number };
      trainingDataCount: number;
      lastRetrainedAt: string | null;
      daysSinceRetrain: number | null;
    }>;
    summary: {
      totalModels: number;
      activeModels: number;
      avgAccuracy: number;
      avgCorrectionRate: number;
      modelsNeedingRetrain: number;
      totalPredictions: number;
      totalFeedback: number;
    };
  }> {
    // AiModel and AiTrainingData tables have been removed.
    // Build performance report from aiFeedback and aiPrediction data only.

    // Get feedback counts grouped by feature and action
    const feedbackCounts = await this.prisma.aiFeedback.groupBy({
      by: ['feature', 'userAction'],
      where: { organizationId },
      _count: { id: true },
    });

    // Get prediction stats grouped by feature
    const predictionStats = await this.prisma.aiPrediction.groupBy({
      by: ['feature'],
      where: { organizationId },
      _count: { id: true },
      _avg: { confidence: true },
    });

    // Build per-feature feedback map
    const feedbackMap = new Map<
      string,
      { accepted: number; rejected: number; corrected: number }
    >();
    for (const fb of feedbackCounts) {
      if (!feedbackMap.has(fb.feature)) {
        feedbackMap.set(fb.feature, { accepted: 0, rejected: 0, corrected: 0 });
      }
      const entry = feedbackMap.get(fb.feature)!;
      if (fb.userAction === 'ACCEPTED') entry.accepted = fb._count.id;
      else if (fb.userAction === 'REJECTED') entry.rejected = fb._count.id;
      else if (fb.userAction === 'CORRECTED') entry.corrected = fb._count.id;
    }

    // Build per-feature prediction map
    const predMap = new Map<string, { count: number; avgConfidence: number }>();
    for (const ps of predictionStats) {
      predMap.set(ps.feature, {
        count: ps._count.id,
        avgConfidence: parseFloat(ps._avg.confidence?.toString() || '0'),
      });
    }

    // Get confidence distribution per feature
    const confidenceDistributions = new Map<
      string,
      { low: number; medium: number; high: number }
    >();
    const allPredictions = await this.prisma.aiPrediction.findMany({
      where: { organizationId },
      select: { feature: true, confidence: true },
    });

    for (const p of allPredictions) {
      if (!confidenceDistributions.has(p.feature)) {
        confidenceDistributions.set(p.feature, { low: 0, medium: 0, high: 0 });
      }
      const dist = confidenceDistributions.get(p.feature)!;
      const conf = parseFloat(p.confidence.toString());
      if (conf < 0.6) dist.low++;
      else if (conf < 0.85) dist.medium++;
      else dist.high++;
    }

    // Collect all known features from feedback and predictions
    const allFeatures = new Set<string>();
    for (const key of feedbackMap.keys()) allFeatures.add(key);
    for (const key of predMap.keys()) allFeatures.add(key);

    const models = Array.from(allFeatures).map((feature) => {
      const fb = feedbackMap.get(feature) || { accepted: 0, rejected: 0, corrected: 0 };
      const pred = predMap.get(feature) || { count: 0, avgConfidence: 0 };
      const totalFeedback = fb.accepted + fb.rejected + fb.corrected;
      const correctionRate = totalFeedback > 0 ? (fb.corrected + fb.rejected) / totalFeedback : 0;

      return {
        feature,
        latestVersion: 0,
        accuracy: 0,
        sampleCount: 0,
        status: 'ACTIVE',
        trainedAt: null,
        correctionRate: Math.round(correctionRate * 1000) / 1000,
        totalPredictions: pred.count,
        totalFeedback,
        acceptedCount: fb.accepted,
        rejectedCount: fb.rejected,
        correctedCount: fb.corrected,
        avgConfidence: Math.round(pred.avgConfidence * 1000) / 1000,
        confidenceDistribution: confidenceDistributions.get(feature) || {
          low: 0,
          medium: 0,
          high: 0,
        },
        trainingDataCount: 0,
        lastRetrainedAt: null,
        daysSinceRetrain: null,
      };
    });

    const avgCorrectionRate =
      models.length > 0 ? models.reduce((sum, m) => sum + m.correctionRate, 0) / models.length : 0;

    return {
      models,
      summary: {
        totalModels: models.length,
        activeModels: models.length,
        avgAccuracy: 0,
        avgCorrectionRate: Math.round(avgCorrectionRate * 1000) / 1000,
        modelsNeedingRetrain: 0,
        totalPredictions: models.reduce((sum, m) => sum + m.totalPredictions, 0),
        totalFeedback: models.reduce((sum, m) => sum + m.totalFeedback, 0),
      },
    };
  }

  private async getTotalBankBalance(organizationId: string) {
    const accounts = await this.prisma.bankAccount.aggregate({
      where: { organizationId, isActive: true },
      _sum: { systemBalance: true },
    });
    return parseFloat(accounts._sum.systemBalance?.toString() || '0');
  }
}
