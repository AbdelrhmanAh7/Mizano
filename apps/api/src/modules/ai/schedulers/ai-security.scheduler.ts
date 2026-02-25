import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../../prisma/prisma.service';
import { FraudDetectionService } from '../services/fraud-detection.service';
import { ComplianceMonitoringService } from '../services/compliance-monitoring.service';
import { AuditRiskService } from '../services/audit-risk.service';

@Injectable()
export class AiSecurityScheduler {
  private readonly logger = new Logger(AiSecurityScheduler.name);

  constructor(
    private prisma: PrismaService,
    private fraudService: FraudDetectionService,
    private complianceService: ComplianceMonitoringService,
    private auditRiskService: AuditRiskService,
  ) {}

  /**
   * Daily fraud scan - runs at 1 AM
   */
  @Cron('0 1 * * *')
  async runDailyFraudScan() {
    this.logger.log('Starting daily fraud scan...');

    try {
      const organizations = await this.prisma.organization.findMany({
        where: {},
        select: { id: true, name: true },
      });

      for (const org of organizations) {
        try {
          const result = await this.fraudService.dailyFraudScan(org.id);
          if (result.alertsCreated > 0) {
            this.logger.log(
              `Org ${org.name}: Fraud scan - ${result.scanned} scanned, ${result.alertsCreated} alerts created`,
            );
          }
        } catch (error) {
          this.logger.error(`Error running fraud scan for org ${org.id}: ${error.message}`);
        }
      }

      this.logger.log('Daily fraud scan completed');
    } catch (error) {
      this.logger.error(`Daily fraud scan failed: ${error.message}`);
    }
  }

  /**
   * Daily compliance check - runs at 5 AM
   */
  @Cron('0 5 * * *')
  async runDailyComplianceCheck() {
    this.logger.log('Starting daily compliance check...');

    try {
      const organizations = await this.prisma.organization.findMany({
        where: {},
        select: { id: true, name: true },
      });

      for (const org of organizations) {
        try {
          const report = await this.complianceService.runComplianceCheck(org.id);
          this.logger.log(
            `Org ${org.name}: Compliance score ${report.score.toFixed(0)}% - ${report.violations.length} violations found`,
          );
        } catch (error) {
          this.logger.error(`Error checking compliance for org ${org.id}: ${error.message}`);
        }
      }

      this.logger.log('Daily compliance check completed');
    } catch (error) {
      this.logger.error(`Daily compliance check failed: ${error.message}`);
    }
  }

  /**
   * Weekly audit risk scoring - runs every Sunday at 6 AM
   */
  @Cron('0 6 * * 0')
  async runWeeklyAuditRiskScoring() {
    this.logger.log('Starting weekly audit risk scoring...');

    try {
      const organizations = await this.prisma.organization.findMany({
        where: {},
        select: { id: true, name: true },
      });

      for (const org of organizations) {
        for (const entityType of ['journal', 'invoice', 'bill', 'expense']) {
          try {
            const result = await this.auditRiskService.batchScore(org.id, entityType);
            if (result.highRisk > 0) {
              this.logger.log(
                `Org ${org.name}: Audit risk ${entityType} - ${result.processed} scored (high: ${result.highRisk}, medium: ${result.mediumRisk})`,
              );
            }
          } catch (error) {
            this.logger.error(
              `Error scoring ${entityType} audit risk for org ${org.id}: ${error.message}`,
            );
          }
        }
      }

      this.logger.log('Weekly audit risk scoring completed');
    } catch (error) {
      this.logger.error(`Weekly audit risk scoring failed: ${error.message}`);
    }
  }

  /**
   * Weekly resolved fraud alert cleanup - runs Saturday at 3 AM
   */
  @Cron('0 3 * * 6')
  async runWeeklyFraudAlertCleanup() {
    this.logger.log('Starting weekly fraud alert cleanup...');

    try {
      const sixMonthsAgo = new Date(Date.now() - 180 * 86400000);

      const deleted = await this.prisma.fraudAlert.deleteMany({
        where: {
          isResolved: true,
          resolvedAt: { lt: sixMonthsAgo },
        },
      });

      this.logger.log(`Cleaned up ${deleted.count} old resolved fraud alerts`);
    } catch (error) {
      this.logger.error(`Weekly fraud alert cleanup failed: ${error.message}`);
    }
  }
}
