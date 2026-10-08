import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { AnomalyDetectionService } from '../services/anomaly-detection.service';
import { ReorderPointsService } from '../services/reorder-points.service';
import { PaymentPredictionService } from '../services/payment-prediction.service';
import { FinancialNarrativeService } from '../services/financial-narrative.service';
import { DemandForecastingService } from '../services/demand-forecasting.service';
import { CashFlowPredictionService } from '../services/cash-flow-prediction.service';
import { LeadScoringService } from '../services/lead-scoring.service';
import { PatternDetectionService } from '../services/pattern-detection.service';
import { AiAlertsService } from '../services/ai-alerts.service';
import { describeError } from '../../../common/utils/redact';

const BATCH_SIZE = 5;

@Injectable()
export class AiOperationsScheduler {
  private readonly logger = new Logger(AiOperationsScheduler.name);
  private readonly enabled: boolean;

  constructor(
    private prisma: PrismaService,
    private anomalyService: AnomalyDetectionService,
    private reorderService: ReorderPointsService,
    private paymentPredictionService: PaymentPredictionService,
    private narrativeService: FinancialNarrativeService,
    private demandForecastingService: DemandForecastingService,
    private cashFlowPredictionService: CashFlowPredictionService,
    private leadScoringService: LeadScoringService,
    private patternDetectionService: PatternDetectionService,
    private aiAlertsService: AiAlertsService,
    private config: ConfigService,
  ) {
    this.enabled = config.get('AI_SCHEDULERS_ENABLED') === 'true';
    if (!this.enabled) {
      this.logger.log(
        'AI_SCHEDULERS_ENABLED is not set to true; AI Operations schedulers are disabled',
      );
    }
  }

  private guard(): boolean {
    if (!this.enabled) {
      this.logger.debug('AI scheduler skipped (AI_SCHEDULERS_ENABLED != true)');
      return false;
    }
    return true;
  }

  /**
   * Daily anomaly scan - runs at 2 AM
   * Scans all organizations for transaction anomalies
   */
  @Cron('0 2 * * *')
  async runDailyAnomalyScan() {
    if (!this.guard()) return;
    this.logger.log('Starting daily anomaly scan...');

    try {
      // Get all active organizations
      const organizations = await this.prisma.organization.findMany({
        where: {},
        select: { id: true, name: true },
      });

      let totalAnomalies = 0;

      for (let i = 0; i < organizations.length; i += BATCH_SIZE) {
        const batch = organizations.slice(i, i + BATCH_SIZE);
        const results = await Promise.allSettled(
          batch.map(async (org) => {
            try {
              const result = await this.anomalyService.dailyAnomalyScan(org.id);
              totalAnomalies += result.newAnomaliesCreated;

              if (result.newAnomaliesCreated > 0) {
                this.logger.log(`Org ${org.name}: Found ${result.newAnomaliesCreated} anomalies`);
              }
            } catch (error) {
              this.logger.error(
                `Error scanning anomalies for org ${org.id}: ${describeError(error)}`,
              );
            }
          }),
        );
        // Log any unexpected rejections
        for (const r of results) {
          if (r.status === 'rejected') {
            this.logger.error(`Scheduler batch rejection: ${describeError(r.reason)}`);
          }
        }
      }

      this.logger.log(`Daily anomaly scan completed. Total anomalies found: ${totalAnomalies}`);
    } catch (error) {
      this.logger.error(`Daily anomaly scan failed: ${describeError(error)}`);
    }
  }

