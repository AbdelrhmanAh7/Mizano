import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { holtWinters, simpleExponentialSmoothing } from '../utils/holt-winters.util';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const ss = require('simple-statistics');

export interface CategoryTrend {
  category: string;
  monthlyData: Array<{ month: string; amount: number }>;
  trend: { slope: number; intercept: number; rSquared: number };
  trendDirection: 'increasing' | 'decreasing' | 'stable';
}

export interface ResourceTrends {
  categories: CategoryTrend[];
}

export interface ForecastPoint {
  month: string;
  amount: number;
  confidence: number;
}

export interface ResourceForecast {
  historical: Array<{ month: string; amount: number }>;
  forecast: ForecastPoint[];
}

export interface OptimizationOpportunity {
  type: 'spike' | 'growing_cost' | 'high_ratio';
  category: string;
  description: string;
  potentialSavings: number;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface OptimizationOpportunities {
  opportunities: OptimizationOpportunity[];
}

export interface CategoryEfficiency {
  category: string;
  totalExpenses: number;
  percentOfTotal: number;
}

export interface EfficiencyMetrics {
  revenueToExpense: number;
  revenuePerEmployee: number;
  categoryEfficiency: CategoryEfficiency[];
  trend: 'improving' | 'declining' | 'stable';
}

@Injectable()
export class ResourceOptimizationService {
  private readonly logger = new Logger(ResourceOptimizationService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Analyze expense trends by category over time
   */
  async getResourceTrends(organizationId: string, months: number = 12): Promise<ResourceTrends> {
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - months);
    startDate.setDate(1);
    startDate.setHours(0, 0, 0, 0);

    const expenses = await this.prisma.expense.findMany({
      where: {
        organizationId,
        date: { gte: startDate },
        deletedAt: null,
      },
      include: {
        account: {
          select: { name: true },
        },
      },
    });

    // Group by account (category) and month
    const categoryMonthly = new Map<string, Map<string, number>>();

    for (const exp of expenses) {
      const category = exp.account.name;
      const monthKey = `${exp.date.getFullYear()}-${String(exp.date.getMonth() + 1).padStart(2, '0')}`;

      if (!categoryMonthly.has(category)) {
        categoryMonthly.set(category, new Map());
      }
      const monthMap = categoryMonthly.get(category)!;
      monthMap.set(monthKey, (monthMap.get(monthKey) || 0) + Number(exp.amount));
    }

    const categories: CategoryTrend[] = [];

    for (const [category, monthMap] of categoryMonthly) {
      const sortedMonths = Array.from(monthMap.entries()).sort(([a], [b]) => a.localeCompare(b));

      if (sortedMonths.length < 2) continue;

      const monthlyData = sortedMonths.map(([month, amount]) => ({
        month,
        amount: Math.round(amount * 100) / 100,
      }));

      // Calculate linear regression for trend
      const xValues = sortedMonths.map((_, i) => i);
      const yValues = sortedMonths.map(([, amount]) => amount);

      const trend = ss.linearRegression(xValues.map((x, i) => [x, yValues[i]]));
      const regressionLine = ss.linearRegressionLine(trend);

      // Calculate R-squared
      const yMean = ss.mean(yValues);
      const ssTotal = ss.sumSimple(yValues.map((y: number) => Math.pow(y - yMean, 2)));
      const ssResidual = ss.sumSimple(
        yValues.map((y: number, i: number) => Math.pow(y - regressionLine(i), 2)),
      );
      const rSquared = ssTotal > 0 ? 1 - ssResidual / ssTotal : 0;

      // Determine trend direction
      const avgAmount = ss.mean(yValues);
      const slopePercent = avgAmount > 0 ? (trend.m / avgAmount) * 100 : 0;
      let trendDirection: CategoryTrend['trendDirection'];
      if (Math.abs(slopePercent) < 2) {
        trendDirection = 'stable';
      } else if (slopePercent > 0) {
        trendDirection = 'increasing';
      } else {
        trendDirection = 'decreasing';
      }

      categories.push({
        category,
        monthlyData,
        trend: {
          slope: Math.round(trend.m * 100) / 100,
          intercept: Math.round(trend.b * 100) / 100,
          rSquared: Math.round(rSquared * 1000) / 1000,
        },
        trendDirection,
      });
    }

    // Sort by total amount descending
    categories.sort((a, b) => {
      const totalA = a.monthlyData.reduce((sum, d) => sum + d.amount, 0);
      const totalB = b.monthlyData.reduce((sum, d) => sum + d.amount, 0);
      return totalB - totalA;
    });

    return { categories };
  }

