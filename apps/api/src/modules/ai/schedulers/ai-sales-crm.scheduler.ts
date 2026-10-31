import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../../prisma/prisma.service';
import { ChurnPredictionService } from '../services/churn-prediction.service';
import { ClvAnalysisService } from '../services/clv-analysis.service';
import { CrossSellService } from '../services/cross-sell.service';
import { DynamicPricingService } from '../services/dynamic-pricing.service';
import { PipelineForecastService } from '../services/pipeline-forecast.service';
import { forEachOrganization } from './for-each-organization';

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
    await forEachOrganization(
      this.prisma,
      this.logger,
      { name: 'weekly churn prediction', failure: 'predicting churn' },
      async (org) => {
        const result = await this.churnService.predictAllCustomers(org.id);
        this.logger.log(
          `Org ${org.name}: Churn prediction - ${result.processed} customers (high: ${result.highRisk}, medium: ${result.mediumRisk}, low: ${result.lowRisk})`,
        );
      },
    );
  }

  /**
   * Monthly CLV calculation - runs on the 1st at 3 AM
   */
  @Cron('0 3 1 * *')
  async runMonthlyCLVCalculation() {
    await forEachOrganization(
      this.prisma,
      this.logger,
      { name: 'monthly CLV calculation', failure: 'calculating CLV' },
      async (org) => {
        const result = await this.clvService.calculateAllCLV(org.id);
        this.logger.log(`Org ${org.name}: CLV calculated for ${result.processed} customers`);
      },
    );
  }

  /**
   * Weekly cross-sell matrix rebuild - runs every Saturday at 2 AM
   */
  @Cron('0 2 * * 6')
  async runWeeklyCrossSellRebuild() {
    await forEachOrganization(
      this.prisma,
      this.logger,
      { name: 'weekly cross-sell matrix rebuild', failure: 'rebuilding cross-sell matrix' },
      async (org) => {
        const result = await this.crossSellService.buildCoOccurrenceMatrix(org.id);
        this.logger.log(
          `Org ${org.name}: Cross-sell matrix rebuilt - ${result.itemPairs} item pairs from ${result.totalTransactions} transactions`,
        );
      },
    );
  }

  /**
   * Monthly pricing analysis - runs on the 1st at 4 AM
   */
  @Cron('0 4 1 * *')
  async runMonthlyPricingAnalysis() {
    await forEachOrganization(
      this.prisma,
      this.logger,
      { name: 'monthly pricing analysis', failure: 'analyzing pricing' },
      async (org) => {
        const result = await this.pricingService.analyzeAllPricing(org.id);
        this.logger.log(`Org ${org.name}: Pricing analysis - ${result.analyzed} items analyzed`);
      },
    );
  }

  /**
   * Weekly pipeline forecast - runs every Monday at 6 AM
   */
  @Cron('0 6 * * 1')
  async runWeeklyPipelineForecast() {
    await forEachOrganization(
      this.prisma,
      this.logger,
      { name: 'weekly pipeline forecast', failure: 'forecasting pipeline' },
      async (org) => {
        const result = await this.pipelineService.forecastPipeline(org.id);
        this.logger.log(
          `Org ${org.name}: Pipeline forecast - weighted value: ${result.totalWeighted.toFixed(2)}, active deals: ${result.activeDeals}`,
        );
      },
    );
  }
}
