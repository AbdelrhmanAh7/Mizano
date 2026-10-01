import { BadRequestException, ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../../../prisma/prisma.service';
import { createMockPrisma } from '../../../test/mocks/prisma.mock';
import { JournalsService } from '../../accounting/services/journals.service';
import { derivePeriodLabel, VatReturnsService } from './vat-returns.service';

const ORG = 'org-1';
const PAYABLE = 'acc-vat-payable';
const RECEIVABLE = 'acc-vat-receivable';
const BANK = 'acc-bank';
const PERIOD_END = new Date('2026-03-31T00:00:00.000Z');

const dec = (v: string): Decimal => new Decimal(v);

function vatReturn(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'vr-1',
    returnNumber: 'VAT-001',
    period: '2026-Q1',
    status: 'CALCULATED',
    startDate: new Date('2026-01-01T00:00:00.000Z'),
    endDate: PERIOD_END,
    periodStart: new Date('2026-01-01T00:00:00.000Z'),
    periodEnd: PERIOD_END,
    totalSales: dec('1000'),
    outputVAT: dec('140.1'),
    totalPurchases: dec('400'),
    inputVAT: dec('56.2'),
    netPayable: dec('83.9'),
    payment: null,
    ...overrides,
  };
}

describe('derivePeriodLabel', () => {
  it('labels calendar quarters, calendar months and arbitrary ranges', () => {
    expect(derivePeriodLabel(new Date('2026-01-01'), new Date('2026-03-31'))).toBe('2026-Q1');
    expect(derivePeriodLabel(new Date('2026-04-01'), new Date('2026-06-30'))).toBe('2026-Q2');
    expect(derivePeriodLabel(new Date('2026-02-01'), new Date('2026-02-28'))).toBe('2026-02');
    expect(derivePeriodLabel(new Date('2026-02-10'), new Date('2026-03-05'))).toBe(
      '2026-02-10_2026-03-05',
    );
  });
});

