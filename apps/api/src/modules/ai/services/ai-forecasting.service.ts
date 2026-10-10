import { Injectable } from '@nestjs/common';
import { bankBookBalances, totalBankBookBalance } from '../../reports/utils/report-utils';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class AiForecastingService {
  constructor(private prisma: PrismaService) {}

  async forecastRevenue(organizationId: string, months: number = 3) {
    // Get historical revenue data (last 12 months)
    const historicalData = await this.getMonthlyRevenue(organizationId, 12);

    // Simple moving average forecast
    const forecastData = this.simpleMovingAverageForecast(historicalData, months);

    // Calculate confidence based on variance
    const variance = this.calculateVariance(historicalData);
    const confidence = this.calculateConfidence(variance);

    // Combine historical + forecast into the shape the frontend expects:
    // { date: ISO string, actualRevenue?: number, predictedRevenue: number, variance?: number }
    const combined = [
      ...historicalData.map((h) => ({
        date: h.isoDate,
        actualRevenue: h.value,
        predictedRevenue: h.value,
        variance: 0,
      })),
      ...forecastData.map((f) => ({
        date: f.isoDate,
        predictedRevenue: f.value,
        actualRevenue: undefined,
        variance: undefined,
      })),
    ];

    return {
      data: combined,
      confidence,
      methodology: 'Simple Moving Average (3-month)',
      generatedAt: new Date(),
    };
  }

  async forecastCashFlow(organizationId: string, weeks: number = 4) {
    // Get current bank balance
    const books = await bankBookBalances(this.prisma, organizationId);
    const bookTotal = totalBankBookBalance(books).toNumber();
    let currentBalance = bookTotal;

    const weeklyRecurring = await this.estimateWeeklyRecurring(organizationId);
    const rawForecast = [];
    const today = new Date();

    for (let i = 1; i <= weeks; i++) {
      const weekStart = new Date(today);
      weekStart.setDate(weekStart.getDate() + (i - 1) * 7);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);

      // Expected inflows - invoices due this week
      const expectedInflows = await this.prisma.invoice.findMany({
        where: {
          organizationId,
          deletedAt: null,
          balanceDue: { gt: 0 },
          dueDate: { gte: weekStart, lt: weekEnd },
        },
      });
      const inflowAmount = expectedInflows.reduce(
        (sum, inv) => sum + parseFloat(inv.balanceDue.toString()),
        0,
      );

      // Expected outflows - bills due this week
      const expectedOutflows = await this.prisma.bill.findMany({
        where: {
          organizationId,
          deletedAt: null,
          balanceDue: { gt: 0 },
          dueDate: { gte: weekStart, lt: weekEnd },
        },
      });
      const outflowAmount = expectedOutflows.reduce(
        (sum, bill) => sum + parseFloat(bill.balanceDue.toString()),
        0,
      );

      const totalOutflow = outflowAmount + weeklyRecurring;
      const netCashFlow = inflowAmount - totalOutflow;
      currentBalance += netCashFlow;

      rawForecast.push({
        week: i,
        startDate: weekStart.toISOString().split('T')[0],
        projectedBalance: currentBalance,
        expectedInflows: inflowAmount,
        expectedOutflows: totalOutflow,
      });
    }

    // Map to the shape the frontend expects:
    // { date, predictedInflow, predictedOutflow, predictedBalance, lowerBound, upperBound }
    const data = rawForecast.map((w) => ({
      date: w.startDate,
      predictedInflow: w.expectedInflows,
      predictedOutflow: w.expectedOutflows,
      predictedBalance: w.projectedBalance,
      lowerBound: Math.round(w.projectedBalance * 0.85 * 100) / 100,
      upperBound: Math.round(w.projectedBalance * 1.15 * 100) / 100,
    }));

    return {
      data,
      currentBalance: bookTotal,
      warnings: this.generateCashFlowWarnings(rawForecast),
      generatedAt: new Date(),
    };
  }

  async forecastExpenses(organizationId: string, months: number = 3) {
    // Get historical expenses by category
    const historicalData = await this.getMonthlyExpenses(organizationId, 12);

    // Group by category and forecast each
    const categoryForecasts: Record<string, unknown> = {};

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const typedForecasts: Record<string, any> = categoryForecasts;
    for (const month of historicalData) {
      for (const [category, amount] of Object.entries(month.byCategory)) {
        if (!typedForecasts[category]) {
          typedForecasts[category] = { historical: [], forecast: [] };
        }
        typedForecasts[category].historical.push(amount);
      }
    }

    // Forecast each category
    for (const category in typedForecasts) {
      const data = typedForecasts[category];
      data.forecast = this.simpleMovingAverageForecast(
        data.historical.map((amount: number, i: number) => ({ month: i, value: amount })),
        months,
      );
      data.averageMonthly =
        data.historical.reduce((sum: number, v: number) => sum + v, 0) / data.historical.length;
    }

    // Calculate total forecast
    const totalForecast = [];
    for (let i = 0; i < months; i++) {
      let total = 0;
      for (const category in typedForecasts) {
        total += typedForecasts[category].forecast[i]?.value || 0;
      }
      const futureMonth = new Date();
      futureMonth.setMonth(futureMonth.getMonth() + i + 1);
      totalForecast.push({
        month: futureMonth.toLocaleString('default', { month: 'short', year: 'numeric' }),
        value: total,
      });
    }

    return {
      byCategory: categoryForecasts,
      totalForecast,
      generatedAt: new Date(),
    };
  }

  async predictCustomerChurn(organizationId: string) {
    // Get customers with their activity
    const customers = await this.prisma.customer.findMany({
      where: { organizationId, deletedAt: null },
      include: {
        invoices: {
          where: { deletedAt: null },
          orderBy: { date: 'desc' },
          take: 10,
        },
      },
    });

    const churnRisks: Array<{
      customerId: string;
      customerName: string;
      riskScore: number;
      riskLevel: string;
      riskFactors: string[];
      lastActivity: Date | undefined;
      totalRevenue: number;
      invoiceCount: number;
    }> = [];
    const today = new Date();
    const threeMonthsAgo = new Date(today);
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const sixMonthsAgo = new Date(today);
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    for (const customer of customers) {
      const lastInvoiceDate = customer.invoices[0]?.date;
      const invoiceCount = customer.invoices.length;
      const recentInvoices = customer.invoices.filter(
        (inv: { date: Date }) => inv.date >= threeMonthsAgo,
      ).length;

      // Calculate churn risk score
      let riskScore = 0;
      const riskFactors: string[] = [];

      // No invoices in 3 months
      if (lastInvoiceDate && lastInvoiceDate < threeMonthsAgo) {
        riskScore += 40;
        riskFactors.push('No activity in 3+ months');
      }

      // Declining activity
      const oldInvoices = customer.invoices.filter(
        (inv: { date: Date }) => inv.date >= sixMonthsAgo && inv.date < threeMonthsAgo,
      ).length;
      if (oldInvoices > recentInvoices * 2) {
        riskScore += 30;
        riskFactors.push('Declining purchase frequency');
      }

      // Low lifetime value
      const totalRevenue = customer.invoices.reduce(
        (sum: number, inv: { grandTotal: { toString: () => string } }) =>
          sum + parseFloat(inv.grandTotal.toString()),
        0,
      );
      if (invoiceCount > 0 && totalRevenue / invoiceCount < 100) {
        riskScore += 20;
        riskFactors.push('Low average order value');
      }

      if (riskScore > 30) {
        churnRisks.push({
          customerId: customer.id,
          customerName: customer.name,
          riskScore: Math.min(100, riskScore),
          riskLevel: riskScore >= 70 ? 'High' : riskScore >= 50 ? 'Medium' : 'Low',
          riskFactors,
          lastActivity: lastInvoiceDate,
          totalRevenue,
          invoiceCount,
        });
      }
    }

    return {
      atRiskCustomers: churnRisks.sort((a, b) => b.riskScore - a.riskScore),
      totalAtRisk: churnRisks.length,
      highRiskCount: churnRisks.filter((c) => c.riskLevel === 'High').length,
      potentialRevenueLoss: churnRisks
        .filter((c) => c.riskLevel === 'High')
        .reduce((sum, c) => sum + c.totalRevenue / c.invoiceCount, 0),
      generatedAt: new Date(),
    };
  }

  private async getMonthlyRevenue(organizationId: string, months: number) {
    const data = [];
    const today = new Date();

    for (let i = months - 1; i >= 0; i--) {
      const start = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const end = new Date(today.getFullYear(), today.getMonth() - i + 1, 0);

      const invoices = await this.prisma.invoice.aggregate({
        where: { organizationId, deletedAt: null, date: { gte: start, lte: end } },
        _sum: { grandTotal: true },
      });

      data.push({
        month: start.toLocaleString('default', { month: 'short', year: 'numeric' }),
        isoDate: start.toISOString().split('T')[0],
        value: parseFloat(invoices._sum.grandTotal?.toString() || '0'),
      });
    }

    return data;
  }

  private async getMonthlyExpenses(organizationId: string, months: number) {
    const data = [];
    const today = new Date();

    for (let i = months - 1; i >= 0; i--) {
      const start = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const end = new Date(today.getFullYear(), today.getMonth() - i + 1, 0);

      const expenses = await this.prisma.expense.findMany({
        where: { organizationId, date: { gte: start, lte: end } },
        include: { account: { select: { name: true } } },
      });

      const byCategory: Record<string, number> = {};
      for (const expense of expenses) {
        const category = expense.account?.name || 'Other';
        byCategory[category] = (byCategory[category] || 0) + parseFloat(expense.amount.toString());
      }

      data.push({
        month: start.toLocaleString('default', { month: 'short', year: 'numeric' }),
        total: Object.values(byCategory).reduce((sum, v) => sum + v, 0),
        byCategory,
      });
    }

    return data;
  }

  private simpleMovingAverageForecast(
    historicalData: { month?: string; value: number }[],
    periods: number,
  ) {
    const windowSize = 3;
    const values = historicalData.map((d) => d.value);
    const forecast = [];

    for (let i = 0; i < periods; i++) {
      const recentValues = values.slice(-windowSize);
      const avg = recentValues.reduce((sum, v) => sum + v, 0) / recentValues.length;

      const futureMonth = new Date();
      futureMonth.setMonth(futureMonth.getMonth() + i + 1);
      futureMonth.setDate(1);

      forecast.push({
        month: futureMonth.toLocaleString('default', { month: 'short', year: 'numeric' }),
        isoDate: futureMonth.toISOString().split('T')[0],
        value: Math.round(avg * 100) / 100,
      });

      values.push(avg);
    }

    return forecast;
  }

  private calculateVariance(data: { value: number }[]) {
    const values = data.map((d) => d.value);
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const squaredDiffs = values.map((v) => Math.pow(v - mean, 2));
    return Math.sqrt(squaredDiffs.reduce((sum, d) => sum + d, 0) / values.length);
  }

  private calculateConfidence(variance: number): string {
    if (variance < 1000) return 'High';
    if (variance < 5000) return 'Medium';
    return 'Low';
  }

  private async estimateWeeklyRecurring(organizationId: string) {
    // Get last month's expenses and estimate weekly
    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);

    const expenses = await this.prisma.expense.aggregate({
      where: { organizationId, date: { gte: lastMonth } },
      _sum: { amount: true },
    });

    return parseFloat(expenses._sum.amount?.toString() || '0') / 4;
  }

  private generateCashFlowWarnings(forecast: { week: number; projectedBalance: number }[]) {
    const warnings = [];

    for (const week of forecast) {
      if (week.projectedBalance < 0) {
        warnings.push({
          type: 'NEGATIVE_BALANCE',
          severity: 'critical',
          week: week.week,
          message: `Projected negative balance of $${Math.abs(week.projectedBalance).toFixed(2)} in week ${week.week}`,
        });
      } else if (week.projectedBalance < 5000) {
        warnings.push({
          type: 'LOW_BALANCE',
          severity: 'warning',
          week: week.week,
          message: `Low projected balance of $${week.projectedBalance.toFixed(2)} in week ${week.week}`,
        });
      }
    }

    return warnings;
  }
}
