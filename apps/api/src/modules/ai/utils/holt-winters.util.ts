/**
 * Holt-Winters Triple Exponential Smoothing Algorithm
 * Implements level, trend, and seasonal components for time series forecasting
 */

export interface HoltWintersParams {
  alpha?: number; // Level smoothing (default 0.3)
  beta?: number; // Trend smoothing (default 0.1)
  gamma?: number; // Seasonal smoothing (default 0.3)
  seasonLength?: number; // Season length (default 12 for monthly)
  type?: 'additive' | 'multiplicative'; // Seasonal type (default 'multiplicative')
}

export interface HoltWintersResult {
  level: number;
  trend: number;
  seasonal: number[];
  fitted: number[];
  forecasts: number[];
  residuals: number[];
  mape: number; // Mean Absolute Percentage Error
}

export interface ForecastPoint {
  period: number;
  predicted: number;
  lowerBound: number;
  upperBound: number;
  seasonalIndex: number;
}

/**
 * Initialize Holt-Winters components from historical data
 */
function initializeComponents(
  data: number[],
  seasonLength: number,
): { level: number; trend: number; seasonal: number[] } {
  // Level: average of first season
  const level = data.slice(0, seasonLength).reduce((a, b) => a + b, 0) / seasonLength;

  // Trend: average growth between first two seasons
  let trend = 0;
  if (data.length >= 2 * seasonLength) {
    for (let i = 0; i < seasonLength; i++) {
      trend += (data[seasonLength + i] - data[i]) / seasonLength;
    }
    trend /= seasonLength;
  }

  // Seasonal: ratio to first season's average (for multiplicative)
  const seasonal: number[] = [];
  for (let i = 0; i < seasonLength; i++) {
    // Use average of all occurrences of this seasonal period
    let sum = 0;
    let count = 0;
    for (let j = i; j < data.length; j += seasonLength) {
      sum += data[j] / level;
      count++;
    }
    seasonal.push(count > 0 ? sum / count : 1);
  }

  // Normalize seasonal factors to sum to seasonLength
  const seasonalSum = seasonal.reduce((a, b) => a + b, 0);
  const normalizedSeasonal = seasonal.map((s) => (s / seasonalSum) * seasonLength);

  return { level, trend, seasonal: normalizedSeasonal };
}

/**
 * Calculate Mean Absolute Percentage Error (MAPE)
 */
function calculateMAPE(actual: number[], predicted: number[]): number {
  if (actual.length === 0 || actual.length !== predicted.length) return 0;

  let sumAPE = 0;
  let validCount = 0;

  for (let i = 0; i < actual.length; i++) {
    if (actual[i] !== 0) {
      sumAPE += Math.abs((actual[i] - predicted[i]) / actual[i]);
      validCount++;
    }
  }

  return validCount > 0 ? (sumAPE / validCount) * 100 : 0;
}

/**
 * Holt-Winters Triple Exponential Smoothing
 *
 * @param data Historical time series data
 * @param horizonPeriods Number of periods to forecast
 * @param params Algorithm parameters
 * @returns Forecasts and model components
 */
export function holtWinters(
  data: number[],
  horizonPeriods: number,
  params: HoltWintersParams = {},
): HoltWintersResult {
  const {
    alpha = 0.3,
    beta = 0.1,
    gamma = 0.3,
    seasonLength = 12,
    type = 'multiplicative',
  } = params;

  // Validate minimum data requirement
  if (data.length < 2 * seasonLength) {
    throw new Error(
      `Insufficient data: need at least ${2 * seasonLength} points, have ${data.length}`,
    );
  }

  // Initialize components
  const { level: L0, trend: T0, seasonal: S0 } = initializeComponents(data, seasonLength);

  let L = L0;
  let T = T0;
  const S = [...S0];
  const fitted: number[] = [];
  const residuals: number[] = [];

  // Fit model to historical data
  for (let t = 0; t < data.length; t++) {
    const sIdx = t % seasonLength;
    const Y = data[t];
    const Lprev = L;
    const Tprev = T;

    if (type === 'multiplicative') {
      // Multiplicative seasonality
      L = alpha * (Y / S[sIdx]) + (1 - alpha) * (Lprev + Tprev);
      T = beta * (L - Lprev) + (1 - beta) * Tprev;
      S[sIdx] = gamma * (Y / L) + (1 - gamma) * S[sIdx];
      fitted.push((Lprev + Tprev) * S[sIdx]);
    } else {
      // Additive seasonality
      L = alpha * (Y - S[sIdx]) + (1 - alpha) * (Lprev + Tprev);
      T = beta * (L - Lprev) + (1 - beta) * Tprev;
      S[sIdx] = gamma * (Y - L) + (1 - gamma) * S[sIdx];
      fitted.push(Lprev + Tprev + S[sIdx]);
    }

    residuals.push(Y - fitted[t]);
  }

  // Generate forecasts
  const forecasts: number[] = [];
  for (let h = 1; h <= horizonPeriods; h++) {
    const sIdx = (data.length + h - 1) % seasonLength;
    if (type === 'multiplicative') {
      forecasts.push((L + h * T) * S[sIdx]);
    } else {
      forecasts.push(L + h * T + S[sIdx]);
    }
  }

  // Calculate MAPE
  const mape = calculateMAPE(data, fitted);

  return {
    level: L,
    trend: T,
    seasonal: S,
    fitted,
    forecasts,
    residuals,
    mape,
  };
}

