import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { dec } from '../../../test/helpers/decimal.helpers';
import { createMockPrisma } from '../../../test/mocks/prisma.mock';
import { ReconciliationService } from './reconciliation.service';

/* eslint-disable @typescript-eslint/no-explicit-any -- the shared Prisma mock is untyped */
describe('Reconciliation of expenses already paid from the bank (#682)', () => {
  const ORG = 'org-1';
  let prisma: any;
  let expenses: { create: jest.Mock };
  let service: ReconciliationService;

  // Golden C08: "November rent" 300.00, no VAT, paid from CIB Current (ledger 1010) on 2 Nov.
  const rentLine = {
    id: 't-e300',
    bankAccountId: 'ba-cib',
    date: new Date('2026-11-02T00:00:00.000Z'),
    type: 'WITHDRAWAL',
    amount: dec('300.0000'),
    description: 'November rent',
    reference: null,
    payee: null,
    status: 'PENDING',
    organizationId: ORG,
  };
  const rent = {
    id: 'exp-rent',
    date: new Date('2026-11-02T00:00:00.000Z'),
    amount: dec('300.0000'),
    taxAmount: dec('0.0000'),
    status: 'POSTED',
    paidThroughAccountId: 'gl-1010',
    description: 'November rent',
    reference: null,
    vendor: null,
  };

  beforeEach(() => {
    prisma = createMockPrisma();
    expenses = { create: jest.fn() };
    service = new ReconciliationService(
      prisma as unknown as PrismaService,
      {} as never,
      {} as never,
      expenses as never,
    );
    prisma.bankAccount.findFirst.mockResolvedValue({ currency: 'EGP', linkedAccountId: 'gl-1010' });
    prisma.organization.findUnique.mockResolvedValue({ baseCurrency: 'EGP' });
    prisma.bankTransaction.findFirst.mockImplementation(async ({ where }: any) =>
      where.id === rentLine.id ? rentLine : null,
    );
    prisma.bankTransaction.findMany.mockResolvedValue([]);
    prisma.bankTransaction.updateMany.mockResolvedValue({ count: 1 });
    prisma.paymentReceived.findMany.mockResolvedValue([]);
    prisma.paymentMade.findMany.mockResolvedValue([]);
    prisma.invoice.findMany.mockResolvedValue([]);
    prisma.bill.findMany.mockResolvedValue([]);
    prisma.expense.findMany.mockResolvedValue([]);
    prisma.expense.findFirst.mockResolvedValue(rent);
    prisma.$queryRaw.mockResolvedValue([]);
  });

  describe('suggestions', () => {
    it('offers the paid rent expense for the 300.00 withdrawal', async () => {
      prisma.bankTransaction.findMany
        .mockResolvedValueOnce([rentLine]) // pending lines
        .mockResolvedValueOnce([]); // lines already matched to these expenses
      prisma.expense.findMany.mockResolvedValue([rent]);

      const [row] = await service.getSuggestions(ORG, 'ba-cib');

      expect(row.matches).toEqual([
        {
          type: 'expense',
          entity: expect.objectContaining({ id: 'exp-rent', total: '300.0000' }),
          confidence: 99,
        },
      ]);
      // Same organization, posted, not voided, paid through this bank's ledger account.
      for (const [{ where }] of prisma.expense.findMany.mock.calls) {
        expect(where).toMatchObject({
          organizationId: ORG,
          deletedAt: null,
          status: 'POSTED',
          paidThroughAccountId: 'gl-1010',
        });
      }
      expect(prisma.bankTransaction.findMany.mock.calls[1][0].where).toEqual({
        organizationId: ORG,
        matchedEntityType: 'expense',
        matchedEntityId: { in: ['exp-rent'] },
      });
    });

    it('compares the total with VAT: 100.00 + 14.00 matches 114.00, 300.00 + 42.00 does not match 300.00', async () => {
      const withVat = {
        ...rent,
        id: 'exp-vat',
        amount: dec('100.0000'),
        taxAmount: dec('14.0000'),
      };
      const rentWithVat = { ...rent, id: 'exp-342', taxAmount: dec('42.0000') };
      prisma.expense.findMany.mockResolvedValue([withVat, rentWithVat]);
      prisma.bankTransaction.findMany
        .mockResolvedValueOnce([{ ...rentLine, id: 't-114', amount: dec('114.0000') }])
        .mockResolvedValueOnce([]);

      const [row] = await service.getSuggestions(ORG, 'ba-cib');

      expect(row.matches.map((m: any) => [m.type, m.entity.id, m.entity.total])).toEqual([
        ['expense', 'exp-vat', '114.0000'],
      ]);
    });

    it('does not offer an expense already matched to another bank line', async () => {
      prisma.expense.findMany.mockResolvedValue([rent]);
      prisma.bankTransaction.findMany
        .mockResolvedValueOnce([rentLine])
        .mockResolvedValueOnce([{ matchedEntityId: 'exp-rent' }]);

      const [row] = await service.getSuggestions(ORG, 'ba-cib');

      expect(row.matches).toEqual([]);
    });

    it('never offers expenses for a deposit', async () => {
      prisma.bankTransaction.findMany.mockResolvedValueOnce([
        { ...rentLine, type: 'DEPOSIT', amount: dec('100.0000') },
      ]);

      await service.getSuggestions(ORG, 'ba-cib');

      expect(prisma.expense.findMany).not.toHaveBeenCalled();
    });
  });

  describe('confirm', () => {
    it('links the line to the rent expense and posts nothing new', async () => {
      prisma.bankTransaction.findFirst.mockImplementation(async ({ where }: any) =>
        where.id === rentLine.id ? rentLine : null,
      );

      await expect(service.confirmMatch(ORG, 't-e300', 'expense', 'exp-rent')).resolves.toEqual({
        message: 'Reconciliation confirmed',
      });

      expect(prisma.$queryRaw).toHaveBeenCalled(); // expense row lock
      expect(prisma.bankTransaction.updateMany).toHaveBeenCalledWith({
        where: { id: 't-e300', organizationId: ORG, status: 'PENDING' },
        data: { status: 'MATCHED', matchedEntityType: 'expense', matchedEntityId: 'exp-rent' },
      });
      expect(expenses.create).not.toHaveBeenCalled();
      expect(prisma.expense.create).not.toHaveBeenCalled();
      expect(prisma.journal.create).not.toHaveBeenCalled();
      expect(prisma.paymentMade.create).not.toHaveBeenCalled();
    });

    it('refuses a deposit', async () => {
      prisma.bankTransaction.findFirst.mockResolvedValue({ ...rentLine, type: 'DEPOSIT' });
      await expect(service.confirmMatch(ORG, 't-e300', 'expense', 'exp-rent')).rejects.toThrow(
        new BadRequestException('Only withdrawals can be matched to an expense'),
      );
      expect(prisma.bankTransaction.updateMany).not.toHaveBeenCalled();
    });

    it.each([
      [
        'paid from another account',
        { paidThroughAccountId: 'gl-cash' },
        'This expense was paid from a different account',
      ],
      [
        'of a different total',
        { taxAmount: dec('42.0000') },
        'The expense amount differs from the bank line',
      ],
      ['not posted', { status: 'PENDING' }, 'Only a posted expense can be matched to a bank line'],
    ])('refuses an expense %s', async (_case, change, message) => {
      prisma.expense.findFirst.mockResolvedValue({ ...rent, ...change });
      await expect(service.confirmMatch(ORG, 't-e300', 'expense', 'exp-rent')).rejects.toThrow(
        new BadRequestException(message),
      );
      expect(prisma.bankTransaction.updateMany).not.toHaveBeenCalled();
    });

    it('refuses an expense already matched to another line', async () => {
      prisma.bankTransaction.findFirst.mockImplementation(async ({ where }: any) =>
        where.id === rentLine.id ? rentLine : { id: 't-other' },
      );
      await expect(service.confirmMatch(ORG, 't-e300', 'expense', 'exp-rent')).rejects.toThrow(
        new BadRequestException('This expense is already matched to another bank line'),
      );
      expect(prisma.bankTransaction.updateMany).not.toHaveBeenCalled();
    });

    it('cannot match an expense of another organization', async () => {
      prisma.expense.findFirst.mockImplementation(async ({ where }: any) =>
        where.organizationId === ORG && where.id === 'exp-rent' ? rent : null,
      );
      await expect(service.confirmMatch(ORG, 't-e300', 'expense', 'exp-foreign')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.expense.findFirst.mock.calls[0][0].where).toMatchObject({
        organizationId: ORG,
        deletedAt: null,
      });
    });
  });
});
