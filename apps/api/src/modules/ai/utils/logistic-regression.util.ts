/**
 * Logistic Regression Utility
 * Wrapper around ml-logistic-regression for lead scoring and classification tasks.
 * 100% local — zero external AI APIs.
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { LogisticRegression } = require('ml-logistic-regression');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Matrix } = require('ml-matrix');

export interface LogisticRegressionModel {
  classifier: any;
  featureNames: string[];
  accuracy: number;
  trainedAt: Date;
  sampleCount: number;
}

export interface TrainingResult {
  model: LogisticRegressionModel;
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
}

/**
 * Train a logistic regression model.
 *
 * @param features 2D array of features [[f1, f2, ...], ...]
 * @param labels Array of binary labels (0 or 1)
 * @param featureNames Optional names for the features
 * @param testSplit Fraction of data to use for testing (default 0.2)
 * @returns Training result with model and metrics
 */
export function trainLogisticRegression(
  features: number[][],
  labels: number[],
  featureNames: string[] = [],
  testSplit: number = 0.2,
): TrainingResult {
  if (features.length !== labels.length || features.length === 0) {
    throw new Error('Features and labels must be non-empty and same length');
  }

  // Normalize features (z-score normalization)
  const { normalized, means, stds } = normalizeFeatures(features);

  // Split into train/test
  const splitIndex = Math.floor(features.length * (1 - testSplit));
  const indices = shuffleIndices(features.length);

  const trainFeatures: number[][] = [];
  const trainLabels: number[] = [];
  const testFeatures: number[][] = [];
  const testLabels: number[] = [];

  for (let i = 0; i < indices.length; i++) {
    const idx = indices[i];
    if (i < splitIndex) {
      trainFeatures.push(normalized[idx]);
      trainLabels.push(labels[idx]);
    } else {
      testFeatures.push(normalized[idx]);
      testLabels.push(labels[idx]);
    }
  }

  // Train the classifier
  const trainMatrix = new Matrix(trainFeatures);
  const classifier = new LogisticRegression({
    numSteps: 1000,
    learningRate: 0.01,
  });
  classifier.train(trainMatrix, Matrix.columnVector(trainLabels));

  // Store normalization params in the classifier for prediction
  classifier._normMeans = means;
  classifier._normStds = stds;

  // Evaluate on test set
  let accuracy = 1.0;
  let truePositives = 0;
  let falsePositives = 0;
  let falseNegatives = 0;

  if (testFeatures.length > 0) {
    const testMatrix = new Matrix(testFeatures);
    const predictions = classifier.predict(testMatrix);
    let correct = 0;

    for (let i = 0; i < testLabels.length; i++) {
      const predicted = predictions[i];
      const actual = testLabels[i];
      if (predicted === actual) correct++;
      if (predicted === 1 && actual === 1) truePositives++;
      if (predicted === 1 && actual === 0) falsePositives++;
      if (predicted === 0 && actual === 1) falseNegatives++;
    }

    accuracy = correct / testLabels.length;
  }

  const precision =
    truePositives + falsePositives > 0
      ? truePositives / (truePositives + falsePositives)
      : 0;
  const recall =
    truePositives + falseNegatives > 0
      ? truePositives / (truePositives + falseNegatives)
      : 0;
  const f1Score =
    precision + recall > 0
      ? (2 * precision * recall) / (precision + recall)
      : 0;

  const model: LogisticRegressionModel = {
    classifier,
    featureNames,
    accuracy,
    trainedAt: new Date(),
    sampleCount: features.length,
  };

  return { model, accuracy, precision, recall, f1Score };
}

/**
 * Predict probability for a single data point.
 * Returns a value between 0 and 1 representing the probability of the positive class.
 *
 * @param model Trained logistic regression model
 * @param features Feature array for a single data point
 * @returns Probability between 0 and 1
 */
