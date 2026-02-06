import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';
import {
  holtWinters,
  forecastWithConfidenceIntervals,
  simpleExponentialSmoothing,
  detectSeasonalityStrength,
  detectTrend,
  aggregateToMonthly,
  applyHolidayMultipliers,
  ForecastPoint,
  HoltWintersParams,
} from '../utils/holt-winters.util';
import { mean, standardDeviation } from '../utils/statistics.util';

export interface DemandForecast {
  forecasts: Array<{
    date: Date;
    predicted: number;
    lowerBound: number;
    upperBound: number;
    seasonalIndex: number;
  }>;
  model: {
    level: number;
    trend: number;
    seasonalIndices: number[];
    mape: number;
  };
  dataPoints: number;
  confidence: 'high' | 'medium' | 'low';
  method: 'holt-winters' | 'double-exponential' | 'simple-exponential';
}

export interface SeasonalityAnalysis {
  pattern: 'seasonal' | 'trending' | 'stable' | 'volatile';
  seasonalStrength: number;
  trendStrength: number;
  monthlyIndices: number[];
  peakMonths: number[];
  lowMonths: number[];
}

export interface TrendAnalysis {
  direction: 'up' | 'down' | 'flat';
  magnitude: number;
  confidence: number;
}

export interface HolidayConfig {
  ramadan: {
    enabled: boolean;
    multiplier: number;
    categories: string[];
  };
  eid: {
    enabled: boolean;
    multiplier: number;
  };
  customHolidays: Array<{
    name: string;
    month: number;
    multiplier: number;
    categories: string[];
  }>;
}

@Injectable()
export class DemandForecastingService {
  private readonly logger = new Logger(DemandForecastingService.name);
  private readonly DEFAULT_SEASON_LENGTH = 12;
  private readonly MIN_DATA_POINTS = 6;

  constructor(private prisma: PrismaService) {}

  /**
   * Forecast demand for a single item
   */
  async forecastItem(
    organizationId: string,
    itemId: string,
    horizonMonths: number = 6,
    params?: HoltWintersParams,
  ): Promise<DemandForecast> {
    // Get item to validate it exists
    const item = await this.prisma.item.findFirst({
      where: { id: itemId, organizationId, deletedAt: null },
      select: { id: true, name: true, type: true },
    });

    if (!item) {
      throw new NotFoundException(`Item ${itemId} not found`);
    }

    // Get historical demand data
    const historicalData = await this.getMonthlyDemandHistory(
      organizationId,
      itemId,
      36, // Get up to 3 years of data
    );

    if (historicalData.length < this.MIN_DATA_POINTS) {
      return this.createEmptyForecast(horizonMonths);
    }

    const values = historicalData.map((d) => d.value);
    const seasonLength = params?.seasonLength || this.DEFAULT_SEASON_LENGTH;
    const useHoltWinters = values.length >= 2 * seasonLength;

    let forecasts: ForecastPoint[];
    let method: DemandForecast['method'];
    let modelData: { level: number; trend: number; seasonalIndices: number[]; mape: number };

    if (useHoltWinters) {
      try {
        const result = holtWinters(values, horizonMonths, {
          alpha: params?.alpha ?? 0.3,
          beta: params?.beta ?? 0.1,
          gamma: params?.gamma ?? 0.3,
          seasonLength,
          type: params?.type ?? 'multiplicative',
        });

        forecasts = forecastWithConfidenceIntervals(values, horizonMonths, {
          ...params,
          seasonLength,
        });

        modelData = {
          level: result.level,
          trend: result.trend,
          seasonalIndices: result.seasonal,
          mape: result.mape,
        };
        method = 'holt-winters';
      } catch (error) {
        this.logger.warn(
          `Holt-Winters failed for item ${itemId}, falling back to simple exponential`,
        );
        return this.fallbackForecast(values, horizonMonths);
      }
    } else {
      return this.fallbackForecast(values, horizonMonths);
    }

    // Calculate confidence based on data points and MAPE
    const confidence = this.calculateConfidence(values.length, modelData.mape);

    // Generate forecast dates starting from next month
    const startDate = new Date();
    startDate.setDate(1);
    startDate.setMonth(startDate.getMonth() + 1);

    const forecastsWithDates = forecasts.map((f, index) => {
      const date = new Date(startDate);
      date.setMonth(date.getMonth() + index);
      return {
        date,
        predicted: Math.max(0, Math.round(f.predicted)),
        lowerBound: Math.max(0, Math.round(f.lowerBound)),
        upperBound: Math.round(f.upperBound),
        seasonalIndex: f.seasonalIndex,
      };
    });

    // Store forecasts in database
    await this.storeForecast(organizationId, itemId, forecastsWithDates, modelData);

    return {
      forecasts: forecastsWithDates,
      model: modelData,
      dataPoints: values.length,
      confidence,
      method,
    };
  }

