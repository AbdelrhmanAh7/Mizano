import { PrismaClient } from '@prisma/client';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';

export type MockPrismaClient = DeepMockProxy<PrismaClient>;

/**
 * Create a deep mock of PrismaClient for unit testing.
 * All methods are auto-mocked and return undefined by default.
 * Configure return values per test with .mockResolvedValue().
 *
 * Usage:
 *   const prisma = createMockPrisma();
 *   prisma.invoice.findMany.mockResolvedValue([mockInvoice]);
 */
export function createMockPrisma(): MockPrismaClient {
  const mock = mockDeep<PrismaClient>();

  // Mock $transaction to execute the callback with the mock client
  (mock.$transaction as jest.Mock).mockImplementation(
    async (fn: (tx: typeof mock) => Promise<unknown>) => {
      if (typeof fn === 'function') {
        return fn(mock);
      }
      return fn;
    },
  );

  return mock;
}
