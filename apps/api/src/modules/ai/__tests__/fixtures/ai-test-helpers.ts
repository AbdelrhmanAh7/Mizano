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

/** Creates a mock AiFeedbackService */
export function createMockAiFeedback() {
  return {
    processFeedback: jest.fn().mockResolvedValue({ id: 'fb-001' }),
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
    deleteOldPredictions: jest.fn().mockResolvedValue({ deleted: 0 }),
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