  /**
   * Forecast future resource costs using Holt-Winters
   */
  async forecastResources(
    organizationId: string,
    forecastMonths: number = 6,
  ): Promise<ResourceForecast> {
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - 36);
    startDate.setDate(1);
    startDate.setHours(0, 0, 0, 0);

    const expenses = await this.prisma.expense.findMany({
      where: {
        organizationId,
        date: { gte: startDate },
        deletedAt: null,
      },
      select: {
        date: true,
        amount: true,
      },
      orderBy: { date: 'asc' },
    });

    // Aggregate by month
    const monthlyTotals = new Map<string, number>();
    for (const exp of expenses) {
      const monthKey = `${exp.date.getFullYear()}-${String(exp.date.getMonth() + 1).padStart(2, '0')}`;
      monthlyTotals.set(monthKey, (monthlyTotals.get(monthKey) || 0) + Number(exp.amount));
    }

    const sortedMonths = Array.from(monthlyTotals.entries()).sort(([a], [b]) => a.localeCompare(b));

    const historical = sortedMonths.map(([month, amount]) => ({
      month,
      amount: Math.round(amount * 100) / 100,
    }));

    if (sortedMonths.length < 3) {
      return {
        historical,
        forecast: [],
      };
    }

    const values = sortedMonths.map(([, amount]) => amount);

    // Use Holt-Winters if enough data, otherwise SES
    let forecasts: number[];

    try {
      if (values.length >= 24) {
        const result = holtWinters(values, forecastMonths, {
          alpha: 0.3,
          beta: 0.1,
          gamma: 0.3,
          seasonLength: 12,
          type: 'additive',
        });
        forecasts = result.forecasts;
      } else {
        forecasts = simpleExponentialSmoothing(values, 0.3, forecastMonths);
      }
    } catch (error) {
      this.logger.warn(`Forecasting failed, using SES fallback: ${error}`);
      forecasts = simpleExponentialSmoothing(values, 0.3, forecastMonths);
    }

    // Generate forecast dates
    const lastMonth = sortedMonths[sortedMonths.length - 1][0];
    const [lastYear, lastMonthNum] = lastMonth.split('-').map(Number);
    const baseDate = new Date(lastYear, lastMonthNum - 1, 1);

    // Calculate confidence based on data length and variance
    const stdDev = ss.standardDeviation(values);
    const meanVal = ss.mean(values);
    const cv = meanVal > 0 ? stdDev / meanVal : 1;
    const baseConfidence = Math.max(0.3, Math.min(0.9, 1 - cv));

    const forecastPoints: ForecastPoint[] = forecasts.map((amount, i) => {
      const forecastDate = new Date(baseDate);
      forecastDate.setMonth(forecastDate.getMonth() + i + 1);
      const monthKey = `${forecastDate.getFullYear()}-${String(forecastDate.getMonth() + 1).padStart(2, '0')}`;

      // Confidence decreases with forecast horizon
      const confidence = Math.max(0.2, baseConfidence - i * 0.05);

      return {
        month: monthKey,
        amount: Math.round(Math.max(0, amount) * 100) / 100,
        confidence: Math.round(confidence * 100) / 100,
      };
    });

    return { historical, forecast: forecastPoints };
  }