  /**
   * Weekly reorder points update - runs every Sunday at midnight
   * Recalculates reorder points and safety stock for all items
   */
  @Cron('0 0 * * 0')
  async runWeeklyReorderUpdate() {
    if (!this.guard()) return;
    this.logger.log('Starting weekly reorder points update...');

    try {
      const organizations = await this.prisma.organization.findMany({
        where: {},
        select: { id: true, name: true },
      });

      for (let i = 0; i < organizations.length; i += BATCH_SIZE) {
        const batch = organizations.slice(i, i + BATCH_SIZE);
        const results = await Promise.allSettled(
          batch.map(async (org) => {
            try {
              const result = await this.reorderService.updateItemReorderPoints(org.id);
              this.logger.log(`Org ${org.name}: Updated ${result.updated} item reorder points`);
            } catch (error) {
              this.logger.error(
                `Error updating reorder points for org ${org.id}: ${describeError(error)}`,
              );
            }
          }),
        );
        // Log any unexpected rejections
        for (const r of results) {
          if (r.status === 'rejected') {
            this.logger.error(`Scheduler batch rejection: ${describeError(r.reason)}`);
          }
        }
      }

      this.logger.log('Weekly reorder points update completed');
    } catch (error) {
      this.logger.error(`Weekly reorder points update failed: ${describeError(error)}`);
    }
  }

  /**
   * Weekly demand forecasting update - runs every Sunday at 1 AM
   * Uses Holt-Winters Triple Exponential Smoothing for all inventory items
   */
  @Cron('0 1 * * 0')
  async runWeeklyDemandForecast() {
    if (!this.guard()) return;
    this.logger.log('Starting weekly demand forecast update...');

    try {
      const organizations = await this.prisma.organization.findMany({
        where: {},
        select: { id: true, name: true },
      });

      for (let i = 0; i < organizations.length; i += BATCH_SIZE) {
        const batch = organizations.slice(i, i + BATCH_SIZE);
        const results = await Promise.allSettled(
          batch.map(async (org) => {
            try {
              const result = await this.demandForecastingService.forecastAllItems(org.id);

              this.logger.log(
                `Org ${org.name}: Processed ${result.processed} items, skipped ${result.skipped} (insufficient data)`,
              );

              if (result.errors.length > 0) {
                this.logger.warn(
                  `Org ${org.name}: ${result.errors.length} errors during forecasting`,
                );
              }
            } catch (error) {
              this.logger.error(
                `Error updating demand forecasts for org ${org.id}: ${describeError(error)}`,
              );
            }
          }),
        );
        // Log any unexpected rejections
        for (const r of results) {
          if (r.status === 'rejected') {
            this.logger.error(`Scheduler batch rejection: ${describeError(r.reason)}`);
          }
        }
      }

      this.logger.log('Weekly demand forecast update completed');
    } catch (error) {
      this.logger.error(`Weekly demand forecast update failed: ${describeError(error)}`);
    }
  }

  /**
   * Daily cash flow prediction update - runs at 3 AM
   * Uses Monte Carlo simulation for probabilistic cash flow forecasting
   */
  @Cron('0 3 * * *')
  async runDailyCashFlowPrediction() {
    if (!this.guard()) return;
    this.logger.log('Starting daily cash flow prediction update...');

    try {
      const organizations = await this.prisma.organization.findMany({
        where: {},
        select: { id: true, name: true },
      });

      for (let i = 0; i < organizations.length; i += BATCH_SIZE) {
        const batch = organizations.slice(i, i + BATCH_SIZE);
        const results = await Promise.allSettled(
          batch.map(async (org) => {
            try {
              const result = await this.cashFlowPredictionService.dailyRecalculate(org.id);

              this.logger.log(
                `Org ${org.name}: Updated ${result.updated} days of cash flow forecasts`,
              );
            } catch (error) {
              this.logger.error(
                `Error updating cash flow for org ${org.id}: ${describeError(error)}`,
              );
            }
          }),
        );
        // Log any unexpected rejections
        for (const r of results) {
          if (r.status === 'rejected') {
            this.logger.error(`Scheduler batch rejection: ${describeError(r.reason)}`);
          }
        }
      }

      this.logger.log('Daily cash flow prediction update completed');
    } catch (error) {
      this.logger.error(`Daily cash flow prediction update failed: ${describeError(error)}`);
    }
  }