  /**
   * Fallback to simpler forecasting methods when data is insufficient
   */
  private fallbackForecast(values: number[], horizonMonths: number): DemandForecast {
    const sesForecasts = simpleExponentialSmoothing(values, 0.3, horizonMonths);
    const startDate = new Date();
    startDate.setDate(1);
    startDate.setMonth(startDate.getMonth() + 1);

    const stdDev = standardDeviation(values);
    const avgValue = mean(values);

    const forecasts = sesForecasts.map((predicted, index) => {
      const date = new Date(startDate);
      date.setMonth(date.getMonth() + index);
      const interval = 1.96 * stdDev * Math.sqrt(1 + index * 0.1);
      return {
        date,
        predicted: Math.max(0, Math.round(predicted)),
        lowerBound: Math.max(0, Math.round(predicted - interval)),
        upperBound: Math.round(predicted + interval),
        seasonalIndex: 1,
      };
    });

    return {
      forecasts,
      model: {
        level: avgValue,
        trend: 0,
        seasonalIndices: Array(12).fill(1),
        mape: 0,
      },
      dataPoints: values.length,
      confidence: 'low',
      method: 'simple-exponential',
    };
  }

  /**
   * Create empty forecast when no data available
   */
  private createEmptyForecast(horizonMonths: number): DemandForecast {
    const startDate = new Date();
    startDate.setDate(1);
    startDate.setMonth(startDate.getMonth() + 1);

    const forecasts = Array(horizonMonths)
      .fill(null)
      .map((_, index) => {
        const date = new Date(startDate);
        date.setMonth(date.getMonth() + index);
        return {
          date,
          predicted: 0,
          lowerBound: 0,
          upperBound: 0,
          seasonalIndex: 1,
        };
      });

    return {
      forecasts,
      model: {
        level: 0,
        trend: 0,
        seasonalIndices: Array(12).fill(1),
        mape: 0,
      },
      dataPoints: 0,
      confidence: 'low',
      method: 'simple-exponential',
    };
  }

  /**
   * Forecast demand for all items in organization
   */
  async forecastAllItems(organizationId: string): Promise<{
    processed: number;
    skipped: number;
    errors: string[];
  }> {
    const items = await this.prisma.item.findMany({
      where: {
        organizationId,
        type: 'GOODS',
        isActive: true,
        deletedAt: null,
      },
      select: { id: true, name: true },
    });

    let processed = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const item of items) {
      try {
        const historicalData = await this.getMonthlyDemandHistory(
          organizationId,
          item.id,
          36,
        );

        if (historicalData.length < this.MIN_DATA_POINTS) {
          skipped++;
          continue;
        }

        await this.forecastItem(organizationId, item.id);
        processed++;
      } catch (error) {
        const errorMsg =
          error instanceof Error ? error.message : 'Unknown error';
        errors.push(`${item.name}: ${errorMsg}`);
        this.logger.error(`Failed to forecast item ${item.id}: ${error}`);
      }
    }

    this.logger.log(
      `Forecasted ${processed} items, skipped ${skipped}, errors: ${errors.length}`,
    );

