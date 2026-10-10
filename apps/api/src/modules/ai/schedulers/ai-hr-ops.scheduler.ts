import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { EmployeeAttritionService } from '../services/employee-attrition.service';
import { CompensationBenchmarkService } from '../services/compensation-benchmark.service';
import { QualityPredictionService } from '../services/quality-prediction.service';
import { PredictiveMaintenanceService } from '../services/predictive-maintenance.service';
import { ResourceOptimizationService } from '../services/resource-optimization.service';
import { describeError } from '../../../common/utils/redact';

const BATCH_SIZE = 5;

@Injectable()
export class AiHrOpsScheduler {
  private readonly logger = new Logger(AiHrOpsScheduler.name);
  private readonly enabled: boolean;

  constructor(
    private prisma: PrismaService,
    private attritionService: EmployeeAttritionService,
    private compensationService: CompensationBenchmarkService,
    private qualityService: QualityPredictionService,
    private maintenanceService: PredictiveMaintenanceService,
    private resourceService: ResourceOptimizationService,
    private config: ConfigService,
  ) {
    this.enabled = config.get('AI_SCHEDULERS_ENABLED') === 'true';
    if (!this.enabled) {
      this.logger.log(
        'AI_SCHEDULERS_ENABLED is not set to true; AI HR/Ops schedulers are disabled',
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
   * Monthly attrition prediction - runs on the 1st at 5 AM
   */
  @Cron('0 5 1 * *', { name: 'ai:hr:monthly-attrition-prediction' })
  async runMonthlyAttritionPrediction() {
    if (!this.guard()) return;
    this.logger.log('Starting monthly attrition prediction...');

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
              const result = await this.attritionService.predictAll(org.id);
              this.logger.log(
                `Org ${org.name}: Attrition prediction - ${result.processed} employees (high: ${result.highRisk}, medium: ${result.mediumRisk}, low: ${result.lowRisk})`,
              );
            } catch (error) {
              this.logger.error(
                `Error predicting attrition for org ${org.id}: ${describeError(error)}`,
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

      this.logger.log('Monthly attrition prediction completed');
    } catch (error) {
      this.logger.error(`Monthly attrition prediction failed: ${describeError(error)}`);
    }
  }

  /**
   * Monthly compensation benchmarking - runs on the 1st at 4 AM
   */
  @Cron('0 4 1 * *', { name: 'ai:hr:monthly-compensation-benchmark' })
  async runMonthlyCompensationBenchmark() {
    if (!this.guard()) return;
    this.logger.log('Starting monthly compensation benchmark...');

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
              const departments = await this.compensationService.getDepartmentBenchmarks(org.id);
              this.logger.log(
                `Org ${org.name}: Compensation benchmark - ${departments.length} departments analyzed`,
              );
            } catch (error) {
              this.logger.error(
                `Error benchmarking compensation for org ${org.id}: ${describeError(error)}`,
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

      this.logger.log('Monthly compensation benchmark completed');
    } catch (error) {
      this.logger.error(`Monthly compensation benchmark failed: ${describeError(error)}`);
    }
  }

  /**
   * Weekly quality prediction - runs every Monday at 5 AM
   */
  @Cron('0 5 * * 1', { name: 'ai:hr:weekly-quality-prediction' })
  async runWeeklyQualityPrediction() {
    if (!this.guard()) return;
    this.logger.log('Starting weekly quality prediction...');

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
              const trends = await this.qualityService.getQualityTrends(org.id);
              this.logger.log(`Org ${org.name}: Quality trends - ${trends.length} months analyzed`);
            } catch (error) {
              this.logger.error(
                `Error analyzing quality for org ${org.id}: ${describeError(error)}`,
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

      this.logger.log('Weekly quality prediction completed');
    } catch (error) {
      this.logger.error(`Weekly quality prediction failed: ${describeError(error)}`);
    }
  }

  /**
   * Monthly predictive maintenance - runs on the 1st at 6 AM
   */
  @Cron('0 6 1 * *', { name: 'ai:hr:monthly-predictive-maintenance' })
  async runMonthlyPredictiveMaintenance() {
    if (!this.guard()) return;
    this.logger.log('Starting monthly predictive maintenance...');

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
              const result = await this.maintenanceService.predictAll(org.id);
              this.logger.log(
                `Org ${org.name}: Maintenance prediction - ${result.processed} assets (critical: ${result.critical}, warning: ${result.warning}, healthy: ${result.healthy})`,
              );
            } catch (error) {
              this.logger.error(
                `Error predicting maintenance for org ${org.id}: ${describeError(error)}`,
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

      this.logger.log('Monthly predictive maintenance completed');
    } catch (error) {
      this.logger.error(`Monthly predictive maintenance failed: ${describeError(error)}`);
    }
  }

  /**
   * Monthly resource optimization - runs on the 1st at 7 AM
   */
  @Cron('0 7 1 * *', { name: 'ai:hr:monthly-resource-optimization' })
  async runMonthlyResourceOptimization() {
    if (!this.guard()) return;
    this.logger.log('Starting monthly resource optimization...');

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
              const opportunities = await this.resourceService.getOptimizationOpportunities(org.id);
              this.logger.log(
                `Org ${org.name}: Resource optimization - ${opportunities.opportunities.length} opportunities found`,
              );
            } catch (error) {
              this.logger.error(
                `Error optimizing resources for org ${org.id}: ${describeError(error)}`,
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

      this.logger.log('Monthly resource optimization completed');
    } catch (error) {
      this.logger.error(`Monthly resource optimization failed: ${describeError(error)}`);
    }
  }
}
