import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../../prisma/prisma.service';
import { EmployeeAttritionService } from '../services/employee-attrition.service';
import { CompensationBenchmarkService } from '../services/compensation-benchmark.service';
import { QualityPredictionService } from '../services/quality-prediction.service';
import { PredictiveMaintenanceService } from '../services/predictive-maintenance.service';
import { ResourceOptimizationService } from '../services/resource-optimization.service';

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
    this.logger.log('Starting monthly attrition prediction...');

    try {
      const organizations = await this.prisma.organization.findMany({
        where: {},
        select: { id: true, name: true },
      });

      for (const org of organizations) {
        try {
          const result = await this.attritionService.predictAll(org.id);
          this.logger.log(
            `Org ${org.name}: Attrition prediction - ${result.processed} employees (high: ${result.highRisk}, medium: ${result.mediumRisk}, low: ${result.lowRisk})`,
          );
        } catch (error) {
          this.logger.error(
            `Error predicting attrition for org ${org.id}: ${error.message}`,
          );
        }
      }

      this.logger.log('Monthly attrition prediction completed');
    } catch (error) {
      this.logger.error(
        `Monthly attrition prediction failed: ${error.message}`,
      );
    }
  }

  /**
   * Monthly compensation benchmarking - runs on the 1st at 4 AM
   */
  @Cron('0 4 1 * *')
  async runMonthlyCompensationBenchmark() {
    this.logger.log('Starting monthly compensation benchmark...');

    try {
      const organizations = await this.prisma.organization.findMany({
        where: {},
        select: { id: true, name: true },
      });

      for (const org of organizations) {
        try {
          const departments =
            await this.compensationService.getDepartmentBenchmarks(org.id);
          this.logger.log(
            `Org ${org.name}: Compensation benchmark - ${departments.length} departments analyzed`,
          );
        } catch (error) {
          this.logger.error(
            `Error benchmarking compensation for org ${org.id}: ${error.message}`,
          );
        }
      }

      this.logger.log('Monthly compensation benchmark completed');
    } catch (error) {
      this.logger.error(
        `Monthly compensation benchmark failed: ${error.message}`,
      );
    }
  }

  /**
   * Weekly quality prediction - runs every Monday at 5 AM
   */
  @Cron('0 5 * * 1')
  async runWeeklyQualityPrediction() {
    this.logger.log('Starting weekly quality prediction...');

    try {
      const organizations = await this.prisma.organization.findMany({
        where: {},
        select: { id: true, name: true },
      });

      for (const org of organizations) {
        try {
          const trends = await this.qualityService.getQualityTrends(org.id);
          this.logger.log(
            `Org ${org.name}: Quality trends - ${trends.length} months analyzed`,
          );
        } catch (error) {
          this.logger.error(
            `Error analyzing quality for org ${org.id}: ${error.message}`,
          );
        }
      }

      this.logger.log('Weekly quality prediction completed');
    } catch (error) {
      this.logger.error(
        `Weekly quality prediction failed: ${error.message}`,
      );
    }
  }

  /**
   * Monthly predictive maintenance - runs on the 1st at 6 AM
   */
  @Cron('0 6 1 * *')
  async runMonthlyPredictiveMaintenance() {
    this.logger.log('Starting monthly predictive maintenance...');

    try {
      const organizations = await this.prisma.organization.findMany({
        where: {},
        select: { id: true, name: true },
      });

      for (const org of organizations) {
        try {
          const result = await this.maintenanceService.predictAll(org.id);
          this.logger.log(
            `Org ${org.name}: Maintenance prediction - ${result.processed} assets (critical: ${result.critical}, warning: ${result.warning}, healthy: ${result.healthy})`,
          );
        } catch (error) {
          this.logger.error(
            `Error predicting maintenance for org ${org.id}: ${error.message}`,
          );
        }
      }

      this.logger.log('Monthly predictive maintenance completed');
    } catch (error) {
      this.logger.error(
        `Monthly predictive maintenance failed: ${error.message}`,
      );
    }
  }

  /**
   * Monthly resource optimization - runs on the 1st at 7 AM
   */
  @Cron('0 7 1 * *')
  async runMonthlyResourceOptimization() {
    this.logger.log('Starting monthly resource optimization...');

    try {
      const organizations = await this.prisma.organization.findMany({
        where: {},
        select: { id: true, name: true },
      });

      for (const org of organizations) {
        try {
          const opportunities =
            await this.resourceService.getOptimizationOpportunities(org.id);
          this.logger.log(
            `Org ${org.name}: Resource optimization - ${opportunities.opportunities.length} opportunities found`,
          );
        } catch (error) {
          this.logger.error(
            `Error optimizing resources for org ${org.id}: ${error.message}`,
          );
        }
      }

      this.logger.log('Monthly resource optimization completed');
    } catch (error) {
      this.logger.error(
        `Monthly resource optimization failed: ${error.message}`,
      );
    }
  }
}
