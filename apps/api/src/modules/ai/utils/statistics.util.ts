/**
 * Statistical utility functions for AI services
 * Implements core statistical algorithms for anomaly detection and forecasting
 */

/**
 * Calculate the arithmetic mean of an array of numbers
 */
export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Calculate the sample standard deviation of an array of numbers
 * Uses Bessel's correction (n-1) for sample standard deviation
 */
export function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const squaredDiffs = values.map((v) => Math.pow(v - avg, 2));
  return Math.sqrt(squaredDiffs.reduce((sum, d) => sum + d, 0) / (values.length - 1));
}

/**
 * Calculate the population standard deviation of an array of numbers
 */
export function populationStandardDeviation(values: number[]): number {
  if (values.length === 0) return 0;
  const avg = mean(values);
  const squaredDiffs = values.map((v) => Math.pow(v - avg, 2));
  return Math.sqrt(squaredDiffs.reduce((sum, d) => sum + d, 0) / values.length);
}

/**
 * Calculate the z-score for a given value
 */
export function zScore(value: number, values: number[]): number {
  const avg = mean(values);
  const stdDev = standardDeviation(values);
  if (stdDev === 0) return 0;
  return (value - avg) / stdDev;
}

/**
 * Calculate the z-score using pre-computed mean and standard deviation
 */
export function zScoreWithStats(value: number, avg: number, stdDev: number): number {
  if (stdDev === 0) return 0;
  return (value - avg) / stdDev;
}

/**
 * Calculate the variance of an array of numbers
 */
export function variance(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const squaredDiffs = values.map((v) => Math.pow(v - avg, 2));
  return squaredDiffs.reduce((sum, d) => sum + d, 0) / (values.length - 1);
}

/**
 * Calculate a specific percentile of an array of numbers
 * @param values Array of numbers
 * @param p Percentile to calculate (0-100)
 */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (index - lower) * (sorted[upper] - sorted[lower]);
}

/**
 * Calculate the median (50th percentile) of an array of numbers
 */
export function median(values: number[]): number {
  return percentile(values, 50);
}

/**
 * Calculate the interquartile range (IQR) and related statistics
 */
export function interquartileRange(values: number[]): {
  q1: number;
  q2: number;
  q3: number;
  iqr: number;
  lowerBound: number;
  upperBound: number;
} {
  const q1 = percentile(values, 25);
  const q2 = percentile(values, 50);
  const q3 = percentile(values, 75);
  const iqr = q3 - q1;
  return {
    q1,
    q2,
    q3,
    iqr,
    lowerBound: q1 - 1.5 * iqr,
    upperBound: q3 + 1.5 * iqr,
  };
}

/**
 * Check if a value is an outlier using the IQR method
 * @param value Value to check
 * @param values Array of historical values
 * @param multiplier IQR multiplier (default 1.5 for standard outliers, 3 for extreme outliers)
 */
export function isOutlierIQR(value: number, values: number[], multiplier: number = 1.5): boolean {
  const { q1, q3, iqr } = interquartileRange(values);
  const lowerBound = q1 - multiplier * iqr;
  const upperBound = q3 + multiplier * iqr;
  return value < lowerBound || value > upperBound;
}

/**
 * Get the IQR bounds for outlier detection
 */
export function getIQRBounds(
  values: number[],
  multiplier: number = 1.5,
): { lowerBound: number; upperBound: number } {
  const { q1, q3, iqr } = interquartileRange(values);
  return {
    lowerBound: q1 - multiplier * iqr,
    upperBound: q3 + multiplier * iqr,
  };
}

/**
 * Z-value lookup table for service levels (for safety stock calculations)
 * Returns the z-value for a given service level
 */
export function getZValueForServiceLevel(serviceLevel: number): number {
  const zTable: Record<number, number> = {
    0.5: 0.0,
    0.6: 0.25,
    0.7: 0.52,
    0.75: 0.67,
    0.8: 0.84,
    0.85: 1.04,
    0.9: 1.28,
    0.92: 1.41,
    0.95: 1.65,
    0.97: 1.88,
    0.98: 2.05,
    0.99: 2.33,
    0.995: 2.58,
    0.999: 3.09,
  };

  // Find exact match
  if (zTable[serviceLevel] !== undefined) {
    return zTable[serviceLevel];
  }

  // Linear interpolation for values not in table
  const keys = Object.keys(zTable)
    .map(Number)
    .sort((a, b) => a - b);
  for (let i = 0; i < keys.length - 1; i++) {
    if (serviceLevel >= keys[i] && serviceLevel <= keys[i + 1]) {
      const ratio = (serviceLevel - keys[i]) / (keys[i + 1] - keys[i]);
      return zTable[keys[i]] + ratio * (zTable[keys[i + 1]] - zTable[keys[i]]);
    }
  }

  // Default to 95% if out of range
  return 1.65;
}

/**
 * Calculate simple moving average
 * @param values Array of values
 * @param period Number of periods to average
 */
export function simpleMovingAverage(values: number[], period: number): number[] {
  if (values.length < period) return [];
  const result: number[] = [];
  for (let i = period - 1; i < values.length; i++) {
    const slice = values.slice(i - period + 1, i + 1);
    result.push(mean(slice));
  }
  return result;
}

/**
 * Calculate exponential moving average
 * @param values Array of values
 * @param period Number of periods (used to calculate smoothing factor)
 */
export function exponentialMovingAverage(values: number[], period: number): number[] {
  if (values.length === 0) return [];
  const k = 2 / (period + 1);
  const result: number[] = [values[0]];
  for (let i = 1; i < values.length; i++) {
    result.push(values[i] * k + result[i - 1] * (1 - k));
  }
  return result;
}

/**
 * Calculate the coefficient of variation (CV)
 * Useful for comparing variability across different scales
 */
export function coefficientOfVariation(values: number[]): number {
  const avg = mean(values);
  if (avg === 0) return 0;
  return standardDeviation(values) / avg;
}

/**
 * Calculate the sum of an array of numbers
 */
export function sum(values: number[]): number {
  return values.reduce((acc, v) => acc + v, 0);
}

/**
 * Find the minimum value in an array
 */
export function min(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.min(...values);
}

/**
 * Find the maximum value in an array
 */
export function max(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.max(...values);
}

/**
 * Calculate the range (max - min) of an array
 */
export function range(values: number[]): number {
  return max(values) - min(values);
}

/**
 * Linear regression calculation
 * Returns slope and intercept for y = mx + b
 */
export function linearRegression(
  x: number[],
  y: number[],
): { slope: number; intercept: number; rSquared: number } {
  if (x.length !== y.length || x.length === 0) {
    return { slope: 0, intercept: 0, rSquared: 0 };
  }

  const n = x.length;
  const sumX = sum(x);
  const sumY = sum(y);
  const sumXY = x.reduce((acc, xi, i) => acc + xi * y[i], 0);
  const sumXX = x.reduce((acc, xi) => acc + xi * xi, 0);

  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  // R-squared calculation
  const yMean = mean(y);
  const ssTotal = y.reduce((acc, yi) => acc + Math.pow(yi - yMean, 2), 0);
  const ssResidual = y.reduce(
    (acc, yi, i) => acc + Math.pow(yi - (slope * x[i] + intercept), 2),
    0,
  );
  const rSquared = ssTotal === 0 ? 0 : 1 - ssResidual / ssTotal;

  return { slope, intercept, rSquared };
}

/**
 * Predict future value using linear regression
 */
export function predictLinear(x: number[], y: number[], futureX: number): number {
  const { slope, intercept } = linearRegression(x, y);
  return slope * futureX + intercept;
}
