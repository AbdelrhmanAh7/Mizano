import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';
import { PaymentPredictionService } from './payment-prediction.service';
import {
  CashFlowEvent,
  runCashFlowMonteCarlo,
  generateDailyForecasts,
  calculatePeriodTotals,
  applyWhatIfScenario,
  identifyCriticalDates,
} from '../utils/monte-carlo.util';

export interface CashFlowForecast {
  date: Date;
  openingBalance: number;
  inflows: { ar: number; other: number };
  outflows: { ap: number; payroll: number; recurring: number };
  closingBalance: { p10: number; p50: number; p90: number };
  alerts: string[];
}

export interface CashFlowPrediction {
  forecasts: CashFlowForecast[];
  summary: {
    currentCash: number;
    lowestPoint: { date: Date; amount: number };
    daysUntilNegative: number | null;
    totalExpectedInflows: number;
    totalExpectedOutflows: number;
  };
  confidence: 'high' | 'medium' | 'low';
  predictionMethod: 'ML' | 'RULE_BASED' | 'HYBRID';
}

export interface QuickForecast {
  next7Days: { low: number; expected: number; high: number };
  next30Days: { low: number; expected: number; high: number };
  next90Days: { low: number; expected: number; high: number };
  criticalDates: Array<{ date: Date; reason: string; impact: number }>;
}

export interface CashFlowScenario {
  name: string;
  forecasts: Array<{ date: Date; balance: number }>;
  lowestPoint: { date: Date; amount: number };
  daysUntilNegative: number | null;
}

export interface CashFlowAlert {
  type: 'warning' | 'critical';
  date: Date;
  message: string;
  suggestedAction: string;
}

export interface WhatIfScenario {
  type: 'delay_customer' | 'early_payment' | 'new_expense' | 'revenue_change';
  params: {
    customerId?: string;
    delayDays?: number;
    billId?: string;
    expenseAmount?: number;
    expenseDate?: Date;
    revenueChange?: number;
  };
}

export interface WhatIfResult {
  baseline: CashFlowForecast[];
  adjusted: CashFlowForecast[];
  impact: {
    totalChange: number;
    daysUntilNegativeChange: number | null;
  };
}

@Injectable()
export class CashFlowPredictionService {
  private readonly logger = new Logger(CashFlowPredictionService.name);
  private readonly MONTE_CARLO_RUNS = 500;
  private readonly LOW_CASH_THRESHOLD_DAYS = 30; // Alert if cash < 30 days of expenses

  constructor(
    private prisma: PrismaService,
    private paymentPredictionService: PaymentPredictionService,
  ) {}

  /**
   * Generate cash flow prediction with Monte Carlo simulation
   */
  async predict(organizationId: string, horizonDays: number = 90): Promise<CashFlowPrediction> {
    // 1. Get current cash balance
    const currentCash = await this.getCurrentCashBalance(organizationId);

    // 2. Gather all cash flow events
    const events = await this.gatherCashFlowEvents(organizationId, horizonDays);

    // 3. Run Monte Carlo simulation
    const simulation = runCashFlowMonteCarlo({
      currentCash,
      events,
      horizonDays,
      runs: this.MONTE_CARLO_RUNS,
    });

    // 4. Generate daily forecasts
    const startDate = new Date();
    startDate.setHours(0, 0, 0, 0);
    const dailyForecasts = generateDailyForecasts(simulation, startDate);

    // 5. Calculate totals
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + horizonDays);
    const totals = calculatePeriodTotals(events, startDate, endDate);

