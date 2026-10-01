import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { dec } from '../../../test/helpers/decimal.helpers';
import { createMockPrisma } from '../../../test/mocks/prisma.mock';
import { JournalsService } from '../../accounting/services/journals.service';
import { BillsService } from './bills.service';
import { VendorCreditsService } from './vendor-credits.service';

describe('VendorCreditsService (posting)', () => {
  const ORG = 'org-1';
  // Partial fixtures are enough for these flows; loosen the deep-mock typing.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;
  let journals: { create: jest.Mock; reverse: jest.Mock };
  let bills: { lockBills: jest.Mock; recalculateBalance: jest.Mock };
  let service: VendorCreditsService;

  const bill = {
    id: 'b1',
    billNumber: 'BILL-1',
    vendorId: 'v1',
    status: 'OPEN',
    currencyCode: null,
    taxAmount: dec('14'),
    grandTotal: dec('114'),
    balanceDue: dec('114'),
  };
  const credit = {
    id: 'c1',
    creditNumber: 'VC-001',
    vendorId: 'v1',
    billId: 'b1',
    amount: dec('57'),
    appliedToBillId: null,
    refundedAt: null,
  };
  const dto = { vendorId: 'v1', billId: 'b1', date: '2026-03-12', reason: 'Return', amount: '57' };

  beforeEach(() => {
    prisma = createMockPrisma();
    journals = { create: jest.fn().mockResolvedValue({}), reverse: jest.fn() };
    bills = { lockBills: jest.fn(), recalculateBalance: jest.fn() };
    service = new VendorCreditsService(
      prisma as unknown as PrismaService,
      bills as unknown as BillsService,
      journals as unknown as JournalsService,
    );
    prisma.bill.count.mockResolvedValue(1);
    prisma.bill.findFirst.mockResolvedValue(bill);
    prisma.organization.findUnique.mockResolvedValue({
      defaultApAccountId: 'ap',
      defaultVatReceivableAccountId: 'vat-recv',
      defaultBankAccountId: 'bank-acc',
      defaultCashAccountId: null,
      baseCurrency: 'EGP',
    });
    prisma.vendorCredit.aggregate.mockResolvedValue({ _sum: { amount: null } });
    prisma.vendorCredit.findMany.mockResolvedValue([]);
    prisma.billLine.findMany.mockResolvedValue([{ accountId: 'exp-acc' }]);
    prisma.$queryRaw.mockResolvedValue([{ max: 4 }]);
    prisma.vendorCredit.create.mockResolvedValue({ id: 'c1', creditNumber: 'VC-005' });
    prisma.account.findFirst.mockResolvedValue({ id: 'bank-acc' });
  });

  describe('create', () => {
    it('posts Dr AP / Cr expense / Cr VAT receivable once, dated on the credit date', async () => {
      await service.create(ORG, dto);

      expect(bills.lockBills).toHaveBeenCalledWith(prisma, ORG, ['b1']);
      expect(prisma.$executeRaw).toHaveBeenCalled(); // ledger lock
      expect(journals.create).toHaveBeenCalledTimes(1);
      const [org, journal, options] = journals.create.mock.calls[0];
      expect(org).toBe(ORG);
      expect(journal.date).toBe(new Date('2026-03-12').toISOString());
      // 57 of a 114 bill with 14 VAT: VAT share 7, net 50.
      expect(journal.lines).toEqual([
        expect.objectContaining({ accountId: 'ap', debit: '57.0000', credit: '0' }),
        expect.objectContaining({ accountId: 'exp-acc', debit: '0', credit: '50.0000' }),
        expect.objectContaining({ accountId: 'vat-recv', debit: '0', credit: '7.0000' }),
      ]);
      expect(options).toEqual({ tx: prisma, source: { type: 'VENDOR_CREDIT', id: 'c1' } });
    });

    it('takes the remaining VAT when the credit exhausts the bill', async () => {
      prisma.vendorCredit.aggregate.mockResolvedValue({ _sum: { amount: dec('57') } });
      prisma.vendorCredit.findMany.mockResolvedValue([{ id: 'older' }]);
      prisma.journalLine.aggregate.mockResolvedValue({ _sum: { credit: dec('7') } });

      await service.create(ORG, { ...dto, amount: '57' });

      const lines = journals.create.mock.calls[0][1].lines;
      expect(lines[2]).toEqual(
        expect.objectContaining({ accountId: 'vat-recv', credit: '7.0000' }),
      );
    });

    it('rejects credits that would exceed the bill total', async () => {
      prisma.vendorCredit.aggregate.mockResolvedValue({ _sum: { amount: dec('100') } });
      await expect(service.create(ORG, { ...dto, amount: '20' })).rejects.toThrow(/exceed/);
      expect(journals.create).not.toHaveBeenCalled();
    });

    it('rejects a bill of another organization before taking any lock', async () => {
      prisma.bill.count.mockResolvedValue(0);
      await expect(service.create(ORG, dto)).rejects.toThrow(/Bill not found/);
      expect(prisma.bill.count.mock.calls[0][0].where).toMatchObject({ organizationId: ORG });
      expect(bills.lockBills).not.toHaveBeenCalled();
      expect(journals.create).not.toHaveBeenCalled();
    });

    it('rejects a credit against a draft bill', async () => {
      prisma.bill.findFirst.mockResolvedValue({ ...bill, status: 'DRAFT' });
      await expect(service.create(ORG, dto)).rejects.toThrow(/posted bill/);
      expect(journals.create).not.toHaveBeenCalled();
    });

    it('rejects a vendor that does not own the bill', async () => {
      await expect(service.create(ORG, { ...dto, vendorId: 'other' })).rejects.toThrow(
        /does not belong/,
      );
    });

    it('rejects a foreign-currency bill (single-currency ledger)', async () => {
      prisma.bill.findFirst.mockResolvedValue({ ...bill, currencyCode: 'USD' });
      await expect(service.create(ORG, dto)).rejects.toThrow(/base currency/);
    });

    it('rejects an explicit credit account that is not on the bill lines', async () => {
      await expect(service.create(ORG, { ...dto, accountId: 'liab' })).rejects.toThrow(
        /accounts on the bill/,
      );
      expect(prisma.billLine.findMany.mock.calls[0][0].where).toMatchObject({
        billId: 'b1',
        bill: { organizationId: ORG },
      });
      expect(journals.create).not.toHaveBeenCalled();
    });

    it('credits an asset account that sits on the bill lines (default = largest line)', async () => {
      prisma.billLine.findMany.mockResolvedValue([
        { accountId: 'inventory-asset' },
        { accountId: 'exp-acc' },
      ]);
      await service.create(ORG, dto);
      expect(journals.create.mock.calls[0][1].lines[1]).toEqual(
        expect.objectContaining({ accountId: 'inventory-asset', credit: '50.0000' }),
      );

      journals.create.mockClear();
      await service.create(ORG, { ...dto, accountId: 'exp-acc' });
      expect(journals.create.mock.calls[0][1].lines[1].accountId).toBe('exp-acc');
    });

    it('counts VAT already credited by earlier credits whatever the current default VAT account is', async () => {
      prisma.vendorCredit.aggregate.mockResolvedValue({ _sum: { amount: dec('57') } });
      prisma.vendorCredit.findMany.mockResolvedValue([{ id: 'older' }]);
      prisma.journalLine.aggregate.mockResolvedValue({ _sum: { credit: dec('7') } });
      // The default VAT account was changed after the first credit was posted.
      prisma.organization.findUnique.mockResolvedValue({
        defaultApAccountId: 'ap',
        defaultVatReceivableAccountId: 'new-vat',
        baseCurrency: 'EGP',
      });

      await service.create(ORG, dto);

      const where = prisma.journalLine.aggregate.mock.calls[0][0].where;
      expect(where.description).toEqual({ endsWith: '- VAT Receivable' });
      expect(where).not.toHaveProperty('accountId');
      const lines = journals.create.mock.calls[0][1].lines;
      expect(lines[2]).toEqual(expect.objectContaining({ accountId: 'new-vat', credit: '7.0000' }));
    });

    it.each(['0', '-1', 'x', '1.23456'])('rejects the invalid amount %s', async (amount) => {
      await expect(service.create(ORG, { ...dto, amount })).rejects.toThrow(BadRequestException);
    });

    it('propagates a journal failure so the transaction rolls the credit back', async () => {
      journals.create.mockRejectedValue(new BadRequestException('Period is locked'));
      await expect(service.create(ORG, dto)).rejects.toThrow('Period is locked');
    });
  });

  describe('applyToBill', () => {
    beforeEach(() => {
      prisma.vendorCredit.findFirst.mockResolvedValue(credit);
      prisma.vendorCredit.updateMany.mockResolvedValue({ count: 1 });
      prisma.vendorCredit.findUniqueOrThrow.mockResolvedValue({ ...credit, appliedToBillId: 'b1' });
    });

    it('attaches the credit under credit and bill locks, recalculates and posts no journal', async () => {
      await service.applyToBill(ORG, 'c1', 'b1');

      expect(bills.lockBills).toHaveBeenCalledWith(prisma, ORG, ['b1']);
      expect(prisma.vendorCredit.updateMany.mock.calls[0][0]).toEqual({
        where: {
          id: 'c1',
          organizationId: ORG,
          deletedAt: null,
          appliedToBillId: null,
          refundedAt: null,
        },
        data: { appliedToBillId: 'b1' },
      });
      expect(bills.recalculateBalance).toHaveBeenCalledWith(prisma, 'b1');
      expect(journals.create).not.toHaveBeenCalled();
    });

    it('rejects an over-application beyond the bill balance', async () => {
      prisma.bill.findFirst.mockResolvedValue({ ...bill, balanceDue: dec('50') });
      await expect(service.applyToBill(ORG, 'c1', 'b1')).rejects.toThrow(/exceeds the balance due/);
      expect(prisma.vendorCredit.updateMany).not.toHaveBeenCalled();
    });

    it('rejects applying twice, or applying a refunded credit', async () => {
      prisma.vendorCredit.findFirst.mockResolvedValue({ ...credit, appliedToBillId: 'b2' });
      await expect(service.applyToBill(ORG, 'c1', 'b1')).rejects.toThrow(/already applied/);
      prisma.vendorCredit.findFirst.mockResolvedValue({ ...credit, refundedAt: new Date() });
      await expect(service.applyToBill(ORG, 'c1', 'b1')).rejects.toThrow(/refunded/);
    });

    it('rejects a bill of a different vendor or one that is not open', async () => {
      prisma.bill.findFirst.mockResolvedValue({ ...bill, vendorId: 'other' });
      await expect(service.applyToBill(ORG, 'c1', 'b1')).rejects.toThrow(/different vendor/);
      prisma.bill.findFirst.mockResolvedValue({ ...bill, status: 'PAID' });
      await expect(service.applyToBill(ORG, 'c1', 'b1')).rejects.toThrow(/not open/);
    });

    it('cannot touch a credit or bill of another organization', async () => {
      prisma.vendorCredit.findFirst.mockResolvedValue(null);
      await expect(service.applyToBill(ORG, 'foreign', 'b1')).rejects.toThrow(NotFoundException);
      prisma.vendorCredit.findFirst.mockResolvedValue(credit);
      prisma.bill.count.mockResolvedValue(0);
      await expect(service.applyToBill(ORG, 'c1', 'foreign')).rejects.toThrow(/Target bill/);
    });

    it('a concurrent apply loses the guarded transition', async () => {
      prisma.vendorCredit.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.applyToBill(ORG, 'c1', 'b1')).rejects.toThrow(ConflictException);
      expect(bills.recalculateBalance).not.toHaveBeenCalled();
    });
  });

  describe('refund', () => {
    beforeEach(() => {
      prisma.vendorCredit.findFirst.mockResolvedValue(credit);
      prisma.vendorCredit.updateMany.mockResolvedValue({ count: 1 });
      prisma.vendorCredit.findUniqueOrThrow.mockResolvedValue({ ...credit });
      prisma.journal.findFirst.mockResolvedValue({
        id: 'j1',
        lines: [{ accountId: 'ap', debit: dec('57'), credit: dec('0') }],
      });
    });

    it('credits the AP account the credit itself debited, not the current default', async () => {
      prisma.journal.findFirst.mockResolvedValue({
        id: 'j1',
        lines: [
          { accountId: 'old-ap', debit: dec('57'), credit: dec('0') },
          { accountId: 'exp-acc', debit: dec('0'), credit: dec('50') },
        ],
      });
      prisma.organization.findUnique.mockResolvedValue({
        defaultApAccountId: 'changed-ap',
        defaultBankAccountId: 'bank-acc',
        defaultCashAccountId: null,
        baseCurrency: 'EGP',
      });
      await service.refund(ORG, 'c1', { bankAccountId: 'bank-acc' });
      expect(journals.create.mock.calls[0][1].lines[1]).toEqual(
        expect.objectContaining({ accountId: 'old-ap', credit: '57.0000' }),
      );
      expect(prisma.journal.findFirst.mock.calls[0][0].where).toMatchObject({
        organizationId: ORG,
        sourceType: 'VENDOR_CREDIT',
        sourceId: 'c1',
      });
    });

    it('rejects a refund of a credit without a linked ledger entry', async () => {
      prisma.journal.findFirst.mockResolvedValue(null);
      await expect(service.refund(ORG, 'c1', { bankAccountId: 'bank-acc' })).rejects.toThrow(
        /no linked ledger entry/,
      );
      expect(journals.create).not.toHaveBeenCalled();
    });

    it('posts Dr bank / Cr AP once on the refund date to an eligible account', async () => {
      await service.refund(ORG, 'c1', { bankAccountId: 'bank-acc', date: '2026-04-02' });

      expect(journals.create).toHaveBeenCalledTimes(1);
      const [, journal, options] = journals.create.mock.calls[0];
      expect(journal.date).toBe(new Date('2026-04-02').toISOString());
      expect(journal.lines).toEqual([
        expect.objectContaining({ accountId: 'bank-acc', debit: '57.0000', credit: '0' }),
        expect.objectContaining({ accountId: 'ap', debit: '0', credit: '57.0000' }),
      ]);
      expect(options).toEqual({ tx: prisma, source: { type: 'VENDOR_CREDIT_REFUND', id: 'c1' } });
      expect(prisma.vendorCredit.updateMany.mock.calls[0][0].data.refundedAt).toEqual(
        new Date('2026-04-02'),
      );
    });

    it('rejects a non bank/cash account', async () => {
      prisma.account.findFirst.mockResolvedValue(null);
      await expect(service.refund(ORG, 'c1', { bankAccountId: 'rev' })).rejects.toThrow(
        /bank or cash/,
      );
      expect(journals.create).not.toHaveBeenCalled();
    });

    it('rejects an applied or already refunded credit', async () => {
      prisma.vendorCredit.findFirst.mockResolvedValue({ ...credit, appliedToBillId: 'b1' });
      await expect(service.refund(ORG, 'c1', { bankAccountId: 'bank-acc' })).rejects.toThrow(
        /applied/,
      );
      prisma.vendorCredit.findFirst.mockResolvedValue({ ...credit, refundedAt: new Date() });
      await expect(service.refund(ORG, 'c1', { bankAccountId: 'bank-acc' })).rejects.toThrow(
        /already been refunded/,
      );
      expect(journals.create).not.toHaveBeenCalled();
    });

    it('a concurrent refund loses the guarded transition and posts nothing', async () => {
      prisma.vendorCredit.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.refund(ORG, 'c1', { bankAccountId: 'bank-acc' })).rejects.toThrow(
        ConflictException,
      );
      expect(journals.create).not.toHaveBeenCalled();
    });

    it('cannot refund a credit of another organization', async () => {
      prisma.vendorCredit.findFirst.mockResolvedValue(null);
      await expect(service.refund(ORG, 'foreign', { bankAccountId: 'bank-acc' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('void', () => {
    beforeEach(() => {
      prisma.vendorCredit.findFirst.mockResolvedValue(credit);
      prisma.vendorCredit.updateMany.mockResolvedValue({ count: 1 });
      prisma.journal.findFirst.mockResolvedValue({ id: 'j1' });
    });

    it('soft-deletes an unapplied credit and posts a VENDOR_CREDIT_VOID reversal', async () => {
      await service.void(ORG, 'c1');
      expect(prisma.journal.findFirst.mock.calls[0][0].where).toMatchObject({
        organizationId: ORG,
        sourceType: 'VENDOR_CREDIT',
        sourceId: 'c1',
      });
      expect(journals.reverse).toHaveBeenCalledWith(ORG, 'j1', undefined, {
        tx: prisma,
        source: { type: 'VENDOR_CREDIT_VOID', id: 'c1' },
      });
    });

    it('rejects voiding an applied or refunded credit', async () => {
      prisma.vendorCredit.findFirst.mockResolvedValue({ ...credit, appliedToBillId: 'b1' });
      await expect(service.void(ORG, 'c1')).rejects.toThrow(/unapplied, unrefunded/);
      prisma.vendorCredit.findFirst.mockResolvedValue({ ...credit, refundedAt: new Date() });
      await expect(service.void(ORG, 'c1')).rejects.toThrow(/unapplied, unrefunded/);
      expect(journals.reverse).not.toHaveBeenCalled();
    });

    it('refuses to void a credit without a linked ledger entry', async () => {
      prisma.journal.findFirst.mockResolvedValue(null);
      await expect(service.void(ORG, 'c1')).rejects.toThrow(/no linked ledger entry/);
    });

    it('bulkDelete reports per-record failures and de-duplicates ids', async () => {
      prisma.vendorCredit.findFirst
        .mockResolvedValueOnce(credit)
        .mockResolvedValueOnce({ ...credit, id: 'c2', appliedToBillId: 'b1' });
      const result = await service.bulkDelete(ORG, ['c1', 'c2', 'c1']);
      expect(result.total).toBe(2);
      expect(result.processed).toBe(1);
      expect(result.failures).toEqual([
        { id: 'c2', reason: 'Only unapplied, unrefunded vendor credits can be voided' },
      ]);
    });
  });
});
