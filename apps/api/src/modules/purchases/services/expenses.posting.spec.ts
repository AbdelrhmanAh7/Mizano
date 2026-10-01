import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { createMockPrisma } from '../../../test/mocks/prisma.mock';
import { JournalsService } from '../../accounting/services/journals.service';
import { ExpensesService } from './expenses.service';

describe('ExpensesService (posting)', () => {
  const ORG = 'org-1';
  // Partial fixtures are enough for these flows; loosen the deep-mock typing.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;
  let journals: { create: jest.Mock; reverse: jest.Mock };
  let service: ExpensesService;

  const dto = {
    date: '2026-03-10',
    accountId: 'exp-acc',
    amount: '100.00',
    taxRate: '14',
    paidThroughAccountId: 'bank-acc',
    description: 'Office rent',
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
    // The created row echoes the stored values: the journal is built from the row.
    prisma.expense.create.mockImplementation(async ({ data }: any) => ({
      id: 'exp-123456',
      ...data,
      description: data.description ?? null,
    }));
  });

  it('posts Dr expense / Dr VAT receivable / Cr bank in one journal on the expense date', async () => {
    await service.create(ORG, dto);

    expect(prisma.$executeRaw).toHaveBeenCalled(); // ledger lock before settings are read
    const data = prisma.expense.create.mock.calls[0][0].data;
    expect(data.amount.toFixed(4)).toBe('100.0000');
    expect(data.taxAmount.toFixed(4)).toBe('14.0000');
    expect(data.organizationId).toBe(ORG);

    expect(journals.create).toHaveBeenCalledTimes(1);
    const [org, journal, options] = journals.create.mock.calls[0];
    expect(org).toBe(ORG);
    expect(journal.date).toBe(new Date('2026-03-10').toISOString());
    expect(journal.lines).toEqual([
      expect.objectContaining({ accountId: 'exp-acc', debit: '100.0000', credit: '0' }),
      expect.objectContaining({ accountId: 'vat-recv', debit: '14.0000', credit: '0' }),
      expect.objectContaining({ accountId: 'bank-acc', debit: '0', credit: '114.0000' }),
    ]);
    expect(options).toEqual({ tx: prisma, source: { type: 'EXPENSE', id: 'exp-123456' } });
  });

  it('treats an inclusive amount as gross and computes the VAT from the percentage', async () => {
    await service.create(ORG, { ...dto, amount: '114.00', taxInclusive: true });

    const data = prisma.expense.create.mock.calls[0][0].data;
    expect(data.amount.toFixed(4)).toBe('100.0000');
    expect(data.taxAmount.toFixed(4)).toBe('14.0000');
    const lines = journals.create.mock.calls[0][1].lines;
    expect(lines[lines.length - 1].credit).toBe('114.0000');
  });

  it('posts no VAT line for an untaxed expense', async () => {
    await service.create(ORG, { ...dto, taxRate: undefined });
    expect(journals.create.mock.calls[0][1].lines).toHaveLength(2);
  });

  it('rejects a taxed expense when no VAT receivable account is configured', async () => {
    prisma.organization.findUnique.mockResolvedValue({
      defaultVatReceivableAccountId: null,
      defaultBankAccountId: 'bank-acc',
      defaultCashAccountId: null,
      baseCurrency: 'EGP',
    });
    await expect(service.create(ORG, dto)).rejects.toThrow(/VAT Receivable/);
    expect(journals.create).not.toHaveBeenCalled();
  });

  it.each(['abc', '-5', '0', '1.23456'])('rejects the invalid amount %s', async (amount) => {
    await expect(service.create(ORG, { ...dto, amount })).rejects.toThrow(BadRequestException);
    expect(prisma.expense.create).not.toHaveBeenCalled();
  });

  it('rejects a VAT rate above 100', async () => {
    await expect(service.create(ORG, { ...dto, taxRate: '101' })).rejects.toThrow(/taxRate/);
  });

  it('rejects an account that is not an active expense account of the organization', async () => {
    prisma.account.findFirst.mockResolvedValueOnce(null);
    await expect(service.create(ORG, dto)).rejects.toThrow(/expense account/);

    const where = prisma.account.findFirst.mock.calls[0][0].where;
    expect(where).toMatchObject({ organizationId: ORG, type: 'EXPENSE', deletedAt: null });
    expect(prisma.expense.create).not.toHaveBeenCalled();
    expect(journals.create).not.toHaveBeenCalled();
  });

  it('rejects a paid-through account that is not an eligible bank or cash account', async () => {
    prisma.account.findFirst.mockResolvedValueOnce({ id: 'exp-acc' }).mockResolvedValueOnce(null);
    await expect(service.create(ORG, dto)).rejects.toThrow(/bank or cash/);
    expect(journals.create).not.toHaveBeenCalled();
  });

  it('rejects a vendor of another organization', async () => {
    prisma.vendor.findFirst.mockResolvedValue(null);
    await expect(service.create(ORG, { ...dto, vendorId: 'foreign' })).rejects.toThrow(
      /Vendor not found/,
    );
    expect(prisma.vendor.findFirst.mock.calls[0][0].where).toMatchObject({
      id: 'foreign',
      organizationId: ORG,
    });
  });

  it('propagates a journal failure so the transaction rolls the expense back', async () => {
    journals.create.mockRejectedValue(new BadRequestException('Period is locked'));
    await expect(service.create(ORG, dto)).rejects.toThrow('Period is locked');
  });

  it('runs inside a caller transaction when one is given', async () => {
    await service.create(ORG, dto, { tx: prisma });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(journals.create).toHaveBeenCalled();
  });

  describe('remove (void)', () => {
    it('soft-deletes under a row lock and posts an EXPENSE_VOID reversal of the linked journal', async () => {
      prisma.expense.findFirst.mockResolvedValue({ id: 'e1' });
      prisma.expense.updateMany.mockResolvedValue({ count: 1 });
      prisma.journal.findFirst.mockResolvedValue({ id: 'j1' });

      await service.remove(ORG, 'e1');

      expect(prisma.$queryRaw).toHaveBeenCalled();
      expect(prisma.expense.updateMany.mock.calls[0][0].where).toEqual({
        id: 'e1',
        organizationId: ORG,
        deletedAt: null,
      });
      expect(prisma.journal.findFirst.mock.calls[0][0].where).toMatchObject({
        organizationId: ORG,
        sourceType: 'EXPENSE',
        sourceId: 'e1',
      });
      expect(journals.reverse).toHaveBeenCalledWith(ORG, 'j1', undefined, {
        tx: prisma,
        source: { type: 'EXPENSE_VOID', id: 'e1' },
      });
    });

    it('cannot void an expense of another organization', async () => {
      prisma.expense.findFirst.mockResolvedValue(null);
      await expect(service.remove(ORG, 'foreign')).rejects.toThrow(NotFoundException);
      expect(journals.reverse).not.toHaveBeenCalled();
    });

    it('refuses to void an expense without a linked ledger entry', async () => {
      prisma.expense.findFirst.mockResolvedValue({ id: 'e1' });
      prisma.expense.updateMany.mockResolvedValue({ count: 1 });
      prisma.journal.findFirst.mockResolvedValue(null);
      await expect(service.remove(ORG, 'e1')).rejects.toThrow(/no linked ledger entry/);
    });

    it('a concurrent void loses the guarded transition and reverses nothing', async () => {
      prisma.expense.findFirst.mockResolvedValue({ id: 'e1' });
      prisma.expense.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.remove(ORG, 'e1')).rejects.toThrow(NotFoundException);
      expect(journals.reverse).not.toHaveBeenCalled();
    });
  });

  describe('bulk operations', () => {
    it('bulkDelete voids each expense and reports per-record failures', async () => {
      prisma.expense.findFirst.mockResolvedValueOnce({ id: 'e1' }).mockResolvedValueOnce(null);
      prisma.expense.updateMany.mockResolvedValue({ count: 1 });
      prisma.journal.findFirst.mockResolvedValue({ id: 'j1' });

      const result = await service.bulkDelete(ORG, ['e1', 'missing', 'e1']);

      expect(result.total).toBe(2);
      expect(result.processed).toBe(1);
      expect(result.failures).toEqual([{ id: 'missing', reason: 'Expense not found' }]);
      expect(journals.reverse).toHaveBeenCalledTimes(1);
    });

    it('bulkCategorize rejects posted expenses per record instead of drifting the ledger', async () => {
      prisma.expense.findFirst.mockResolvedValue({ id: 'e1', status: 'POSTED' });
      prisma.expense.updateMany.mockResolvedValue({ count: 0 });
      const result = await service.bulkCategorize(ORG, ['e1'], 'other-acc');
      expect(result.processed).toBe(0);
      expect(result.failures?.[0]?.reason).toMatch(/cannot be re-categorised/);
      expect(prisma.expense.update).not.toHaveBeenCalled();
      expect(prisma.expense.update).not.toHaveBeenCalled();
    });
  });
});
