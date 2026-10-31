import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
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
import { forEachOrganization } from './for-each-organization';

@Injectable()
export class AiOperationsScheduler {
  private readonly logger = new Logger(AiOperationsScheduler.name);

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
  ) {}

  /**
   * Daily anomaly scan - runs at 2 AM
   * Scans all organizations for transaction anomalies
   */
  @Cron('0 2 * * *')
  async runDailyAnomalyScan() {
    let totalAnomalies = 0;

    await forEachOrganization(
      this.prisma,
      this.logger,
      {
        name: 'daily anomaly scan',
        failure: 'scanning anomalies',
        completed: () => `Daily anomaly scan completed. Total anomalies found: ${totalAnomalies}`,
      },
      async (org) => {
        const result = await this.anomalyService.dailyAnomalyScan(org.id);
        totalAnomalies += result.newAnomaliesCreated;

        if (result.newAnomaliesCreated > 0) {
          this.logger.log(`Org ${org.name}: Found ${result.newAnomaliesCreated} anomalies`);
        }
      },
    );
  }

  /**
   * Weekly reorder points update - runs every Sunday at midnight
   * Recalculates reorder points and safety stock for all items
   */
  @Cron('0 0 * * 0')
  async runWeeklyReorderUpdate() {
    await forEachOrganization(
      this.prisma,
      this.logger,
      { name: 'weekly reorder points update', failure: 'updating reorder points' },
      async (org) => {
        const result = await this.reorderService.updateItemReorderPoints(org.id);
        this.logger.log(`Org ${org.name}: Updated ${result.updated} item reorder points`);
      },
    );
  }

  /**
   * Weekly demand forecasting update - runs every Sunday at 1 AM
   * Uses Holt-Winters Triple Exponential Smoothing for all inventory items
   */
  @Cron('0 1 * * 0')
  async runWeeklyDemandForecast() {
    await forEachOrganization(
      this.prisma,
      this.logger,
      { name: 'weekly demand forecast update', failure: 'updating demand forecasts' },
      async (org) => {
        const result = await this.demandForecastingService.forecastAllItems(org.id);

        this.logger.log(
          `Org ${org.name}: Processed ${result.processed} items, skipped ${result.skipped} (insufficient data)`,
        );

        if (result.errors.length > 0) {
          this.logger.warn(`Org ${org.name}: ${result.errors.length} errors during forecasting`);
        }
      },
    );
  }

  /**
   * Daily cash flow prediction update - runs at 3 AM
   * Uses Monte Carlo simulation for probabilistic cash flow forecasting
   */
  @Cron('0 3 * * *')
  async runDailyCashFlowPrediction() {
    await forEachOrganization(
      this.prisma,
      this.logger,
      { name: 'daily cash flow prediction update', failure: 'updating cash flow' },
      async (org) => {
        const result = await this.cashFlowPredictionService.dailyRecalculate(org.id);

        this.logger.log(`Org ${org.name}: Updated ${result.updated} days of cash flow forecasts`);
      },
    );
  }

  /**
   * Weekly lead scoring update - runs every Sunday at midnight
   * Rescores all leads and applies decay for inactivity
   */
  @Cron('0 0 * * 0')
  async runWeeklyLeadScoringUpdate() {
    await forEachOrganization(
      this.prisma,
      this.logger,
      { name: 'weekly lead scoring update', failure: 'updating lead scores' },
      async (org) => {
        const result = await this.leadScoringService.updateScores(org.id);

        this.logger.log(
          `Org ${org.name}: Updated ${result.updated} lead scores, ${result.decayed} leads had decay applied`,
        );
      },
    );
  }

  /**
   * Payment predictions update - runs every Sunday at 2 AM
   * Recalculates payment predictions for all outstanding invoices
   */
  @Cron('0 2 * * 0')
  async runWeeklyPaymentPredictionUpdate() {
    await forEachOrganization(
      this.prisma,
      this.logger,
      { name: 'weekly payment prediction update', failure: 'updating payment predictions' },
      async (org) => {
        const result = await this.paymentPredictionService.updatePredictions(org.id);
        this.logger.log(`Org ${org.name}: Updated ${result.updated} payment predictions`);
      },
    );
  }

  /**
   * Monthly narrative generation - runs on the 1st of each month at 6 AM
   * Generates and stores monthly financial narratives for all organizations
   */
  @Cron('0 6 1 * *')
  async runMonthlyNarrativeGeneration() {
    // Generate narrative for the previous month
    const prevMonth = new Date();
    prevMonth.setMonth(prevMonth.getMonth() - 1);
    const month = prevMonth.getMonth() + 1;
    const year = prevMonth.getFullYear();

    await forEachOrganization(
      this.prisma,
      this.logger,
      { name: 'monthly narrative generation', failure: 'generating narrative' },
      async (org) => {
        const narrative = await this.narrativeService.generateMonthlyNarrative(org.id, month, year);

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
      },
    );
  }

  /**
   * Weekly pattern detection analysis - runs every Sunday at 3 AM
   * Detects recurring transaction patterns and generates suggestions
   */
  @Cron('0 3 * * 0')
  async runWeeklyPatternDetection() {
    await forEachOrganization(
      this.prisma,
      this.logger,
      { name: 'weekly pattern detection analysis', failure: 'analyzing patterns' },
      async (org) => {
        const result = await this.patternDetectionService.analyzePatterns(org.id);

        this.logger.log(
          `Org ${org.name}: Detected ${result.patternsDetected} patterns, created ${result.suggestionsCreated} suggestions, found ${result.duplicatesFound} potential duplicates`,
        );
      },
    );
  }

  /**
   * AI alerts aggregation - runs every 4 hours at :30
   * Collects alerts from all AI services and creates unified notifications
   */
  @Cron('30 */4 * * *')
  async runHourlyAlertAggregation() {
    await forEachOrganization(
      this.prisma,
      this.logger,
      { name: 'hourly AI alerts aggregation', failure: 'aggregating alerts' },
      async (org) => {
        const result = await this.aiAlertsService.aggregateAlerts(org.id);

        if (result.created > 0 || result.updated > 0) {
          this.logger.log(
            `Org ${org.name}: Created ${result.created} new alerts, updated ${result.updated}, expired ${result.expired}`,
          );
        }
      },
    );
  }

  /**
   * Daily AI alerts cleanup - runs at 4 AM
   * Removes expired alerts and old dismissed alerts
   */
  @Cron('0 4 * * *')
  async runDailyAlertCleanup() {
    let totalCleaned = 0;

    await forEachOrganization(
      this.prisma,
      this.logger,
      {
        name: 'daily AI alerts cleanup',
        failure: 'cleaning up alerts',
        completed: () => `Daily AI alerts cleanup completed. Cleaned ${totalCleaned} alerts`,
      },
      async (org) => {
        const cleaned = await this.aiAlertsService.cleanupExpiredAlerts(org.id);
        totalCleaned += cleaned;
      },
    );
  }

  /**
   * Mark stale patterns - runs every Sunday at 5 AM
   * Marks patterns as stale if no new occurrences in 90+ days
   */
  @Cron('0 5 * * 0')
  async runWeeklyStalePatternCheck() {
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
    await forEachOrganization(
      this.prisma,
      this.logger,
      { name: 'monthly ABC analysis', failure: 'running ABC analysis' },
      async (org) => {
        const result = await this.reorderService.recalculateWithAbcServiceLevels(org.id);

        this.logger.log(
          `Org ${org.name}: ABC analysis updated ${result.updated} items ` +
            `(A:${result.byCategory.A}, B:${result.byCategory.B}, C:${result.byCategory.C})`,
        );
      },
    );
  }
}
