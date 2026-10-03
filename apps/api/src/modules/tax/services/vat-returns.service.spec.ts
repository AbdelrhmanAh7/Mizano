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

type MockModel = Record<
  | 'findFirst'
  | 'findUnique'
  | 'findUniqueOrThrow'
  | 'findMany'
  | 'aggregate'
  | 'count'
  | 'create'
  | 'updateMany',
  jest.Mock
>;
type VatPrismaMock = Record<
  | 'organization'
  | 'account'
  | 'journal'
  | 'journalLine'
  | 'invoice'
  | 'bill'
  | 'vATReturn'
  | 'vATPayment'
  | 'taxRate',
  MockModel
> & { $transaction: jest.Mock; $executeRaw: jest.Mock; $queryRaw: jest.Mock };

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
  let prisma: VatPrismaMock;
  let journals: { create: jest.Mock };

  /** Ledger movements and document bases the figures are computed from. */
  function givenLedger(opts: {
    outputCredit: string;
    outputDebit?: string;
    inputDebit: string;
    inputCredit?: string;
    creditNotesNet?: string;
    salesBase?: string;
    purchasesBase?: string;
    purchasesCredit?: string;
  }): void {
    prisma.journalLine.aggregate.mockImplementation(
      async (args: {
        where: { accountId?: string; description?: { endsWith?: string }; OR?: unknown[] };
      }) => {
        if (args.where.OR) {
          return {
            _sum: {
              debit: dec(opts.purchasesBase ?? '400'),
              credit: dec(opts.purchasesCredit ?? '0'),
            },
          };
        }
        if (args.where.description?.endsWith === '- Sales Revenue') {
          return { _sum: { debit: dec('0'), credit: dec(opts.salesBase ?? '1000') } };
        }
        if (args.where.description) {
          return { _sum: { debit: dec(opts.creditNotesNet ?? '0'), credit: dec('0') } };
        }
        if (args.where.accountId === PAYABLE) {
          return { _sum: { debit: dec(opts.outputDebit ?? '0'), credit: dec(opts.outputCredit) } };
        }
        return { _sum: { debit: dec(opts.inputDebit), credit: dec(opts.inputCredit ?? '0') } };
      },
    );
  }

  beforeEach(async () => {
    prisma = createMockPrisma() as unknown as VatPrismaMock;
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
    // No invoice issue/void events in the window unless a test says otherwise.
    prisma.journal.findMany.mockResolvedValue([]);
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
      expect(prisma.vATReturn.findUniqueOrThrow).toHaveBeenCalledWith({
        where: { id: 'vr-1', organizationId: ORG, deletedAt: null },
      });

      const ledgerWhere = prisma.journalLine.aggregate.mock.calls[0][0].where;
      expect(ledgerWhere.journal).toEqual(
        expect.objectContaining({
          organizationId: ORG,
          isPosted: true,
          deletedAt: null,
          AND: [
            {
              OR: [
                { sourceType: null },
                { sourceType: { notIn: ['VAT_RETURN', 'VAT_PAYMENT', 'OPENING_BALANCE'] } },
              ],
            },
            { NOT: { journalNumber: 'OB-001', sourceType: null } },
            { NOT: { reversalOf: { is: { journalNumber: 'OB-001', sourceType: null } } } },
          ],
        }),
      );
    });

    it('excludes opening balance journals (and their reversals) from VAT activity', async () => {
      prisma.vATReturn.findFirst.mockResolvedValue(vatReturn({ status: 'DRAFT' }));
      prisma.vATReturn.updateMany.mockResolvedValue({ count: 1 });
      prisma.vATReturn.findUniqueOrThrow.mockResolvedValue({ id: 'vr-1' });
      givenLedger({ outputCredit: '10', inputDebit: '0' });
      await service.calculate(ORG, 'vr-1');
      const sources = prisma.journalLine.aggregate.mock.calls[0][0].where.journal.AND[0].OR[1];
      expect(sources.sourceType.notIn).toContain('OPENING_BALANCE');
    });

    it('subtracts credit notes issued in the period (net of VAT) from the sales base', async () => {
      prisma.vATReturn.findFirst.mockResolvedValue(vatReturn({ status: 'DRAFT' }));
      prisma.vATReturn.updateMany.mockResolvedValue({ count: 1 });
      prisma.vATReturn.findUniqueOrThrow.mockResolvedValue({ id: 'vr-1' });
      givenLedger({ outputCredit: '140.1', inputDebit: '56.2', creditNotesNet: '100.25' });

      await service.calculate(ORG, 'vr-1');

      const update = prisma.vATReturn.updateMany.mock.calls[0][0];
      // invoices 1000 - credit notes 100.25
      expect((update.data.totalSales as Decimal).toFixed(4)).toBe('899.7500');
      const creditNoteQuery = prisma.journalLine.aggregate.mock.calls.find(
        (c) => c[0].where.description?.endsWith === '- Sales Returns',
      )[0].where;
      expect(creditNoteQuery.journal.sourceType.in).toEqual(['CREDIT_NOTE', 'CREDIT_NOTE_VOID']);
      // Sales come from dated issue/void journals, so a later-voided invoice keeps its original
      // period base and the void reduces the period it is dated in.
      const salesQuery = prisma.journalLine.aggregate.mock.calls.find(
        (c) => c[0].where.description?.endsWith === '- Sales Revenue',
      )[0].where;
      expect(salesQuery.journal.OR).toEqual([
        { sourceType: { in: ['INVOICE_SEND', 'INVOICE_VOID'] } },
        { sourceType: null },
      ]);
      // No issue/void events in the window: the invoice table is not consulted at all.
      expect(prisma.invoice.aggregate).not.toHaveBeenCalled();
    });

    it('takes untaxed shipping back out of the sales base, dated on the issue/void journals', async () => {
      prisma.vATReturn.findFirst.mockResolvedValue(vatReturn({ status: 'DRAFT' }));
      prisma.vATReturn.updateMany.mockResolvedValue({ count: 1 });
      prisma.vATReturn.findUniqueOrThrow.mockResolvedValue({ id: 'vr-1' });
      givenLedger({ outputCredit: '140.1', inputDebit: '56.2' });
      prisma.journal.findMany.mockResolvedValue([
        { sourceType: 'INVOICE_SEND', sourceId: 'inv-1' },
        { sourceType: 'INVOICE_SEND', sourceId: 'inv-2' },
        { sourceType: 'INVOICE_VOID', sourceId: 'inv-9' },
      ]);
      prisma.invoice.aggregate.mockImplementation(
        async (args: { where: { id: { in: string[] } } }) => ({
          _sum: {
            shippingAmount: args.where.id.in.includes('inv-9') ? dec('10.25') : dec('30.5'),
          },
        }),
      );

      await service.calculate(ORG, 'vr-1');

      // Sales Revenue 1000 (subtotal + shipping) - shipping issued 30.5 + shipping voided 10.25
      const update = prisma.vATReturn.updateMany.mock.calls[0][0];
      expect((update.data.totalSales as Decimal).toFixed(4)).toBe('979.7500');
      const calls = prisma.invoice.aggregate.mock.calls.map((c) => c[0].where);
      expect(calls).toEqual(
        expect.arrayContaining([
          { organizationId: ORG, id: { in: ['inv-1', 'inv-2'] } },
          { organizationId: ORG, id: { in: ['inv-9'] } },
        ]),
      );
    });

    it('includes VAT on an account that was a default VAT account before', async () => {
      prisma.vATReturn.findFirst.mockResolvedValue(vatReturn({ status: 'DRAFT' }));
      prisma.vATReturn.updateMany.mockResolvedValue({ count: 1 });
      prisma.vATReturn.findUniqueOrThrow.mockResolvedValue({ id: 'vr-1' });
      prisma.journalLine.findMany
        .mockResolvedValueOnce([{ accountId: 'acc-old-payable' }])
        .mockResolvedValueOnce([]);
      prisma.journalLine.aggregate.mockImplementation(
        async (args: { where: { accountId: string } }) => {
          const credit: Record<string, string> = { [PAYABLE]: '100', 'acc-old-payable': '25.5' };
          return { _sum: { debit: dec('0'), credit: dec(credit[args.where.accountId] ?? '0') } };
        },
      );

      await service.calculate(ORG, 'vr-1');

      const update = prisma.vATReturn.updateMany.mock.calls[0][0];
      expect((update.data.outputVAT as Decimal).toFixed(4)).toBe('125.5000');
      const marker = prisma.journalLine.findMany.mock.calls[0][0].where;
      expect(marker.journal).toMatchObject({
        organizationId: ORG,
        isPosted: true,
        deletedAt: null,
      });
      expect(marker.journal.OR[0].sourceType.in).toEqual(
        expect.arrayContaining([
          'INVOICE_SEND',
          'BILL_APPROVAL',
          'CREDIT_NOTE',
          'EXPENSE',
          'VENDOR_CREDIT',
          'VAT_RETURN',
        ]),
      );
      expect(marker.journal.OR).toContainEqual({ sourceType: null });
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

    it('uses posted purchase and reversal lines in the tenant journal window, net of credits', async () => {
      prisma.vATReturn.findFirst.mockResolvedValue(vatReturn({ status: 'DRAFT' }));
      prisma.vATReturn.updateMany.mockResolvedValue({ count: 1 });
      prisma.vATReturn.findUniqueOrThrow.mockResolvedValue({ id: 'vr-1' });
      prisma.journalLine.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ accountId: 'historical-input-vat' }]);
      givenLedger({
        outputCredit: '0',
        inputDebit: '0',
        purchasesBase: '500',
        purchasesCredit: '600.2501',
      });

      await service.calculate(ORG, 'vr-1');

      const calls = prisma.journalLine.aggregate.mock.calls as Array<
        [{ where: { OR?: unknown[]; journal: unknown } }]
      >;
      const query = calls.find(([args]) => args.where.OR)?.[0].where;
      expect(query?.journal).toEqual({
        organizationId: ORG,
        isPosted: true,
        deletedAt: null,
        date: { gte: new Date('2026-01-01'), lt: new Date('2026-04-01') },
      });
      expect(query?.OR).toEqual(
        expect.arrayContaining([
          {
            journal: { sourceType: { in: ['BILL_APPROVAL', 'EXPENSE'] } },
            debit: { gt: dec('0') },
          },
          {
            journal: { sourceType: { in: ['BILL_VOID', 'EXPENSE_VOID'] } },
            credit: { gt: dec('0') },
          },
          { journal: { sourceType: 'VENDOR_CREDIT' }, credit: { gt: dec('0') } },
          { journal: { sourceType: 'VENDOR_CREDIT_VOID' }, debit: { gt: dec('0') } },
        ]),
      );
      expect(query).toHaveProperty('accountId', {
        notIn: [RECEIVABLE, 'historical-input-vat'],
      });
      expect(prisma.vATReturn.updateMany.mock.calls[0][0].data.totalPurchases.toFixed(4)).toBe(
        '-100.2501',
      );
      expect(prisma.bill.aggregate).not.toHaveBeenCalled();
    });

    it('recognizes legacy bill approval evidence and dates linked reversals independently', async () => {
      prisma.vATReturn.findFirst.mockResolvedValue(vatReturn({ status: 'DRAFT' }));
      prisma.vATReturn.updateMany.mockResolvedValue({ count: 1 });
      prisma.vATReturn.findUniqueOrThrow.mockResolvedValue({ id: 'vr-1' });
      givenLedger({ outputCredit: '0', inputDebit: '28', purchasesBase: '200' });

      await service.calculate(ORG, 'vr-1');

      const purchaseWhere = prisma.journalLine.aggregate.mock.calls.find(
        ([args]) => args.where.OR,
      )?.[0].where;
      const legacy = {
        sourceType: null,
        reversalOfId: null,
        isPosted: true,
        deletedAt: null,
        reference: { startsWith: 'Bill ' },
        lines: {
          some: {
            credit: { gt: dec('0') },
            description: { startsWith: 'Bill ', endsWith: '- Accounts Payable' },
          },
        },
      };
      expect(purchaseWhere.OR).toEqual(
        expect.arrayContaining([
          { journal: legacy, debit: { gt: dec('0') } },
          {
            journal: { sourceType: null, reversalOf: { is: { ...legacy, organizationId: ORG } } },
            credit: { gt: dec('0') },
          },
        ]),
      );
      expect(purchaseWhere.journal.date).toEqual({
        gte: new Date('2026-01-01'),
        lt: new Date('2026-04-01'),
      });
      expect(prisma.vATReturn.updateMany.mock.calls[0][0].data.totalPurchases.toFixed(4)).toBe(
        '200.0000',
      );
    });

    it('calculates a zero purchase base when the journal window has no purchase lines', async () => {
      prisma.vATReturn.findFirst.mockResolvedValue(vatReturn({ status: 'DRAFT' }));
      prisma.vATReturn.updateMany.mockResolvedValue({ count: 1 });
      prisma.vATReturn.findUniqueOrThrow.mockResolvedValue({ id: 'vr-1' });
      prisma.journalLine.aggregate.mockResolvedValue({ _sum: { debit: null, credit: null } });

      await service.calculate(ORG, 'vr-1');

      expect(prisma.vATReturn.updateMany.mock.calls[0][0].data.totalPurchases.toFixed(4)).toBe(
        '0.0000',
      );
      expect(prisma.bill.aggregate).not.toHaveBeenCalled();
    });

    it.each([
      { purchasesBase: '1000000000000000', purchasesCredit: '0' },
      { purchasesBase: '0', purchasesCredit: '1000000000000000' },
    ])(
      'rejects purchase aggregates outside Decimal(19,4) before writing (%s)',
      async (purchases) => {
        prisma.vATReturn.findFirst.mockResolvedValue(vatReturn({ status: 'DRAFT' }));
        givenLedger({ outputCredit: '0', inputDebit: '0', ...purchases });
        await expect(service.calculate(ORG, 'vr-1')).rejects.toThrow('totalPurchases is too large');
        expect(prisma.vATReturn.updateMany).not.toHaveBeenCalled();
      },
    );

    it('keeps all four places at the largest valid purchase aggregate', async () => {
      prisma.vATReturn.findFirst.mockResolvedValue(vatReturn({ status: 'DRAFT' }));
      prisma.vATReturn.updateMany.mockResolvedValue({ count: 1 });
      prisma.vATReturn.findUniqueOrThrow.mockResolvedValue({ id: 'vr-1' });
      givenLedger({ outputCredit: '0', inputDebit: '0', purchasesBase: '999999999999999.9999' });
      await service.calculate(ORG, 'vr-1');
      expect(prisma.vATReturn.updateMany.mock.calls[0][0].data.totalPurchases.toFixed(4)).toBe(
        '999999999999999.9999',
      );
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
      const debits = dto.lines.reduce(
        (s: Decimal, l: { debit: string }) => s.add(l.debit),
        dec('0'),
      );
      const credits = dto.lines.reduce(
        (s: Decimal, l: { credit: string }) => s.add(l.credit),
        dec('0'),
      );
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

    it('rejects when only the sales or purchases base moved (zero-rated document posted)', async () => {
      prisma.vATReturn.findUniqueOrThrow.mockResolvedValueOnce(vatReturn());
      givenLedger({ outputCredit: '140.1', inputDebit: '56.2', salesBase: '1500' });
      await expect(service.submit(ORG, 'vr-1')).rejects.toThrow('recalculate');

      prisma.vATReturn.findUniqueOrThrow.mockResolvedValueOnce(vatReturn());
      givenLedger({ outputCredit: '140.1', inputDebit: '56.2', purchasesBase: '999' });
      await expect(service.submit(ORG, 'vr-1')).rejects.toThrow('recalculate');
      expect(journals.create).not.toHaveBeenCalled();
    });

    it('rejects when purchase credits change the base without changing VAT', async () => {
      prisma.vATReturn.findUniqueOrThrow.mockResolvedValueOnce(vatReturn());
      givenLedger({
        outputCredit: '140.1',
        inputDebit: '56.2',
        purchasesBase: '400',
        purchasesCredit: '0.0001',
      });

      await expect(service.submit(ORG, 'vr-1')).rejects.toThrow('recalculate');
      expect(journals.create).not.toHaveBeenCalled();
      // The guarded transition acquires the row lock before the comparison; the real
      // transaction rolls it back on rejection (covered by the VAT purchase E2E).
      expect(prisma.vATReturn.updateMany).toHaveBeenCalledTimes(1);
      expect(prisma.organization.updateMany).not.toHaveBeenCalled();
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
      prisma.account.findFirst.mockResolvedValue({ id: BANK });
      prisma.journal.findFirst.mockResolvedValue({
        lines: [
          { accountId: PAYABLE, credit: dec('0'), description: 'VAT-001 - Output VAT cleared' },
          {
            accountId: PAYABLE,
            credit: dec('83.9'),
            description: 'VAT-001 - VAT payable to tax authority',
          },
        ],
      });
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

    it('requires an eligible bank/cash account of the tenant (shared sales rule)', async () => {
      await service.recordPayment(ORG, 'vr-1', dto);
      expect(prisma.$queryRaw).toHaveBeenCalled();
      const where = prisma.account.findFirst.mock.calls[0][0].where;
      expect(where.AND[0]).toEqual({ id: BANK });
      expect(where.AND[1]).toMatchObject({
        organizationId: ORG,
        type: 'ASSET',
        isActive: true,
        deletedAt: null,
      });
    });

    it('debits the payable account the settlement credited, not the current default', async () => {
      prisma.organization.findUnique.mockResolvedValue({
        defaultVatPayableAccountId: 'acc-new-default-payable',
        defaultVatReceivableAccountId: RECEIVABLE,
        defaultBankAccountId: BANK,
        baseCurrency: 'EGP',
      });
      await service.recordPayment(ORG, 'vr-1', dto);
      expect(prisma.journal.findFirst.mock.calls[0][0].where).toMatchObject({
        organizationId: ORG,
        sourceType: 'VAT_RETURN',
        sourceId: 'vr-1',
      });
      expect(journals.create.mock.calls[0][1].lines[0]).toEqual(
        expect.objectContaining({ accountId: PAYABLE, debit: '83.9000' }),
      );
    });

    it('refuses to pay when the settlement journal cannot be found', async () => {
      prisma.journal.findFirst.mockResolvedValue(null);
      await expect(service.recordPayment(ORG, 'vr-1', dto)).rejects.toThrow('settlement journal');
      expect(journals.create).not.toHaveBeenCalled();
    });

    it('lists the eligible payment accounts with the same rule', async () => {
      prisma.account.findMany.mockResolvedValue([{ id: BANK, code: '1010', name: 'Bank' }]);
      const res = await service.paymentAccounts(ORG);
      expect(res).toHaveLength(1);
      expect(prisma.account.findMany.mock.calls[0][0].where).toMatchObject({
        organizationId: ORG,
        type: 'ASSET',
      });
    });

    it('takes the ledger lock first, then locks the return row (same order as submit)', async () => {
      await service.recordPayment(ORG, 'vr-1', dto);
      expect(prisma.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.$queryRaw.mock.invocationCallOrder[0],
      );
      expect(prisma.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.vATReturn.findFirst.mock.invocationCallOrder[0],
      );
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
      expect(prisma.account.findFirst.mock.calls[0][0].where.AND[1].organizationId).toBe(ORG);

      prisma.account.findFirst.mockResolvedValue({ id: PAYABLE });
      await expect(service.recordPayment(ORG, 'vr-1', dto)).rejects.toThrow('must differ');
    });
  });

  describe('create', () => {
    it('checks overlap and inserts in one transaction, after taking the return lock', async () => {
      prisma.vATReturn.findFirst.mockResolvedValue(null);
      prisma.$queryRaw.mockResolvedValue([{ max: 1 }]);
      prisma.vATReturn.create.mockResolvedValue({ id: 'vr-new' });

      await service.create(ORG, { startDate: '2026-04-01', endDate: '2026-04-30' });

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      const lock = prisma.$executeRaw.mock.invocationCallOrder[0];
      expect(lock).toBeLessThan(prisma.vATReturn.findFirst.mock.invocationCallOrder[0]);
      expect(prisma.vATReturn.findFirst.mock.invocationCallOrder[1]).toBeLessThan(
        prisma.vATReturn.create.mock.invocationCallOrder[0],
      );
    });

    it('rejects an overlapping period', async () => {
      prisma.vATReturn.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ returnNumber: 'VAT-001', period: 'x' });
      await expect(
        service.create(ORG, { startDate: '2026-04-15', endDate: '2026-05-15' }),
      ).rejects.toThrow('overlaps VAT return VAT-001');
      expect(prisma.vATReturn.create).not.toHaveBeenCalled();
    });
  });

  describe('fileReturn', () => {
    it('files a submitted return with nothing to pay, guarded, without a journal', async () => {
      prisma.vATReturn.updateMany.mockResolvedValue({ count: 1 });
      prisma.vATReturn.findUniqueOrThrow.mockResolvedValue({ id: 'vr-1', status: 'FILED' });
      await service.fileReturn(ORG, 'vr-1');
      expect(prisma.vATReturn.updateMany.mock.calls[0][0]).toEqual(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'vr-1',
            organizationId: ORG,
            status: 'SUBMITTED',
            netPayable: { lte: 0 },
          }),
          data: expect.objectContaining({ status: 'FILED' }),
        }),
      );
      expect(journals.create).not.toHaveBeenCalled();
    });

    it('refuses a return with VAT payable (payment files it)', async () => {
      prisma.vATReturn.updateMany.mockResolvedValue({ count: 0 });
      prisma.vATReturn.findFirst.mockResolvedValue({ status: 'SUBMITTED', netPayable: dec('5') });
      await expect(service.fileReturn(ORG, 'vr-1')).rejects.toThrow('record its payment');
    });

    it('refuses a return that is not submitted and hides other tenants', async () => {
      prisma.vATReturn.updateMany.mockResolvedValue({ count: 0 });
      prisma.vATReturn.findFirst.mockResolvedValue({ status: 'FILED', netPayable: dec('0') });
      await expect(service.fileReturn(ORG, 'vr-1')).rejects.toThrow('Only a submitted');
      prisma.vATReturn.findFirst.mockResolvedValue(null);
      await expect(service.fileReturn('other', 'vr-1')).rejects.toThrow('not found');
    });
  });

  describe('bulk operations', () => {
    it('bulkSubmit submits older periods first even when ids arrive newest-first', async () => {
      prisma.vATReturn.findMany = jest.fn().mockResolvedValue([
        { id: 'mar', periodEnd: new Date('2025-03-31'), endDate: new Date('2025-03-31') },
        { id: 'jan', periodEnd: new Date('2025-01-31'), endDate: new Date('2025-01-31') },
        { id: 'feb', periodEnd: null, endDate: new Date('2025-02-28') },
      ]);
      const order: string[] = [];
      jest.spyOn(service, 'submit').mockImplementation(async (_org, id) => {
        order.push(id);
        return {} as never;
      });

      const result = await service.bulkSubmit(ORG, ['mar', 'feb', 'jan']);

      expect(order).toEqual(['jan', 'feb', 'mar']);
      expect(result.processed).toBe(3);
    });

    it('bulkSubmit reuses submit and reports per-record outcomes', async () => {
      prisma.vATReturn.findMany = jest.fn().mockResolvedValue([
        { id: 'a', periodEnd: new Date('2025-01-31'), endDate: new Date('2025-01-31') },
        { id: 'b', periodEnd: new Date('2025-02-28'), endDate: new Date('2025-02-28') },
      ]);
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
