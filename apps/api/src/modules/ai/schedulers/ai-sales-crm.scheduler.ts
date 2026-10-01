import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../../prisma/prisma.service';
import { ChurnPredictionService } from '../services/churn-prediction.service';
import { ClvAnalysisService } from '../services/clv-analysis.service';
import { CrossSellService } from '../services/cross-sell.service';
import { DynamicPricingService } from '../services/dynamic-pricing.service';
import { PipelineForecastService } from '../services/pipeline-forecast.service';
import { describeError } from '../../../common/utils/redact';

const BATCH_SIZE = 5;

@Injectable()
export class AiSalesCrmScheduler {
  private readonly logger = new Logger(AiSalesCrmScheduler.name);

  constructor(
    private prisma: PrismaService,
    private churnService: ChurnPredictionService,
    private clvService: ClvAnalysisService,
    private crossSellService: CrossSellService,
    private pricingService: DynamicPricingService,
    private pipelineService: PipelineForecastService,
  ) {}

  /**
   * Weekly churn prediction - runs every Sunday at 4 AM
   */
  @Cron('0 4 * * 0')
  async runWeeklyChurnPrediction() {
    this.logger.log('Starting weekly churn prediction...');

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
              const result = await this.churnService.predictAllCustomers(org.id);
              this.logger.log(
                `Org ${org.name}: Churn prediction - ${result.processed} customers (high: ${result.highRisk}, medium: ${result.mediumRisk}, low: ${result.lowRisk})`,
              );
            } catch (error) {
              this.logger.error(
                `Error predicting churn for org ${org.id}: ${describeError(error)}`,
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

      this.logger.log('Weekly churn prediction completed');
    } catch (error) {
      this.logger.error(`Weekly churn prediction failed: ${describeError(error)}`);
    }
  }

  /**
   * Monthly CLV calculation - runs on the 1st at 3 AM
   */
  @Cron('0 3 1 * *')
  async runMonthlyCLVCalculation() {
    this.logger.log('Starting monthly CLV calculation...');

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
              const result = await this.clvService.calculateAllCLV(org.id);
              this.logger.log(`Org ${org.name}: CLV calculated for ${result.processed} customers`);
            } catch (error) {
              this.logger.error(`Error calculating CLV for org ${org.id}: ${describeError(error)}`);
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

      this.logger.log('Monthly CLV calculation completed');
    } catch (error) {
      this.logger.error(`Monthly CLV calculation failed: ${describeError(error)}`);
    }
  }

  /**
   * Weekly cross-sell matrix rebuild - runs every Saturday at 2 AM
   */
  @Cron('0 2 * * 6')
  async runWeeklyCrossSellRebuild() {
    this.logger.log('Starting weekly cross-sell matrix rebuild...');

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
              const result = await this.crossSellService.buildCoOccurrenceMatrix(org.id);
              this.logger.log(
                `Org ${org.name}: Cross-sell matrix rebuilt - ${result.itemPairs} item pairs from ${result.totalTransactions} transactions`,
              );
            } catch (error) {
              this.logger.error(
                `Error rebuilding cross-sell matrix for org ${org.id}: ${describeError(error)}`,
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

      this.logger.log('Weekly cross-sell matrix rebuild completed');
    } catch (error) {
      this.logger.error(`Weekly cross-sell matrix rebuild failed: ${describeError(error)}`);
    }
  }

  /**
   * Monthly pricing analysis - runs on the 1st at 4 AM
   */
  @Cron('0 4 1 * *')
  async runMonthlyPricingAnalysis() {
    this.logger.log('Starting monthly pricing analysis...');

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
              const result = await this.pricingService.analyzeAllPricing(org.id);
              this.logger.log(
                `Org ${org.name}: Pricing analysis - ${result.analyzed} items analyzed`,
              );
            } catch (error) {
              this.logger.error(
                `Error analyzing pricing for org ${org.id}: ${describeError(error)}`,
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

      this.logger.log('Monthly pricing analysis completed');
    } catch (error) {
      this.logger.error(`Monthly pricing analysis failed: ${describeError(error)}`);
    }
  }

  /**
   * Weekly pipeline forecast - runs every Monday at 6 AM
   */
  @Cron('0 6 * * 1')
  async runWeeklyPipelineForecast() {
    this.logger.log('Starting weekly pipeline forecast...');

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
              const result = await this.pipelineService.forecastPipeline(org.id);
              this.logger.log(
                `Org ${org.name}: Pipeline forecast - weighted value: ${result.totalWeighted.toFixed(2)}, active deals: ${result.activeDeals}`,
              );
            } catch (error) {
              this.logger.error(
                `Error forecasting pipeline for org ${org.id}: ${describeError(error)}`,
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

      this.logger.log('Weekly pipeline forecast completed');
    } catch (error) {
      this.logger.error(`Weekly pipeline forecast failed: ${describeError(error)}`);
    }
  }
}
