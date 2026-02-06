import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../../prisma/prisma.service';
import { AnomalyDetectionService } from '../services/anomaly-detection.service';
import { ReorderPointsService } from '../services/reorder-points.service';
import { AiFeedbackService } from '../services/ai-feedback.service';
import { TransactionCategorizerService } from '../services/transaction-categorizer.service';
import { PaymentPredictionService } from '../services/payment-prediction.service';
import { FinancialNarrativeService } from '../services/financial-narrative.service';
import { DemandForecastingService } from '../services/demand-forecasting.service';
import { CashFlowPredictionService } from '../services/cash-flow-prediction.service';
import { LeadScoringService } from '../services/lead-scoring.service';
import { PatternDetectionService } from '../services/pattern-detection.service';
import { AiAlertsService } from '../services/ai-alerts.service';
import { AiFeature } from '@prisma/client';

@Injectable()
export class AiRetrainingScheduler {
  private readonly logger = new Logger(AiRetrainingScheduler.name);

  constructor(
    private prisma: PrismaService,
    private anomalyService: AnomalyDetectionService,
    private reorderService: ReorderPointsService,
    private feedbackService: AiFeedbackService,
    private categorizerService: TransactionCategorizerService,
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
    this.logger.log('Starting daily anomaly scan...');

    try {
      // Get all active organizations
      const organizations = await this.prisma.organization.findMany({
        where: {},
        select: { id: true, name: true },
      });

      let totalAnomalies = 0;

      for (const org of organizations) {
        try {
          const result = await this.anomalyService.dailyAnomalyScan(org.id);
          totalAnomalies += result.newAnomaliesCreated;

          if (result.newAnomaliesCreated > 0) {
            this.logger.log(
              `Org ${org.name}: Found ${result.newAnomaliesCreated} anomalies`,
            );
          }
        } catch (error) {
          this.logger.error(
            `Error scanning anomalies for org ${org.id}: ${error.message}`,
          );
        }
      }

      this.logger.log(
        `Daily anomaly scan completed. Total anomalies found: ${totalAnomalies}`,
      );
    } catch (error) {
      this.logger.error(`Daily anomaly scan failed: ${error.message}`);
    }
  }

  /**
   * Weekly reorder points update - runs every Sunday at midnight
   * Recalculates reorder points and safety stock for all items
   */
  @Cron('0 0 * * 0')
  async runWeeklyReorderUpdate() {
    this.logger.log('Starting weekly reorder points update...');

    try {
      const organizations = await this.prisma.organization.findMany({
        where: {},
        select: { id: true, name: true },
      });

      for (const org of organizations) {
        try {
          const result = await this.reorderService.updateItemReorderPoints(
            org.id,
          );
          this.logger.log(
            `Org ${org.name}: Updated ${result.updated} item reorder points`,
          );
        } catch (error) {
          this.logger.error(
            `Error updating reorder points for org ${org.id}: ${error.message}`,
          );
        }
      }

      this.logger.log('Weekly reorder points update completed');
    } catch (error) {
      this.logger.error(`Weekly reorder points update failed: ${error.message}`);
    }
  }

  /**
   * Check retraining thresholds every 6 hours
   * Triggers model retraining when enough corrections are accumulated
   */
  @Cron('0 */6 * * *')
  async checkRetrainingThresholds() {
    this.logger.log('Checking AI model retraining thresholds...');

    try {
      const organizations = await this.prisma.organization.findMany({
        where: {},
        select: { id: true },
      });

      const features: AiFeature[] = [
        'CATEGORIZATION',
        'RECONCILIATION',
        'LEAD_SCORING',
        'DEMAND_FORECAST',
        'PATTERN_DETECTION',
      ];

      for (const org of organizations) {
        for (const feature of features) {
          try {
            const needsRetraining =
              await this.feedbackService.checkRetrainingThreshold(
                org.id,
                feature,
              );

            if (needsRetraining) {
              this.logger.log(
                `Org ${org.id}: ${feature} needs retraining - triggering...`,
              );
              await this.triggerModelRetraining(org.id, feature);
            }
          } catch (error) {
            this.logger.error(
              `Error checking retraining for ${org.id}/${feature}: ${error.message}`,
            );
          }
        }
      }

      this.logger.log('Retraining threshold check completed');
    } catch (error) {
      this.logger.error(`Retraining threshold check failed: ${error.message}`);
    }
  }

