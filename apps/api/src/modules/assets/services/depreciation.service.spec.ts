import { Decimal } from '@prisma/client/runtime/library';
import { DepreciationService } from './depreciation.service';
import { PrismaService } from '../../../prisma/prisma.service';

describe('DepreciationService ledger lock', () => {
  it('takes the organization ledger lock before posting the depreciation journal', async () => {
    const calls: string[] = [];
    const tx = {
      $executeRaw: jest.fn(async () => {
        calls.push('lock');
        return 1;
      }),
      journal: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(async () => {
          calls.push('journal');
          return { id: 'j1' };
        }),
      },
      depreciationSchedule: { update: jest.fn() },
      asset: { update: jest.fn() },
    };
    const prisma = {
      asset: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'a1',
          name: 'Laptop',
          assetNumber: 'FA-001',
          salvageValue: new Decimal(0),
          depreciationAccountId: 'dep',
          accumulatedDeprAccountId: 'acc',
        }),
      },
      depreciationSchedule: {
        findUnique: jest.fn().mockResolvedValue({
          id: 's1',
          amount: new Decimal(100),
          accumulatedTotal: new Decimal(100),
          bookValue: new Decimal(900),
          executedAt: null,
        }),
      },
      $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    };
    const service = new DepreciationService(prisma as unknown as PrismaService);

    const result = await service.runDepreciationForAsset('org-1', 'a1', 1, 2026);

    expect(result.journalId).toBe('j1');
    expect(calls).toEqual(['lock', 'journal']);
  });
});
