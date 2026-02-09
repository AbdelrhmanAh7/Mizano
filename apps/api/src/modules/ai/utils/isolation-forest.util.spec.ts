import {
  buildIsolationForest,
  isolationForestScore,
  isolationForestDetect,
  buildIsolationForest1D,
  isolationForestScore1D,
} from './isolation-forest.util';

describe('isolation-forest.util', () => {
  describe('buildIsolationForest', () => {
    it('should handle empty data', () => {
      const forest = buildIsolationForest([]);
      expect(forest.trees).toHaveLength(0);
      expect(forest.sampleSize).toBe(0);
    });

    it('should build forest with specified number of trees', () => {
      const data = Array.from({ length: 100 }, () => [
        Math.random() * 100,
        Math.random() * 100,
      ]);
      const forest = buildIsolationForest(data, 50);
      expect(forest.trees).toHaveLength(50);
    });

    it('should use default 100 trees', () => {
      const data = Array.from({ length: 100 }, () => [Math.random() * 100]);
      const forest = buildIsolationForest(data);
      expect(forest.trees).toHaveLength(100);
    });

    it('should set sample size to min(256, data.length)', () => {
      const smallData = Array.from({ length: 50 }, () => [Math.random()]);
      const forest = buildIsolationForest(smallData, 10);
      expect(forest.sampleSize).toBe(50);

      const largeData = Array.from({ length: 500 }, () => [Math.random()]);
      const largeFroest = buildIsolationForest(largeData, 10);
      expect(largeFroest.sampleSize).toBe(256);
    });

    it('should accept custom sample size', () => {
      const data = Array.from({ length: 100 }, () => [Math.random()]);
      const forest = buildIsolationForest(data, 10, 30);
      expect(forest.sampleSize).toBe(30);
    });
  });

  describe('isolationForestScore', () => {
    it('should return 0.5 for empty forest', () => {
      const forest = { trees: [], sampleSize: 0 };
      expect(isolationForestScore([1], forest)).toBe(0.5);
    });

    it('should score anomalies higher than normal points', () => {
      // Create normal cluster + outlier
      const normalData: number[][] = [];
      for (let i = 0; i < 200; i++) {
        normalData.push([50 + Math.random() * 10, 50 + Math.random() * 10]);
      }

      const forest = buildIsolationForest(normalData, 100);

      // Normal point (within cluster)
      const normalScore = isolationForestScore([55, 55], forest);

      // Anomaly point (far from cluster)
      const anomalyScore = isolationForestScore([200, 200], forest);

      expect(anomalyScore).toBeGreaterThan(normalScore);
    });

    it('should return score between 0 and 1', () => {
      const data = Array.from({ length: 100 }, () => [
        Math.random() * 100,
      ]);
      const forest = buildIsolationForest(data, 50);

      const score = isolationForestScore([50], forest);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });
  });

  describe('isolationForestDetect', () => {
    it('should detect clear anomalies', () => {
      const normalData: number[][] = [];
      for (let i = 0; i < 200; i++) {
        normalData.push([Math.random() * 10]);
      }

      const forest = buildIsolationForest(normalData, 100);

      // Far outlier should be detected
      const isAnomaly = isolationForestDetect([1000], forest, 0.6);
      expect(isAnomaly).toBe(true);
    });

    it('should not flag normal data points', () => {
      const data: number[][] = [];
      for (let i = 0; i < 200; i++) {
        data.push([50 + Math.random() * 5]);
      }

      const forest = buildIsolationForest(data, 100);

      // Point within normal range
      const isAnomaly = isolationForestDetect([52], forest, 0.7);
      expect(isAnomaly).toBe(false);
    });

    it('should respect threshold parameter', () => {
      const data: number[][] = [];
      for (let i = 0; i < 200; i++) {
        data.push([Math.random() * 100]);
      }
      const forest = buildIsolationForest(data, 100);

      const score = isolationForestScore([500], forest);

      // Low threshold: more things flagged
      const detectedLow = isolationForestDetect([500], forest, 0.3);
      // High threshold: fewer things flagged
      const detectedHigh = isolationForestDetect([500], forest, 0.99);

      if (score > 0.3) expect(detectedLow).toBe(true);
      if (score < 0.99) expect(detectedHigh).toBe(false);
    });
  });

  describe('buildIsolationForest1D', () => {
    it('should wrap 1D values correctly', () => {
      const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const forest = buildIsolationForest1D(values, 50);
      expect(forest.trees).toHaveLength(50);
      expect(forest.sampleSize).toBe(10);
    });
  });

  describe('isolationForestScore1D', () => {
    it('should score 1D values', () => {
      const values = Array.from({ length: 100 }, () => Math.random() * 10);
      const forest = buildIsolationForest1D(values, 50);

      const score = isolationForestScore1D(5, forest);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });

    it('should give higher score to 1D outliers', () => {
      const values = Array.from({ length: 200 }, () => 50 + Math.random() * 5);
      const forest = buildIsolationForest1D(values, 100);

      const normalScore = isolationForestScore1D(52, forest);
      const outlierScore = isolationForestScore1D(500, forest);

      expect(outlierScore).toBeGreaterThan(normalScore);
    });
  });
});
