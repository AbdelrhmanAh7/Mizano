import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';
import {
  buildIsolationForest1D,
  isolationForestScore1D,
} from '../utils/isolation-forest.util';
import { zScore, mean, standardDeviation } from '../utils/statistics.util';

export interface FraudScoreResult {
  entityType: string;
  entityId: string;
  fraudScore: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  signals: FraudSignal[];
  isAnomaly: boolean;
}

export interface FraudSignal {
  signal: string;
  score: number;
  description: string;
  triggered: boolean;
}

@Injectable()
export class FraudDetectionService {
  private readonly logger = new Logger(FraudDetectionService.name);

  constructor(private prisma: PrismaService) {}

  async scoreTransaction(
    organizationId: string,
    entityType: string,
    entityId: string,
  ): Promise<FraudScoreResult> {
    const signals: FraudSignal[] = [];
    let totalScore = 0;
    let weightSum = 0;

    // 1. Amount anomaly check (weight: 0.3)
    const amountResult = await this.amountAnomalyCheck(
      organizationId,
      entityType,
      entityId,
    );
    signals.push(amountResult.signal);
    totalScore += amountResult.signal.score * 0.3;
    weightSum += 0.3;

    // 2. Time-of-day check (weight: 0.15)
    const timeResult = await this.timeOfDayCheck(
      organizationId,
      entityType,
      entityId,
    );
    signals.push(timeResult);
    totalScore += timeResult.score * 0.15;
    weightSum += 0.15;

    // 3. Velocity check (weight: 0.25)
    const velocityResult = await this.velocityCheck(
      organizationId,
      entityType,
      entityId,
    );
    signals.push(velocityResult);
    totalScore += velocityResult.score * 0.25;
    weightSum += 0.25;

    // 4. Duplicate check (weight: 0.2)
    const dupResult = await this.duplicateCheck(
      organizationId,
      entityType,
      entityId,
    );
    signals.push(dupResult);
    totalScore += dupResult.score * 0.2;
    weightSum += 0.2;

    // 5. Benford's law check (weight: 0.1)
    const benfordResult = await this.benfordCheck(
      organizationId,
      entityType,
      entityId,
    );
    signals.push(benfordResult);
    totalScore += benfordResult.score * 0.1;
    weightSum += 0.1;

    const fraudScore = weightSum > 0 ? totalScore / weightSum : 0;
    const riskLevel = this.getRiskLevel(fraudScore);

    return {
      entityType,
      entityId,
      fraudScore: Math.round(fraudScore * 1000) / 1000,
      riskLevel,
      signals,
      isAnomaly: fraudScore > 0.5,
    };
  }

  async dailyFraudScan(
    organizationId: string,
  ): Promise<{ scanned: number; alertsCreated: number }> {
    const yesterday = new Date(Date.now() - 86400000);
    let scanned = 0;
    let alertsCreated = 0;

    // Scan recent journals
    const journals = await this.prisma.journal.findMany({
      where: {
        organizationId,
        createdAt: { gte: yesterday },
        deletedAt: null,
      },
      select: { id: true },
    });

    for (const journal of journals) {
      scanned++;
      try {
        const result = await this.scoreTransaction(
          organizationId,
          'journal',
          journal.id,
        );
        if (result.fraudScore > 0.5) {
          await this.createFraudAlert(organizationId, result);
          alertsCreated++;
        }
      } catch {
        // skip
      }
    }

    // Scan recent bank transactions
    const bankTxns = await this.prisma.bankTransaction.findMany({
      where: {
        organizationId,
        createdAt: { gte: yesterday },
      },
      select: { id: true },
    });

    for (const txn of bankTxns) {
      scanned++;
      try {
        const result = await this.scoreTransaction(
          organizationId,
          'bank_transaction',
          txn.id,
        );
        if (result.fraudScore > 0.5) {
          await this.createFraudAlert(organizationId, result);
          alertsCreated++;
        }
      } catch {
        // skip
      }
    }

    // Scan recent expenses
    const expenses = await this.prisma.expense.findMany({
      where: {
        organizationId,
        createdAt: { gte: yesterday },
        deletedAt: null,
      },
      select: { id: true },
    });

    for (const expense of expenses) {
      scanned++;
      try {
        const result = await this.scoreTransaction(
          organizationId,
          'expense',
          expense.id,
        );
        if (result.fraudScore > 0.5) {
          await this.createFraudAlert(organizationId, result);
          alertsCreated++;
        }
      } catch {
        // skip
      }
    }

    this.logger.log(
      `Fraud scan: ${scanned} scanned, ${alertsCreated} alerts created`,
    );
    return { scanned, alertsCreated };
  }

