/**
 * Logistic Regression Utility Tests
 *
 * Mocks ml-logistic-regression and ml-matrix since they use native require()
 * and may not resolve correctly in all environments.
 */

// Mock ml-logistic-regression before imports
const mockPredict = jest.fn();
const mockTrain = jest.fn();
const mockToJSON = jest.fn().mockReturnValue({ type: 'logistic-regression' });
const mockLoad = jest.fn();

class MockLogisticRegression {
  weights: any;
  _normMeans: number[] | undefined;
  _normStds: number[] | undefined;

  constructor(_opts?: any) {
    this.weights = null;
  }

  train(features: any, labels: any) {
    mockTrain(features, labels);
    // Simulate trained weights
    this.weights = [[0.5], [0.5]];
  }

  predict(matrix: any) {
    mockPredict(matrix);
    // Return based on first feature value
    const data = matrix.data || matrix;
    return data.map((row: number[]) => (row[0] > 0 ? 1 : 0));
  }

  toJSON() {
    return mockToJSON();
  }

  static load(json: any) {
    mockLoad(json);
    const instance = new MockLogisticRegression();
    instance.weights = [[0.5], [0.5]];
    return instance;
  }
}

class MockMatrix {
  data: number[][];
  constructor(data: number[][]) {
    this.data = data;
  }
  static columnVector(arr: number[]) {
    return arr.map((v) => [v]);
  }
}

jest.mock('ml-logistic-regression', () => ({
  default: MockLogisticRegression,
  __esModule: true,
}));

jest.mock('ml-matrix', () => ({
  Matrix: MockMatrix,
}));

import {
  trainLogisticRegression,
  predictProbability,
  predictClass,
  getModelAccuracy,
  serializeModel,
  deserializeModel,
} from './logistic-regression.util';

describe('logistic-regression.util', () => {
  // Create a simple linearly separable dataset
  const features: number[][] = [];
  const labels: number[] = [];

  for (let i = 0; i < 50; i++) {
    features.push([1 + i * 0.05, 1 + i * 0.05]);
    labels.push(0);
  }
  for (let i = 0; i < 50; i++) {
    features.push([7 + i * 0.05, 7 + i * 0.05]);
    labels.push(1);
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('trainLogisticRegression', () => {
    it('should throw for empty data', () => {
      expect(() => trainLogisticRegression([], [])).toThrow(
        'Features and labels must be non-empty and same length',
      );
    });

    it('should throw for mismatched lengths', () => {
      expect(() => trainLogisticRegression([[1, 2]], [1, 0])).toThrow();
    });

    it('should train and return model with metrics', () => {
      const result = trainLogisticRegression(features, labels, ['x', 'y']);

      expect(result).toHaveProperty('model');
      expect(result).toHaveProperty('accuracy');
      expect(result).toHaveProperty('precision');
      expect(result).toHaveProperty('recall');
      expect(result).toHaveProperty('f1Score');

      expect(result.model.featureNames).toEqual(['x', 'y']);
      expect(result.model.sampleCount).toBe(100);
      expect(result.model.trainedAt).toBeInstanceOf(Date);
    });

    it('should call train on the classifier', () => {
      trainLogisticRegression(features, labels);
      expect(mockTrain).toHaveBeenCalled();
    });

    it('should respect testSplit parameter', () => {
      const result = trainLogisticRegression(features, labels, [], 0.3);
      expect(result.accuracy).toBeDefined();
    });

    it('should produce accuracy between 0 and 1', () => {
      const result = trainLogisticRegression(features, labels);
      expect(result.accuracy).toBeGreaterThanOrEqual(0);
      expect(result.accuracy).toBeLessThanOrEqual(1);
    });
  });

  describe('predictProbability', () => {
    it('should return value between 0 and 1', () => {
      const { model } = trainLogisticRegression(features, labels);
      const prob = predictProbability(model, [5, 5]);
      expect(prob).toBeGreaterThanOrEqual(0);
      expect(prob).toBeLessThanOrEqual(1);
    });

    it('should return a number', () => {
      const { model } = trainLogisticRegression(features, labels);
      const prob = predictProbability(model, [1, 1]);
      expect(typeof prob).toBe('number');
      expect(isNaN(prob)).toBe(false);
    });
  });

  describe('predictClass', () => {
    it('should return 0 or 1', () => {
      const { model } = trainLogisticRegression(features, labels);
      const cls = predictClass(model, [5, 5]);
      expect([0, 1]).toContain(cls);
    });
  });

  describe('getModelAccuracy', () => {
    it('should return accuracy between 0 and 1', () => {
      const { model } = trainLogisticRegression(features, labels);
      const accuracy = getModelAccuracy(model, features, labels);
      expect(accuracy).toBeGreaterThanOrEqual(0);
      expect(accuracy).toBeLessThanOrEqual(1);
    });

    it('should return 0 for empty data', () => {
      const { model } = trainLogisticRegression(features, labels);
      expect(getModelAccuracy(model, [], [])).toBe(0);
    });
  });

  describe('serializeModel', () => {
    it('should return a JSON string', () => {
      const { model } = trainLogisticRegression(features, labels);
      const json = serializeModel(model);
      expect(typeof json).toBe('string');
      const parsed = JSON.parse(json);
      expect(parsed).toHaveProperty('classifier');
      expect(parsed).toHaveProperty('featureNames');
      expect(parsed).toHaveProperty('accuracy');
      expect(parsed).toHaveProperty('trainedAt');
      expect(parsed).toHaveProperty('sampleCount');
    });
  });

  describe('deserializeModel', () => {
    it('should reconstruct a model from JSON', () => {
      const { model } = trainLogisticRegression(features, labels);
      const json = serializeModel(model);
      const restored = deserializeModel(json);

      expect(restored.featureNames).toEqual(model.featureNames);
      expect(restored.accuracy).toBe(model.accuracy);
      expect(restored.sampleCount).toBe(model.sampleCount);
      expect(restored.trainedAt).toBeInstanceOf(Date);
      expect(restored.classifier).toBeDefined();
    });
  });
});
