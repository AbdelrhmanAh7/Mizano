import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { dec } from '../../../test/helpers/decimal.helpers';
import { createMockPrisma } from '../../../test/mocks/prisma.mock';
import { JournalsService } from '../../accounting/services/journals.service';
import { ExpensesService } from './expenses.service';

/* eslint-disable @typescript-eslint/no-explicit-any */
describe('ExpensesService (pending expenses)', () => {
  const ORG = 'org-1';
  let prisma: any;
  let journals: { create: jest.Mock; reverse: jest.Mock };
  let service: ExpensesService;

  const dto = {
    date: '2026-03-10',
    accountId: 'exp-acc',
    amount: '100.00',
    taxRate: '14',
    paidThroughAccountId: 'bank-acc',
  };
  const pending = {
    id: 'e1',
    date: new Date('2026-03-10T00:00:00.000Z'),
    accountId: 'exp-acc',
    paidThroughAccountId: 'bank-acc',
    description: 'Rent',
    amount: dec('100'),
    taxAmount: dec('14'),
    status: 'PENDING',
  };

  beforeEach(() => {
    prisma = createMockPrisma();
    journals = { create: jest.fn().mockResolvedValue({}), reverse: jest.fn() };
    service = new ExpensesService(
      prisma as unknown as PrismaService,
      journals as unknown as JournalsService,
    );
    prisma.account.findFirst.mockResolvedValue({ id: 'acc' });
    prisma.organization.findUnique.mockResolvedValue({
      defaultVatReceivableAccountId: 'vat-recv',
      defaultBankAccountId: 'bank-acc',
      defaultCashAccountId: null,
      baseCurrency: 'EGP',
    });
    prisma.expense.create.mockImplementation(async ({ data }: any) => ({ id: 'e1', ...data }));
  });

  it('create with post=false stores a PENDING expense and posts no journal', async () => {
    const result = await service.create(ORG, dto, { post: false });
    expect(result.status).toBe('PENDING');
    expect(prisma.expense.create.mock.calls[0][0].data.status).toBe('PENDING');
    expect(journals.create).not.toHaveBeenCalled();
  });

  describe('post', () => {
    beforeEach(() => {
      prisma.expense.findFirst.mockResolvedValue(pending);
      prisma.expense.updateMany.mockResolvedValue({ count: 1 });
      prisma.expense.findUniqueOrThrow.mockResolvedValue({ ...pending, status: 'POSTED' });
    });

    it('posts the same journal as create(), under a guarded PENDING -> POSTED transition', async () => {
      await service.post(ORG, 'e1');

      expect(prisma.$queryRaw).toHaveBeenCalled(); // expense row lock
      expect(prisma.expense.updateMany.mock.calls[0][0]).toEqual({
        where: { id: 'e1', organizationId: ORG, deletedAt: null, status: 'PENDING' },
        data: { status: 'POSTED' },
      });
      expect(journals.create).toHaveBeenCalledTimes(1);
      const [org, journal, options] = journals.create.mock.calls[0];
      expect(org).toBe(ORG);
      expect(journal.date).toBe('2026-03-10T00:00:00.000Z');
      expect(journal.lines).toEqual([
        expect.objectContaining({ accountId: 'exp-acc', debit: '100.0000', credit: '0' }),
        expect.objectContaining({ accountId: 'vat-recv', debit: '14.0000', credit: '0' }),
        expect.objectContaining({ accountId: 'bank-acc', debit: '0', credit: '114.0000' }),
      ]);
      expect(options).toEqual({ tx: prisma, source: { type: 'EXPENSE', id: 'e1' } });
    });

    it('only posts pending expenses of the organization', async () => {
      prisma.expense.findFirst.mockResolvedValue({ ...pending, status: 'POSTED' });
      await expect(service.post(ORG, 'e1')).rejects.toThrow(/Only pending/);
      prisma.expense.findFirst.mockResolvedValue(null);
      await expect(service.post(ORG, 'foreign')).rejects.toThrow(NotFoundException);
      expect(prisma.expense.findFirst.mock.calls[1][0].where).toMatchObject({
        id: 'foreign',
        organizationId: ORG,
      });
      expect(journals.create).not.toHaveBeenCalled();
    });

    it('a concurrent post loses the guarded transition and posts nothing', async () => {
      prisma.expense.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.post(ORG, 'e1')).rejects.toThrow(ConflictException);
      expect(journals.create).not.toHaveBeenCalled();
    });

    it('re-validates the accounts and the VAT account before posting', async () => {
      prisma.account.findFirst.mockResolvedValueOnce(null);
      await expect(service.post(ORG, 'e1')).rejects.toThrow(/expense account/);

      prisma.account.findFirst.mockResolvedValue({ id: 'acc' });
      prisma.organization.findUnique.mockResolvedValue({
        defaultVatReceivableAccountId: null,
        defaultBankAccountId: 'bank-acc',
        defaultCashAccountId: null,
        baseCurrency: 'EGP',
      });
      await expect(service.post(ORG, 'e1')).rejects.toThrow(/VAT Receivable/);
      expect(journals.create).not.toHaveBeenCalled();
    });

    it('a journal failure propagates so the status change rolls back', async () => {
      journals.create.mockRejectedValue(new BadRequestException('Period is locked'));
      await expect(service.post(ORG, 'e1')).rejects.toThrow('Period is locked');
    });

    it('bulkApprove posts through the same command and reports per-record failures', async () => {
      prisma.expense.findFirst
        .mockResolvedValueOnce(pending)
        .mockResolvedValueOnce({ ...pending, id: 'e2', status: 'POSTED' });
      const result = await service.bulkApprove(ORG, ['e1', 'e2', 'e1']);
      expect(result.total).toBe(2);
      expect(result.processed).toBe(1);
      expect(result.failures).toEqual([
        { id: 'e2', reason: 'Only pending expenses can be posted' },
      ]);
      expect(journals.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('remove and findOne', () => {
    it('voiding a pending expense soft-deletes it and reverses nothing (it was never posted)', async () => {
      prisma.expense.findFirst.mockResolvedValue({ id: 'e1', status: 'PENDING' });
      prisma.expense.updateMany.mockResolvedValue({ count: 1 });
      await service.remove(ORG, 'e1');
      expect(prisma.expense.updateMany.mock.calls[0][0].data.status).toBe('CANCELLED');
      expect(journals.reverse).not.toHaveBeenCalled();
    });

    it('findOne returns a voided expense read-only, scoped to the organization', async () => {
      const voided = { id: 'e1', deletedAt: new Date('2026-04-01') };
      prisma.expense.findFirst.mockResolvedValue(voided);
      await expect(service.findOne(ORG, 'e1')).resolves.toBe(voided);
      expect(prisma.expense.findFirst.mock.calls[0][0].where).toEqual({
        id: 'e1',
        organizationId: ORG,
      });
    });
  });
});