  async getFraudAlerts(
    organizationId: string,
    resolved?: boolean,
    limit?: number,
  ): Promise<any[]> {
    const where: any = { organizationId };
    if (resolved !== undefined) where.isResolved = resolved;

    return this.prisma.fraudAlert.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit || 100,
    });
  }

  async resolveAlert(
    organizationId: string,
    alertId: string,
    isConfirmedFraud: boolean,
    resolvedBy: string,
  ): Promise<void> {
    await this.prisma.fraudAlert.update({
      where: { id: alertId },
      data: {
        isResolved: true,
        isConfirmedFraud,
        resolvedAt: new Date(),
        resolvedBy,
      },
    });
  }

  // ─── SIGNAL CHECKS ───

  private async amountAnomalyCheck(
    organizationId: string,
    entityType: string,
    entityId: string,
  ): Promise<{ signal: FraudSignal; amount: number }> {
    const amount = await this.getEntityAmount(
      organizationId,
      entityType,
      entityId,
    );
    const historicalAmounts = await this.getHistoricalAmounts(
      organizationId,
      entityType,
    );

    let score = 0;
    let description = 'Amount within normal range';

    if (historicalAmounts.length >= 10) {
      // Z-score check
      const z = Math.abs(zScore(amount, historicalAmounts));
      if (z > 3) {
        score = 0.9;
        description = `Amount is ${z.toFixed(1)} std deviations from mean`;
      } else if (z > 2) {
        score = 0.5;
        description = `Amount is ${z.toFixed(1)} std deviations from mean`;
      }

      // Isolation forest check
      if (historicalAmounts.length >= 20) {
        const forest = buildIsolationForest1D(historicalAmounts, 50);
        const isoScore = isolationForestScore1D(amount, forest);
        if (isoScore > 0.6) {
          score = Math.max(score, isoScore);
          description = `Anomalous amount detected (isolation score: ${isoScore.toFixed(2)})`;
        }
      }
    }

    return {
      signal: {
        signal: 'amount_anomaly',
        score,
        description,
        triggered: score > 0.4,
      },
      amount,
    };
  }

  private async timeOfDayCheck(
    organizationId: string,
    entityType: string,
    entityId: string,
  ): Promise<FraudSignal> {
    const createdAt = await this.getEntityCreatedAt(
      organizationId,
      entityType,
      entityId,
    );
    if (!createdAt) {
      return {
        signal: 'time_anomaly',
        score: 0,
        description: 'Unable to check time',
        triggered: false,
      };
    }

    const hour = createdAt.getHours();
    const isWeekend = [0, 6].includes(createdAt.getDay());

    let score = 0;
    let description = 'Normal business hours';

    if (hour >= 0 && hour < 5) {
      score = 0.8;
      description = `Created at unusual hour (${hour}:00)`;
    } else if (hour >= 22 || hour < 7) {
      score = 0.4;
      description = `Created outside business hours (${hour}:00)`;
    }

    if (isWeekend) {
      score = Math.min(1, score + 0.2);
      description += ' on weekend';
    }

    return {
      signal: 'time_anomaly',
      score,
      description,
      triggered: score > 0.3,
    };
  }

  private async velocityCheck(
    organizationId: string,
    entityType: string,
    entityId: string,
  ): Promise<FraudSignal> {
    const createdAt = await this.getEntityCreatedAt(
      organizationId,
      entityType,
      entityId,
    );
    if (!createdAt) {
      return {
        signal: 'velocity',
        score: 0,
        description: 'Unable to check velocity',
        triggered: false,
      };
    }

    // Count entities created within 1 hour window
    const oneHourBefore = new Date(createdAt.getTime() - 3600000);
    const oneHourAfter = new Date(createdAt.getTime() + 3600000);

    let count = 0;
    if (entityType === 'journal') {
      count = await this.prisma.journal.count({
        where: {
          organizationId,
          createdAt: { gte: oneHourBefore, lte: oneHourAfter },
          deletedAt: null,
        },
      });
    } else if (entityType === 'expense') {
      count = await this.prisma.expense.count({
        where: {
          organizationId,
          createdAt: { gte: oneHourBefore, lte: oneHourAfter },
          deletedAt: null,
        },
      });
    } else if (entityType === 'bank_transaction') {
      count = await this.prisma.bankTransaction.count({
        where: {
          organizationId,
          createdAt: { gte: oneHourBefore, lte: oneHourAfter },
        },
      });
    }

    let score = 0;
    let description = `${count} similar transactions in time window`;

    if (count > 20) {
      score = 0.9;
      description = `High velocity: ${count} transactions within 1 hour`;
    } else if (count > 10) {
      score = 0.5;
      description = `Elevated velocity: ${count} transactions within 1 hour`;
    }

    return {
      signal: 'velocity',
      score,
      description,
      triggered: score > 0.3,
    };
  }

  private async duplicateCheck(
    organizationId: string,
    entityType: string,
    entityId: string,
  ): Promise<FraudSignal> {
    const amount = await this.getEntityAmount(
      organizationId,
      entityType,
      entityId,
    );
    const createdAt = await this.getEntityCreatedAt(
      organizationId,
      entityType,
      entityId,
    );
    if (!createdAt) {
      return {
        signal: 'duplicate',
        score: 0,
        description: 'Unable to check duplicates',
        triggered: false,
      };
    }

    // Check for same amount on same day
    const dayStart = new Date(createdAt);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(createdAt);
    dayEnd.setHours(23, 59, 59, 999);

    let duplicateCount = 0;
    if (entityType === 'expense') {
      duplicateCount = await this.prisma.expense.count({
        where: {
          organizationId,
          amount: new Decimal(amount),
          createdAt: { gte: dayStart, lte: dayEnd },
          id: { not: entityId },
          deletedAt: null,
        },
      });
    } else if (entityType === 'journal') {
      // Compare journal totals computed from lines
      const sameDayJournals = await this.prisma.journal.findMany({
        where: {
          organizationId,
          createdAt: { gte: dayStart, lte: dayEnd },
          id: { not: entityId },
          deletedAt: null,
        },
        select: { lines: { select: { debit: true } } },
      });
      for (const j of sameDayJournals) {
        const jTotal = j.lines.reduce((sum, l) => sum + Number(l.debit), 0);
        if (Math.abs(jTotal - amount) < 0.01) {
          duplicateCount++;
        }
      }
    }

    let score = 0;
    let description = 'No duplicates detected';

    if (duplicateCount >= 3) {
      score = 0.9;
      description = `${duplicateCount} potential duplicates found on same day`;
    } else if (duplicateCount >= 1) {
      score = 0.5;
      description = `${duplicateCount} similar amount transaction on same day`;
    }

    return {
      signal: 'duplicate',
      score,
      description,
      triggered: score > 0.3,
    };
  }

  private async benfordCheck(
    organizationId: string,
    entityType: string,
    entityId: string,
  ): Promise<FraudSignal> {
    const amount = await this.getEntityAmount(
      organizationId,
      entityType,
      entityId,
    );
    const leadingDigit = parseInt(Math.abs(amount).toString()[0]);

    // Benford's expected distribution
    const expected: Record<number, number> = {
      1: 0.301, 2: 0.176, 3: 0.125, 4: 0.097, 5: 0.079,
      6: 0.067, 7: 0.058, 8: 0.051, 9: 0.046,
    };

    // Get actual distribution from recent transactions
    const historicalAmounts = await this.getHistoricalAmounts(
      organizationId,
      entityType,
    );

    if (historicalAmounts.length < 50) {
      return {
        signal: 'benford',
        score: 0,
        description: 'Insufficient data for Benford analysis',
        triggered: false,
      };
    }

    const digitCounts: Record<number, number> = {};
    for (const amt of historicalAmounts) {
      const d = parseInt(Math.abs(amt).toString()[0]);
      if (d >= 1 && d <= 9) {
        digitCounts[d] = (digitCounts[d] || 0) + 1;
      }
    }

    // Chi-squared test
    let chiSquared = 0;
    const total = historicalAmounts.length;
    for (let d = 1; d <= 9; d++) {
      const observed = (digitCounts[d] || 0) / total;
      const exp = expected[d];
      chiSquared += Math.pow(observed - exp, 2) / exp;
    }

    // High chi-squared means distribution doesn't follow Benford
    const score = chiSquared > 0.1 ? Math.min(1, chiSquared * 2) : 0;

    return {
      signal: 'benford',
      score,
      description:
        score > 0.3
          ? `Digit distribution deviates from Benford\'s law (χ²=${chiSquared.toFixed(3)})`
          : 'Digit distribution follows expected pattern',
      triggered: score > 0.3,
    };
  }

  // ─── HELPERS ───

  private async getEntityAmount(
    organizationId: string,
    entityType: string,
    entityId: string,
  ): Promise<number> {
    if (entityType === 'expense') {
      const e = await this.prisma.expense.findUnique({
        where: { id: entityId },
        select: { amount: true },
      });
      return e ? Number(e.amount) : 0;
    }
    if (entityType === 'journal') {
      const j = await this.prisma.journal.findUnique({
        where: { id: entityId },
        select: { lines: { select: { debit: true } } },
      });
      return j ? j.lines.reduce((sum, l) => sum + Number(l.debit), 0) : 0;
    }
    if (entityType === 'bank_transaction') {
      const bt = await this.prisma.bankTransaction.findUnique({
        where: { id: entityId },
        select: { amount: true },
      });
      return bt ? Number(bt.amount) : 0;
    }
    return 0;
  }

  private async getEntityCreatedAt(
    organizationId: string,
    entityType: string,
    entityId: string,
  ): Promise<Date | null> {
    if (entityType === 'expense') {
      const e = await this.prisma.expense.findUnique({
        where: { id: entityId },
        select: { createdAt: true },
      });
      return e?.createdAt || null;
    }
    if (entityType === 'journal') {
      const j = await this.prisma.journal.findUnique({
        where: { id: entityId },
        select: { createdAt: true },
      });
      return j?.createdAt || null;
    }
    if (entityType === 'bank_transaction') {
      const bt = await this.prisma.bankTransaction.findUnique({
        where: { id: entityId },
        select: { createdAt: true },
      });
      return bt?.createdAt || null;
    }
    return null;
  }

  private async getHistoricalAmounts(
    organizationId: string,
    entityType: string,
  ): Promise<number[]> {
    const sixMonthsAgo = new Date(Date.now() - 180 * 86400000);

    if (entityType === 'expense') {
      const expenses = await this.prisma.expense.findMany({
        where: { organizationId, createdAt: { gte: sixMonthsAgo }, deletedAt: null },
        select: { amount: true },
        take: 500,
      });
      return expenses.map((e) => Number(e.amount));
    }
    if (entityType === 'journal') {
      const journals = await this.prisma.journal.findMany({
        where: { organizationId, createdAt: { gte: sixMonthsAgo }, deletedAt: null },
        select: { lines: { select: { debit: true } } },
        take: 500,
      });
      return journals.map((j) =>
        j.lines.reduce((sum, l) => sum + Number(l.debit), 0),
      );
    }
    if (entityType === 'bank_transaction') {
      const txns = await this.prisma.bankTransaction.findMany({
        where: { organizationId, createdAt: { gte: sixMonthsAgo } },
        select: { amount: true },
        take: 500,
      });
      return txns.map((t) => Number(t.amount));
    }
    return [];
  }

  private async createFraudAlert(
    organizationId: string,
    result: FraudScoreResult,
  ): Promise<void> {
    // Check if alert already exists for this entity
    const existing = await this.prisma.fraudAlert.findFirst({
      where: {
        organizationId,
        entityType: result.entityType,
        entityId: result.entityId,
        isResolved: false,
      },
    });

    if (existing) return;

    await this.prisma.fraudAlert.create({
      data: {
        organizationId,
        entityType: result.entityType,
        entityId: result.entityId,
        fraudScore: new Decimal(result.fraudScore),
        signals: result.signals as any,
        velocityCheck: result.signals.some(
          (s) => s.signal === 'velocity' && s.triggered,
        ),
        amountAnomaly: result.signals.some(
          (s) => s.signal === 'amount_anomaly' && s.triggered,
        ),
        timeAnomaly: result.signals.some(
          (s) => s.signal === 'time_anomaly' && s.triggered,
        ),
        duplicateCheck: result.signals.some(
          (s) => s.signal === 'duplicate' && s.triggered,
        ),
      },
    });
  }

  private getRiskLevel(
    score: number,
  ): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
    if (score >= 0.8) return 'CRITICAL';
    if (score >= 0.6) return 'HIGH';
    if (score >= 0.4) return 'MEDIUM';
    return 'LOW';
  }
}