    // 6. Build forecasts response
    const forecasts: CashFlowForecast[] = dailyForecasts.map((day, index) => {
      const alerts: string[] = [];
      if (day.isNegativeRisk) {
        alerts.push('Cash balance may go negative');
      }
      if (day.isLowCashRisk) {
        alerts.push('Low cash warning');
      }

      return {
        date: day.date,
        openingBalance: index === 0 ? currentCash : dailyForecasts[index - 1].p50,
        inflows: {
          ar: totals.inflowsBySource.ar || 0,
          other: (totals.inflowsBySource.other || 0) / horizonDays,
        },
        outflows: {
          ap: totals.outflowsBySource.ap || 0,
          payroll: totals.outflowsBySource.payroll || 0,
          recurring: totals.outflowsBySource.recurring || 0,
        },
        closingBalance: {
          p10: day.p10,
          p50: day.p50,
          p90: day.p90,
        },
        alerts,
      };
    });

    // 7. Store forecasts
    await this.storeForecasts(organizationId, forecasts);

    // 8. Calculate confidence
    const confidence = this.calculateConfidence(events.length, currentCash);

    return {
      forecasts,
      summary: {
        currentCash,
        lowestPoint: {
          date: simulation.minBalanceDate || new Date(),
          amount: simulation.minBalance,
        },
        daysUntilNegative: simulation.daysUntilNegative,
        totalExpectedInflows: totals.expectedInflows,
        totalExpectedOutflows: totals.expectedOutflows,
      },
      confidence,
      predictionMethod: 'ML',
    };
  }

  /**
   * Get quick forecast summary
   */
  async getQuickForecast(organizationId: string): Promise<QuickForecast> {
    const prediction = await this.predict(organizationId, 90);
    const forecasts = prediction.forecasts;

    // Get balances at key points
    const day7 = forecasts[6] || forecasts[forecasts.length - 1];
    const day30 = forecasts[29] || forecasts[forecasts.length - 1];
    const day90 = forecasts[89] || forecasts[forecasts.length - 1];

    // Get critical dates
    const events = await this.gatherCashFlowEvents(organizationId, 90);
    const simplifiedForecasts = forecasts.map((f) => ({
      date: f.date,
      p10: f.closingBalance.p10,
      p50: f.closingBalance.p50,
    }));
    const threshold = prediction.summary.currentCash * 0.1;
    const criticalDates = identifyCriticalDates(simplifiedForecasts, events, threshold);

    return {
      next7Days: {
        low: day7.closingBalance.p10,
        expected: day7.closingBalance.p50,
        high: day7.closingBalance.p90,
      },
      next30Days: {
        low: day30.closingBalance.p10,
        expected: day30.closingBalance.p50,
        high: day30.closingBalance.p90,
      },
      next90Days: {
        low: day90.closingBalance.p10,
        expected: day90.closingBalance.p50,
        high: day90.closingBalance.p90,
      },
      criticalDates: criticalDates.map((cd) => ({
        date: cd.date,
        reason: cd.reason,
        impact: cd.impact,
      })),
    };
  }

  /**
   * Get optimistic, expected, and pessimistic scenarios
   */
  async getScenarios(organizationId: string): Promise<{
    optimistic: CashFlowScenario;
    expected: CashFlowScenario;
    pessimistic: CashFlowScenario;
  }> {
    const prediction = await this.predict(organizationId, 90);

    const buildScenario = (name: string, percentile: 'p10' | 'p50' | 'p90'): CashFlowScenario => {
      const forecasts = prediction.forecasts.map((f) => ({
        date: f.date,
        balance: f.closingBalance[percentile],
      }));

      let lowestPoint = { date: forecasts[0].date, amount: forecasts[0].balance };
      let daysUntilNegative: number | null = null;

      forecasts.forEach((f, index) => {
        if (f.balance < lowestPoint.amount) {
          lowestPoint = { date: f.date, amount: f.balance };
        }
        if (f.balance < 0 && daysUntilNegative === null) {
          daysUntilNegative = index;
        }
      });

      return {
        name,
        forecasts,
        lowestPoint,
        daysUntilNegative,
      };
    };

    return {
      optimistic: buildScenario('Optimistic (90th percentile)', 'p90'),
      expected: buildScenario('Expected (50th percentile)', 'p50'),
      pessimistic: buildScenario('Pessimistic (10th percentile)', 'p10'),
    };
  }

  /**
   * Get alerts for cash flow issues
   */
  async getAlerts(organizationId: string): Promise<CashFlowAlert[]> {
    const prediction = await this.predict(organizationId, 90);
    const alerts: CashFlowAlert[] = [];
    const avgDailyExpense = prediction.summary.totalExpectedOutflows / 90 || 1000;

    for (const forecast of prediction.forecasts) {
      // Critical: Negative cash
      if (forecast.closingBalance.p10 < 0) {
        alerts.push({
          type: 'critical',
          date: forecast.date,
          message: `Cash balance may go negative by ${Math.abs(forecast.closingBalance.p10).toLocaleString()}`,
          suggestedAction: 'Consider accelerating receivables collection or delaying payables',
        });
        break; // Only report first critical
      }

      // Warning: Low cash (less than 30 days of expenses)
      const daysOfCash = forecast.closingBalance.p50 / avgDailyExpense;
      if (daysOfCash < this.LOW_CASH_THRESHOLD_DAYS && alerts.length === 0) {
        alerts.push({
          type: 'warning',
          date: forecast.date,
          message: `Cash reserves fall below ${this.LOW_CASH_THRESHOLD_DAYS} days of operating expenses`,
          suggestedAction: 'Review upcoming large payments and receivables',
        });
      }
    }

    // Check for large single-day outflows
    const largeOutflowThreshold = prediction.summary.currentCash * 0.2;
    for (const forecast of prediction.forecasts) {
      const totalOutflow =
        forecast.outflows.ap + forecast.outflows.payroll + forecast.outflows.recurring;
      if (totalOutflow > largeOutflowThreshold) {
        alerts.push({
          type: 'warning',
          date: forecast.date,
          message: `Large payment day: ${totalOutflow.toLocaleString()} in outflows`,
          suggestedAction: 'Ensure sufficient funds are available',
        });
      }
    }

    return alerts.slice(0, 5); // Limit to 5 alerts
  }

  /**
   * Run what-if analysis
   */
  async whatIf(organizationId: string, scenario: WhatIfScenario): Promise<WhatIfResult> {
    // Get baseline prediction
    const baselinePrediction = await this.predict(organizationId, 90);

    // Gather events and apply scenario
    const events = await this.gatherCashFlowEvents(organizationId, 90);
    const adjustedEvents = applyWhatIfScenario(events, {
      type: scenario.type,
      customerId: scenario.params.customerId,
      delayDays: scenario.params.delayDays,
      billId: scenario.params.billId,
      expenseAmount: scenario.params.expenseAmount,
      expenseDate: scenario.params.expenseDate,
      revenueChangePercent: scenario.params.revenueChange,
    });

    // Run simulation with adjusted events
    const currentCash = await this.getCurrentCashBalance(organizationId);
    const adjustedSimulation = runCashFlowMonteCarlo({
      currentCash,
      events: adjustedEvents,
      horizonDays: 90,
      runs: this.MONTE_CARLO_RUNS,
    });

    const startDate = new Date();
    const adjustedDailyForecasts = generateDailyForecasts(adjustedSimulation, startDate);

    const adjustedForecasts: CashFlowForecast[] = adjustedDailyForecasts.map((day, index) => ({
      date: day.date,
      openingBalance: index === 0 ? currentCash : adjustedDailyForecasts[index - 1].p50,
      inflows: { ar: 0, other: 0 },
      outflows: { ap: 0, payroll: 0, recurring: 0 },
      closingBalance: { p10: day.p10, p50: day.p50, p90: day.p90 },
      alerts: [],
    }));

    // Calculate impact
    const baselineEndBalance =
      baselinePrediction.forecasts[baselinePrediction.forecasts.length - 1]?.closingBalance.p50 ||
      currentCash;
    const adjustedEndBalance =
      adjustedForecasts[adjustedForecasts.length - 1]?.closingBalance.p50 || currentCash;

    return {
      baseline: baselinePrediction.forecasts,
      adjusted: adjustedForecasts,
      impact: {
        totalChange: adjustedEndBalance - baselineEndBalance,
        daysUntilNegativeChange:
          adjustedSimulation.daysUntilNegative !== null &&
          baselinePrediction.summary.daysUntilNegative !== null
            ? adjustedSimulation.daysUntilNegative - baselinePrediction.summary.daysUntilNegative
            : null,
      },
    };
  }

  /**
   * Daily recalculation (for cron job)
   */
  async dailyRecalculate(organizationId: string): Promise<{ updated: number }> {
    try {
      const prediction = await this.predict(organizationId, 90);
      return { updated: prediction.forecasts.length };
    } catch (error) {
      this.logger.error(`Failed to recalculate cash flow for org ${organizationId}: ${error}`);
      return { updated: 0 };
    }
  }

  // Private helper methods

  /**
   * Get current cash balance from bank accounts
   */
  private async getCurrentCashBalance(organizationId: string): Promise<number> {
    const bankAccounts = await this.prisma.bankAccount.findMany({
      where: {
        organizationId,
        isActive: true,
      },
      select: {
        systemBalance: true,
      },
    });

    return bankAccounts.reduce((sum, acc) => sum + Number(acc.systemBalance), 0);
  }

  /**
   * Gather all cash flow events for the forecast period
   */
  private async gatherCashFlowEvents(
    organizationId: string,
    horizonDays: number,
  ): Promise<CashFlowEvent[]> {
    const events: CashFlowEvent[] = [];
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + horizonDays);

    // 1. Get outstanding invoices (AR inflows)
    const outstandingInvoices = await this.prisma.invoice.findMany({
      where: {
        organizationId,
        status: { in: ['SENT', 'PARTIALLY_PAID', 'OVERDUE'] },
        deletedAt: null,
      },
      select: {
        id: true,
        invoiceNumber: true,
        customerId: true,
        grandTotal: true,
        balanceDue: true,
        dueDate: true,
        customer: { select: { name: true } },
      },
    });

    for (const invoice of outstandingInvoices) {
      const amountDue = Number(invoice.balanceDue);
      if (amountDue <= 0) continue;

      // Try to get payment prediction
      let predictedDate = invoice.dueDate;
      let confidence = 0.5;

      try {
        const prediction = await this.paymentPredictionService.predictPaymentDate(
          organizationId,
          invoice.id,
        );
        if (prediction) {
          predictedDate = prediction.predictedDate;
          confidence =
            prediction.confidence === 'high' ? 0.8 : prediction.confidence === 'medium' ? 0.6 : 0.4;
        }
      } catch {
        // Use due date if prediction fails
      }

      if (predictedDate <= endDate) {
        events.push({
          id: invoice.id,
          date: predictedDate,
          amount: amountDue,
          type: 'inflow',
          source: 'ar',
          variability: 'timing',
          predictedDate,
          confidence,
          entityId: invoice.customerId,
          entityName: invoice.customer?.name || invoice.invoiceNumber,
        });
      }
    }

    // 2. Get outstanding bills (AP outflows)
    const outstandingBills = await this.prisma.bill.findMany({
      where: {
        organizationId,
        status: { in: ['OPEN', 'PARTIALLY_PAID', 'OVERDUE'] },
        deletedAt: null,
      },
      select: {
        id: true,
        billNumber: true,
        vendorId: true,
        grandTotal: true,
        balanceDue: true,
        dueDate: true,
        vendor: { select: { name: true } },
      },
    });

    for (const bill of outstandingBills) {
      const amountDue = Number(bill.balanceDue);
      if (amountDue <= 0 || bill.dueDate > endDate) continue;

      events.push({
        id: bill.id,
        date: bill.dueDate,
        amount: amountDue,
        type: 'outflow',
        source: 'ap',
        variability: 'fixed',
        entityId: bill.vendorId,
        entityName: bill.vendor?.name || bill.billNumber,
      });
    }

    // 3. Get scheduled payroll (if exists)
    const upcomingPayroll = await this.prisma.payrollRun.findMany({
      where: {
        organizationId,
        status: { in: ['DRAFT', 'PROCESSED'] },
        payDate: { gte: startDate, lte: endDate },
      },
      select: {
        id: true,
        payDate: true,
        totalNet: true,
        periodEnd: true,
      },
    });

    for (const payroll of upcomingPayroll) {
      if (payroll.payDate) {
        events.push({
          id: payroll.id,
          date: payroll.payDate,
          amount: Number(payroll.totalNet),
          type: 'outflow',
          source: 'payroll',
          variability: 'fixed',
          entityName: `Payroll - ${payroll.periodEnd?.toLocaleDateString()}`,
        });
      }
    }

    // 4. Get recurring profiles (recurring inflows/outflows)
    const recurringProfiles = await this.prisma.recurringProfile.findMany({
      where: {
        organizationId,
        isActive: true,
        nextRunDate: { lte: endDate },
      },
      select: {
        id: true,
        name: true,
        frequency: true,
        templateData: true,
        nextRunDate: true,
        type: true,
      },
    });

    for (const profile of recurringProfiles) {
      const runDate = profile.nextRunDate ? new Date(profile.nextRunDate) : new Date();
      const intervalDays = this.getIntervalDays(profile.frequency);

      // Extract amount from templateData JSON
      const templateData = profile.templateData as Record<string, unknown> | null;
      const profileAmount =
        templateData && typeof templateData === 'object'
          ? Number((templateData as any).grandTotal || (templateData as any).amount || 0)
          : 0;

      while (runDate <= endDate) {
        if (runDate >= startDate) {
          events.push({
            id: `${profile.id}-${runDate.toISOString()}`,
            date: new Date(runDate),
            amount: profileAmount,
            type: profile.type === 'INVOICE' ? 'inflow' : 'outflow',
            source: 'recurring',
            variability: 'fixed',
            entityName: profile.name,
          });
        }
        runDate.setDate(runDate.getDate() + intervalDays);
      }
    }

    return events;
  }

  /**
   * Get interval in days for recurring frequency
   */
  private getIntervalDays(frequency: string): number {
    switch (frequency) {
      case 'DAILY':
        return 1;
      case 'WEEKLY':
        return 7;
      case 'MONTHLY':
        return 30;
      case 'YEARLY':
        return 365;
      default:
        return 30;
    }
  }

  /**
   * Calculate confidence level
   */
  private calculateConfidence(eventCount: number, currentCash: number): 'high' | 'medium' | 'low' {
    if (eventCount > 20 && currentCash > 0) return 'high';
    if (eventCount > 10) return 'medium';
    return 'low';
  }

  /**
   * Store forecasts in database
   */
  private async storeForecasts(
    organizationId: string,
    forecasts: CashFlowForecast[],
  ): Promise<void> {
    // Delete old forecasts
    await this.prisma.cashFlowForecast.deleteMany({
      where: { organizationId },
    });

    // Insert new forecasts
    await this.prisma.cashFlowForecast.createMany({
      data: forecasts.map((f) => ({
        organizationId,
        forecastDate: f.date,
        openingBalance: new Decimal(f.openingBalance),
        expectedInflows: new Decimal(f.inflows.ar + f.inflows.other),
        expectedOutflows: new Decimal(f.outflows.ap + f.outflows.payroll + f.outflows.recurring),
        closingBalanceP10: new Decimal(f.closingBalance.p10),
        closingBalanceP50: new Decimal(f.closingBalance.p50),
        closingBalanceP90: new Decimal(f.closingBalance.p90),
        lowCashAlert: f.alerts.includes('Low cash warning'),
        negativeCashAlert: f.alerts.includes('Cash balance may go negative'),
      })),
    });
  }
}
