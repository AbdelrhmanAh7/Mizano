import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../prisma/prisma.service';
import { AlertCategory, AlertPriority, AlertSource, AIInsight, Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

export interface UnifiedAlert {
  id: string;
  category: AlertCategory;
  priority: AlertPriority;
  source: AlertSource;
  title: string;
  description: string;
  impact?: string;
  suggestedAction?: string;
  actionUrl?: string;
  actionLabel?: string;
  sourceEntity?: {
    type: string;
    id: string;
    name?: string;
  };
  data?: Record<string, unknown>;
  confidence?: number;
  expiresAt?: Date;
  createdAt: Date;
  isRead: boolean;
  isDismissed: boolean;
}

export interface AlertSummary {
  total: number;
  unread: number;
  byCategory: Record<AlertCategory, number>;
  byPriority: Record<AlertPriority, number>;
  critical: UnifiedAlert[];
}

export interface AlertQueryOptions {
  category?: AlertCategory;
  priority?: AlertPriority;
  source?: AlertSource;
  isRead?: boolean;
  includeDismissed?: boolean;
  limit?: number;
  offset?: number;
}

@Injectable()
export class AiAlertsService {
  private readonly logger = new Logger(AiAlertsService.name);

  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
  ) {}

  /**
   * Aggregate alerts from all AI services
   */
  async aggregateAlerts(organizationId: string): Promise<{
    created: number;
    updated: number;
    expired: number;
  }> {
    this.logger.log(`Aggregating alerts for org ${organizationId}`);

    let created = 0;
    let updated = 0;
    let expired = 0;

    try {
      // Collect alerts from all sources
      const [
        financialAlerts,
        collectionAlerts,
        inventoryAlerts,
        crmAlerts,
        complianceAlerts,
        hrAlerts,
      ] = await Promise.all([
        this.getFinancialAlerts(organizationId),
        this.getCollectionAlerts(organizationId),
        this.getInventoryAlerts(organizationId),
        this.getCrmAlerts(organizationId),
        this.getComplianceAlerts(organizationId),
        this.getHrAlerts(organizationId),
      ]);

      const allAlerts = [
        ...financialAlerts,
        ...collectionAlerts,
        ...inventoryAlerts,
        ...crmAlerts,
        ...complianceAlerts,
        ...hrAlerts,
      ];

      // Store/update alerts
      for (const alert of allAlerts) {
        const existing = await this.findExistingAlert(
          organizationId,
          alert.source,
          alert.sourceEntity?.id,
        );

        if (existing) {
          // Update existing alert if content changed
          if (existing.title !== alert.title || existing.description !== alert.description) {
            await this.prisma.aIInsight.update({
              where: { id: existing.id },
              data: {
                title: alert.title,
                description: alert.description,
                priority: alert.priority,
                data: alert.data as Prisma.InputJsonValue,
                updatedAt: new Date(),
              },
            });
            updated++;
          }
        } else {
          // Create new alert
          await this.prisma.aIInsight.create({
            data: {
              type: 'ALERT',
              title: alert.title,
              description: alert.description,
              data: alert.data as Prisma.InputJsonValue,
              severity: this.mapPriorityToSeverity(alert.priority),
              category: alert.category,
              priority: alert.priority,
              aiSource: alert.source,
              sourceEntityType: alert.sourceEntity?.type,
              sourceEntityId: alert.sourceEntity?.id,
              actionUrl: alert.actionUrl,
              actionLabel: alert.actionLabel,
              impact: alert.impact,
              suggestedAction: alert.suggestedAction,
              expiresAt: alert.expiresAt,
              organizationId,
            },
          });
          created++;

          // Emit event for real-time notifications
          this.eventEmitter.emit('alert.created', {
            organizationId,
            alert,
          });
        }
      }

      // Expire old alerts
      expired = await this.cleanupExpiredAlerts(organizationId);

      return { created, updated, expired };
    } catch (error) {
      this.logger.error(`Alert aggregation failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get alerts with filtering
   */
  async getAlerts(
    organizationId: string,
    options?: AlertQueryOptions,
  ): Promise<{ data: UnifiedAlert[]; total: number }> {
    const where: Prisma.AIInsightWhereInput = {
      organizationId,
      type: 'ALERT',
    };

    if (options?.category) {
      where.category = options.category;
    }

    if (options?.priority) {
      where.priority = options.priority;
    }

    if (options?.source) {
      where.aiSource = options.source;
    }

    if (options?.isRead !== undefined) {
      where.isRead = options.isRead;
    }

    if (!options?.includeDismissed) {
      where.isDismissed = false;
    }

    const [data, total] = await Promise.all([
      this.prisma.aIInsight.findMany({
        where,
        orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
        take: options?.limit || 50,
        skip: options?.offset || 0,
      }),
      this.prisma.aIInsight.count({ where }),
    ]);

    return {
      data: data.map(this.mapToUnifiedAlert),
      total,
    };
  }

  /**
   * Get alert summary for dashboard
   */
  async getAlertSummary(organizationId: string): Promise<AlertSummary> {
    const alerts = await this.prisma.aIInsight.findMany({
      where: {
        organizationId,
        type: 'ALERT',
        isDismissed: false,
      },
    });

    const unread = alerts.filter((a) => !a.isRead).length;

    const byCategory: Record<AlertCategory, number> = {
      FINANCIAL: 0,
      COLLECTION: 0,
      INVENTORY: 0,
      COMPLIANCE: 0,
      HR: 0,
      CRM: 0,
    };

    const byPriority: Record<AlertPriority, number> = {
      CRITICAL: 0,
      HIGH: 0,
      MEDIUM: 0,
      LOW: 0,
    };

    for (const alert of alerts) {
      if (alert.category) {
        byCategory[alert.category]++;
      }
      if (alert.priority) {
        byPriority[alert.priority]++;
      }
    }

    const critical = alerts
      .filter((a) => a.priority === AlertPriority.CRITICAL)
      .slice(0, 5)
      .map(this.mapToUnifiedAlert);

    return {
      total: alerts.length,
      unread,
      byCategory,
      byPriority,
      critical,
    };
  }

  /**
   * Get critical alerts only
   */
  async getCriticalAlerts(organizationId: string, limit: number = 5): Promise<UnifiedAlert[]> {
    const alerts = await this.prisma.aIInsight.findMany({
      where: {
        organizationId,
        type: 'ALERT',
        priority: AlertPriority.CRITICAL,
        isDismissed: false,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return alerts.map(this.mapToUnifiedAlert);
  }

  /**
   * Get alerts by category
   */
  async getAlertsByCategory(
    organizationId: string,
    category: AlertCategory,
    limit: number = 10,
  ): Promise<UnifiedAlert[]> {
    const alerts = await this.prisma.aIInsight.findMany({
      where: {
        organizationId,
        type: 'ALERT',
        category,
        isDismissed: false,
      },
      orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
      take: limit,
    });

    return alerts.map(this.mapToUnifiedAlert);
  }

  /**
   * Mark alert as read
   */
  async markAsRead(organizationId: string, alertId: string): Promise<void> {
    const alert = await this.prisma.aIInsight.findFirst({
      where: { id: alertId, organizationId },
    });

    if (!alert) {
      throw new NotFoundException('Alert not found');
    }

    await this.prisma.aIInsight.update({
      where: { id: alertId },
      data: { isRead: true },
    });
  }

  /**
   * Mark all alerts as read
   */
  async markAllAsRead(organizationId: string, category?: AlertCategory): Promise<number> {
    const where: Prisma.AIInsightWhereInput = {
      organizationId,
      type: 'ALERT',
      isRead: false,
    };

    if (category) {
      where.category = category;
    }

    const result = await this.prisma.aIInsight.updateMany({
      where,
      data: { isRead: true },
    });

    return result.count;
  }

  /**
   * Dismiss an alert
   */
  async dismissAlert(
    organizationId: string,
    alertId: string,
    userId: string,
    reason?: string,
  ): Promise<void> {
    const alert = await this.prisma.aIInsight.findFirst({
      where: { id: alertId, organizationId },
    });

    if (!alert) {
      throw new NotFoundException('Alert not found');
    }

    await this.prisma.aIInsight.update({
      where: { id: alertId },
      data: {
        isDismissed: true,
        dismissedAt: new Date(),
        dismissedBy: userId,
      },
    });
  }

  /**
   * Record action taken on alert
   */
  async recordAction(organizationId: string, alertId: string, action: string): Promise<void> {
    const alert = await this.prisma.aIInsight.findFirst({
      where: { id: alertId, organizationId },
    });

    if (!alert) {
      throw new NotFoundException('Alert not found');
    }

    await this.prisma.aIInsight.update({
      where: { id: alertId },
      data: {
        actionTakenAt: new Date(),
        actionTaken: action,
        isRead: true,
      },
    });
  }

  /**
   * Clean up expired alerts
   */
  async cleanupExpiredAlerts(organizationId: string): Promise<number> {
    const now = new Date();

    // Mark expired alerts as dismissed
    const expired = await this.prisma.aIInsight.updateMany({
      where: {
        organizationId,
        type: 'ALERT',
        isDismissed: false,
        expiresAt: { lt: now },
      },
      data: {
        isDismissed: true,
        dismissedAt: now,
      },
    });

    // Delete very old dismissed alerts (older than 90 days)
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 90);

    await this.prisma.aIInsight.deleteMany({
      where: {
        organizationId,
        type: 'ALERT',
        isDismissed: true,
        dismissedAt: { lt: oldDate },
      },
    });

    return expired.count;
  }

  /**
   * Check AI model health and generate accuracy alerts.
   * Call this periodically (e.g., daily from scheduler) to detect:
   * - Model accuracy below threshold
   * - High correction rate (users frequently correcting AI)
   * - Stale training data (no retrain in 30+ days)
   */
  async checkModelAccuracy(
    organizationId: string,
    options?: {
      accuracyThreshold?: number; // default 0.7
      correctionRateThreshold?: number; // default 0.3
      staleDays?: number; // default 30
    },
  ): Promise<{ alertsCreated: number; modelsChecked: number }> {
    const accuracyThreshold = options?.accuracyThreshold ?? 0.7;
    const correctionRateThreshold = options?.correctionRateThreshold ?? 0.3;
    const staleDays = options?.staleDays ?? 30;
    let alertsCreated = 0;

    // Get latest model per feature
    const allModels = await this.prisma.aiModel.findMany({
      where: { organizationId, status: 'ACTIVE' },
      orderBy: [{ feature: 'asc' }, { version: 'desc' }],
    });

    const latestModels = new Map<string, (typeof allModels)[0]>();
    for (const model of allModels) {
      if (!latestModels.has(model.feature)) {
        latestModels.set(model.feature, model);
      }
    }

    // Get correction rates from feedback
    const feedbackCounts = await this.prisma.aiFeedback.groupBy({
      by: ['feature', 'userAction'],
      where: { organizationId },
      _count: { id: true },
    });

    const feedbackMap = new Map<string, { total: number; corrections: number }>();
    for (const fb of feedbackCounts) {
      if (!feedbackMap.has(fb.feature)) {
        feedbackMap.set(fb.feature, { total: 0, corrections: 0 });
      }
      const entry = feedbackMap.get(fb.feature)!;
      entry.total += fb._count.id;
      if (fb.userAction === 'CORRECTED' || fb.userAction === 'REJECTED') {
        entry.corrections += fb._count.id;
      }
    }

    const now = Date.now();

    for (const [feature, model] of latestModels) {
      const accuracy = parseFloat(model.accuracy.toString());
      const fb = feedbackMap.get(feature);
      const correctionRate = fb && fb.total > 0 ? fb.corrections / fb.total : 0;
      const daysSinceRetrain = model.trainedAt
        ? Math.floor((now - model.trainedAt.getTime()) / (1000 * 60 * 60 * 24))
        : null;

      // Alert 1: Low accuracy
      if (accuracy > 0 && accuracy < accuracyThreshold) {
        const existingAlert = await this.findExistingAlert(
          organizationId,
          AlertSource.ANOMALY,
          `ai-accuracy-${feature}`,
        );
        if (!existingAlert) {
          await this.prisma.aIInsight.create({
            data: {
              type: 'ALERT',
              title: `AI Model Accuracy Below Threshold: ${feature}`,
              description: `The ${feature} model accuracy is ${(accuracy * 100).toFixed(1)}%, below the ${(accuracyThreshold * 100).toFixed(0)}% threshold. Consider retraining with more data.`,
              severity: accuracy < 0.5 ? 'critical' : 'warning',
              category: AlertCategory.FINANCIAL,
              priority: accuracy < 0.5 ? AlertPriority.CRITICAL : AlertPriority.HIGH,
              aiSource: AlertSource.ANOMALY,
              sourceEntityType: 'ai_model',
              sourceEntityId: `ai-accuracy-${feature}`,
              impact: `${feature} predictions may be unreliable`,
              suggestedAction: 'Retrain the model with corrected data or review training samples',
              actionUrl: '/settings/ai',
              actionLabel: 'AI Settings',
              data: {
                feature,
                accuracy,
                threshold: accuracyThreshold,
                modelVersion: model.version,
              } as any,
              organizationId,
            },
          });
          alertsCreated++;
        }
      }

      // Alert 2: High correction rate
      if (fb && fb.total >= 10 && correctionRate > correctionRateThreshold) {
        const existingAlert = await this.findExistingAlert(
          organizationId,
          AlertSource.ANOMALY,
          `ai-corrections-${feature}`,
        );
        if (!existingAlert) {
          await this.prisma.aIInsight.create({
            data: {
              type: 'ALERT',
              title: `High Correction Rate: ${feature}`,
              description: `Users corrected ${(correctionRate * 100).toFixed(0)}% of ${feature} predictions (${fb.corrections}/${fb.total}). The model may need retraining.`,
              severity: correctionRate > 0.5 ? 'critical' : 'warning',
              category: AlertCategory.FINANCIAL,
              priority: correctionRate > 0.5 ? AlertPriority.HIGH : AlertPriority.MEDIUM,
              aiSource: AlertSource.ANOMALY,
              sourceEntityType: 'ai_model',
              sourceEntityId: `ai-corrections-${feature}`,
              impact: `${feature} suggestions are frequently wrong`,
              suggestedAction: 'Review recent corrections and retrain the model',
              actionUrl: '/settings/ai',
              actionLabel: 'AI Settings',
              data: {
                feature,
                correctionRate,
                totalFeedback: fb.total,
                corrections: fb.corrections,
              } as any,
              organizationId,
            },
          });
          alertsCreated++;
        }
      }

      // Alert 3: Stale training data
      if (daysSinceRetrain !== null && daysSinceRetrain > staleDays) {
        const existingAlert = await this.findExistingAlert(
          organizationId,
          AlertSource.ANOMALY,
          `ai-stale-${feature}`,
        );
        if (!existingAlert) {
          await this.prisma.aIInsight.create({
            data: {
              type: 'ALERT',
              title: `Stale Model: ${feature}`,
              description: `The ${feature} model hasn't been retrained in ${daysSinceRetrain} days. Newer data may improve accuracy.`,
              severity: 'info',
              category: AlertCategory.FINANCIAL,
              priority: daysSinceRetrain > 60 ? AlertPriority.MEDIUM : AlertPriority.LOW,
              aiSource: AlertSource.ANOMALY,
              sourceEntityType: 'ai_model',
              sourceEntityId: `ai-stale-${feature}`,
              impact: 'Model may not reflect recent patterns',
              suggestedAction: 'Trigger a model retrain from AI Settings',
              actionUrl: '/settings/ai',
              actionLabel: 'AI Settings',
              data: {
                feature,
                daysSinceRetrain,
                lastTrainedAt: model.trainedAt?.toISOString(),
              } as any,
              organizationId,
            },
          });
          alertsCreated++;
        }
      }
    }

    return { alertsCreated, modelsChecked: latestModels.size };
  }

  // ============ Private Alert Collection Methods ============

  /**
   * Get financial alerts from cash flow predictions and anomalies
   */
  private async getFinancialAlerts(organizationId: string): Promise<UnifiedAlert[]> {
    const alerts: UnifiedAlert[] = [];

    // Cash flow alerts
    const cashFlowForecasts = await this.prisma.cashFlowForecast.findMany({
      where: {
        organizationId,
        forecastDate: { gte: new Date() },
        OR: [{ lowCashAlert: true }, { negativeCashAlert: true }],
      },
      orderBy: { forecastDate: 'asc' },
      take: 5,
    });

    for (const forecast of cashFlowForecasts) {
      if (forecast.negativeCashAlert) {
        alerts.push({
          id: `cash-negative-${forecast.id}`,
          category: AlertCategory.FINANCIAL,
          priority: AlertPriority.CRITICAL,
          source: AlertSource.CASH_FLOW,
          title: 'Cash Flow Warning: Potential Negative Balance',
          description: `Cash balance may go negative on ${forecast.forecastDate.toLocaleDateString()}. Expected balance: ${forecast.closingBalanceP50}`,
          impact: 'Risk of overdraft fees and missed payments',
          suggestedAction: 'Review upcoming payments and consider delaying non-essential expenses',
          actionUrl: `/cash-flow?date=${forecast.forecastDate.toISOString().split('T')[0]}`,
          actionLabel: 'View Cash Flow',
          data: {
            date: forecast.forecastDate,
            expectedBalance: forecast.closingBalanceP50.toNumber(),
          },
          expiresAt: forecast.forecastDate,
          createdAt: new Date(),
          isRead: false,
          isDismissed: false,
        });
      } else if (forecast.lowCashAlert) {
        alerts.push({
          id: `cash-low-${forecast.id}`,
          category: AlertCategory.FINANCIAL,
          priority: AlertPriority.HIGH,
          source: AlertSource.CASH_FLOW,
          title: 'Low Cash Warning',
          description: `Cash balance will be low on ${forecast.forecastDate.toLocaleDateString()}`,
          suggestedAction: 'Monitor cash position and follow up on outstanding receivables',
          actionUrl: `/cash-flow`,
          actionLabel: 'View Cash Flow',
          data: { date: forecast.forecastDate },
          expiresAt: forecast.forecastDate,
          createdAt: new Date(),
          isRead: false,
          isDismissed: false,
        });
      }
    }

    // Transaction anomalies
    const anomalies = await this.prisma.aiAnomaly.findMany({
      where: {
        organizationId,
        isResolved: false,
        type: { in: ['TRANSACTION', 'SPENDING'] },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    for (const anomaly of anomalies) {
      const priority =
        anomaly.severity === 'CRITICAL'
          ? AlertPriority.CRITICAL
          : anomaly.severity === 'HIGH'
            ? AlertPriority.HIGH
            : AlertPriority.MEDIUM;

      alerts.push({
        id: `anomaly-${anomaly.id}`,
        category: AlertCategory.FINANCIAL,
        priority,
        source: AlertSource.ANOMALY,
        title: `Unusual ${anomaly.type === 'TRANSACTION' ? 'Transaction' : 'Spending'} Detected`,
        description: anomaly.description,
        impact: `Value ${anomaly.value} is ${anomaly.zScore.toNumber().toFixed(1)}σ from expected ${anomaly.expectedValue}`,
        suggestedAction: 'Review the transaction for accuracy',
        sourceEntity: {
          type: anomaly.entityType,
          id: anomaly.entityId,
        },
        data: {
          value: anomaly.value.toNumber(),
          expected: anomaly.expectedValue.toNumber(),
          zScore: anomaly.zScore.toNumber(),
        },
        createdAt: anomaly.createdAt,
        isRead: false,
        isDismissed: false,
      });
    }

    return alerts;
  }

  /**
   * Get collection alerts from payment predictions
   */
  private async getCollectionAlerts(organizationId: string): Promise<UnifiedAlert[]> {
    const alerts: UnifiedAlert[] = [];

    // Overdue invoices
    const overdueInvoices = await this.prisma.invoice.findMany({
      where: {
        organizationId,
        status: 'OVERDUE',
        deletedAt: null,
      },
      include: { customer: true },
      orderBy: { dueDate: 'asc' },
      take: 10,
    });

    for (const invoice of overdueInvoices) {
      const daysOverdue = Math.floor(
        (Date.now() - invoice.dueDate.getTime()) / (1000 * 60 * 60 * 24),
      );

      const priority =
        daysOverdue > 30
          ? AlertPriority.HIGH
          : daysOverdue > 14
            ? AlertPriority.MEDIUM
            : AlertPriority.LOW;

      alerts.push({
        id: `overdue-${invoice.id}`,
        category: AlertCategory.COLLECTION,
        priority,
        source: AlertSource.PAYMENT_PREDICTION,
        title: `Invoice ${invoice.invoiceNumber} is ${daysOverdue} days overdue`,
        description: `${invoice.customer.name} owes ${invoice.balanceDue} (due ${invoice.dueDate.toLocaleDateString()})`,
        suggestedAction: daysOverdue > 30 ? 'Send final notice' : 'Send payment reminder',
        actionUrl: `/invoices/${invoice.id}`,
        actionLabel: 'View Invoice',
        sourceEntity: {
          type: 'invoice',
          id: invoice.id,
          name: invoice.invoiceNumber,
        },
        data: {
          amount: invoice.balanceDue.toNumber(),
          daysOverdue,
          customerId: invoice.customerId,
        },
        createdAt: new Date(),
        isRead: false,
        isDismissed: false,
      });
    }

    return alerts;
  }

  /**
   * Get inventory alerts from reorder points and demand forecasting
   */
  private async getInventoryAlerts(organizationId: string): Promise<UnifiedAlert[]> {
    const alerts: UnifiedAlert[] = [];

    // Low stock alerts
    const reorderAlerts = await this.prisma.itemReorderAnalysis.findMany({
      where: {
        organizationId,
        status: { in: ['LOW_STOCK', 'CRITICAL'] },
      },
      include: { item: true },
      take: 20,
    });

    for (const analysis of reorderAlerts) {
      const priority = analysis.status === 'CRITICAL' ? AlertPriority.HIGH : AlertPriority.MEDIUM;

      alerts.push({
        id: `reorder-${analysis.id}`,
        category: AlertCategory.INVENTORY,
        priority,
        source: AlertSource.REORDER,
        title: `${analysis.status === 'CRITICAL' ? 'Critical' : 'Low'} Stock: ${analysis.item.name}`,
        description: `Current stock (${analysis.item.currentStock}) is below reorder point (${analysis.reorderPoint})`,
        suggestedAction: `Order ${analysis.economicOrderQty} units`,
        actionUrl: `/inventory/items/${analysis.itemId}`,
        actionLabel: 'View Item',
        sourceEntity: {
          type: 'item',
          id: analysis.itemId,
          name: analysis.item.name,
        },
        data: {
          currentStock: analysis.item.currentStock,
          reorderPoint: analysis.reorderPoint,
          eoq: analysis.economicOrderQty,
        },
        createdAt: analysis.calculatedAt,
        isRead: false,
        isDismissed: false,
      });
    }

    // Dead stock alerts
    const deadStock = await this.prisma.itemReorderAnalysis.findMany({
      where: {
        organizationId,
        status: 'DEAD_STOCK',
      },
      include: { item: true },
      take: 10,
    });

    if (deadStock.length > 0) {
      alerts.push({
        id: `dead-stock-${organizationId}`,
        category: AlertCategory.INVENTORY,
        priority: AlertPriority.LOW,
        source: AlertSource.REORDER,
        title: `${deadStock.length} items have dead stock`,
        description: `These items have had zero sales for 90+ days`,
        suggestedAction: 'Consider clearance sales or write-offs',
        actionUrl: `/inventory?filter=dead-stock`,
        actionLabel: 'View Dead Stock',
        data: {
          count: deadStock.length,
          items: deadStock.map((d) => ({ id: d.itemId, name: d.item.name })),
        },
        createdAt: new Date(),
        isRead: false,
        isDismissed: false,
      });
    }

    return alerts;
  }

  /**
   * Get CRM alerts from lead scoring
   */
  private async getCrmAlerts(organizationId: string): Promise<UnifiedAlert[]> {
    const alerts: UnifiedAlert[] = [];

    // Hot leads
    const hotLeads = await this.prisma.leadScore.findMany({
      where: {
        organizationId,
        tier: 'HOT',
        totalScore: { gte: 80 },
      },
      include: { lead: true },
      orderBy: { totalScore: 'desc' },
      take: 5,
    });

    for (const score of hotLeads) {
      if (score.lead) {
        alerts.push({
          id: `hot-lead-${score.leadId}`,
          category: AlertCategory.CRM,
          priority: AlertPriority.HIGH,
          source: AlertSource.LEAD_SCORING,
          title: `Hot Lead: ${score.lead.leadName}`,
          description: `Lead score: ${score.totalScore}. High conversion probability.`,
          suggestedAction: 'Follow up immediately',
          actionUrl: `/crm/leads/${score.leadId}`,
          actionLabel: 'View Lead',
          sourceEntity: {
            type: 'lead',
            id: score.leadId,
            name: score.lead.leadName,
          },
          data: {
            score: score.totalScore,
            probability: score.conversionProbability.toNumber(),
          },
          createdAt: score.lastScoredAt,
          isRead: false,
          isDismissed: false,
        });
      }
    }

    // Stale deals
    const staleDeals = await this.prisma.deal.findMany({
      where: {
        organizationId,
        stage: { notIn: ['WON', 'LOST'] },
        updatedAt: {
          lt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000), // 14 days
        },
        deletedAt: null,
      },
      include: { customer: true, lead: true },
      take: 10,
    });

    for (const deal of staleDeals) {
      const daysSinceUpdate = Math.floor(
        (Date.now() - deal.updatedAt.getTime()) / (1000 * 60 * 60 * 24),
      );

      alerts.push({
        id: `stale-deal-${deal.id}`,
        category: AlertCategory.CRM,
        priority: AlertPriority.MEDIUM,
        source: AlertSource.LEAD_SCORING,
        title: `Deal "${deal.dealName}" is stale`,
        description: `No activity for ${daysSinceUpdate} days. Stage: ${deal.stage}`,
        suggestedAction: 'Update deal status or schedule follow-up',
        actionUrl: `/crm/deals/${deal.id}`,
        actionLabel: 'View Deal',
        sourceEntity: {
          type: 'deal',
          id: deal.id,
          name: deal.dealName,
        },
        data: {
          stage: deal.stage,
          amount: deal.expectedAmount.toNumber(),
          daysSinceUpdate,
        },
        createdAt: new Date(),
        isRead: false,
        isDismissed: false,
      });
    }

    return alerts;
  }

  /**
   * Get compliance alerts
   */
  private async getComplianceAlerts(organizationId: string): Promise<UnifiedAlert[]> {
    const alerts: UnifiedAlert[] = [];

    // VAT return deadlines
    const pendingVatReturns = await this.prisma.vATReturn.findMany({
      where: {
        organizationId,
        status: 'DRAFT',
        dueDate: {
          lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Within 7 days
        },
      },
    });

    for (const vatReturn of pendingVatReturns) {
      // Skip if dueDate is null
      if (!vatReturn.dueDate) continue;

      const daysUntilDue = Math.ceil(
        (vatReturn.dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
      );

      const priority =
        daysUntilDue <= 3
          ? AlertPriority.CRITICAL
          : daysUntilDue <= 5
            ? AlertPriority.HIGH
            : AlertPriority.MEDIUM;

      alerts.push({
        id: `vat-due-${vatReturn.id}`,
        category: AlertCategory.COMPLIANCE,
        priority,
        source: AlertSource.TAX_COMPLIANCE,
        title: `VAT Return due in ${daysUntilDue} days`,
        description: `${vatReturn.period} VAT return needs to be filed by ${vatReturn.dueDate.toLocaleDateString()}`,
        suggestedAction: 'Complete and submit VAT return',
        actionUrl: `/tax/vat-returns/${vatReturn.id}`,
        actionLabel: 'View VAT Return',
        sourceEntity: {
          type: 'vat_return',
          id: vatReturn.id,
        },
        data: {
          period: vatReturn.period,
          dueDate: vatReturn.dueDate,
          daysUntilDue,
        },
        expiresAt: vatReturn.dueDate,
        createdAt: new Date(),
        isRead: false,
        isDismissed: false,
      });
    }

    // Unreconciled transactions
    const unreconciledCount = await this.prisma.bankTransaction.count({
      where: {
        organizationId,
        status: 'PENDING',
        date: {
          lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Older than 30 days
        },
      },
    });

    if (unreconciledCount > 0) {
      alerts.push({
        id: `unreconciled-${organizationId}`,
        category: AlertCategory.COMPLIANCE,
        priority: unreconciledCount > 50 ? AlertPriority.HIGH : AlertPriority.MEDIUM,
        source: AlertSource.ANOMALY,
        title: `${unreconciledCount} unreconciled transactions`,
        description: `Bank transactions older than 30 days need attention`,
        suggestedAction: 'Review and reconcile outstanding transactions',
        actionUrl: `/banking/reconciliation`,
        actionLabel: 'Reconcile Now',
        data: { count: unreconciledCount },
        createdAt: new Date(),
        isRead: false,
        isDismissed: false,
      });
    }

    return alerts;
  }

  /**
   * Get HR alerts
   */
  private async getHrAlerts(organizationId: string): Promise<UnifiedAlert[]> {
    const alerts: UnifiedAlert[] = [];

    // Payroll anomalies
    const payrollAnomalies = await this.prisma.aiAnomaly.findMany({
      where: {
        organizationId,
        type: { in: ['PAYROLL', 'OVERTIME'] },
        isResolved: false,
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    for (const anomaly of payrollAnomalies) {
      const priority =
        anomaly.severity === 'CRITICAL' || anomaly.severity === 'HIGH'
          ? AlertPriority.HIGH
          : AlertPriority.MEDIUM;

      alerts.push({
        id: `hr-anomaly-${anomaly.id}`,
        category: AlertCategory.HR,
        priority,
        source: AlertSource.PAYROLL,
        title:
          anomaly.type === 'OVERTIME' ? 'Overtime Anomaly Detected' : 'Payroll Anomaly Detected',
        description: anomaly.description,
        suggestedAction: 'Review and verify the data',
        sourceEntity: {
          type: anomaly.entityType,
          id: anomaly.entityId,
        },
        data: {
          value: anomaly.value.toNumber(),
          expected: anomaly.expectedValue.toNumber(),
        },
        createdAt: anomaly.createdAt,
        isRead: false,
        isDismissed: false,
      });
    }

    return alerts;
  }

  // ============ Helper Methods ============

  /**
   * Find existing alert to avoid duplicates
   */
  private async findExistingAlert(organizationId: string, source: AlertSource, entityId?: string) {
    return this.prisma.aIInsight.findFirst({
      where: {
        organizationId,
        type: 'ALERT',
        aiSource: source,
        sourceEntityId: entityId || null,
        isDismissed: false,
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Within last 24 hours
        },
      },
    });
  }

  /**
   * Map priority to legacy severity field
   */
  private mapPriorityToSeverity(priority: AlertPriority): string {
    switch (priority) {
      case AlertPriority.CRITICAL:
        return 'critical';
      case AlertPriority.HIGH:
        return 'warning';
      case AlertPriority.MEDIUM:
        return 'info';
      case AlertPriority.LOW:
        return 'info';
      default:
        return 'info';
    }
  }

  /**
   * Map database record to UnifiedAlert
   */
  private mapToUnifiedAlert(record: AIInsight): UnifiedAlert {
    return {
      id: record.id,
      category: record.category as AlertCategory,
      priority: record.priority as AlertPriority,
      source: record.aiSource as AlertSource,
      title: record.title,
      description: record.description,
      impact: record.impact ?? undefined,
      suggestedAction: record.suggestedAction ?? undefined,
      actionUrl: record.actionUrl ?? undefined,
      actionLabel: record.actionLabel ?? undefined,
      sourceEntity: record.sourceEntityId
        ? {
            type: record.sourceEntityType as string,
            id: record.sourceEntityId,
          }
        : undefined,
      data: record.data as Record<string, unknown> | undefined,
      expiresAt: record.expiresAt ?? undefined,
      createdAt: record.createdAt,
      isRead: record.isRead,
      isDismissed: record.isDismissed,
    };
  }
}
