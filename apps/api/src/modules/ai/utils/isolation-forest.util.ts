/**
 * Isolation Forest Algorithm
 * An unsupervised anomaly detection algorithm based on the principle
 * that anomalies are "few and different" — they require fewer random
 * splits to isolate compared to normal observations.
 *
 * Reference: Liu, Ting & Zhou (2008) "Isolation Forest"
 *
 * 100% local — zero external dependencies.
 */

interface IsolationTreeNode {
  splitFeature: number;
  splitValue: number;
  left: IsolationTreeNode | null;
  right: IsolationTreeNode | null;
  size: number;
}

interface IsolationForest {
  trees: IsolationTreeNode[];
  sampleSize: number;
}

/**
 * Average path length of an unsuccessful search in a Binary Search Tree.
 * Used for normalizing anomaly scores.
 * c(n) = 2 * H(n-1) - 2(n-1)/n, where H(i) ≈ ln(i) + 0.5772 (Euler constant)
 */
function averagePathLength(n: number): number {
  if (n <= 1) return 0;
  if (n === 2) return 1;
  const harmonicNumber = Math.log(n - 1) + 0.5772156649;
  return 2 * harmonicNumber - (2 * (n - 1)) / n;
}

/**
 * Build a single Isolation Tree by recursively splitting data randomly.
 */
function buildIsolationTree(
  data: number[][],
  currentDepth: number,
  maxDepth: number,
): IsolationTreeNode {
  const n = data.length;

  // External node: stop splitting
  if (currentDepth >= maxDepth || n <= 1) {
    return {
      splitFeature: -1,
      splitValue: 0,
      left: null,
      right: null,
      size: n,
    };
  }

  const numFeatures = data[0].length;

  // Randomly select a feature
  const featureIndex = Math.floor(Math.random() * numFeatures);

  // Get min and max of the selected feature
  let minVal = Infinity;
  let maxVal = -Infinity;
  for (const point of data) {
    if (point[featureIndex] < minVal) minVal = point[featureIndex];
    if (point[featureIndex] > maxVal) maxVal = point[featureIndex];
  }

  // If all values are the same, create an external node
  if (minVal === maxVal) {
    return {
      splitFeature: -1,
      splitValue: 0,
      left: null,
      right: null,
      size: n,
    };
  }

  // Randomly select a split value between min and max
  const splitValue = minVal + Math.random() * (maxVal - minVal);

  // Partition data
  const leftData: number[][] = [];
  const rightData: number[][] = [];

  for (const point of data) {
    if (point[featureIndex] < splitValue) {
      leftData.push(point);
    } else {
      rightData.push(point);
    }
  }

  return {
    splitFeature: featureIndex,
    splitValue,
    left: buildIsolationTree(leftData, currentDepth + 1, maxDepth),
    right: buildIsolationTree(rightData, currentDepth + 1, maxDepth),
    size: n,
  };
}

/**
 * Calculate the path length to isolate a point in a single tree.
 */
function pathLength(
  point: number[],
  node: IsolationTreeNode,
  currentDepth: number,
): number {
  // External node — estimate remaining path using c(n)
  if (node.left === null || node.right === null) {
    return currentDepth + averagePathLength(node.size);
  }

  // Traverse the tree
  if (point[node.splitFeature] < node.splitValue) {
    return pathLength(point, node.left, currentDepth + 1);
  } else {
    return pathLength(point, node.right, currentDepth + 1);
  }
}

/**
 * Build an Isolation Forest from multi-dimensional data.
 *
 * @param data Array of data points, each point is an array of features
 * @param numTrees Number of isolation trees (default 100)
 * @param sampleSize Subsample size for each tree (default min(256, data.length))
 * @returns IsolationForest model
 */
export function buildIsolationForest(
  data: number[][],
  numTrees: number = 100,
  sampleSize?: number,
): IsolationForest {
  if (data.length === 0) {
    return { trees: [], sampleSize: 0 };
  }

  const effectiveSampleSize = sampleSize ?? Math.min(256, data.length);
  const maxDepth = Math.ceil(Math.log2(effectiveSampleSize));
  const trees: IsolationTreeNode[] = [];

  for (let i = 0; i < numTrees; i++) {
    // Random subsample without replacement
    const sample = randomSubsample(data, effectiveSampleSize);
    trees.push(buildIsolationTree(sample, 0, maxDepth));
  }

  return { trees, sampleSize: effectiveSampleSize };
}

/**
 * Calculate the anomaly score for a single point.
 * Score is between 0 and 1:
 * - Score close to 1: anomaly
 * - Score close to 0.5: normal
 * - Score close to 0: very normal (dense region)
 *
 * @param point Data point (array of features)
 * @param forest Trained Isolation Forest
 * @returns Anomaly score between 0 and 1
 */
export function isolationForestScore(
  point: number[],
  forest: IsolationForest,
): number {
  if (forest.trees.length === 0) return 0.5;

  // Calculate average path length across all trees
  let totalPathLength = 0;
  for (const tree of forest.trees) {
    totalPathLength += pathLength(point, tree, 0);
  }
  const avgPathLength = totalPathLength / forest.trees.length;

  // Normalize using c(sampleSize)
  const c = averagePathLength(forest.sampleSize);
  if (c === 0) return 0.5;

  // Anomaly score = 2^(-avgPathLength / c(n))
  return Math.pow(2, -avgPathLength / c);
}

/**
 * Detect if a point is an anomaly using the Isolation Forest.
 *
 * @param point Data point to check
 * @param forest Trained Isolation Forest
 * @param threshold Score threshold for anomaly detection (default 0.6)
 * @returns true if the point is considered an anomaly
 */
export function isolationForestDetect(
  point: number[],
  forest: IsolationForest,
  threshold: number = 0.6,
): boolean {
  return isolationForestScore(point, forest) > threshold;
}

/**
 * Build an Isolation Forest from 1D data (convenience wrapper).
 * Wraps single values as [[v1], [v2], ...] for the multi-dimensional algorithm.
 *
 * @param values Array of single values
 * @param numTrees Number of trees (default 100)
 * @returns IsolationForest model
 */
export function buildIsolationForest1D(
  values: number[],
  numTrees: number = 100,
): IsolationForest {
  const data = values.map((v) => [v]);
  return buildIsolationForest(data, numTrees);
}

/**
 * Calculate anomaly score for a single value using a 1D forest.
 */
export function isolationForestScore1D(
  value: number,
  forest: IsolationForest,
): number {
  return isolationForestScore([value], forest);
}

/**
 * Random subsample without replacement using Fisher-Yates shuffle.
 */
function randomSubsample<T>(array: T[], size: number): T[] {
  if (size >= array.length) return [...array];

  // Fisher-Yates partial shuffle
  const result = [...array];
  for (let i = 0; i < size; i++) {
    const j = i + Math.floor(Math.random() * (result.length - i));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result.slice(0, size);
}
