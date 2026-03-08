import { createMockPrisma, MockPrismaClient } from '../../../../test/mocks/prisma.mock';

/**
 * Shared mock factories for AI service tests.
 */

export { createMockPrisma, MockPrismaClient };

/** Creates a mock EventEmitter2 */
export function createMockEventEmitter(): {
  emit: jest.Mock;
  on: jest.Mock;
  once: jest.Mock;
  removeListener: jest.Mock;
} {
  return {
    emit: jest.fn(),
    on: jest.fn(),
    once: jest.fn(),
    removeListener: jest.fn(),
  };
}

/** Creates a mock ModelRegistryService */
export function createMockModelRegistry() {
  return {
    saveModel: jest.fn().mockResolvedValue({ id: 'model-001', version: 1 }),
    loadActiveModel: jest.fn().mockResolvedValue(null),
    loadModelByVersion: jest.fn().mockResolvedValue(null),
    getModelHistory: jest.fn().mockResolvedValue([]),
    retireOldModels: jest.fn().mockResolvedValue({ retired: 0 }),
    activateModel: jest.fn().mockResolvedValue(undefined),
    setTrainingStatus: jest.fn().mockResolvedValue({ version: 1 }),
    completeTraining: jest.fn().mockResolvedValue(undefined),
    getModelStatus: jest.fn().mockResolvedValue({
      hasActiveModel: false,
      activeVersion: null,
      isTraining: false,
      trainingVersion: null,
      lastTrainedAt: null,
    }),
    saveModelWithValidation: jest.fn().mockResolvedValue({
      id: 'model-001',
      version: 1,
      promoted: true,
    }),
    rollbackModel: jest.fn().mockResolvedValue({ version: 0 }),
    getAccuracyTrend: jest.fn().mockResolvedValue({
      trend: 'stable',
      history: [],
      currentAccuracy: null,
      avgAccuracy: 0,
      degradationDetected: false,
    }),
    deleteAllModels: jest.fn().mockResolvedValue({ deleted: 0 }),
  };
}

/** Creates a mock AiFeedbackService */
export function createMockAiFeedback() {
  return {
    processFeedback: jest.fn().mockResolvedValue({ id: 'fb-001', shouldRetrain: false }),
    checkRetrainingThreshold: jest.fn().mockResolvedValue({
      shouldRetrain: false,
      correctionCount: 0,
      threshold: 10,
    }),
    getFeedbackStats: jest.fn().mockResolvedValue({
      total: 0,
      accepted: 0,
      rejected: 0,
      corrected: 0,
      acceptanceRate: 0,
      rejectionRate: 0,
      correctionRate: 0,
    }),
    getRecentFeedback: jest.fn().mockResolvedValue([]),
    getFeedbackForPrediction: jest.fn().mockResolvedValue(null),
    getFeedbackTrends: jest.fn().mockResolvedValue([]),
    storePrediction: jest.fn().mockResolvedValue({ id: 'pred-001', inputHash: 'hash' }),
    getCachedPrediction: jest.fn().mockResolvedValue(null),
    invalidatePredictionCache: jest.fn().mockResolvedValue({ deleted: 0 }),
    getRetrainingThreshold: jest.fn().mockReturnValue(10),
    deleteOldPredictions: jest.fn().mockResolvedValue({ deleted: 0 }),
  };
}

/** Creates a mock AiTrainingService */
export function createMockAiTraining() {
  return {
    addTrainingData: jest.fn().mockResolvedValue({ id: 'td-001' }),
    getTrainingData: jest.fn().mockResolvedValue({ data: [], total: 0 }),
    countCorrectionsSinceLastTraining: jest.fn().mockResolvedValue(0),
    getTrainTestSplit: jest.fn().mockResolvedValue({ train: [], test: [] }),
    generateInputHash: jest.fn().mockReturnValue('test-hash'),
    seedTrainingData: jest.fn().mockResolvedValue({ inserted: 0 }),
    deleteOldTrainingData: jest.fn().mockResolvedValue({ deleted: 0 }),
    getTrainingStats: jest.fn().mockResolvedValue({
      total: 0,
      bySource: {},
      uniqueLabels: 0,
      oldestRecord: null,
      newestRecord: null,
    }),
    getLabelDistribution: jest.fn().mockResolvedValue({}),
    validateTrainingReadiness: jest.fn().mockResolvedValue({
      isReady: false,
      currentSamples: 0,
      minimumRequired: 20,
      labelDistribution: {},
      warnings: ['Not enough training data'],
    }),
  };
}