  /**
   * Weekly lead scoring update - runs every Sunday at midnight
   * Rescores all leads and applies decay for inactivity
   */
  @Cron('0 0 * * 0')
  async runWeeklyLeadScoringUpdate() {
    if (!this.guard()) return;
    this.logger.log('Starting weekly lead scoring update...');

    try {
      const organizations = await this.prisma.organization.findMany({
        where: {},
        select: { id: true, name: true },
      });

      for (let i = 0; i < organizations.length; i += BATCH_SIZE) {
        const batch = organizations.slice(i, i + BATCH_SIZE);
        const results = await Promise.allSettled(
          batch.map(async (org) => {
            try {
              const result = await this.leadScoringService.updateScores(org.id);

              this.logger.log(
                `Org ${org.name}: Updated ${result.updated} lead scores, ${result.decayed} leads had decay applied`,
              );
            } catch (error) {
              this.logger.error(
                `Error updating lead scores for org ${org.id}: ${describeError(error)}`,
              );
            }
          }),
        );
        // Log any unexpected rejections
        for (const r of results) {
          if (r.status === 'rejected') {
            this.logger.error(`Scheduler batch rejection: ${describeError(r.reason)}`);
          }
        }
      }

      this.logger.log('Weekly lead scoring update completed');
    } catch (error) {
      this.logger.error(`Weekly lead scoring update failed: ${describeError(error)}`);
    }
  }

  /**
   * Payment predictions update - runs every Sunday at 2 AM
   * Recalculates payment predictions for all outstanding invoices
   */
  @Cron('0 2 * * 0')
  async runWeeklyPaymentPredictionUpdate() {
    if (!this.guard()) return;
    this.logger.log('Starting weekly payment prediction update...');

    try {
      const organizations = await this.prisma.organization.findMany({
        where: {},
        select: { id: true, name: true },
      });

      for (let i = 0; i < organizations.length; i += BATCH_SIZE) {
        const batch = organizations.slice(i, i + BATCH_SIZE);
        const results = await Promise.allSettled(
          batch.map(async (org) => {
            try {
              const result = await this.paymentPredictionService.updatePredictions(org.id);
              this.logger.log(`Org ${org.name}: Updated ${result.updated} payment predictions`);
            } catch (error) {
              this.logger.error(
                `Error updating payment predictions for org ${org.id}: ${describeError(error)}`,
              );
            }
          }),
        );
        // Log any unexpected rejections
        for (const r of results) {
          if (r.status === 'rejected') {
            this.logger.error(`Scheduler batch rejection: ${describeError(r.reason)}`);
          }
        }
      }

      this.logger.log('Weekly payment prediction update completed');
    } catch (error) {
      this.logger.error(`Weekly payment prediction update failed: ${describeError(error)}`);
    }
  }

  /**
   * Monthly narrative generation - runs on the 1st of each month at 6 AM
   * Generates and stores monthly financial narratives for all organizations
   */
  @Cron('0 6 1 * *')
  async runMonthlyNarrativeGeneration() {
    if (!this.guard()) return;
    this.logger.log('Starting monthly narrative generation...');

    try {
      const organizations = await this.prisma.organization.findMany({
        where: {},
        select: { id: true, name: true },
      });

      // Generate narrative for the previous month
      const prevMonth = new Date();
      prevMonth.setMonth(prevMonth.getMonth() - 1);
      const month = prevMonth.getMonth() + 1;
      const year = prevMonth.getFullYear();

      for (let i = 0; i < organizations.length; i += BATCH_SIZE) {
        const batch = organizations.slice(i, i + BATCH_SIZE);
        const results = await Promise.allSettled(
          batch.map(async (org) => {
            try {
              const narrative = await this.narrativeService.generateMonthlyNarrative(
                org.id,
                month,
                year,
              );

              // Store as AI Insight for historical reference
              await this.prisma.aIInsight.create({
                data: {
                  organizationId: org.id,
                  type: 'NARRATIVE',
                  severity: 'info',
                  priority: 'MEDIUM',
                  title: `Monthly Summary - ${prevMonth.toLocaleString('default', { month: 'long' })} ${year}`,
                  description:
                    narrative.summary ||
                    narrative.sections
                      .map((s) => s.content)
                      .join(' ')
                      .slice(0, 500),
                  data: narrative as unknown as import('@prisma/client').Prisma.InputJsonValue,
                },
              });

              this.logger.log(`Org ${org.name}: Monthly narrative generated for ${month}/${year}`);
            } catch (error) {
              this.logger.error(
                `Error generating narrative for org ${org.id}: ${describeError(error)}`,
              );
            }
          }),
        );
        // Log any unexpected rejections
        for (const r of results) {
          if (r.status === 'rejected') {
            this.logger.error(`Scheduler batch rejection: ${describeError(r.reason)}`);
          }
        }
      }

      this.logger.log('Monthly narrative generation completed');
    } catch (error) {
      this.logger.error(`Monthly narrative generation failed: ${describeError(error)}`);
    }
  }