    return { processed, skipped, errors };
  }

  /**
   * Get seasonality pattern for an item
   */
  async getSeasonalityPattern(
    organizationId: string,
    itemId: string,
  ): Promise<SeasonalityAnalysis> {
    const historicalData = await this.getMonthlyDemandHistory(
      organizationId,
      itemId,
      36,
    );

    if (historicalData.length < 12) {
      return {
        pattern: 'stable',
        seasonalStrength: 0,
        trendStrength: 0,
        monthlyIndices: Array(12).fill(1),
        peakMonths: [],
        lowMonths: [],
      };
    }

    const values = historicalData.map((d) => d.value);

    // Detect seasonality strength
    const seasonalStrength = detectSeasonalityStrength(values, 12);

    // Detect trend
    const trend = detectTrend(values);
    const trendStrength = trend.confidence;

    // Calculate monthly indices
    const monthlyIndices = this.calculateMonthlyIndices(historicalData);

    // Find peak and low months
    const peakMonths: number[] = [];
    const lowMonths: number[] = [];
    const avgIndex = mean(monthlyIndices);

    monthlyIndices.forEach((index, month) => {
      if (index > avgIndex * 1.2) {
        peakMonths.push(month + 1); // 1-indexed months
      } else if (index < avgIndex * 0.8) {
        lowMonths.push(month + 1);
      }
    });

    // Determine pattern
    let pattern: SeasonalityAnalysis['pattern'];
    if (seasonalStrength > 0.3) {
      pattern = 'seasonal';
    } else if (Math.abs(trend.magnitude) > 5) {
      pattern = 'trending';
    } else if (standardDeviation(values) / mean(values) > 0.5) {
      pattern = 'volatile';
    } else {
      pattern = 'stable';
    }

    return {
      pattern,
      seasonalStrength,
      trendStrength,
      monthlyIndices,
      peakMonths,
      lowMonths,
    };
  }

  /**
   * Detect trend for an item
   */
  async detectItemTrend(
    organizationId: string,
    itemId: string,
  ): Promise<TrendAnalysis> {
    const historicalData = await this.getMonthlyDemandHistory(
      organizationId,
      itemId,
      24,
    );

    if (historicalData.length < 3) {
      return {
        direction: 'flat',
        magnitude: 0,
        confidence: 0,
      };
    }

    const values = historicalData.map((d) => d.value);
    return detectTrend(values);
  }

  /**
   * Weekly recalculation of all forecasts
   */
  async weeklyRecalculate(organizationId: string): Promise<{ updated: number }> {
    const result = await this.forecastAllItems(organizationId);
    return { updated: result.processed };
  }

  /**
   * Apply holiday multipliers to forecasts
   */
  async applyHolidayConfig(
    forecasts: DemandForecast,
    config: HolidayConfig,
  ): Promise<DemandForecast> {
    const holidays: { month: number; multiplier: number }[] = [];

    // Add Ramadan months (approximate)
    if (config.ramadan.enabled) {
      // Ramadan shifts by ~11 days each year, approximate for now
      holidays.push({ month: 2, multiplier: config.ramadan.multiplier }); // Example
    }

    if (config.eid.enabled) {
      holidays.push({ month: 3, multiplier: config.eid.multiplier }); // Example
    }

    // Add custom holidays
    for (const holiday of config.customHolidays) {
      holidays.push({ month: holiday.month - 1, multiplier: holiday.multiplier });
    }

    if (holidays.length === 0) {
      return forecasts;
    }

    const startDate = forecasts.forecasts[0]?.date || new Date();
    const forecastPoints: ForecastPoint[] = forecasts.forecasts.map((f) => ({
      period: 0,
      predicted: f.predicted,
      lowerBound: f.lowerBound,
      upperBound: f.upperBound,
      seasonalIndex: f.seasonalIndex,
    }));

    const adjustedPoints = applyHolidayMultipliers(
      forecastPoints,
      startDate,
      holidays,
    );

    return {
      ...forecasts,
      forecasts: adjustedPoints.map((f, index) => ({
        date: forecasts.forecasts[index].date,
        predicted: Math.round(f.predicted),
        lowerBound: Math.round(f.lowerBound),
        upperBound: Math.round(f.upperBound),
        seasonalIndex: f.seasonalIndex,
      })),
    };
  }

  /**
   * Get forecast dashboard summary
   */
  async getForecastDashboard(organizationId: string): Promise<{
    totalItems: number;
    itemsWithForecasts: number;
    highConfidenceCount: number;
    avgMAPE: number;
    topGrowingItems: Array<{ itemId: string; itemName: string; growthRate: number }>;
    topDecliningItems: Array<{ itemId: string; itemName: string; declineRate: number }>;
  }> {
    const items = await this.prisma.item.findMany({
      where: {
        organizationId,
        type: 'GOODS',
        isActive: true,
        deletedAt: null,
      },
      select: { id: true, name: true },
    });

    const forecasts = await this.prisma.itemDemandForecast.findMany({
      where: {
        organizationId,
        forecastDate: { gte: new Date() },
      },
      select: {
        itemId: true,
        confidence: true,
        trendComponent: true,
      },
      distinct: ['itemId'],
    });

    // Calculate metrics
    const itemsWithForecasts = new Set(forecasts.map((f) => f.itemId)).size;
    const highConfidenceCount = forecasts.filter(
      (f) => Number(f.confidence) > 0.7,
    ).length;

    // Get item trends
    const itemTrends: Array<{
      itemId: string;
      itemName: string;
      rate: number;
    }> = [];

    for (const item of items.slice(0, 20)) {
      // Limit for performance
      try {
        const trend = await this.detectItemTrend(organizationId, item.id);
        if (trend.confidence > 0.5) {
          itemTrends.push({
            itemId: item.id,
            itemName: item.name,
            rate: trend.magnitude,
          });
        }
      } catch {
        // Skip items with insufficient data
      }
    }

    const topGrowingItems = itemTrends
      .filter((t) => t.rate > 0)
      .sort((a, b) => b.rate - a.rate)
      .slice(0, 5)
      .map((t) => ({ itemId: t.itemId, itemName: t.itemName, growthRate: t.rate }));

    const topDecliningItems = itemTrends
      .filter((t) => t.rate < 0)
      .sort((a, b) => a.rate - b.rate)
      .slice(0, 5)
      .map((t) => ({
        itemId: t.itemId,
        itemName: t.itemName,
        declineRate: Math.abs(t.rate),
      }));

    return {
      totalItems: items.length,
      itemsWithForecasts,
      highConfidenceCount,
      avgMAPE: 0, // Would need to calculate from stored forecasts
      topGrowingItems,
      topDecliningItems,
    };
  }

  // Private helper methods

  /**
   * Get monthly demand history for an item
   */
  private async getMonthlyDemandHistory(
    organizationId: string,
    itemId: string,
    months: number = 24,
  ): Promise<{ month: Date; value: number }[]> {
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - months);
    startDate.setDate(1);
    startDate.setHours(0, 0, 0, 0);

    // Get all sales movements for this item
    const movements = await this.prisma.inventoryMovement.findMany({
      where: {
        organizationId,
        itemId,
        type: 'sale',
        createdAt: { gte: startDate },
      },
      select: {
        quantity: true,
        createdAt: true,
      },
    });

    // Convert to daily data
    const dailyData = movements.map((m) => ({
      date: m.createdAt,
      value: Math.abs(parseFloat(m.quantity.toString())),
    }));

    // Aggregate to monthly
    return aggregateToMonthly(dailyData);
  }

  /**
   * Calculate monthly indices from historical data
   */
  private calculateMonthlyIndices(
    data: { month: Date; value: number }[],
  ): number[] {
    const monthlyTotals: number[] = Array(12).fill(0);
    const monthlyCounts: number[] = Array(12).fill(0);

    for (const { month, value } of data) {
      const monthIndex = month.getMonth();
      monthlyTotals[monthIndex] += value;
      monthlyCounts[monthIndex]++;
    }

    // Calculate average for each month
    const monthlyAvgs = monthlyTotals.map((total, i) =>
      monthlyCounts[i] > 0 ? total / monthlyCounts[i] : 0,
    );

    // Normalize to indices (1 = average)
    const overallAvg = mean(monthlyAvgs.filter((v) => v > 0));
    if (overallAvg === 0) return Array(12).fill(1);

    return monthlyAvgs.map((avg) => (avg > 0 ? avg / overallAvg : 1));
  }

  /**
   * Calculate confidence level based on data points and MAPE
   */
  private calculateConfidence(
    dataPoints: number,
    mape: number,
  ): 'high' | 'medium' | 'low' {
    if (dataPoints >= 24 && mape < 15) return 'high';
    if (dataPoints >= 12 && mape < 25) return 'medium';
    return 'low';
  }

  /**
   * Store forecast in database
   */
  private async storeForecast(
    organizationId: string,
    itemId: string,
    forecasts: DemandForecast['forecasts'],
    model: DemandForecast['model'],
  ): Promise<void> {
    // Delete old forecasts for this item
    await this.prisma.itemDemandForecast.deleteMany({
      where: { organizationId, itemId },
    });

    // Insert new forecasts
    await this.prisma.itemDemandForecast.createMany({
      data: forecasts.map((f) => ({
        organizationId,
        itemId,
        forecastDate: f.date,
        predictedQuantity: new Decimal(f.predicted),
        lowerBound: new Decimal(f.lowerBound),
        upperBound: new Decimal(f.upperBound),
        seasonalIndex: new Decimal(f.seasonalIndex),
        trendComponent: new Decimal(model.trend),
        confidence: new Decimal(
          model.mape < 15 ? 0.9 : model.mape < 25 ? 0.7 : 0.5,
        ),
      })),
    });
  }
}