/** Creates a mock OcrService */
export function createMockOcrService() {
  return {
    extractFromImage: jest.fn().mockResolvedValue({
      text: 'Sample OCR text',
      confidence: 85,
      fieldConfidence: {},
    }),
    extractFromPdf: jest.fn().mockResolvedValue({
      text: 'Sample PDF text',
      confidence: 90,
      fieldConfidence: {},
    }),
    buildExtractionResult: jest.fn().mockReturnValue({
      date: null,
      total: null,
      subtotal: null,
      tax: null,
      invoiceNumber: null,
      vendorName: null,
      lineItems: [],
    }),
    checkDuplicate: jest.fn().mockResolvedValue({
      isDuplicate: false,
      existingBillId: null,
      matchType: null,
      similarity: 0,
    }),
    applyVendorHints: jest
      .fn()
      .mockImplementation((_orgId, _vendorId, ocrResult) => Promise.resolve(ocrResult)),
    learnLayout: jest.fn().mockResolvedValue(undefined),
  };
}

/** Creates a mock DocumentClassificationService */
export function createMockDocumentClassification() {
  return {
    classifyText: jest.fn().mockResolvedValue({
      category: 'INVOICE',
      confidence: 0.85,
      scores: [],
    }),
    classifyDocument: jest.fn().mockResolvedValue({
      category: 'INVOICE',
      confidence: 0.85,
      scores: [],
    }),
    trainModel: jest.fn().mockResolvedValue(undefined),
    getModelStatus: jest.fn().mockResolvedValue({
      hasActiveModel: false,
    }),
  };
}

/** Creates a mock EntityExtractionService */
export function createMockEntityExtraction() {
  return {
    extractEntities: jest.fn().mockResolvedValue([]),
    extractAndMatch: jest.fn().mockResolvedValue({
      entities: [],
      matchedVendors: [],
      matchedCustomers: [],
    }),
  };
}

/** Standard test org ID */
export const TEST_ORG_ID = 'org-test-001';

/** Standard test user ID */
export const TEST_USER_ID = 'user-test-001';

interface DecimalLike {
  toNumber(): number;
}

type DecimalArg = DecimalLike | number;

/** Helper to create a Decimal-like value for Prisma mocks */
export function mockDecimal(value: number) {
  const toNum = (other: DecimalArg) =>
    typeof other === 'number' ? other : ((other as DecimalLike).toNumber?.() ?? 0);
  return {
    toNumber: () => value,
    toString: () => String(value),
    equals: (other: DecimalArg) => toNum(other) === value,
    add: (other: DecimalArg) => mockDecimal(value + toNum(other)),
    sub: (other: DecimalArg) => mockDecimal(value - toNum(other)),
    mul: (other: DecimalArg) => mockDecimal(value * toNum(other)),
    div: (other: DecimalArg) => mockDecimal(value / toNum(other)),
    gt: (other: DecimalArg) => value > toNum(other),
    gte: (other: DecimalArg) => value >= toNum(other),
    lt: (other: DecimalArg) => value < toNum(other),
    lte: (other: DecimalArg) => value <= toNum(other),
    isZero: () => value === 0,
    isNeg: () => value < 0,
    isPos: () => value > 0,
    abs: () => mockDecimal(Math.abs(value)),
    toFixed: (dp: number) => value.toFixed(dp),
  };
}