  /**
   * Weekly pattern detection analysis - runs every Sunday at 3 AM
   * Detects recurring transaction patterns and generates suggestions
   */
  @Cron('0 3 * * 0')
  async runWeeklyPatternDetection() {
    if (!this.guard()) return;
    this.logger.log('Starting weekly pattern detection analysis...');

    try {
      const organizations = await this.prisma.organization.findMany({
        where: {},
        select: { id: true, name: true },
      });

      for (let i = 0; i < organizations.length; i += BATCH_SIZE) {
        const batch = organizations.slice(i, i + BATCH_SIZE);
        const results = await Promise.allSettled(
          batch.map(async (org) => {
            try {
              const result = await this.patternDetectionService.analyzePatterns(org.id);

              this.logger.log(
                `Org ${org.name}: Detected ${result.patternsDetected} patterns, created ${result.suggestionsCreated} suggestions, found ${result.duplicatesFound} potential duplicates`,
              );
            } catch (error) {
              this.logger.error(
                `Error analyzing patterns for org ${org.id}: ${describeError(error)}`,
              );
            }
          }),
        );
        // Log any unexpected rejections
        for (const r of results) {
          if (r.status === 'rejected') {
            this.logger.error(`Scheduler batch rejection: ${describeError(r.reason)}`);
          }
        }
      }

      this.logger.log('Weekly pattern detection analysis completed');
    } catch (error) {
      this.logger.error(`Weekly pattern detection analysis failed: ${describeError(error)}`);
    }
  }

  /**
   * AI alerts aggregation - runs every 4 hours at :30
   * Collects alerts from all AI services and creates unified notifications
   */
  @Cron('30 */4 * * *')
  async runHourlyAlertAggregation() {
    if (!this.guard()) return;
    this.logger.log('Starting hourly AI alerts aggregation...');

    try {
      const organizations = await this.prisma.organization.findMany({
        where: {},
        select: { id: true, name: true },
      });

      for (let i = 0; i < organizations.length; i += BATCH_SIZE) {
        const batch = organizations.slice(i, i + BATCH_SIZE);
        const results = await Promise.allSettled(
          batch.map(async (org) => {
            try {
              const result = await this.aiAlertsService.aggregateAlerts(org.id);

              if (result.created > 0 || result.updated > 0) {
                this.logger.log(
                  `Org ${org.name}: Created ${result.created} new alerts, updated ${result.updated}, expired ${result.expired}`,
                );
              }
            } catch (error) {
              this.logger.error(
                `Error aggregating alerts for org ${org.id}: ${describeError(error)}`,
              );
            }
          }),
        );
        // Log any unexpected rejections
        for (const r of results) {
          if (r.status === 'rejected') {
            this.logger.error(`Scheduler batch rejection: ${describeError(r.reason)}`);
          }
        }
      }

      this.logger.log('Hourly AI alerts aggregation completed');
    } catch (error) {
      this.logger.error(`Hourly AI alerts aggregation failed: ${describeError(error)}`);
    }
  }

  /**
   * Daily AI alerts cleanup - runs at 4 AM
   * Removes expired alerts and old dismissed alerts
   */
  @Cron('0 4 * * *')
  async runDailyAlertCleanup() {
    if (!this.guard()) return;
    this.logger.log('Starting daily AI alerts cleanup...');

    try {
      const organizations = await this.prisma.organization.findMany({
        where: {},
        select: { id: true, name: true },
      });

      let totalCleaned = 0;

      for (let i = 0; i < organizations.length; i += BATCH_SIZE) {
        const batch = organizations.slice(i, i + BATCH_SIZE);
        const results = await Promise.allSettled(
          batch.map(async (org) => {
            try {
              const cleaned = await this.aiAlertsService.cleanupExpiredAlerts(org.id);
              totalCleaned += cleaned;
            } catch (error) {
              this.logger.error(
                `Error cleaning up alerts for org ${org.id}: ${describeError(error)}`,
              );
            }
          }),
        );
        // Log any unexpected rejections
        for (const r of results) {
          if (r.status === 'rejected') {
            this.logger.error(`Scheduler batch rejection: ${describeError(r.reason)}`);
          }
        }
      }

      this.logger.log(`Daily AI alerts cleanup completed. Cleaned ${totalCleaned} alerts`);
    } catch (error) {
      this.logger.error(`Daily AI alerts cleanup failed: ${describeError(error)}`);
    }
  }

