import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { AnomalyType, AnomalySeverity, Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import {
  mean,
  standardDeviation,
  zScoreWithStats,
  interquartileRange,
} from '../utils/statistics.util';
import { buildIsolationForest1D, isolationForestScore1D } from '../utils/isolation-forest.util';

export interface AnomalyResult {
  isAnomaly: boolean;
  value: number;
  mean: number;
  stdDev: number;
  zScore: number;
  isolationScore: number;
  severity: AnomalySeverity | null;
  method: 'zscore' | 'iqr' | 'isolation_forest' | 'ensemble';
  reason: string;
}

export interface AnomalyRecord {
  id: string;
  type: AnomalyType;
  severity: AnomalySeverity;
  entityType: string;
  entityId: string;
  value: number;
  expectedValue: number;
  zScore: number;
  description: string;
  isResolved: boolean;
  createdAt: Date;
}

@Injectable()
export class AnomalyDetectionService {
  private readonly logger = new Logger(AnomalyDetectionService.name);
  private readonly MIN_DATA_POINTS = 10;
  private readonly Z_SCORE_THRESHOLD = 2.5;
  private readonly IQR_MULTIPLIER = 1.5;

  constructor(private prisma: PrismaService) {}

  /**
   * Core anomaly detection method using Z-Score + IQR + Isolation Forest ensemble
   */
  detectAnomaly(value: number, historicalValues: number[]): AnomalyResult {
    // Check for minimum data points
    if (historicalValues.length < this.MIN_DATA_POINTS) {
      return {
        isAnomaly: false,
        value,
        mean: 0,
        stdDev: 0,
        zScore: 0,
        isolationScore: 0,
        severity: null,
        method: 'ensemble',
        reason: 'insufficient_data',
      };
    }

    // Calculate statistics
    const avg = mean(historicalValues);
    const stdDev = standardDeviation(historicalValues);
    const zScore = zScoreWithStats(value, avg, stdDev);

    // IQR-based detection
    const { lowerBound, upperBound } = interquartileRange(historicalValues);
    const iqrLower = lowerBound;
    const iqrUpper = upperBound;
    const isIqrOutlier = value < iqrLower || value > iqrUpper;

    // Z-Score based detection
    const absZScore = Math.abs(zScore);
    const isZScoreOutlier = absZScore > this.Z_SCORE_THRESHOLD;

    // Isolation Forest detection
    let isolationScore = 0;
    let isIsolationOutlier = false;
    if (historicalValues.length >= 20) {
      const forest = buildIsolationForest1D(historicalValues, 100);
      isolationScore = isolationForestScore1D(value, forest);
      isIsolationOutlier = isolationScore > 0.6;
    }

    // Ensemble: any method flags → anomaly
    const isAnomaly = isZScoreOutlier || isIqrOutlier || isIsolationOutlier;

    // Count how many methods agree for severity boosting
    const methodsAgreed = [isZScoreOutlier, isIqrOutlier, isIsolationOutlier].filter(
      Boolean,
    ).length;
    const severity = this.determineSeverity(absZScore, isolationScore, methodsAgreed);

    let reason = 'normal';
    if (isAnomaly) {
      const methods: string[] = [];
      if (isZScoreOutlier) methods.push(`z-score ${absZScore.toFixed(1)}σ`);
      if (isIqrOutlier)
        methods.push(`outside IQR [${iqrLower.toFixed(2)}, ${iqrUpper.toFixed(2)}]`);
      if (isIsolationOutlier) methods.push(`isolation score ${isolationScore.toFixed(2)}`);
      reason = `Value ${value.toFixed(2)} flagged by ${methods.join(', ')} (mean: ${avg.toFixed(2)})`;
    }

    return {
      isAnomaly,
      value,
      mean: avg,
      stdDev,
      zScore,
      isolationScore,
      severity: isAnomaly ? severity : null,
      method: 'ensemble',
      reason,
    };
  }

  /**
   * Determine severity based on z-score, isolation score, and method agreement.
   * Multiple methods agreeing boosts severity by one level.
   */
  private determineSeverity(
    absZScore: number,
    isolationScore: number = 0,
    methodsAgreed: number = 1,
  ): AnomalySeverity {
    // Base severity from z-score
    let baseSeverity: AnomalySeverity;
    if (absZScore > 4 || isolationScore > 0.85) {
      baseSeverity = 'CRITICAL';
    } else if (absZScore > 3.5 || isolationScore > 0.75) {
      baseSeverity = 'HIGH';
    } else if (absZScore > 3 || isolationScore > 0.65) {
      baseSeverity = 'MEDIUM';
    } else {
      baseSeverity = 'LOW';
    }

    // Boost severity if multiple methods agree (3/3 → boost by one level)
    if (methodsAgreed >= 3) {
      const boostMap: Record<AnomalySeverity, AnomalySeverity> = {
        LOW: 'MEDIUM',
        MEDIUM: 'HIGH',
        HIGH: 'CRITICAL',
        CRITICAL: 'CRITICAL',
      };
      return boostMap[baseSeverity];
    }

    return baseSeverity;
  }

  /**
   * Check for transaction amount anomaly
   */
  async checkTransactionAnomaly(
    organizationId: string,
    amount: number,
    accountId: string,
  ): Promise<AnomalyResult & { historicalAvg: number }> {
    // Get last 90 days of transactions for this account
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    // Query expenses for this account
    const expenses = await this.prisma.expense.findMany({
      where: {
        organizationId,
        accountId,
        createdAt: { gte: ninetyDaysAgo },
        deletedAt: null,
      },
      select: { amount: true },
    });

    const historicalValues = expenses.map((e) => Number(e.amount));
    const result = this.detectAnomaly(amount, historicalValues);

    return {
      ...result,
      historicalAvg: result.mean,
    };
  }

  /**
   * Check for overtime hours anomaly
   */
  async checkOvertimeAnomaly(
    organizationId: string,
    employeeId: string,
    hours: number,
  ): Promise<AnomalyResult & { employeeAvgHours: number }> {
    // Get last 6 months of attendance/overtime for this employee
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const attendances = await this.prisma.attendance.findMany({
      where: {
        organizationId,
        employeeId,
        date: { gte: sixMonthsAgo },
      },
      select: { checkIn: true, checkOut: true },
    });

    // Calculate overtime hours (assuming 8 hour workday)
    const overtimeHours = attendances
      .filter((a) => a.checkIn && a.checkOut)
      .map((a) => {
        const checkIn = new Date(a.checkIn!);
        const checkOut = new Date(a.checkOut!);
        const workedHours = (checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60);
        return Math.max(0, workedHours - 8);
      });

    const result = this.detectAnomaly(hours, overtimeHours);

    return {
      ...result,
      employeeAvgHours: result.mean,
    };
  }

  /**
   * Check for spending anomaly by vendor
   */
  async checkSpendingAnomaly(
    organizationId: string,
    vendorId: string,
    amount: number,
  ): Promise<AnomalyResult & { vendorAvgSpend: number }> {
    // Get last 12 months of spending for this vendor
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    const [expenses, bills] = await Promise.all([
      this.prisma.expense.findMany({
        where: {
          organizationId,
          vendorId,
          createdAt: { gte: twelveMonthsAgo },
          deletedAt: null,
        },
        select: { amount: true },
      }),
      this.prisma.bill.findMany({
        where: {
          organizationId,
          vendorId,
          createdAt: { gte: twelveMonthsAgo },
          deletedAt: null,
        },
        select: { grandTotal: true },
      }),
    ]);

    const historicalValues = [
      ...expenses.map((e) => Number(e.amount)),
      ...bills.map((b) => Number(b.grandTotal)),
    ];

    const result = this.detectAnomaly(amount, historicalValues);

    return {
      ...result,
      vendorAvgSpend: result.mean,
    };
  }

  /**
   * Check for payroll anomaly
   */
  async checkPayrollAnomaly(organizationId: string, payrollRunId: string): Promise<AnomalyResult> {
    // Get current payroll run total
    const currentRun = await this.prisma.payrollRun.findUnique({
      where: { id: payrollRunId },
      select: { totalGross: true, month: true, year: true },
    });

    if (!currentRun) {
      return {
        isAnomaly: false,
        value: 0,
        mean: 0,
        stdDev: 0,
        zScore: 0,
        isolationScore: 0,
        severity: null,
        method: 'ensemble',
        reason: 'payroll_run_not_found',
      };
    }

    // Get last 6 payroll runs
    const previousRuns = await this.prisma.payrollRun.findMany({
      where: {
        organizationId,
        id: { not: payrollRunId },
        status: { in: ['PROCESSED', 'PAID'] },
      },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
      take: 6,
      select: { totalGross: true },
    });

    const historicalValues = previousRuns.map((r) => Number(r.totalGross));
    return this.detectAnomaly(Number(currentRun.totalGross), historicalValues);
  }

  /**
   * Daily anomaly scan for an organization
   */
  async dailyAnomalyScan(organizationId: string): Promise<{
    transactionAnomalies: number;
    spendingAnomalies: number;
    newAnomaliesCreated: number;
  }> {
    this.logger.log(`Starting daily anomaly scan for org ${organizationId}`);

    let transactionAnomalies = 0;
    let spendingAnomalies = 0;
    let newAnomaliesCreated = 0;

    // Get yesterday's date range
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Scan recent expenses
    const recentExpenses = await this.prisma.expense.findMany({
      where: {
        organizationId,
        createdAt: { gte: yesterday, lt: today },
        deletedAt: null,
      },
      select: { id: true, amount: true, accountId: true, vendorId: true },
    });

    for (const expense of recentExpenses) {
      // Check by account
      const accountResult = await this.checkTransactionAnomaly(
        organizationId,
        Number(expense.amount),
        expense.accountId,
      );

      if (accountResult.isAnomaly) {
        transactionAnomalies++;
        const created = await this.createAnomalyRecord(
          organizationId,
          'TRANSACTION',
          accountResult.severity!,
          'expense',
          expense.id,
          Number(expense.amount),
          accountResult.mean,
          accountResult.zScore,
          accountResult.reason,
        );
        if (created) newAnomaliesCreated++;
      }

      // Check by vendor if available
      if (expense.vendorId) {
        const vendorResult = await this.checkSpendingAnomaly(
          organizationId,
          expense.vendorId,
          Number(expense.amount),
        );

        if (vendorResult.isAnomaly) {
          spendingAnomalies++;
          const created = await this.createAnomalyRecord(
            organizationId,
            'SPENDING',
            vendorResult.severity!,
            'expense',
            expense.id,
            Number(expense.amount),
            vendorResult.mean,
            vendorResult.zScore,
            vendorResult.reason,
          );
          if (created) newAnomaliesCreated++;
        }
      }
    }

    // Scan recent bills
    const recentBills = await this.prisma.bill.findMany({
      where: {
        organizationId,
        createdAt: { gte: yesterday, lt: today },
        deletedAt: null,
      },
      select: { id: true, grandTotal: true, vendorId: true },
    });

    for (const bill of recentBills) {
      const result = await this.checkSpendingAnomaly(
        organizationId,
        bill.vendorId,
        Number(bill.grandTotal),
      );

      if (result.isAnomaly) {
        spendingAnomalies++;
        const created = await this.createAnomalyRecord(
          organizationId,
          'SPENDING',
          result.severity!,
          'bill',
          bill.id,
          Number(bill.grandTotal),
          result.mean,
          result.zScore,
          result.reason,
        );
        if (created) newAnomaliesCreated++;
      }
    }

    this.logger.log(
      `Completed anomaly scan for org ${organizationId}: ${transactionAnomalies} transaction, ${spendingAnomalies} spending anomalies`,
    );

    return {
      transactionAnomalies,
      spendingAnomalies,
      newAnomaliesCreated,
    };
  }

  /**
   * Create an anomaly record
   */
  private async createAnomalyRecord(
    organizationId: string,
    type: AnomalyType,
    severity: AnomalySeverity,
    entityType: string,
    entityId: string,
    value: number,
    expectedValue: number,
    zScore: number,
    description: string,
  ): Promise<boolean> {
    // Check if anomaly already exists for this entity
    const existing = await this.prisma.aiAnomaly.findFirst({
      where: {
        organizationId,
        entityType,
        entityId,
        isResolved: false,
      },
    });

    if (existing) {
      return false;
    }

    await this.prisma.aiAnomaly.create({
      data: {
        organizationId,
        type,
        severity,
        entityType,
        entityId,
        value: new Decimal(value),
        expectedValue: new Decimal(expectedValue),
        zScore: new Decimal(zScore),
        description,
      },
    });

    // Create notification for admins
    const admins = await this.prisma.user.findMany({
      where: {
        organizationId,
        role: { name: 'Admin' },
        status: 'ACTIVE',
      },
      select: { id: true },
    });

    if (admins.length > 0) {
      await this.prisma.notification.createMany({
        data: admins.map((admin) => ({
          organizationId,
          userId: admin.id,
          title: `${severity} Anomaly Detected`,
          message: description,
          type: 'AI_ANOMALY',
          entityType,
          entityId,
        })),
      });
    }

    return true;
  }

  /**
   * Get unresolved anomalies
   */
  async getUnresolvedAnomalies(
    organizationId: string,
    options?: {
      type?: AnomalyType;
      severity?: AnomalySeverity;
      limit?: number;
      offset?: number;
    },
  ): Promise<{ data: AnomalyRecord[]; total: number }> {
    const { type, severity, limit = 50, offset = 0 } = options || {};

    const where: Prisma.AiAnomalyWhereInput = {
      organizationId,
      isResolved: false,
      ...(type && { type }),
      ...(severity && { severity }),
    };

    const [data, total] = await Promise.all([
      this.prisma.aiAnomaly.findMany({
        where,
        orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }],
        skip: offset,
        take: limit,
      }),
      this.prisma.aiAnomaly.count({ where }),
    ]);

    return {
      data: data.map((a) => ({
        id: a.id,
        type: a.type,
        severity: a.severity,
        entityType: a.entityType,
        entityId: a.entityId,
        value: Number(a.value),
        expectedValue: Number(a.expectedValue),
        zScore: Number(a.zScore),
        description: a.description,
        isResolved: a.isResolved,
        createdAt: a.createdAt,
      })),
      total,
    };
  }

  /**
   * Resolve an anomaly
   */
  async resolveAnomaly(organizationId: string, anomalyId: string, userId: string): Promise<void> {
    await this.prisma.aiAnomaly.update({
      where: {
        id: anomalyId,
        organizationId,
      },
      data: {
        isResolved: true,
        resolvedAt: new Date(),
        resolvedBy: userId,
      },
    });

    this.logger.debug(`Resolved anomaly ${anomalyId} by user ${userId}`);
  }

  /**
   * Get anomaly statistics
   */
  async getAnomalyStats(organizationId: string): Promise<{
    total: number;
    unresolved: number;
    byType: Record<AnomalyType, number>;
    bySeverity: Record<AnomalySeverity, number>;
  }> {
    const [total, unresolved, byType, bySeverity] = await Promise.all([
      this.prisma.aiAnomaly.count({ where: { organizationId } }),
      this.prisma.aiAnomaly.count({
        where: { organizationId, isResolved: false },
      }),
      this.prisma.aiAnomaly.groupBy({
        by: ['type'],
        where: { organizationId, isResolved: false },
        _count: true,
      }),
      this.prisma.aiAnomaly.groupBy({
        by: ['severity'],
        where: { organizationId, isResolved: false },
        _count: true,
      }),
    ]);

    const typeMap: Record<AnomalyType, number> = {
      TRANSACTION: 0,
      OVERTIME: 0,
      SPENDING: 0,
      PAYROLL: 0,
      INVENTORY: 0,
      REVENUE: 0,
    };
    for (const item of byType) {
      typeMap[item.type] = item._count;
    }

    const severityMap: Record<AnomalySeverity, number> = {
      LOW: 0,
      MEDIUM: 0,
      HIGH: 0,
      CRITICAL: 0,
    };
    for (const item of bySeverity) {
      severityMap[item.severity] = item._count;
    }

    return {
      total,
      unresolved,
      byType: typeMap,
      bySeverity: severityMap,
    };
  }
}