  /**
   * Find cost-saving optimization opportunities
   */
  async getOptimizationOpportunities(organizationId: string): Promise<OptimizationOpportunities> {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const expenses = await this.prisma.expense.findMany({
      where: {
        organizationId,
        date: { gte: sixMonthsAgo },
        deletedAt: null,
      },
      include: {
        account: { select: { name: true } },
      },
    });

    // Get revenue for ratio comparison
    const revenue = await this.prisma.invoice.findMany({
      where: {
        organizationId,
        status: { in: ['PAID', 'PARTIALLY_PAID'] },
        date: { gte: sixMonthsAgo },
        deletedAt: null,
      },
      select: { grandTotal: true },
    });

    const totalRevenue = revenue.reduce((sum, inv) => sum + Number(inv.grandTotal), 0);

    const opportunities: OptimizationOpportunity[] = [];

    // Group expenses by category and month
    const categoryMonthly = new Map<string, Map<string, number>>();
    const categoryTotals = new Map<string, number>();

    for (const exp of expenses) {
      const category = exp.account.name;
      const monthKey = `${exp.date.getFullYear()}-${String(exp.date.getMonth() + 1).padStart(2, '0')}`;

      if (!categoryMonthly.has(category)) {
        categoryMonthly.set(category, new Map());
      }
      const monthMap = categoryMonthly.get(category)!;
      monthMap.set(monthKey, (monthMap.get(monthKey) || 0) + Number(exp.amount));

      categoryTotals.set(category, (categoryTotals.get(category) || 0) + Number(exp.amount));
    }

    // Detect spikes using z-score
    for (const [category, monthMap] of categoryMonthly) {
      const values = Array.from(monthMap.values());
      if (values.length < 3) continue;

      const meanVal = ss.mean(values);
      const stdDev = ss.standardDeviation(values);

      if (stdDev === 0) continue;

      // Check the most recent month for spikes
      const sortedEntries = Array.from(monthMap.entries()).sort(([a], [b]) => a.localeCompare(b));
      const latestValue = sortedEntries[sortedEntries.length - 1][1];
      const latestMonth = sortedEntries[sortedEntries.length - 1][0];
      const z = (latestValue - meanVal) / stdDev;

      if (z > 2) {
        const excess = latestValue - meanVal;
        opportunities.push({
          type: 'spike',
          category,
          description: `Unusual spending spike in ${category} for ${latestMonth}: ${latestValue.toFixed(2)} vs average ${meanVal.toFixed(2)} (z-score: ${z.toFixed(1)})`,
          potentialSavings: Math.round(excess * 100) / 100,
          priority: z > 3 ? 'HIGH' : 'MEDIUM',
        });
      }
    }

    // Detect growing cost categories
    for (const [category, monthMap] of categoryMonthly) {
      const sortedEntries = Array.from(monthMap.entries()).sort(([a], [b]) => a.localeCompare(b));
      if (sortedEntries.length < 3) continue;

      const values = sortedEntries.map(([, v]) => v);
      const xValues = values.map((_, i) => i);

      const regression = ss.linearRegression(xValues.map((x, i) => [x, values[i]]));

      const meanVal = ss.mean(values);
      const slopePercent = meanVal > 0 ? (regression.m / meanVal) * 100 : 0;

      if (slopePercent > 10) {
        const monthlyIncrease = regression.m;
        opportunities.push({
          type: 'growing_cost',
          category,
          description: `${category} costs are growing at ${slopePercent.toFixed(1)}% per month (avg monthly increase: ${monthlyIncrease.toFixed(2)})`,
          potentialSavings: Math.round(monthlyIncrease * 6 * 100) / 100,
          priority: slopePercent > 20 ? 'HIGH' : 'MEDIUM',
        });
      }
    }

    // Check expense-to-revenue ratios by category
    if (totalRevenue > 0) {
      for (const [category, total] of categoryTotals) {
        const ratio = total / totalRevenue;
        if (ratio > 0.15) {
          opportunities.push({
            type: 'high_ratio',
            category,
            description: `${category} accounts for ${(ratio * 100).toFixed(1)}% of revenue over the last 6 months`,
            potentialSavings: Math.round((total - totalRevenue * 0.1) * 100) / 100,
            priority: ratio > 0.25 ? 'HIGH' : 'MEDIUM',
          });
        }
      }
    }

    // Sort by potential savings descending
    opportunities.sort((a, b) => b.potentialSavings - a.potentialSavings);

    return { opportunities };
  }

