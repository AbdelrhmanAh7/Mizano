import {
  holtWinters,
  simpleExponentialSmoothing,
  doubleExponentialSmoothing,
  forecastWithConfidenceIntervals,
  detectSeasonalityStrength,
  detectTrend,
  aggregateToMonthly,
  applyHolidayMultipliers,
} from './holt-winters.util';
import { generateTimeSeries } from '../../../test/helpers/test-utils';

describe('holt-winters.util', () => {
  // Generate 36 months of data with trend and seasonality
  const seasonalData = generateTimeSeries(36, {
    base: 100,
    trend: 2,
    seasonalAmplitude: 20,
    seasonLength: 12,
    noise: 5,
  });

  describe('holtWinters', () => {
    it('should throw error for insufficient data', () => {
      expect(() => holtWinters([1, 2, 3], 6, { seasonLength: 12 })).toThrow(/Insufficient data/);
    });

    it('should require at least 2x season length', () => {
      const shortData = Array(23).fill(100);
      expect(() => holtWinters(shortData, 6, { seasonLength: 12 })).toThrow();
    });

    it('should return correct structure with 24+ data points', () => {
      const result = holtWinters(seasonalData, 6);

      expect(result).toHaveProperty('level');
      expect(result).toHaveProperty('trend');
      expect(result).toHaveProperty('seasonal');
      expect(result).toHaveProperty('fitted');
      expect(result).toHaveProperty('forecasts');
      expect(result).toHaveProperty('residuals');
      expect(result).toHaveProperty('mape');
    });

    it('should produce correct number of forecasts', () => {
      const result = holtWinters(seasonalData, 12);
      expect(result.forecasts).toHaveLength(12);
    });

    it('should produce fitted values matching data length', () => {
      const result = holtWinters(seasonalData, 6);
      expect(result.fitted).toHaveLength(seasonalData.length);
    });

    it('should have seasonal components matching season length', () => {
      const result = holtWinters(seasonalData, 6, { seasonLength: 12 });
      expect(result.seasonal).toHaveLength(12);
    });

    it('should compute MAPE', () => {
      const result = holtWinters(seasonalData, 6);
      expect(result.mape).toBeGreaterThanOrEqual(0);
    });

    it('should support additive seasonality', () => {
      const result = holtWinters(seasonalData, 6, { type: 'additive' });
      expect(result.forecasts).toHaveLength(6);
    });

    it('should detect upward trend', () => {
      const result = holtWinters(seasonalData, 6);
      expect(result.trend).toBeGreaterThan(0);
    });
  });

  describe('simpleExponentialSmoothing', () => {
    it('should return empty for empty input', () => {
      expect(simpleExponentialSmoothing([])).toEqual([]);
    });

    it('should return constant forecast (no trend/seasonality)', () => {
      const forecasts = simpleExponentialSmoothing([10, 20, 30], 0.3, 3);
      expect(forecasts).toHaveLength(3);
      // All forecast values should be the same
      expect(forecasts[0]).toBe(forecasts[1]);
      expect(forecasts[1]).toBe(forecasts[2]);
    });

    it('should respect alpha parameter', () => {
      // High alpha = more responsive to recent data
      const highAlpha = simpleExponentialSmoothing([10, 50], 0.9, 1);
      const lowAlpha = simpleExponentialSmoothing([10, 50], 0.1, 1);
      // High alpha should be closer to 50
      expect(highAlpha[0]).toBeGreaterThan(lowAlpha[0]);
    });
  });

  describe('doubleExponentialSmoothing', () => {
    it('should fallback to SES for less than 2 data points', () => {
      const result = doubleExponentialSmoothing([100], 0.3, 0.1, 3);
      expect(result).toHaveLength(3);
    });

    it('should capture trend', () => {
      const trendData = [100, 110, 120, 130, 140];
      const forecasts = doubleExponentialSmoothing(trendData, 0.3, 0.1, 3);
      // Forecasts should continue the upward trend
      expect(forecasts[0]).toBeGreaterThan(140);
      expect(forecasts[2]).toBeGreaterThan(forecasts[0]);
    });
  });

  describe('forecastWithConfidenceIntervals', () => {
    it('should return forecast points with bounds', () => {
      const points = forecastWithConfidenceIntervals(seasonalData, 6);

      expect(points).toHaveLength(6);
      points.forEach((p) => {
        expect(p).toHaveProperty('period');
        expect(p).toHaveProperty('predicted');
        expect(p).toHaveProperty('lowerBound');
        expect(p).toHaveProperty('upperBound');
        expect(p).toHaveProperty('seasonalIndex');
      });
    });

    it('should have lowerBound <= predicted <= upperBound', () => {
      const points = forecastWithConfidenceIntervals(seasonalData, 6);
      points.forEach((p) => {
        expect(p.lowerBound).toBeLessThanOrEqual(p.predicted);
        expect(p.predicted).toBeLessThanOrEqual(p.upperBound);
      });
    });

    it('should expand confidence intervals over horizon', () => {
      const points = forecastWithConfidenceIntervals(seasonalData, 12);
      const firstWidth = points[0].upperBound - points[0].lowerBound;
      const lastWidth = points[11].upperBound - points[11].lowerBound;
      expect(lastWidth).toBeGreaterThan(firstWidth);
    });

    it('should ensure predicted values are non-negative', () => {
      const points = forecastWithConfidenceIntervals(seasonalData, 6);
      points.forEach((p) => {
        expect(p.predicted).toBeGreaterThanOrEqual(0);
        expect(p.lowerBound).toBeGreaterThanOrEqual(0);
      });
    });

    it('should work with less data (fallback to DES/SES)', () => {
      const shortData = [100, 110, 120, 130, 140, 150, 160, 170];
      const points = forecastWithConfidenceIntervals(shortData, 3, {
        seasonLength: 12,
      });
      expect(points).toHaveLength(3);
    });
  });

  describe('detectSeasonalityStrength', () => {
    it('should return 0 for insufficient data', () => {
      expect(detectSeasonalityStrength([1, 2, 3], 12)).toBe(0);
    });

    it('should return 0 for constant data', () => {
      const constant = Array(36).fill(100);
      expect(detectSeasonalityStrength(constant, 12)).toBe(0);
    });

    it('should detect strong seasonality', () => {
      const strongSeasonal = generateTimeSeries(36, {
        base: 100,
        seasonalAmplitude: 40,
        seasonLength: 12,
        noise: 1,
      });
      const strength = detectSeasonalityStrength(strongSeasonal, 12);
      expect(strength).toBeGreaterThan(0.1);
    });
  });

  describe('detectTrend', () => {
    it('should return flat for insufficient data', () => {
      const result = detectTrend([1, 2]);
      expect(result.direction).toBe('flat');
    });

    it('should detect upward trend', () => {
      const upData = [100, 110, 120, 130, 140, 150];
      const result = detectTrend(upData);
      expect(result.direction).toBe('up');
      expect(result.magnitude).toBeGreaterThan(0);
      expect(result.confidence).toBeGreaterThan(0.9);
    });

    it('should detect downward trend', () => {
      const downData = [150, 140, 130, 120, 110, 100];
      const result = detectTrend(downData);
      expect(result.direction).toBe('down');
      expect(result.magnitude).toBeLessThan(0);
    });

    it('should detect flat trend for constant data', () => {
      const flatData = [100, 100, 100, 100, 100];
      const result = detectTrend(flatData);
      expect(result.direction).toBe('flat');
    });
  });

  describe('aggregateToMonthly', () => {
    it('should aggregate daily data to monthly totals', () => {
      const dailyData = [
        { date: new Date(2024, 0, 1), value: 10 },
        { date: new Date(2024, 0, 15), value: 20 },
        { date: new Date(2024, 1, 1), value: 30 },
      ];
      const monthly = aggregateToMonthly(dailyData);
      expect(monthly).toHaveLength(2);
      expect(monthly[0].value).toBe(30); // Jan: 10 + 20
      expect(monthly[1].value).toBe(30); // Feb: 30
    });

    it('should sort by date', () => {
      const data = [
        { date: new Date(2024, 2, 1), value: 10 },
        { date: new Date(2024, 0, 1), value: 20 },
      ];
      const monthly = aggregateToMonthly(data);
      expect(monthly[0].month.getMonth()).toBe(0); // Jan first
    });
  });

  describe('applyHolidayMultipliers', () => {
    it('should apply multiplier to matching months', () => {
      const forecasts = [
        { period: 1, predicted: 100, lowerBound: 80, upperBound: 120, seasonalIndex: 1 },
      ];
      const holidays = [{ month: new Date().getMonth(), multiplier: 1.5 }];
      const result = applyHolidayMultipliers(forecasts, new Date(), holidays);
      expect(result[0].predicted).toBe(150);
    });

    it('should not modify non-holiday months', () => {
      const forecasts = [
        { period: 1, predicted: 100, lowerBound: 80, upperBound: 120, seasonalIndex: 1 },
      ];
      // Use a month that won't match current month + index
      const holidays = [{ month: 13, multiplier: 2.0 }];
      const result = applyHolidayMultipliers(forecasts, new Date(), holidays);
      expect(result[0].predicted).toBe(100);
    });
  });
});
