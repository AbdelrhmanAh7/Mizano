import { Injectable, Logger, Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../../prisma/prisma.service';
import { EmployeeAttritionService } from '../services/employee-attrition.service';
import { CompensationBenchmarkService } from '../services/compensation-benchmark.service';
import { QualityPredictionService } from '../services/quality-prediction.service';
import { PredictiveMaintenanceService } from '../services/predictive-maintenance.service';
import { ResourceOptimizationService } from '../services/resource-optimization.service';
import { forEachOrganization } from './for-each-organization';

@Injectable()
export class AiHrOpsScheduler {
  private readonly logger = new Logger(AiHrOpsScheduler.name);

  constructor(
    private prisma: PrismaService,
    private attritionService: EmployeeAttritionService,
    private compensationService: CompensationBenchmarkService,
    private qualityService: QualityPredictionService,
    private maintenanceService: PredictiveMaintenanceService,
    private resourceService: ResourceOptimizationService,
  ) {}

  /**
   * Monthly attrition prediction - runs on the 1st at 5 AM
   */
  @Cron('0 5 1 * *')
  async runMonthlyAttritionPrediction() {
    await forEachOrganization(
      this.prisma,
      this.logger,
      { name: 'monthly attrition prediction', failure: 'predicting attrition' },
      async (org) => {
        const result = await this.attritionService.predictAll(org.id);
        this.logger.log(
          `Org ${org.name}: Attrition prediction - ${result.processed} employees (high: ${result.highRisk}, medium: ${result.mediumRisk}, low: ${result.lowRisk})`,
        );
      },
    );
  }

  /**
   * Monthly compensation benchmarking - runs on the 1st at 4 AM
   */
  @Cron('0 4 1 * *')
  async runMonthlyCompensationBenchmark() {
    await forEachOrganization(
      this.prisma,
      this.logger,
      { name: 'monthly compensation benchmark', failure: 'benchmarking compensation' },
      async (org) => {
        const departments = await this.compensationService.getDepartmentBenchmarks(org.id);
        this.logger.log(
          `Org ${org.name}: Compensation benchmark - ${departments.length} departments analyzed`,
        );
      },
    );
  }

  /**
   * Weekly quality prediction - runs every Monday at 5 AM
   */
  @Cron('0 5 * * 1')
  async runWeeklyQualityPrediction() {
    await forEachOrganization(
      this.prisma,
      this.logger,
      { name: 'weekly quality prediction', failure: 'analyzing quality' },
      async (org) => {
        const trends = await this.qualityService.getQualityTrends(org.id);
        this.logger.log(`Org ${org.name}: Quality trends - ${trends.length} months analyzed`);
      },
    );
  }

  /**
   * Monthly predictive maintenance - runs on the 1st at 6 AM
   */
  @Cron('0 6 1 * *')
  async runMonthlyPredictiveMaintenance() {
    await forEachOrganization(
      this.prisma,
      this.logger,
      { name: 'monthly predictive maintenance', failure: 'predicting maintenance' },
      async (org) => {
        const result = await this.maintenanceService.predictAll(org.id);
        this.logger.log(
          `Org ${org.name}: Maintenance prediction - ${result.processed} assets (critical: ${result.critical}, warning: ${result.warning}, healthy: ${result.healthy})`,
        );
      },
    );
  }

  /**
   * Monthly resource optimization - runs on the 1st at 7 AM
   */
  @Cron('0 7 1 * *')
  async runMonthlyResourceOptimization() {
    await forEachOrganization(
      this.prisma,
      this.logger,
      { name: 'monthly resource optimization', failure: 'optimizing resources' },
      async (org) => {
        const opportunities = await this.resourceService.getOptimizationOpportunities(org.id);
        this.logger.log(
          `Org ${org.name}: Resource optimization - ${opportunities.opportunities.length} opportunities found`,
        );
      },
    );
  }
}

/**
 * Registers AiHrOpsScheduler only when AI_SCHEDULERS_ENABLED=true. Otherwise an
 * inert object is provided under the same token: DI keeps resolving, but it has
 * no @Cron metadata, so nothing is scheduled.
 */
export const aiHrOpsSchedulerProvider: Provider = {
  provide: AiHrOpsScheduler,
  inject: [
    ConfigService,
    PrismaService,
    EmployeeAttritionService,
    CompensationBenchmarkService,
    QualityPredictionService,
    PredictiveMaintenanceService,
    ResourceOptimizationService,
  ],
  useFactory: (
    config: ConfigService,
    ...deps: ConstructorParameters<typeof AiHrOpsScheduler>
  ): AiHrOpsScheduler | object =>
    config.get<string>('AI_SCHEDULERS_ENABLED') === 'true' ? new AiHrOpsScheduler(...deps) : {},
};
