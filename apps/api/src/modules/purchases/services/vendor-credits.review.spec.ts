import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { dec } from '../../../test/helpers/decimal.helpers';
import { createMockPrisma } from '../../../test/mocks/prisma.mock';
import { JournalsService } from '../../accounting/services/journals.service';
import { BillsService } from './bills.service';
import { VendorCreditsService } from './vendor-credits.service';

/* eslint-disable @typescript-eslint/no-explicit-any */
describe('VendorCreditsService (review fixes)', () => {
  const ORG = 'org-1';
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
      defaultVatReceivableAccountId: 'new-vat',
      defaultBankAccountId: 'bank-acc',
      defaultCashAccountId: null,
      baseCurrency: 'EGP',
    });
    prisma.vendorCredit.aggregate.mockResolvedValue({ _sum: { amount: null } });
    prisma.vendorCredit.findMany.mockResolvedValue([]);
    prisma.billLine.findMany.mockResolvedValue([{ accountId: 'exp-acc' }]);
    prisma.$queryRaw.mockResolvedValue([{ max: 0 }]);
    prisma.vendorCredit.create.mockResolvedValue({ id: 'c1' });
  });

  it('credits the VAT account the bill approval debited, not the current default', async () => {
    prisma.journal.findFirst.mockResolvedValue({
      id: 'j-bill',
      lines: [
        { accountId: 'exp-acc', debit: dec('100'), credit: dec('0'), description: 'Bill - Line' },
        {
          accountId: 'old-vat',
          debit: dec('14'),
          credit: dec('0'),
          description: 'Bill BILL-1 - VAT Receivable',
        },
        { accountId: 'ap', debit: dec('0'), credit: dec('114'), description: 'Bill - AP' },
      ],
    });

    await service.create(ORG, { vendorId: 'v1', billId: 'b1', amount: '57', date: '2026-03-12' });

    expect(prisma.journal.findFirst.mock.calls[0][0].where).toMatchObject({
      organizationId: ORG,
      sourceType: 'BILL_APPROVAL',
      sourceId: 'b1',
    });
    const lines = journals.create.mock.calls[0][1].lines;
    expect(lines[2]).toEqual(expect.objectContaining({ accountId: 'old-vat', credit: '7.0000' }));
  });

  it('falls back to the default VAT account only when the bill has no readable approval journal', async () => {
    prisma.journal.findFirst.mockResolvedValue(null);
    await service.create(ORG, { vendorId: 'v1', billId: 'b1', amount: '57', date: '2026-03-12' });
    expect(journals.create.mock.calls[0][1].lines[2].accountId).toBe('new-vat');
  });

  describe('refund date', () => {
    const credit = {
      id: 'c1',
      creditNumber: 'VC-001',
      vendorId: 'v1',
      amount: dec('57'),
      date: new Date('2026-03-12T00:00:00.000Z'),
      appliedToBillId: null,
      refundedAt: null,
    };

    beforeEach(() => {
      prisma.vendorCredit.findFirst.mockResolvedValue(credit);
      prisma.vendorCredit.updateMany.mockResolvedValue({ count: 1 });
      prisma.vendorCredit.findUniqueOrThrow.mockResolvedValue(credit);
      prisma.account.findFirst.mockResolvedValue({ id: 'bank-acc' });
      prisma.journal.findFirst.mockResolvedValue({
        id: 'j1',
        lines: [{ accountId: 'ap', debit: dec('57'), credit: dec('0') }],
      });
    });

    it('rejects an explicit refund date earlier than the credit date', async () => {
      await expect(
        service.refund(ORG, 'c1', { bankAccountId: 'bank-acc', date: '2026-03-11' }),
      ).rejects.toThrow(BadRequestException);
      expect(journals.create).not.toHaveBeenCalled();
      expect(prisma.vendorCredit.updateMany).not.toHaveBeenCalled();
    });

    it('accepts a refund dated on the credit date', async () => {
      await service.refund(ORG, 'c1', { bankAccountId: 'bank-acc', date: '2026-03-12' });
      expect(journals.create.mock.calls[0][1].date).toBe('2026-03-12T00:00:00.000Z');
    });

    it('defaults to today for a past credit and to the credit date for a future-dated credit', async () => {
      const before = Date.now();
      await service.refund(ORG, 'c1', { bankAccountId: 'bank-acc' });
      expect(new Date(journals.create.mock.calls[0][1].date).getTime()).toBeGreaterThanOrEqual(
        before,
      );

      journals.create.mockClear();
      const future = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
      prisma.vendorCredit.findFirst.mockResolvedValue({ ...credit, date: future });
      await service.refund(ORG, 'c1', { bankAccountId: 'bank-acc' });
      expect(journals.create.mock.calls[0][1].date).toBe(future.toISOString());
    });
  });

  it('findOne returns a voided credit read-only, scoped to the organization', async () => {
    const voided = { id: 'c1', deletedAt: new Date('2026-04-01') };
    prisma.vendorCredit.findFirst.mockResolvedValue(voided);
    await expect(service.findOne(ORG, 'c1')).resolves.toBe(voided);
    expect(prisma.vendorCredit.findFirst.mock.calls[0][0].where).toEqual({
      id: 'c1',
      organizationId: ORG,
    });
  });
});