/**
 * Simple Exponential Smoothing (SES) - fallback for insufficient data
 *
 * @param data Historical data
 * @param alpha Smoothing factor (0-1)
 * @param horizon Number of periods to forecast
 * @returns Array of forecast values
 */
export function simpleExponentialSmoothing(
  data: number[],
  alpha: number = 0.3,
  horizon: number = 6,
): number[] {
  if (data.length === 0) return [];

  // Initialize with first value
  let level = data[0];

  // Update level for each observation
  for (let i = 1; i < data.length; i++) {
    level = alpha * data[i] + (1 - alpha) * level;
  }

  // All forecasts are the final level (no trend or seasonality)
  return Array(horizon).fill(level);
}

/**
 * Double Exponential Smoothing (Holt's method) - for trend without seasonality
 *
 * @param data Historical data
 * @param alpha Level smoothing factor
 * @param beta Trend smoothing factor
 * @param horizon Number of periods to forecast
 * @returns Array of forecast values
 */
export function doubleExponentialSmoothing(
  data: number[],
  alpha: number = 0.3,
  beta: number = 0.1,
  horizon: number = 6,
): number[] {
  if (data.length < 2) return simpleExponentialSmoothing(data, alpha, horizon);

  // Initialize level and trend
  let level = data[0];
  let trend = data[1] - data[0];

  // Update for each observation
  for (let i = 1; i < data.length; i++) {
    const prevLevel = level;
    level = alpha * data[i] + (1 - alpha) * (level + trend);
    trend = beta * (level - prevLevel) + (1 - beta) * trend;
  }

  // Generate forecasts
  const forecasts: number[] = [];
  for (let h = 1; h <= horizon; h++) {
    forecasts.push(level + h * trend);
  }

  return forecasts;
}

/**
 * Generate forecasts with confidence intervals
 *
 * @param data Historical data
 * @param horizonPeriods Number of periods to forecast
 * @param params Algorithm parameters
 * @param confidenceLevel Confidence level (default 0.95 for 95% CI)
 * @returns Array of forecast points with bounds
 */
export function forecastWithConfidenceIntervals(
  data: number[],
  horizonPeriods: number,
  params: HoltWintersParams = {},
  confidenceLevel: number = 0.95,
): ForecastPoint[] {
  const { seasonLength = 12 } = params;

  // Check if we have enough data for Holt-Winters
  const useHoltWinters = data.length >= 2 * seasonLength;

  let forecasts: number[];
  let residualStdDev: number;
  let seasonal: number[];

  if (useHoltWinters) {
    const result = holtWinters(data, horizonPeriods, params);
    forecasts = result.forecasts;
    residualStdDev = calculateStdDev(result.residuals);
    seasonal = result.seasonal;
  } else if (data.length >= 6) {
    // Use double exponential smoothing
    forecasts = doubleExponentialSmoothing(
      data,
      params.alpha,
      params.beta,
      horizonPeriods,
    );
    const fittedSES = applyDoubleExponentialSmoothingFit(
      data,
      params.alpha || 0.3,
      params.beta || 0.1,
    );
    residualStdDev = calculateStdDev(
      data.slice(1).map((v, i) => v - fittedSES[i]),
    );
    seasonal = Array(seasonLength).fill(1);
  } else {
    // Use simple exponential smoothing
    forecasts = simpleExponentialSmoothing(data, params.alpha, horizonPeriods);
    residualStdDev = calculateStdDev(data);
    seasonal = Array(seasonLength).fill(1);
  }

  // Z-value for confidence level (approx)
  const zValue = confidenceLevel === 0.95 ? 1.96 : confidenceLevel === 0.90 ? 1.645 : 1.96;

  // Generate forecast points with expanding confidence intervals
  const forecastPoints: ForecastPoint[] = [];
  for (let h = 0; h < horizonPeriods; h++) {
    const predicted = forecasts[h];
    // Confidence interval expands with forecast horizon
    const interval = zValue * residualStdDev * Math.sqrt(1 + h * 0.1);
    const sIdx = (data.length + h) % seasonLength;

    forecastPoints.push({
      period: h + 1,
      predicted: Math.max(0, predicted), // Demand can't be negative
      lowerBound: Math.max(0, predicted - interval),
      upperBound: predicted + interval,
      seasonalIndex: seasonal[sIdx],
    });
  }

  return forecastPoints;
}

/**
 * Helper: Calculate standard deviation
 */
function calculateStdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const squaredDiffs = values.map((v) => Math.pow(v - avg, 2));
  return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / (values.length - 1));
}