  /**
   * Mark stale patterns - runs every Sunday at 5 AM
   * Marks patterns as stale if no new occurrences in 90+ days
   */
  @Cron('0 5 * * 0')
  async runWeeklyStalePatternCheck() {
    if (!this.guard()) return;
    this.logger.log('Starting weekly stale pattern check...');

    try {
      const staleDate = new Date();
      staleDate.setDate(staleDate.getDate() - 90);

      const result = await this.prisma.transactionPattern.updateMany({
        where: {
          status: 'DETECTED',
          lastOccurrence: {
            lt: staleDate,
          },
        },
        data: {
          status: 'STALE',
        },
      });

      this.logger.log(`Marked ${result.count} patterns as stale`);
    } catch (error) {
      this.logger.error(`Weekly stale pattern check failed: ${describeError(error)}`);
    }
  }

  /**
   * Cleanup old AI data - runs weekly on Saturday at 4 AM
   * Removes old predictions and resolved anomalies
   */
  @Cron('0 4 * * 6')
  async runWeeklyCleanup() {
    if (!this.guard()) return;
    this.logger.log('Starting weekly AI data cleanup...');

    try {
      // Delete predictions older than 90 days
      const deletedPredictions = await this.prisma.aiPrediction.deleteMany({
        where: {
          createdAt: {
            lt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
          },
        },
      });

      this.logger.log(`Deleted ${deletedPredictions.count} old predictions`);

      // Delete old resolved anomalies older than 1 year
      const resolvedAnomalies = await this.prisma.aiAnomaly.deleteMany({
        where: {
          isResolved: true,
          resolvedAt: {
            lt: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
          },
        },
      });

      this.logger.log(`Deleted ${resolvedAnomalies.count} old resolved anomalies`);

      this.logger.log('Weekly AI data cleanup completed');
    } catch (error) {
      this.logger.error(`Weekly AI data cleanup failed: ${describeError(error)}`);
    }
  }

  /**
   * Monthly ABC analysis - runs on the 1st of each month at 2 AM
   * Reclassifies items and adjusts service levels accordingly
   */
  @Cron('0 2 1 * *')
  async runMonthlyAbcAnalysis() {
    if (!this.guard()) return;
    this.logger.log('Starting monthly ABC analysis...');

    try {
      const organizations = await this.prisma.organization.findMany({
        where: {},
        select: { id: true, name: true },
      });

      for (let i = 0; i < organizations.length; i += BATCH_SIZE) {
        const batch = organizations.slice(i, i + BATCH_SIZE);
        const results = await Promise.allSettled(
          batch.map(async (org) => {
            try {
              const result = await this.reorderService.recalculateWithAbcServiceLevels(org.id);

              this.logger.log(
                `Org ${org.name}: ABC analysis updated ${result.updated} items ` +
                  `(A:${result.byCategory.A}, B:${result.byCategory.B}, C:${result.byCategory.C})`,
              );
            } catch (error) {
              this.logger.error(
                `Error running ABC analysis for org ${org.id}: ${describeError(error)}`,
              );
            }
          }),
        );
        // Log any unexpected rejections
        for (const r of results) {
          if (r.status === 'rejected') {
            this.logger.error(`Scheduler batch rejection: ${describeError(r.reason)}`);
          }
        }
      }

      this.logger.log('Monthly ABC analysis completed');
    } catch (error) {
      this.logger.error(`Monthly ABC analysis failed: ${describeError(error)}`);
    }
  }
}