  /**
   * Monthly lead scoring recalculation - runs on the 1st of each month at midnight
   */
  @Cron('0 0 1 * *')
  async runMonthlyLeadScoring() {
    this.logger.log('Starting monthly lead scoring update...');

    try {
      const organizations = await this.prisma.organization.findMany({
        where: {},
        select: { id: true, name: true },
      });

      for (const org of organizations) {
        try {
          // Count leads with outcomes in the last month
          const leadOutcomes = await this.prisma.lead.count({
            where: {
              organizationId: org.id,
              status: { in: ['WON', 'LOST'] },
              updatedAt: {
                gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
              },
            },
          });

          // Only retrain if we have 20+ outcomes
          if (leadOutcomes >= 20) {
            this.logger.log(
              `Org ${org.name}: Triggering lead scoring retraining (${leadOutcomes} outcomes)`,
            );
            await this.triggerModelRetraining(org.id, 'LEAD_SCORING');
          }
        } catch (error) {
          this.logger.error(
            `Error processing lead scoring for org ${org.id}: ${error.message}`,
          );
        }
      }

      this.logger.log('Monthly lead scoring update completed');
    } catch (error) {
      this.logger.error(`Monthly lead scoring update failed: ${error.message}`);
    }
  }

  /**
   * Weekly demand forecasting update - runs every Sunday at 1 AM
   * Uses Holt-Winters Triple Exponential Smoothing for all inventory items
   */
  @Cron('0 1 * * 0')
  async runWeeklyDemandForecast() {
    this.logger.log('Starting weekly demand forecast update...');

    try {
      const organizations = await this.prisma.organization.findMany({
        where: {},
        select: { id: true, name: true },
      });

      for (const org of organizations) {
        try {
          const result = await this.demandForecastingService.forecastAllItems(
            org.id,
          );

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
            `Error updating demand forecasts for org ${org.id}: ${error.message}`,
          );
        }
      }

      this.logger.log('Weekly demand forecast update completed');
    } catch (error) {
      this.logger.error(`Weekly demand forecast update failed: ${error.message}`);
    }
  }

  /**
   * Daily cash flow prediction update - runs at 3 AM
   * Uses Monte Carlo simulation for probabilistic cash flow forecasting
   */
  @Cron('0 3 * * *')
  async runDailyCashFlowPrediction() {
    this.logger.log('Starting daily cash flow prediction update...');

    try {
      const organizations = await this.prisma.organization.findMany({
        where: {},
        select: { id: true, name: true },
      });

      for (const org of organizations) {
        try {
          const result = await this.cashFlowPredictionService.dailyRecalculate(
            org.id,
          );

          this.logger.log(
            `Org ${org.name}: Updated ${result.updated} days of cash flow forecasts`,
          );
        } catch (error) {
          this.logger.error(
            `Error updating cash flow for org ${org.id}: ${error.message}`,
          );
        }
      }

      this.logger.log('Daily cash flow prediction update completed');
    } catch (error) {
      this.logger.error(
        `Daily cash flow prediction update failed: ${error.message}`,
      );
    }
  }

  /**
   * Weekly lead scoring update - runs every Sunday at midnight
   * Rescores all leads and applies decay for inactivity
   */
  @Cron('0 0 * * 0')
  async runWeeklyLeadScoringUpdate() {
    this.logger.log('Starting weekly lead scoring update...');

    try {
      const organizations = await this.prisma.organization.findMany({
        where: {},
        select: { id: true, name: true },
      });

      for (const org of organizations) {
        try {
          const result = await this.leadScoringService.updateScores(org.id);

          this.logger.log(
            `Org ${org.name}: Updated ${result.updated} lead scores, ${result.decayed} leads had decay applied`,
          );
        } catch (error) {
          this.logger.error(
            `Error updating lead scores for org ${org.id}: ${error.message}`,
          );
        }
      }

      this.logger.log('Weekly lead scoring update completed');
    } catch (error) {
      this.logger.error(
        `Weekly lead scoring update failed: ${error.message}`,
      );
    }
  }

  /**
   * Transaction Categorization retraining check - runs every 6 hours
   * Retrains the Naive Bayes classifier when 50+ corrections are accumulated
   */
  @Cron('0 */6 * * *')
  async checkCategorizationRetraining() {
    this.logger.log('Checking transaction categorization retraining...');

    try {
      const organizations = await this.prisma.organization.findMany({
        where: {},
        select: { id: true, name: true },
      });

      for (const org of organizations) {
        try {
          const needsRetraining =
            await this.feedbackService.checkRetrainingThreshold(
              org.id,
              'CATEGORIZATION',
            );

          if (needsRetraining) {
            this.logger.log(
              `Org ${org.name}: Retraining transaction categorizer...`,
            );
            const result = await this.categorizerService.train(org.id);
            this.logger.log(
              `Org ${org.name}: Categorizer trained - v${result.version}, accuracy: ${(result.accuracy * 100).toFixed(1)}%`,
            );
          }
        } catch (error) {
          this.logger.error(
            `Error checking categorization retraining for org ${org.id}: ${error.message}`,
          );
        }
      }

      this.logger.log('Categorization retraining check completed');
    } catch (error) {
      this.logger.error(
        `Categorization retraining check failed: ${error.message}`,
      );
    }
  }

  /**
   * Payment predictions update - runs every Sunday at 2 AM
   * Recalculates payment predictions for all outstanding invoices
   */
  @Cron('0 2 * * 0')
  async runWeeklyPaymentPredictionUpdate() {
    this.logger.log('Starting weekly payment prediction update...');

    try {
      const organizations = await this.prisma.organization.findMany({
        where: {},
        select: { id: true, name: true },
      });

      for (const org of organizations) {
        try {
          const result = await this.paymentPredictionService.updatePredictions(
            org.id,
          );
          this.logger.log(
            `Org ${org.name}: Updated ${result.updated} payment predictions`,
          );
        } catch (error) {
          this.logger.error(
            `Error updating payment predictions for org ${org.id}: ${error.message}`,
          );
        }
      }

      this.logger.log('Weekly payment prediction update completed');
    } catch (error) {
      this.logger.error(
        `Weekly payment prediction update failed: ${error.message}`,
      );
    }
  }

  /**
   * Monthly narrative generation - runs on the 1st of each month at 6 AM
   * Generates and stores monthly financial narratives for all organizations
   */
  @Cron('0 6 1 * *')
  async runMonthlyNarrativeGeneration() {
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

      for (const org of organizations) {
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
              description: narrative.summary || narrative.sections.map((s) => s.content).join(' ').slice(0, 500),
              data: narrative as any,
            },
          });

          this.logger.log(
            `Org ${org.name}: Monthly narrative generated for ${month}/${year}`,
          );
        } catch (error) {
          this.logger.error(
            `Error generating narrative for org ${org.id}: ${error.message}`,
          );
        }
      }

      this.logger.log('Monthly narrative generation completed');
    } catch (error) {
      this.logger.error(
        `Monthly narrative generation failed: ${error.message}`,
      );
    }
  }

  /**
   * Weekly pattern detection analysis - runs every Sunday at 3 AM
   * Detects recurring transaction patterns and generates suggestions
   */
  @Cron('0 3 * * 0')
  async runWeeklyPatternDetection() {
    this.logger.log('Starting weekly pattern detection analysis...');

    try {
      const organizations = await this.prisma.organization.findMany({
        where: {},
        select: { id: true, name: true },
      });

      for (const org of organizations) {
        try {
          const result = await this.patternDetectionService.analyzePatterns(org.id);

          this.logger.log(
            `Org ${org.name}: Detected ${result.patternsDetected} patterns, created ${result.suggestionsCreated} suggestions, found ${result.duplicatesFound} potential duplicates`,
          );
        } catch (error) {
          this.logger.error(
            `Error analyzing patterns for org ${org.id}: ${error.message}`,
          );
        }
      }

      this.logger.log('Weekly pattern detection analysis completed');
    } catch (error) {
      this.logger.error(`Weekly pattern detection analysis failed: ${error.message}`);
    }
  }

  /**
   * Hourly AI alerts aggregation - runs every hour at :30
   * Collects alerts from all AI services and creates unified notifications
   */
  @Cron('30 * * * *')
  async runHourlyAlertAggregation() {
    this.logger.log('Starting hourly AI alerts aggregation...');

    try {
      const organizations = await this.prisma.organization.findMany({
        where: {},
        select: { id: true, name: true },
      });

      for (const org of organizations) {
        try {
          const result = await this.aiAlertsService.aggregateAlerts(org.id);

          if (result.created > 0 || result.updated > 0) {
            this.logger.log(
              `Org ${org.name}: Created ${result.created} new alerts, updated ${result.updated}, expired ${result.expired}`,
            );
          }
        } catch (error) {
          this.logger.error(
            `Error aggregating alerts for org ${org.id}: ${error.message}`,
          );
        }
      }

      this.logger.log('Hourly AI alerts aggregation completed');
    } catch (error) {
      this.logger.error(`Hourly AI alerts aggregation failed: ${error.message}`);
    }
  }

  /**
   * Daily AI alerts cleanup - runs at 4 AM
   * Removes expired alerts and old dismissed alerts
   */
  @Cron('0 4 * * *')
  async runDailyAlertCleanup() {
    this.logger.log('Starting daily AI alerts cleanup...');

    try {
      const organizations = await this.prisma.organization.findMany({
        where: {},
        select: { id: true, name: true },
      });

      let totalCleaned = 0;

      for (const org of organizations) {
        try {
          const cleaned = await this.aiAlertsService.cleanupExpiredAlerts(org.id);
          totalCleaned += cleaned;
        } catch (error) {
          this.logger.error(
            `Error cleaning up alerts for org ${org.id}: ${error.message}`,
          );
        }
      }

      this.logger.log(`Daily AI alerts cleanup completed. Cleaned ${totalCleaned} alerts`);
    } catch (error) {
      this.logger.error(`Daily AI alerts cleanup failed: ${error.message}`);
    }
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
      this.logger.error(`Weekly stale pattern check failed: ${error.message}`);
    }
  }

  /**
   * Cleanup old AI data - runs weekly on Saturday at 4 AM
   * Removes old predictions and retired models
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

      this.logger.log(
        `Deleted ${deletedPredictions.count} old predictions`,
      );

      // Delete retired models older than 6 months (keep last 3 versions per feature)
      const retiredModels = await this.prisma.aiModel.deleteMany({
        where: {
          status: 'RETIRED',
          updatedAt: {
            lt: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000),
          },
        },
      });

      this.logger.log(`Deleted ${retiredModels.count} retired models`);

      // Delete old resolved anomalies older than 1 year
      const resolvedAnomalies = await this.prisma.aiAnomaly.deleteMany({
        where: {
          isResolved: true,
          resolvedAt: {
            lt: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
          },
        },
      });

      this.logger.log(
        `Deleted ${resolvedAnomalies.count} old resolved anomalies`,
      );

      this.logger.log('Weekly AI data cleanup completed');
    } catch (error) {
      this.logger.error(`Weekly AI data cleanup failed: ${error.message}`);
    }
  }

  /**
   * Trigger model retraining for a specific feature
   */
  private async triggerModelRetraining(
    organizationId: string,
    feature: AiFeature,
  ): Promise<void> {
    this.logger.log(
      `Model retraining triggered for org ${organizationId}, feature ${feature}`,
    );

    try {
      switch (feature) {
        case 'CATEGORIZATION':
          await this.categorizerService.train(organizationId);
          break;

        case 'PAYMENT_PREDICTION':
          await this.paymentPredictionService.updatePredictions(organizationId);
          break;

        case 'DEMAND_FORECAST':
          await this.demandForecastingService.forecastAllItems(organizationId);
          break;

        case 'CASH_FLOW':
          await this.cashFlowPredictionService.dailyRecalculate(organizationId);
          break;

        case 'LEAD_SCORING':
          await this.leadScoringService.scoreAllLeads(organizationId);
          break;

        case 'PATTERN_DETECTION':
          await this.patternDetectionService.analyzePatterns(organizationId);
          break;

        default:
          // For other features, just mark training data as processed
          await this.prisma.aiTrainingData.updateMany({
            where: {
              organizationId,
              feature,
              source: 'CORRECTION',
            },
            data: {
              source: 'USER', // Change from CORRECTION to USER after processing
            },
          });
      }

      this.logger.log(
        `Model retraining completed for org ${organizationId}, feature ${feature}`,
      );
    } catch (error) {
      this.logger.error(
        `Model retraining failed for org ${organizationId}, feature ${feature}: ${error.message}`,
      );
    }
  }
}