describe('VatReturnsService', () => {
  let service: VatReturnsService;
  let prisma: any;
  let journals: { create: jest.Mock };

  /** Ledger movements and document bases the figures are computed from. */
  function givenLedger(opts: {
    outputCredit: string;
    outputDebit?: string;
    inputDebit: string;
    inputCredit?: string;
  }): void {
    prisma.journalLine.aggregate.mockImplementation(
      async (args: { where: { accountId: string } }) => {
        if (args.where.accountId === PAYABLE) {
          return { _sum: { debit: dec(opts.outputDebit ?? '0'), credit: dec(opts.outputCredit) } };
        }
        return { _sum: { debit: dec(opts.inputDebit), credit: dec(opts.inputCredit ?? '0') } };
      },
    );
    prisma.invoice.aggregate.mockResolvedValue({ _sum: { subtotal: dec('1000') } });
    prisma.bill.aggregate.mockResolvedValue({ _sum: { subtotal: dec('400') } });
  }

  beforeEach(async () => {
    prisma = createMockPrisma();
    journals = { create: jest.fn().mockResolvedValue({ id: 'j1' }) };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VatReturnsService,
        { provide: PrismaService, useValue: prisma },
        { provide: JournalsService, useValue: journals },
      ],
    }).compile();
    service = module.get(VatReturnsService);

    prisma.organization.findUnique.mockResolvedValue({
      defaultVatPayableAccountId: PAYABLE,
      defaultVatReceivableAccountId: RECEIVABLE,
      baseCurrency: 'EGP',
    });
    prisma.account.count.mockResolvedValue(2);
  });

  describe('calculate', () => {
    it('sums the ledger with exact decimals (no float drift) and excludes settlement journals', async () => {
      prisma.vATReturn.findFirst.mockResolvedValue(vatReturn({ status: 'DRAFT' }));
      prisma.vATReturn.updateMany.mockResolvedValue({ count: 1 });
      prisma.vATReturn.findUniqueOrThrow.mockResolvedValue({ id: 'vr-1' });
      // 0.1 + 0.2 style amounts that floats get wrong.
      givenLedger({ outputCredit: '140.1', inputDebit: '56.2' });

      await service.calculate(ORG, 'vr-1');

      const update = prisma.vATReturn.updateMany.mock.calls[0][0];
      expect((update.data.outputVAT as Decimal).toFixed(4)).toBe('140.1000');
      expect((update.data.inputVAT as Decimal).toFixed(4)).toBe('56.2000');
      expect((update.data.netPayable as Decimal).toFixed(4)).toBe('83.9000');
      expect(update.data.status).toBe('CALCULATED');
      expect(update.where.organizationId).toBe(ORG);

      const ledgerWhere = prisma.journalLine.aggregate.mock.calls[0][0].where;
      expect(ledgerWhere.journal).toEqual(
        expect.objectContaining({
          organizationId: ORG,
          isPosted: true,
          deletedAt: null,
          OR: [{ sourceType: null }, { sourceType: { notIn: ['VAT_RETURN', 'VAT_PAYMENT'] } }],
        }),
      );
    });

    it('nets credit-note style debits against output VAT', async () => {
      prisma.vATReturn.findFirst.mockResolvedValue(vatReturn({ status: 'CALCULATED' }));
      prisma.vATReturn.updateMany.mockResolvedValue({ count: 1 });
      prisma.vATReturn.findUniqueOrThrow.mockResolvedValue({ id: 'vr-1' });
      givenLedger({ outputCredit: '150', outputDebit: '30', inputDebit: '20' });

      await service.calculate(ORG, 'vr-1');

      const data = prisma.vATReturn.updateMany.mock.calls[0][0].data;
      expect((data.outputVAT as Decimal).toFixed(4)).toBe('120.0000');
      expect((data.netPayable as Decimal).toFixed(4)).toBe('100.0000');
    });

    it('fails clearly when VAT accounts are not configured', async () => {
      prisma.vATReturn.findFirst.mockResolvedValue(vatReturn({ status: 'DRAFT' }));
      prisma.organization.findUnique.mockResolvedValue({
        defaultVatPayableAccountId: PAYABLE,
        defaultVatReceivableAccountId: null,
      });
      await expect(service.calculate(ORG, 'vr-1')).rejects.toThrow('VAT Receivable');
      expect(prisma.vATReturn.updateMany).not.toHaveBeenCalled();
    });

    it('refuses to recalculate a submitted return', async () => {
      prisma.vATReturn.findFirst.mockResolvedValue(vatReturn({ status: 'SUBMITTED' }));
      await expect(service.calculate(ORG, 'vr-1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('submit', () => {
    beforeEach(() => {
      prisma.vATReturn.findFirst.mockResolvedValue({ status: 'CALCULATED' });
      prisma.vATReturn.updateMany.mockResolvedValue({ count: 1 });
      prisma.vATReturn.findUniqueOrThrow.mockResolvedValue(vatReturn({ status: 'SUBMITTED' }));
      prisma.organization.updateMany.mockResolvedValue({ count: 1 });
      givenLedger({ outputCredit: '140.1', inputDebit: '56.2' });
    });

    it('takes the ledger lock before reading the return and computing figures', async () => {
      await service.submit(ORG, 'vr-1');

      expect(prisma.$executeRaw).toHaveBeenCalled();
      expect(prisma.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.vATReturn.findFirst.mock.invocationCallOrder[0],
      );
    });

    it('posts the balanced settlement on period end inside the transaction, then locks the period', async () => {
      // The re-read inside the transaction returns the calculated figures.
      prisma.vATReturn.findUniqueOrThrow.mockResolvedValueOnce(vatReturn());

      await service.submit(ORG, 'vr-1');

      // Guarded transition: only CALCULATED can move to SUBMITTED.
      expect(prisma.vATReturn.updateMany.mock.calls[0][0].where).toEqual(
        expect.objectContaining({ id: 'vr-1', organizationId: ORG, status: 'CALCULATED' }),
      );

      const [orgId, dto, options] = journals.create.mock.calls[0];
      expect(orgId).toBe(ORG);
      expect(options).toEqual({ tx: prisma, source: { type: 'VAT_RETURN', id: 'vr-1' } });
      expect(dto.date).toBe(PERIOD_END.toISOString());
      expect(dto.lines).toEqual([
        expect.objectContaining({ accountId: PAYABLE, debit: '140.1000', credit: '0' }),
        expect.objectContaining({ accountId: RECEIVABLE, debit: '0', credit: '56.2000' }),
        expect.objectContaining({ accountId: PAYABLE, debit: '0', credit: '83.9000' }),
      ]);
      const debits = dto.lines.reduce((s: Decimal, l: any) => s.add(l.debit), dec('0'));
      const credits = dto.lines.reduce((s: Decimal, l: any) => s.add(l.credit), dec('0'));
      expect(debits.equals(credits)).toBe(true);

      // Period lock is applied after the journal (journal create precedes lock update).
      const lockOrder = prisma.organization.updateMany.mock.invocationCallOrder[0];
      expect(journals.create.mock.invocationCallOrder[0]).toBeLessThan(lockOrder);
      expect(prisma.organization.updateMany.mock.calls[0][0].data).toEqual({
        lockDate: PERIOD_END,
      });
    });

    it('settles a refundable return to the VAT Receivable account', async () => {
      prisma.vATReturn.findUniqueOrThrow.mockResolvedValueOnce(
        vatReturn({ outputVAT: dec('20'), inputVAT: dec('50'), netPayable: dec('-30') }),
      );
      givenLedger({ outputCredit: '20', inputDebit: '50' });

      await service.submit(ORG, 'vr-1');

      const lines = journals.create.mock.calls[0][1].lines;
      expect(lines).toEqual([
        expect.objectContaining({ accountId: PAYABLE, debit: '20.0000', credit: '0' }),
        expect.objectContaining({ accountId: RECEIVABLE, debit: '0', credit: '50.0000' }),
        expect.objectContaining({ accountId: RECEIVABLE, debit: '30.0000', credit: '0' }),
      ]);
    });

    it('posts nothing for a nil return but still submits it', async () => {
      prisma.vATReturn.findUniqueOrThrow.mockResolvedValueOnce(
        vatReturn({ outputVAT: dec('0'), inputVAT: dec('0'), netPayable: dec('0') }),
      );
      givenLedger({ outputCredit: '0', inputDebit: '0' });

      await service.submit(ORG, 'vr-1');

      expect(journals.create).not.toHaveBeenCalled();
    });

    it('a concurrent or retried submit (guard count 0) posts no journal', async () => {
      prisma.vATReturn.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.submit(ORG, 'vr-1')).rejects.toThrow(ConflictException);
      expect(journals.create).not.toHaveBeenCalled();
    });

    it('rejects submission of a return that is not calculated', async () => {
      prisma.vATReturn.findFirst.mockResolvedValue({ status: 'DRAFT' });
      await expect(service.submit(ORG, 'vr-1')).rejects.toThrow('must be calculated');
      expect(prisma.vATReturn.updateMany).not.toHaveBeenCalled();
    });

    it('rejects when the ledger VAT moved since calculation (settlement must match the return)', async () => {
      prisma.vATReturn.findUniqueOrThrow.mockResolvedValueOnce(vatReturn());
      givenLedger({ outputCredit: '200', inputDebit: '56.2' });

      await expect(service.submit(ORG, 'vr-1')).rejects.toThrow('recalculate');
      expect(journals.create).not.toHaveBeenCalled();
    });

    it('errors clearly when the VAT Payable account is not configured', async () => {
      prisma.organization.findUnique.mockResolvedValue({
        defaultVatPayableAccountId: null,
        defaultVatReceivableAccountId: RECEIVABLE,
      });
      await expect(service.submit(ORG, 'vr-1')).rejects.toThrow('VAT Payable');
      expect(prisma.vATReturn.updateMany).not.toHaveBeenCalled();
    });

    it('is tenant scoped: another organization sees the return as not found', async () => {
      prisma.vATReturn.findFirst.mockResolvedValue(null);
      await expect(service.submit('other-org', 'vr-1')).rejects.toThrow('not found');
      expect(prisma.vATReturn.findFirst.mock.calls[0][0].where.organizationId).toBe('other-org');
    });
  });

  describe('recordPayment', () => {
    const dto = {
      amount: '83.9000',
      date: '2026-04-15',
      paidFromAccountId: BANK,
      reference: 'EFT-1',
    };

    beforeEach(() => {
      prisma.vATReturn.findFirst.mockResolvedValue(vatReturn({ status: 'SUBMITTED' }));
      prisma.account.findFirst.mockResolvedValue({ id: BANK, currency: 'EGP' });
      prisma.vATReturn.updateMany.mockResolvedValue({ count: 1 });
      prisma.vATPayment.create.mockResolvedValue({ id: 'pay-1' });
    });

    it('posts Dr VAT Payable / Cr bank dated on the payment date and files the return', async () => {
      await service.recordPayment(ORG, 'vr-1', dto);

      expect(prisma.vATReturn.updateMany.mock.calls[0][0]).toEqual(
        expect.objectContaining({
          where: expect.objectContaining({ id: 'vr-1', organizationId: ORG, status: 'SUBMITTED' }),
          data: expect.objectContaining({ status: 'FILED' }),
        }),
      );
      const [, journalDto, options] = journals.create.mock.calls[0];
      expect(options).toEqual({ tx: prisma, source: { type: 'VAT_PAYMENT', id: 'pay-1' } });
      expect(journalDto.date).toBe(new Date('2026-04-15').toISOString());
      expect(journalDto.lines).toEqual([
        expect.objectContaining({ accountId: PAYABLE, debit: '83.9000', credit: '0' }),
        expect.objectContaining({ accountId: BANK, debit: '0', credit: '83.9000' }),
      ]);
    });

    it('rejects an overpayment beyond the return net payable', async () => {
      await expect(
        service.recordPayment(ORG, 'vr-1', { ...dto, amount: '83.9001' }),
      ).rejects.toThrow('must equal the VAT payable');
      expect(prisma.vATPayment.create).not.toHaveBeenCalled();
      expect(journals.create).not.toHaveBeenCalled();
    });

    it('rejects a partial payment (a return has exactly one payment)', async () => {
      await expect(service.recordPayment(ORG, 'vr-1', { ...dto, amount: '50' })).rejects.toThrow(
        'partial payments are not supported',
      );
      expect(journals.create).not.toHaveBeenCalled();
    });

    it('locks the return row and the ledger, and requires an asset account in base currency', async () => {
      await service.recordPayment(ORG, 'vr-1', dto);
      expect(prisma.$queryRaw).toHaveBeenCalled();
      expect(prisma.account.findFirst.mock.calls[0][0].where).toMatchObject({
        organizationId: ORG,
        type: 'ASSET',
        isActive: true,
      });
      prisma.account.findFirst.mockResolvedValue({ id: BANK, currency: 'USD' });
      await expect(service.recordPayment(ORG, 'vr-1', dto)).rejects.toThrow('base currency');
    });

    it('rejects a non-positive amount', async () => {
      await expect(service.recordPayment(ORG, 'vr-1', { ...dto, amount: '0' })).rejects.toThrow(
        'greater than zero',
      );
    });

    it('rejects a second payment (already recorded)', async () => {
      prisma.vATReturn.findFirst.mockResolvedValue(
        vatReturn({ status: 'FILED', payment: { id: 'pay-0' } }),
      );
      await expect(service.recordPayment(ORG, 'vr-1', dto)).rejects.toThrow('already recorded');
      expect(journals.create).not.toHaveBeenCalled();
    });

    it('rejects payment before submission and for a refund return', async () => {
      prisma.vATReturn.findFirst.mockResolvedValue(vatReturn({ status: 'CALCULATED' }));
      await expect(service.recordPayment(ORG, 'vr-1', dto)).rejects.toThrow('must be submitted');

      prisma.vATReturn.findFirst.mockResolvedValue(
        vatReturn({ status: 'SUBMITTED', netPayable: dec('-10') }),
      );
      await expect(service.recordPayment(ORG, 'vr-1', dto)).rejects.toThrow('no VAT payable');
    });

    it('a concurrent payment (guard count 0) posts no journal', async () => {
      prisma.vATReturn.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.recordPayment(ORG, 'vr-1', dto)).rejects.toThrow(ConflictException);
      expect(journals.create).not.toHaveBeenCalled();
    });

    it('rejects a paid-from account from another organization or equal to VAT Payable', async () => {
      prisma.account.findFirst.mockResolvedValue(null);
      await expect(service.recordPayment(ORG, 'vr-1', dto)).rejects.toThrow('Paid-from account');
      expect(prisma.account.findFirst.mock.calls[0][0].where.organizationId).toBe(ORG);

      prisma.account.findFirst.mockResolvedValue({ id: PAYABLE, currency: 'EGP' });
      await expect(service.recordPayment(ORG, 'vr-1', dto)).rejects.toThrow('must differ');
    });

    it('errors clearly when no VAT Payable account is configured', async () => {
      prisma.organization.findUnique.mockResolvedValue({ defaultVatPayableAccountId: null });
      await expect(service.recordPayment(ORG, 'vr-1', dto)).rejects.toThrow('VAT Payable');
      expect(journals.create).not.toHaveBeenCalled();
    });
  });

  describe('bulk operations', () => {
    it('bulkSubmit reuses submit and reports per-record outcomes', async () => {
      const submit = jest
        .spyOn(service, 'submit')
        .mockResolvedValueOnce({} as never)
        .mockRejectedValueOnce(new ConflictException('VAT return has already been submitted'));

      const result = await service.bulkSubmit(ORG, ['a', 'b', 'a']);

      expect(submit).toHaveBeenCalledTimes(2);
      expect(result).toEqual({
        processed: 1,
        total: 2,
        failures: [{ id: 'b', reason: 'VAT return has already been submitted' }],
      });
    });

    it('bulkDelete reuses deleteReturn', async () => {
      const del = jest.spyOn(service, 'deleteReturn').mockResolvedValue({ message: 'ok' });
      const result = await service.bulkDelete(ORG, ['a', 'b']);
      expect(del).toHaveBeenCalledWith(ORG, 'a');
      expect(result).toEqual({ processed: 2, total: 2, failures: [] });
    });
  });

  describe('getDashboardStats', () => {
    it('sums Decimal amounts exactly and returns decimal strings', async () => {
      prisma.taxRate.findMany.mockResolvedValue([{ id: 't1', isActive: true }]);
      prisma.vATReturn.findMany.mockResolvedValue([
        { id: 'r1', status: 'CALCULATED', netPayable: dec('0.1'), dueDate: null },
        { id: 'r2', status: 'SUBMITTED', netPayable: dec('0.2'), dueDate: null },
        { id: 'r3', status: 'FILED', netPayable: dec('5'), dueDate: null },
      ]);
      prisma.vATPayment.findMany.mockResolvedValue([
        { amount: dec('0.1') },
        { amount: dec('0.2') },
      ]);

      const stats = await service.getDashboardStats(ORG);

      expect(stats.outstandingVAT).toBe('0.3000');
      expect(stats.totalPaid).toBe('0.3000');
      expect(stats.pendingReturns).toBe(1);
    });
  });
});
