import {
  mean,
  standardDeviation,
  populationStandardDeviation,
  zScore,
  zScoreWithStats,
  variance,
  percentile,
  median,
  interquartileRange,
  isOutlierIQR,
  getIQRBounds,
  getZValueForServiceLevel,
  simpleMovingAverage,
  exponentialMovingAverage,
  coefficientOfVariation,
  sum,
  min,
  max,
  range,
  linearRegression,
  predictLinear,
} from './statistics.util';

describe('statistics.util', () => {
  describe('mean', () => {
    it('should return 0 for empty array', () => {
      expect(mean([])).toBe(0);
    });

    it('should calculate mean of single value', () => {
      expect(mean([5])).toBe(5);
    });

    it('should calculate mean of multiple values', () => {
      expect(mean([1, 2, 3, 4, 5])).toBe(3);
    });

    it('should handle negative values', () => {
      expect(mean([-10, 10])).toBe(0);
    });

    it('should handle decimal values', () => {
      expect(mean([1.5, 2.5, 3.5])).toBeCloseTo(2.5);
    });
  });

  describe('standardDeviation', () => {
    it('should return 0 for less than 2 values', () => {
      expect(standardDeviation([])).toBe(0);
      expect(standardDeviation([5])).toBe(0);
    });

    it('should return 0 for identical values', () => {
      expect(standardDeviation([5, 5, 5, 5])).toBe(0);
    });

    it('should calculate sample standard deviation', () => {
      // Known: [2, 4, 4, 4, 5, 5, 7, 9] has sample std dev ≈ 2.138
      const values = [2, 4, 4, 4, 5, 5, 7, 9];
      expect(standardDeviation(values)).toBeCloseTo(2.138, 2);
    });
  });

  describe('populationStandardDeviation', () => {
    it('should return 0 for empty array', () => {
      expect(populationStandardDeviation([])).toBe(0);
    });

    it('should calculate population std dev (divides by n, not n-1)', () => {
      const values = [2, 4, 4, 4, 5, 5, 7, 9];
      expect(populationStandardDeviation(values)).toBeCloseTo(2.0, 1);
    });
  });

  describe('zScore', () => {
    it('should return 0 when std dev is 0', () => {
      expect(zScore(5, [5, 5, 5])).toBe(0);
    });

    it('should return 0 for mean value', () => {
      const values = [10, 20, 30, 40, 50];
      expect(zScore(30, values)).toBeCloseTo(0, 5);
    });

    it('should return positive for above-mean values', () => {
      const values = [10, 20, 30, 40, 50];
      expect(zScore(50, values)).toBeGreaterThan(0);
    });

    it('should return negative for below-mean values', () => {
      const values = [10, 20, 30, 40, 50];
      expect(zScore(10, values)).toBeLessThan(0);
    });
  });

  describe('zScoreWithStats', () => {
    it('should return 0 when std dev is 0', () => {
      expect(zScoreWithStats(5, 5, 0)).toBe(0);
    });

    it('should calculate z-score from pre-computed stats', () => {
      expect(zScoreWithStats(110, 100, 10)).toBeCloseTo(1.0);
      expect(zScoreWithStats(80, 100, 10)).toBeCloseTo(-2.0);
    });
  });

  describe('variance', () => {
    it('should return 0 for less than 2 values', () => {
      expect(variance([])).toBe(0);
      expect(variance([5])).toBe(0);
    });

    it('should equal standard deviation squared', () => {
      const values = [2, 4, 4, 4, 5, 5, 7, 9];
      const stdDev = standardDeviation(values);
      expect(variance(values)).toBeCloseTo(stdDev * stdDev, 5);
    });
  });

  describe('percentile', () => {
    it('should return 0 for empty array', () => {
      expect(percentile([], 50)).toBe(0);
    });

    it('should return the only value for single-element array', () => {
      expect(percentile([42], 50)).toBe(42);
    });

    it('should calculate 50th percentile (median)', () => {
      expect(percentile([1, 2, 3, 4, 5], 50)).toBe(3);
    });

    it('should calculate 25th and 75th percentiles', () => {
      const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      expect(percentile(values, 25)).toBeCloseTo(3.25, 1);
      expect(percentile(values, 75)).toBeCloseTo(7.75, 1);
    });

    it('should return min at 0th percentile', () => {
      expect(percentile([10, 20, 30], 0)).toBe(10);
    });

    it('should return max at 100th percentile', () => {
      expect(percentile([10, 20, 30], 100)).toBe(30);
    });
  });

  describe('median', () => {
    it('should return 50th percentile', () => {
      expect(median([1, 3, 5])).toBe(3);
      expect(median([1, 2, 3, 4])).toBe(2.5);
    });
  });

  describe('interquartileRange', () => {
    it('should calculate Q1, Q2, Q3, IQR, and bounds', () => {
      const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const result = interquartileRange(values);

      expect(result.q1).toBeCloseTo(3.25, 1);
      expect(result.q2).toBeCloseTo(5.5, 1);
      expect(result.q3).toBeCloseTo(7.75, 1);
      expect(result.iqr).toBeCloseTo(4.5, 1);
      expect(result.lowerBound).toBeLessThan(result.q1);
      expect(result.upperBound).toBeGreaterThan(result.q3);
    });
  });

  describe('isOutlierIQR', () => {
    it('should detect outliers', () => {
      const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      expect(isOutlierIQR(100, values)).toBe(true);
      expect(isOutlierIQR(-50, values)).toBe(true);
    });

    it('should not flag normal values', () => {
      const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      expect(isOutlierIQR(5, values)).toBe(false);
    });

    it('should respect multiplier', () => {
      const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      // With multiplier 3 (extreme outliers), fewer things flagged
      expect(isOutlierIQR(15, values, 1.5)).toBe(true);
      expect(isOutlierIQR(15, values, 3.0)).toBe(false);
    });
  });

  describe('getIQRBounds', () => {
    it('should return bounds based on multiplier', () => {
      const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const bounds = getIQRBounds(values, 1.5);
      expect(bounds.lowerBound).toBeLessThan(1);
      expect(bounds.upperBound).toBeGreaterThan(10);
    });
  });

  describe('getZValueForServiceLevel', () => {
    it('should return exact values from table', () => {
      expect(getZValueForServiceLevel(0.95)).toBe(1.65);
      expect(getZValueForServiceLevel(0.99)).toBe(2.33);
      expect(getZValueForServiceLevel(0.9)).toBe(1.28);
    });

    it('should interpolate between table values', () => {
      const z = getZValueForServiceLevel(0.96);
      expect(z).toBeGreaterThan(1.65);
      expect(z).toBeLessThan(1.88);
    });

    it('should default to 1.65 for out-of-range values', () => {
      expect(getZValueForServiceLevel(0.1)).toBe(1.65);
    });
  });

  describe('simpleMovingAverage', () => {
    it('should return empty array if data shorter than period', () => {
      expect(simpleMovingAverage([1, 2], 5)).toEqual([]);
    });

    it('should calculate SMA correctly', () => {
      const values = [1, 2, 3, 4, 5];
      const sma = simpleMovingAverage(values, 3);
      expect(sma).toEqual([2, 3, 4]);
    });
  });

  describe('exponentialMovingAverage', () => {
    it('should return empty array for empty input', () => {
      expect(exponentialMovingAverage([], 3)).toEqual([]);
    });

    it('should start with first value', () => {
      const ema = exponentialMovingAverage([10, 20, 30], 3);
      expect(ema[0]).toBe(10);
    });

    it('should have same length as input', () => {
      const values = [1, 2, 3, 4, 5];
      expect(exponentialMovingAverage(values, 3).length).toBe(5);
    });
  });

  describe('coefficientOfVariation', () => {
    it('should return 0 when mean is 0', () => {
      expect(coefficientOfVariation([-1, 1])).toBe(0);
    });

    it('should return 0 for identical values', () => {
      expect(coefficientOfVariation([5, 5, 5])).toBe(0);
    });

    it('should be positive for varying values', () => {
      expect(coefficientOfVariation([10, 20, 30])).toBeGreaterThan(0);
    });
  });

  describe('sum, min, max, range', () => {
    it('should handle empty arrays', () => {
      expect(sum([])).toBe(0);
      expect(min([])).toBe(0);
      expect(max([])).toBe(0);
      expect(range([])).toBe(0);
    });

    it('should calculate correctly', () => {
      const values = [3, 1, 4, 1, 5, 9, 2, 6];
      expect(sum(values)).toBe(31);
      expect(min(values)).toBe(1);
      expect(max(values)).toBe(9);
      expect(range(values)).toBe(8);
    });
  });

  describe('linearRegression', () => {
    it('should handle empty arrays', () => {
      const result = linearRegression([], []);
      expect(result.slope).toBe(0);
      expect(result.intercept).toBe(0);
      expect(result.rSquared).toBe(0);
    });

    it('should handle mismatched arrays', () => {
      const result = linearRegression([1, 2], [1]);
      expect(result.slope).toBe(0);
    });

    it('should find perfect linear relationship', () => {
      const x = [1, 2, 3, 4, 5];
      const y = [2, 4, 6, 8, 10]; // y = 2x
      const result = linearRegression(x, y);
      expect(result.slope).toBeCloseTo(2, 5);
      expect(result.intercept).toBeCloseTo(0, 5);
      expect(result.rSquared).toBeCloseTo(1, 5);
    });

    it('should calculate R-squared for noisy data', () => {
      const x = [1, 2, 3, 4, 5];
      const y = [2.1, 3.9, 6.2, 7.8, 10.1];
      const result = linearRegression(x, y);
      expect(result.rSquared).toBeGreaterThan(0.95);
      expect(result.rSquared).toBeLessThanOrEqual(1);
    });
  });

  describe('predictLinear', () => {
    it('should predict future values', () => {
      const x = [1, 2, 3, 4, 5];
      const y = [2, 4, 6, 8, 10];
      expect(predictLinear(x, y, 10)).toBeCloseTo(20, 2);
    });
  });
});