  /**
   * Calculate revenue-per-expense efficiency metrics
   */
  async getEfficiencyMetrics(organizationId: string): Promise<EfficiencyMetrics> {
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    // Get revenue (paid invoices)
    const invoices = await this.prisma.invoice.findMany({
      where: {
        organizationId,
        status: { in: ['PAID', 'PARTIALLY_PAID'] },
        date: { gte: twelveMonthsAgo },
        deletedAt: null,
      },
      select: { grandTotal: true, date: true },
    });

    const totalRevenue = invoices.reduce((sum, inv) => sum + Number(inv.grandTotal), 0);

    // Get expenses
    const expenses = await this.prisma.expense.findMany({
      where: {
        organizationId,
        date: { gte: twelveMonthsAgo },
        deletedAt: null,
      },
      include: {
        account: { select: { name: true } },
      },
    });

    const totalExpenses = expenses.reduce((sum, exp) => sum + Number(exp.amount), 0);

    // Get employee count
    const employeeCount = await this.prisma.employee.count({
      where: { organizationId, isActive: true },
    });

    // Revenue to expense ratio
    const revenueToExpense =
      totalExpenses > 0 ? Math.round((totalRevenue / totalExpenses) * 100) / 100 : 0;

    // Revenue per employee
    const revenuePerEmployee =
      employeeCount > 0 ? Math.round((totalRevenue / employeeCount) * 100) / 100 : 0;

    // Expenses by category
    const categoryTotals = new Map<string, number>();
    for (const exp of expenses) {
      const category = exp.account.name;
      categoryTotals.set(category, (categoryTotals.get(category) || 0) + Number(exp.amount));
    }

    const categoryEfficiency: CategoryEfficiency[] = Array.from(categoryTotals.entries())
      .map(([category, total]) => ({
        category,
        totalExpenses: Math.round(total * 100) / 100,
        percentOfTotal: totalExpenses > 0 ? Math.round((total / totalExpenses) * 10000) / 10000 : 0,
      }))
      .sort((a, b) => b.totalExpenses - a.totalExpenses);

    // Determine efficiency trend by comparing first half to second half
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const firstHalfRevenue = invoices
      .filter((inv) => inv.date < sixMonthsAgo)
      .reduce((sum, inv) => sum + Number(inv.grandTotal), 0);
    const secondHalfRevenue = invoices
      .filter((inv) => inv.date >= sixMonthsAgo)
      .reduce((sum, inv) => sum + Number(inv.grandTotal), 0);

    const firstHalfExpenses = expenses
      .filter((exp) => exp.date < sixMonthsAgo)
      .reduce((sum, exp) => sum + Number(exp.amount), 0);
    const secondHalfExpenses = expenses
      .filter((exp) => exp.date >= sixMonthsAgo)
      .reduce((sum, exp) => sum + Number(exp.amount), 0);

    const firstHalfRatio = firstHalfExpenses > 0 ? firstHalfRevenue / firstHalfExpenses : 0;
    const secondHalfRatio = secondHalfExpenses > 0 ? secondHalfRevenue / secondHalfExpenses : 0;

    let trend: EfficiencyMetrics['trend'];
    const ratioChange =
      firstHalfRatio > 0 ? ((secondHalfRatio - firstHalfRatio) / firstHalfRatio) * 100 : 0;

    if (ratioChange > 5) {
      trend = 'improving';
    } else if (ratioChange < -5) {
      trend = 'declining';
    } else {
      trend = 'stable';
    }

    return {
      revenueToExpense,
      revenuePerEmployee,
      categoryEfficiency,
      trend,
    };
  }
}