export function predictProbability(
  model: LogisticRegressionModel,
  features: number[],
): number {
  const means = model.classifier._normMeans as number[];
  const stds = model.classifier._normStds as number[];

  // Normalize using training stats
  const normalizedFeatures = features.map((f, i) => {
    const std = stds[i];
    return std === 0 ? 0 : (f - means[i]) / std;
  });

  // Use the internal weights to compute the raw logistic value
  // sigmoid(w · x + b) gives us the probability
  const weights = model.classifier.weights || model.classifier.W;
  if (!weights) {
    // Fallback: use predict and return 0 or 1
    const matrix = new Matrix([normalizedFeatures]);
    const prediction = model.classifier.predict(matrix);
    return prediction[0] === 1 ? 0.8 : 0.2;
  }

  // Manual sigmoid computation for probability
  let z = 0;
  const w = weights.data ? weights.data : weights;
  for (let i = 0; i < normalizedFeatures.length; i++) {
    const weight = Array.isArray(w[i]) ? w[i][0] : w[i];
    z += weight * normalizedFeatures[i];
  }

  // Sigmoid function
  const probability = 1 / (1 + Math.exp(-z));
  return Math.max(0.01, Math.min(0.99, probability));
}

/**
 * Predict class for a single data point.
 *
 * @param model Trained logistic regression model
 * @param features Feature array for a single data point
 * @returns 0 or 1
 */
export function predictClass(
  model: LogisticRegressionModel,
  features: number[],
): number {
  const prob = predictProbability(model, features);
  return prob >= 0.5 ? 1 : 0;
}

/**
 * Calculate model accuracy on a dataset.
 */
export function getModelAccuracy(
  model: LogisticRegressionModel,
  features: number[][],
  labels: number[],
): number {
  let correct = 0;
  for (let i = 0; i < features.length; i++) {
    const predicted = predictClass(model, features[i]);
    if (predicted === labels[i]) correct++;
  }
  return features.length > 0 ? correct / features.length : 0;
}

/**
 * Serialize a model for storage in the database.
 */
export function serializeModel(model: LogisticRegressionModel): string {
  return JSON.stringify({
    classifier: model.classifier.toJSON(),
    normMeans: model.classifier._normMeans,
    normStds: model.classifier._normStds,
    featureNames: model.featureNames,
    accuracy: model.accuracy,
    trainedAt: model.trainedAt.toISOString(),
    sampleCount: model.sampleCount,
  });
}

/**
 * Deserialize a model from database storage.
 */
export function deserializeModel(json: string): LogisticRegressionModel {
  const data = JSON.parse(json);
  const classifier = LogisticRegression.load(data.classifier);
  classifier._normMeans = data.normMeans;
  classifier._normStds = data.normStds;

  return {
    classifier,
    featureNames: data.featureNames,
    accuracy: data.accuracy,
    trainedAt: new Date(data.trainedAt),
    sampleCount: data.sampleCount,
  };
}

/**
 * Normalize features using z-score normalization (mean=0, std=1).
 */
function normalizeFeatures(features: number[][]): {
  normalized: number[][];
  means: number[];
  stds: number[];
} {
  if (features.length === 0) return { normalized: [], means: [], stds: [] };

  const numFeatures = features[0].length;
  const means: number[] = [];
  const stds: number[] = [];

  // Calculate mean and std for each feature
  for (let j = 0; j < numFeatures; j++) {
    const column = features.map((row) => row[j]);
    const m = column.reduce((a, b) => a + b, 0) / column.length;
    means.push(m);

    const squaredDiffs = column.map((v) => Math.pow(v - m, 2));
    const variance =
      squaredDiffs.reduce((a, b) => a + b, 0) / Math.max(column.length - 1, 1);
    stds.push(Math.sqrt(variance));
  }

  // Normalize
  const normalized = features.map((row) =>
    row.map((val, j) => {
      if (stds[j] === 0) return 0;
      return (val - means[j]) / stds[j];
    }),
  );

  return { normalized, means, stds };
}

/**
 * Generate shuffled array of indices.
 */
function shuffleIndices(length: number): number[] {
  const indices = Array.from({ length }, (_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices;
}
