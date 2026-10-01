import { ModuleRef } from '@nestjs/core';
import { PrismaService } from '../../../prisma/prisma.service';
import { createMockPrisma } from '../../../test/mocks/prisma.mock';
import { ExpensesService } from '../../purchases/services/expenses.service';
import { JournalsService } from './journals.service';
import { RecurringProfilesService } from './recurring-profiles.service';

/* eslint-disable @typescript-eslint/no-explicit-any */
describe('RecurringProfilesService legacy expense templates', () => {
  let service: RecurringProfilesService;
  let expenses: { create: jest.Mock };
  const prisma: any = createMockPrisma();

  beforeEach(() => {
    expenses = { create: jest.fn().mockResolvedValue({ id: 'e1' }) };
    const moduleRef = {
      get: (token: unknown) => (token === ExpensesService ? expenses : undefined),
    } as unknown as ModuleRef;
    service = new RecurringProfilesService(
      prisma as unknown as PrismaService,
      {} as JournalsService,
      moduleRef,
    );
  });

  const convert = async (template: Record<string, unknown>): Promise<string | undefined> => {
    await (service as any).createExpenseFromTemplate(
      prisma,
      { organizationId: 'org-1', name: 'Rent', autoPost: true },
      { accountId: 'a', paidThroughAccountId: 'b', ...template },
      new Date('2026-03-01T00:00:00.000Z'),
      'p:2026-03-01',
    );
    return expenses.create.mock.calls[0][1].taxRate;
  };

  it('derives the rate from the net amount for an inclusive legacy template (114 gross, 14 VAT -> 14%)', async () => {
    expect(await convert({ amount: '114', taxAmount: '14', taxInclusive: true })).toBe('14');
    // ExpensesService reproduces the stored VAT: gross 114 x 14 / (100 + 14) = 14.
  });

  it('derives the rate from the amount for an exclusive legacy template (100 net, 14 VAT -> 14%)', async () => {
    expect(await convert({ amount: '100', taxAmount: '14' })).toBe('14');
  });

  it('rejects an inclusive template whose VAT consumes the whole amount', async () => {
    await expect(convert({ amount: '14', taxAmount: '14', taxInclusive: true })).rejects.toThrow(
      /less than the inclusive amount/,
    );
    expect(expenses.create).not.toHaveBeenCalled();
  });

  it('keeps an explicit taxRate untouched', async () => {
    expect(await convert({ amount: '114', taxRate: '14', taxInclusive: true })).toBe('14');
  });
});