/**
 * Helper: Apply double exponential smoothing to get fitted values
 */
function applyDoubleExponentialSmoothingFit(
  data: number[],
  alpha: number,
  beta: number,
): number[] {
  if (data.length < 2) return [];

  let level = data[0];
  let trend = data[1] - data[0];
  const fitted: number[] = [];

  for (let i = 1; i < data.length; i++) {
    fitted.push(level + trend);
    const prevLevel = level;
    level = alpha * data[i] + (1 - alpha) * (level + trend);
    trend = beta * (level - prevLevel) + (1 - beta) * trend;
  }

  return fitted;
}

/**
 * Detect seasonality strength in time series
 * Returns a value between 0 (no seasonality) and 1 (strong seasonality)
 */
export function detectSeasonalityStrength(
  data: number[],
  seasonLength: number,
): number {
  if (data.length < 2 * seasonLength) return 0;

  // Calculate seasonal averages
  const seasonalMeans: number[] = [];
  for (let s = 0; s < seasonLength; s++) {
    const seasonalValues: number[] = [];
    for (let i = s; i < data.length; i += seasonLength) {
      seasonalValues.push(data[i]);
    }
    seasonalMeans.push(
      seasonalValues.reduce((a, b) => a + b, 0) / seasonalValues.length,
    );
  }

  const overallMean = data.reduce((a, b) => a + b, 0) / data.length;

  // Variance of seasonal means
  const seasonalVariance =
    seasonalMeans.reduce((sum, m) => sum + Math.pow(m - overallMean, 2), 0) /
    seasonLength;

  // Total variance
  const totalVariance =
    data.reduce((sum, v) => sum + Math.pow(v - overallMean, 2), 0) / data.length;

  if (totalVariance === 0) return 0;

  // Seasonality strength: ratio of seasonal variance to total variance
  return Math.min(1, Math.max(0, seasonalVariance / totalVariance));
}

/**
 * Detect trend direction and magnitude
 */
export function detectTrend(data: number[]): {
  direction: 'up' | 'down' | 'flat';
  magnitude: number; // % change per period
  confidence: number; // R-squared
} {
  if (data.length < 3) {
    return { direction: 'flat', magnitude: 0, confidence: 0 };
  }

  // Simple linear regression
  const x = data.map((_, i) => i);
  const n = data.length;
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = data.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((sum, xi, i) => sum + xi * data[i], 0);
  const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);
  const sumYY = data.reduce((sum, yi) => sum + yi * yi, 0);

  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  // R-squared for confidence
  const yMean = sumY / n;
  const ssTotal = data.reduce((sum, yi) => sum + Math.pow(yi - yMean, 2), 0);
  const ssResidual = data.reduce(
    (sum, yi, i) => sum + Math.pow(yi - (slope * i + intercept), 2),
    0,
  );
  const rSquared = ssTotal === 0 ? 0 : 1 - ssResidual / ssTotal;

  // Magnitude as percentage change per period
  const avgValue = yMean;
  const magnitudePercent = avgValue !== 0 ? (slope / avgValue) * 100 : 0;

  // Direction
  let direction: 'up' | 'down' | 'flat';
  if (Math.abs(magnitudePercent) < 1) {
    direction = 'flat';
  } else if (magnitudePercent > 0) {
    direction = 'up';
  } else {
    direction = 'down';
  }

  return {
    direction,
    magnitude: magnitudePercent,
    confidence: rSquared,
  };
}

/**
 * Aggregate daily data to monthly buckets
 */
export function aggregateToMonthly(
  dailyData: { date: Date; value: number }[],
): { month: Date; value: number }[] {
  const monthlyMap = new Map<string, { date: Date; sum: number }>();

  for (const { date, value } of dailyData) {
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    const existing = monthlyMap.get(key);
    if (existing) {
      existing.sum += value;
    } else {
      monthlyMap.set(key, {
        date: new Date(date.getFullYear(), date.getMonth(), 1),
        sum: value,
      });
    }
  }

  // Convert to array and sort by date
  return Array.from(monthlyMap.values())
    .map((m) => ({ month: m.date, value: m.sum }))
    .sort((a, b) => a.month.getTime() - b.month.getTime());
}

/**
 * Apply holiday/Ramadan multiplier to forecasts
 */
export function applyHolidayMultipliers(
  forecasts: ForecastPoint[],
  startDate: Date,
  holidays: { month: number; multiplier: number }[],
): ForecastPoint[] {
  return forecasts.map((forecast, index) => {
    const forecastDate = new Date(startDate);
    forecastDate.setMonth(forecastDate.getMonth() + index);
    const month = forecastDate.getMonth();

    const holiday = holidays.find((h) => h.month === month);
    if (holiday) {
      return {
        ...forecast,
        predicted: forecast.predicted * holiday.multiplier,
        lowerBound: forecast.lowerBound * holiday.multiplier,
        upperBound: forecast.upperBound * holiday.multiplier,
      };
    }

    return forecast;
  });
}
