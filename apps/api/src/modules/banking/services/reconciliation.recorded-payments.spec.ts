import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { dec } from '../../../test/helpers/decimal.helpers';
import { createMockPrisma } from '../../../test/mocks/prisma.mock';
import { ReconciliationService } from './reconciliation.service';

/* eslint-disable @typescript-eslint/no-explicit-any -- the shared Prisma mock is untyped */
describe('Reconciliation of payments already in the books (#635)', () => {
  const ORG = 'org-1';
  let prisma: any;
  let received: { create: jest.Mock };
  let made: { create: jest.Mock };
  let service: ReconciliationService;

  const deposit = {
    id: 't1',
    bankAccountId: 'ba1',
    date: new Date('2026-11-01T00:00:00.000Z'),
    type: 'DEPOSIT',
    amount: dec('400'),
    description: 'QA Customer receipt',
    reference: 'PMT-001',
    payee: null,
    status: 'PENDING',
    organizationId: ORG,
  };
  const withdrawal = {
    ...deposit,
    id: 't2',
    type: 'WITHDRAWAL',
    amount: dec('-114'),
    reference: null,
  };
  const receipt = {
    id: 'pr1',
    paymentNumber: 'PMT-001',
    reference: null,
    date: new Date('2026-11-01T00:00:00.000Z'),
    amount: dec('400'),
    depositToAccountId: 'gl-1010',
    bankTransactionId: null,
    customer: { id: 'c1', name: 'QA Customer' },
  };

  beforeEach(() => {
    prisma = createMockPrisma();
    received = { create: jest.fn().mockResolvedValue({ id: 'new-pr' }) };
    made = { create: jest.fn().mockResolvedValue({ id: 'new-pm' }) };
    service = new ReconciliationService(
      prisma as unknown as PrismaService,
      made as never,
      received as never,
      {} as never,
    );
    prisma.bankAccount.findFirst.mockResolvedValue({
      currency: 'EGP',
      linkedAccountId: 'gl-1010',
    });
    prisma.organization.findUnique.mockResolvedValue({ baseCurrency: 'EGP' });
    prisma.bankTransaction.findFirst.mockResolvedValue(deposit);
    prisma.bankTransaction.updateMany.mockResolvedValue({ count: 1 });
    prisma.paymentReceived.findFirst.mockResolvedValue(receipt);
    prisma.paymentReceived.updateMany.mockResolvedValue({ count: 1 });
    prisma.paymentMade.updateMany.mockResolvedValue({ count: 1 });
    prisma.invoice.findMany.mockResolvedValue([]);
    prisma.bill.findMany.mockResolvedValue([]);
    prisma.$queryRaw.mockResolvedValue([]);
  });

  describe('suggestions', () => {
    it('offers the recorded receipt named on the bank line when its invoice is already paid', async () => {
      prisma.bankTransaction.findMany.mockResolvedValue([deposit]);
      prisma.paymentReceived.findMany.mockResolvedValue([receipt]);

      const [row] = await service.getSuggestions(ORG, 'ba1');

      expect(row.matches).toEqual([
        expect.objectContaining({ type: 'payment_received', confidence: 100 }),
      ]);
      const { where } = prisma.paymentReceived.findMany.mock.calls[0][0];
      // Same org, not voided, not linked yet, booked to this bank's ledger account, exact amount.
      expect(where).toMatchObject({
        organizationId: ORG,
        deletedAt: null,
        bankTransactionId: null,
        depositToAccountId: 'gl-1010',
      });
      expect(where.amount.toString()).toBe('400');
      expect(where.OR).toContainEqual({
        paymentNumber: { in: ['PMT-001', 'QA', 'Customer', 'receipt'] },
      });
      // The named pool has no date window: a payment named on the line is offered whatever its age.
      expect(where.date).toBeUndefined();
    });

    it('keeps a payment named on the line when 200 newer payments of the same amount exist', async () => {
      prisma.bankTransaction.findMany.mockResolvedValue([deposit]);
      const newer = Array.from({ length: 200 }, (_, i) => ({
        ...receipt,
        id: `newer-${i}`,
        paymentNumber: `PMT-${1000 + i}`,
        date: new Date('2026-10-20T00:00:00.000Z'),
      }));
      const old = { ...receipt, date: new Date('2025-01-01T00:00:00.000Z') };
      // Pools in order: named, then the date window (no payee on this line).
      prisma.paymentReceived.findMany.mockResolvedValueOnce([old]).mockResolvedValueOnce(newer);

      const [row] = await service.getSuggestions(ORG, 'ba1');

      expect(prisma.paymentReceived.findMany).toHaveBeenCalledTimes(2);
      const windowWhere = prisma.paymentReceived.findMany.mock.calls[1][0].where;
      expect(windowWhere.date.gte.toISOString()).toBe('2026-09-17T00:00:00.000Z');
      expect(windowWhere.OR).toBeUndefined();
      expect(row.matches[0]).toMatchObject({ entity: { id: 'pr1' }, confidence: 100 });
      expect(row.matches).toHaveLength(5);
    });

    it('fetches the payee pool on its own when the line names one', async () => {
      prisma.bankTransaction.findMany.mockResolvedValue([{ ...deposit, payee: 'qa customer' }]);
      prisma.paymentReceived.findMany.mockResolvedValue([]);

      await service.getSuggestions(ORG, 'ba1');

      const wheres = prisma.paymentReceived.findMany.mock.calls.map((c: any[]) => c[0].where);
      expect(wheres).toHaveLength(3);
      expect(wheres[1].customer).toEqual({
        name: { contains: 'qa customer', mode: 'insensitive' },
      });
      for (const w of wheres) {
        expect(w).toMatchObject({ organizationId: ORG, deletedAt: null, bankTransactionId: null });
      }
    });

    it('offers recorded supplier payments for a withdrawal by its absolute amount', async () => {
      prisma.bankTransaction.findMany.mockResolvedValue([withdrawal]);
      prisma.paymentMade.findMany.mockResolvedValue([
        {
          id: 'pm1',
          paymentNumber: 'PAY-001',
          reference: null,
          date: new Date('2026-10-30T00:00:00.000Z'),
          amount: dec('114'),
          vendor: { id: 'v1', name: 'QA Vendor' },
        },
      ]);

      const [row] = await service.getSuggestions(ORG, 'ba1');

      const { where } = prisma.paymentMade.findMany.mock.calls[0][0];
      expect(where).toMatchObject({ organizationId: ORG, paidFromAccountId: 'gl-1010' });
      expect(where.amount.toString()).toBe('114');
      // Exact amount two days apart: a strong but not certain match.
      expect(row.matches).toEqual([
        expect.objectContaining({ type: 'payment_made', confidence: 90 }),
      ]);
      expect(prisma.paymentReceived.findMany).not.toHaveBeenCalled();
    });
  });

  describe('confirming a recorded payment', () => {
    it('links the bank line and the receipt to each other and posts nothing', async () => {
      await expect(service.confirmMatch(ORG, 't1', 'payment_received', 'pr1')).resolves.toEqual({
        message: 'Reconciliation confirmed',
      });

      expect(prisma.bankTransaction.updateMany).toHaveBeenCalledWith({
        where: { id: 't1', organizationId: ORG, status: 'PENDING' },
        data: { status: 'MATCHED', matchedEntityType: 'payment_received', matchedEntityId: 'pr1' },
      });
      expect(prisma.paymentReceived.updateMany).toHaveBeenCalledWith({
        where: { id: 'pr1', organizationId: ORG, deletedAt: null, bankTransactionId: null },
        data: { bankTransactionId: 't1' },
      });
      // The payment row is locked before the bank line (the order voiding takes too).
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
      expect(prisma.$queryRaw.mock.calls[0][0].join('?')).toContain(
        'FROM "payments_received" WHERE id = ? AND "organizationId" = ? FOR UPDATE',
      );
      expect(prisma.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.bankTransaction.updateMany.mock.invocationCallOrder[0],
      );
      expect(prisma.paymentReceived.findFirst.mock.calls[0][0].where).toEqual({
        id: 'pr1',
        organizationId: ORG,
        deletedAt: null,
      });
      // No second receipt, no journal, no invoice change: the money is already in the books.
      expect(received.create).not.toHaveBeenCalled();
      expect(made.create).not.toHaveBeenCalled();
      expect(prisma.journal.create).not.toHaveBeenCalled();
      expect(prisma.paymentReceived.create).not.toHaveBeenCalled();
      expect(prisma.invoice.update).not.toHaveBeenCalled();
    });

    it('links a withdrawal to a recorded supplier payment', async () => {
      prisma.bankTransaction.findFirst.mockResolvedValue(withdrawal);
      prisma.paymentMade.findFirst.mockResolvedValue({
        amount: dec('114'),
        paidFromAccountId: 'gl-1010',
        bankTransactionId: null,
      });

      await service.confirmMatch(ORG, 't2', 'payment_made', 'pm1');

      expect(prisma.paymentMade.updateMany).toHaveBeenCalledWith({
        where: { id: 'pm1', organizationId: ORG, deletedAt: null, bankTransactionId: null },
        data: { bankTransactionId: 't2' },
      });
      expect(made.create).not.toHaveBeenCalled();
      expect(prisma.journal.create).not.toHaveBeenCalled();
    });

    it.each([
      ['another bank account', { depositToAccountId: 'gl-cash' }, /different bank account/],
      ['a different amount', { amount: dec('400.0001') }, /amount differs/],
      ['already linked to another line', { bankTransactionId: 't9' }, /another bank line/],
    ])('refuses a receipt booked to %s and writes nothing', async (_label, change, message) => {
      prisma.paymentReceived.findFirst.mockResolvedValue({ ...receipt, ...change });

      await expect(service.confirmMatch(ORG, 't1', 'payment_received', 'pr1')).rejects.toThrow(
        message,
      );
      expect(prisma.bankTransaction.updateMany).not.toHaveBeenCalled();
      expect(prisma.paymentReceived.updateMany).not.toHaveBeenCalled();
    });

    it('refuses a voided payment or one of another organization', async () => {
      prisma.paymentReceived.findFirst.mockResolvedValue(null);
      await expect(service.confirmMatch(ORG, 't1', 'payment_received', 'foreign')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.bankTransaction.updateMany).not.toHaveBeenCalled();
    });

    it('refuses the wrong direction before anything is read or written', async () => {
      await expect(service.confirmMatch(ORG, 't1', 'payment_made', 'pm1')).rejects.toThrow(
        /Only withdrawals/,
      );
      prisma.bankTransaction.findFirst.mockResolvedValue(withdrawal);
      await expect(service.confirmMatch(ORG, 't2', 'payment_received', 'pr1')).rejects.toThrow(
        /Only deposits/,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('a concurrent link of the same payment loses the guarded update and rolls back', async () => {
      prisma.paymentReceived.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.confirmMatch(ORG, 't1', 'payment_received', 'pr1')).rejects.toThrow(
        BadRequestException,
      );
      // Both updates share one $transaction callback, so the bank line's transition is undone.
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('a second confirmation of the same line is refused', async () => {
      prisma.bankTransaction.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.confirmMatch(ORG, 't1', 'payment_received', 'pr1')).rejects.toThrow(
        /Already reconciled/,
      );
      expect(prisma.paymentReceived.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('settling an open invoice (the existing path)', () => {
    it('records one receipt through the payments command and links it to the bank line', async () => {
      prisma.invoice.findFirst.mockResolvedValue({ id: 'inv1', customerId: 'c1' });

      await service.confirmMatch(ORG, 't1', 'invoice', 'inv1');

      expect(received.create).toHaveBeenCalledTimes(1);
      expect(received.create).toHaveBeenCalledWith(
        ORG,
        expect.objectContaining({
          customerId: 'c1',
          amount: '400.0000',
          depositToAccountId: 'gl-1010',
          allocations: [{ invoiceId: 'inv1', amount: '400.0000' }],
        }),
        { tx: prisma },
      );
      // The new receipt is this line's money, so it can never be matched to another line.
      expect(prisma.paymentReceived.updateMany).toHaveBeenCalledWith({
        where: { id: 'new-pr', organizationId: ORG },
        data: { bankTransactionId: 't1' },
      });
    });
  });
});
