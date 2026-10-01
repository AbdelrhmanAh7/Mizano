import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { CreditNotesService } from './credit-notes.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { JournalsService } from '../../accounting/services/journals.service';
import { InvoicesService } from './invoices.service';
import { createMockPrisma, MockPrismaClient } from '../../../test/mocks/prisma.mock';
import { dec } from '../../../test/helpers/decimal.helpers';
import { Decimal } from '@prisma/client/runtime/library';

const mockFindMany = jest.fn();
const mockCount = jest.fn();

const prismaServiceMock = {
  creditNote: { findMany: mockFindMany, count: mockCount },
};

describe('CreditNotesService.findAll', () => {
  let service: CreditNotesService;

  beforeEach(async () => {
    mockFindMany.mockReset();
    mockCount.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreditNotesService,
        { provide: PrismaService, useValue: prismaServiceMock },
        { provide: JournalsService, useValue: {} },
        { provide: InvoicesService, useValue: {} },
      ],
    }).compile();

    service = module.get<CreditNotesService>(CreditNotesService);
  });

  it('filters by customerId when provided', async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    await service.findAll('org-1', { customerId: 'cust-abc', limit: 10 });

    const whereArg = mockFindMany.mock.calls[0][0].where;
    expect(whereArg.customerId).toBe('cust-abc');
    expect(whereArg.organizationId).toBe('org-1');
    expect(whereArg.deletedAt).toBeNull();
  });

  it('does not add customerId to where when not provided', async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    await service.findAll('org-1', {});

    const whereArg = mockFindMany.mock.calls[0][0].where;
    expect(whereArg.customerId).toBeUndefined();
  });

  it('respects limit parameter', async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    await service.findAll('org-1', { limit: 10 });

    expect(mockFindMany.mock.calls[0][0].take).toBe(10);
  });

  it('returns paginated response shape', async () => {
    mockFindMany.mockResolvedValue([{ id: 'cn-1' }]);
    mockCount.mockResolvedValue(1);

    const result = await service.findAll('org-1', {});

    expect(result).toEqual({
      data: [{ id: 'cn-1' }],
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
  });
});

const ORG_ID = 'org-test-001';

function invoiceRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'inv-1',
    invoiceNumber: 'INV-0001',
    organizationId: ORG_ID,
    customerId: 'cust-1',
    status: 'SENT',
    subtotal: dec('1000'),
    taxAmount: dec('140'),
    grandTotal: dec('1140'),
    balanceDue: dec('1140'),
    deletedAt: null,
    ...overrides,
  };
}

describe('CreditNotesService (posting)', () => {
  let service: CreditNotesService;
  let prisma: MockPrismaClient;
  let invoicesService: { lockInvoices: jest.Mock; recalculateBalance: jest.Mock };
  let journalsService: { create: jest.Mock; reverse: jest.Mock };

  const orgAccounts = {
    defaultArAccountId: 'ar',
    defaultSalesReturnsAccountId: 'returns',
    defaultVatPayableAccountId: 'vat',
  };

  beforeEach(async () => {
    prisma = createMockPrisma();
    invoicesService = {
      lockInvoices: jest.fn().mockResolvedValue(undefined),
      recalculateBalance: jest.fn().mockResolvedValue(undefined),
    };
    journalsService = {
      create: jest.fn().mockResolvedValue({}),
      reverse: jest.fn().mockResolvedValue({}),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreditNotesService,
        { provide: PrismaService, useValue: prisma },
        { provide: InvoicesService, useValue: invoicesService },
        { provide: JournalsService, useValue: journalsService },
      ],
    }).compile();
    service = module.get(CreditNotesService);
  });

  describe('create', () => {
    const dto = {
      customerId: 'cust-1',
      invoiceId: 'inv-1',
      date: '2024-08-01',
      reason: 'Returned goods',
      amount: '570',
      type: 'APPLY_TO_INVOICE' as const,
    };
    const refundDto = {
      ...dto,
      type: 'REFUND' as const,
      refundAccountId: 'bank-1',
    };

    let existingCredits: Decimal | null;
    let refundedCredits: Decimal | null;

    beforeEach(() => {
      existingCredits = null;
      refundedCredits = null;
      prisma.invoice.count.mockResolvedValue(1);
      prisma.invoice.findFirst.mockResolvedValue(invoiceRow() as any);
      prisma.creditNote.aggregate.mockImplementation(((args: any) =>
        Promise.resolve({
          _sum: { amount: args.where.type ? refundedCredits : existingCredits },
        })) as any);
      prisma.paymentAllocation.findMany.mockResolvedValue([{ amount: dec('1140') }] as any);
      prisma.account.findFirst.mockResolvedValue({ id: 'bank-1' } as any);
      prisma.organization.findUnique.mockResolvedValue(orgAccounts as any);
      prisma.$queryRaw.mockResolvedValue([{ max: 2 }] as any);
      prisma.creditNote.create.mockImplementation((async (args: any) => ({
        id: 'cn-1',
        ...args.data,
      })) as any);
    });

    function journalCall() {
      return journalsService.create.mock.calls[0] as [
        string,
        { date: string; lines: Array<Record<string, string>> },
        { tx: unknown; source: { type: string; id: string } },
      ];
    }

    function expectBalanced(lines: Array<Record<string, string>>) {
      const debit = lines.reduce((s, l) => s.add(l.debit), new Decimal(0));
      const credit = lines.reduce((s, l) => s.add(l.credit), new Decimal(0));
      expect(debit.equals(credit)).toBe(true);
    }

    it('posts Dr Sales Returns / Dr VAT / Cr AR, splitting VAT proportionally', async () => {
      await service.create(ORG_ID, dto);

      // 570 / 1140 of the 140 VAT = 70; net = 500
      const [, journal, options] = journalCall();
      expect(journal.lines).toEqual([
        expect.objectContaining({ accountId: 'returns', debit: '500.0000', credit: '0' }),
        expect.objectContaining({ accountId: 'vat', debit: '70.0000', credit: '0' }),
        expect.objectContaining({ accountId: 'ar', debit: '0', credit: '570.0000' }),
      ]);
      expectBalanced(journal.lines);
      expect(options).toEqual({ tx: prisma, source: { type: 'CREDIT_NOTE', id: 'cn-1' } });
      // Dated on the credit note's own date.
      expect(journal.date).toBe(new Date('2024-08-01').toISOString());
      expect(journalsService.create).toHaveBeenCalledTimes(1);
    });

    it('numbers the note CN-nnn from the per-organization maximum and stores Decimal', async () => {
      await service.create(ORG_ID, dto);

      const data = prisma.creditNote.create.mock.calls[0][0].data as any;
      expect(data.creditNoteNumber).toBe('CN-003');
      expect(data.organizationId).toBe(ORG_ID);
      expect(data.amount).toBeInstanceOf(Decimal);
      expect(data.appliedToInvoiceId).toBe('inv-1'); // defaults to the credited invoice
    });

    it('applies to the invoice: locks it, then recalculates the balance', async () => {
      await service.create(ORG_ID, dto);

      expect(invoicesService.lockInvoices).toHaveBeenCalledWith(prisma, ['inv-1']);
      expect(invoicesService.recalculateBalance).toHaveBeenCalledWith(prisma, 'inv-1');
    });

    it('rounds the VAT share to 4 decimals and still balances', async () => {
      prisma.invoice.findFirst.mockResolvedValue(
        invoiceRow({ taxAmount: dec('1'), grandTotal: dec('3'), balanceDue: dec('3') }) as any,
      );

      await service.create(ORG_ID, { ...dto, amount: '1' });

      const { lines } = journalCall()[1];
      expect(lines[0]).toMatchObject({ accountId: 'returns', debit: '0.6667' });
      expect(lines[1]).toMatchObject({ accountId: 'vat', debit: '0.3333' });
      expect(lines[2]).toMatchObject({ accountId: 'ar', credit: '1.0000' });
      expectBalanced(lines);
    });

    it('omits the VAT line for an untaxed invoice and does not need a VAT account', async () => {
      prisma.invoice.findFirst.mockResolvedValue(
        invoiceRow({
          taxAmount: dec('0'),
          grandTotal: dec('1000'),
          balanceDue: dec('1000'),
        }) as any,
      );
      prisma.organization.findUnique.mockResolvedValue({
        ...orgAccounts,
        defaultVatPayableAccountId: null,
      } as any);

      await service.create(ORG_ID, { ...dto, amount: '100' });

      expect(journalCall()[1].lines).toHaveLength(2);
    });

    it('requires the VAT Payable account when the credit carries VAT', async () => {
      prisma.organization.findUnique.mockResolvedValue({
        ...orgAccounts,
        defaultVatPayableAccountId: null,
      } as any);

      await expect(service.create(ORG_ID, dto)).rejects.toThrow(/VAT Payable/);
      expect(prisma.creditNote.create).not.toHaveBeenCalled();
      expect(journalsService.create).not.toHaveBeenCalled();
    });

    it('requires the AR and Sales Returns accounts', async () => {
      prisma.organization.findUnique.mockResolvedValue({
        ...orgAccounts,
        defaultSalesReturnsAccountId: null,
      } as any);
      await expect(service.create(ORG_ID, dto)).rejects.toThrow(/Sales Returns/);

      prisma.organization.findUnique.mockResolvedValue({
        ...orgAccounts,
        defaultArAccountId: null,
      } as any);
      await expect(service.create(ORG_ID, dto)).rejects.toThrow(/Accounts Receivable/);
      expect(prisma.creditNote.create).not.toHaveBeenCalled();
    });

    it('caps total live credit notes on an invoice at its grand total', async () => {
      existingCredits = dec('600');
      await expect(service.create(ORG_ID, dto)).rejects.toThrow('would exceed the total');
      expect(prisma.creditNote.create).not.toHaveBeenCalled();

      // Exactly reaching the total is allowed.
      existingCredits = dec('570');
      await service.create(ORG_ID, dto);
      expect(prisma.creditNote.create).toHaveBeenCalledTimes(1);
      expect(prisma.creditNote.aggregate.mock.calls[0][0]!.where).toMatchObject({
        organizationId: ORG_ID,
        invoiceId: 'inv-1',
        deletedAt: null,
      });
    });

    it('rejects an invoice from another organization before taking any lock', async () => {
      prisma.invoice.count.mockResolvedValue(0);

      await expect(service.create(ORG_ID, dto)).rejects.toThrow('Invoice not found');
      expect(prisma.invoice.count.mock.calls[0][0]!.where).toMatchObject({
        organizationId: ORG_ID,
        deletedAt: null,
      });
      expect(invoicesService.lockInvoices).not.toHaveBeenCalled();
    });

    it('rejects another customer, and draft or void invoices', async () => {
      await expect(service.create(ORG_ID, { ...dto, customerId: 'other' })).rejects.toThrow(
        'does not belong to this customer',
      );
      for (const status of ['DRAFT', 'VOID']) {
        prisma.invoice.findFirst.mockResolvedValue(invoiceRow({ status }) as any);
        await expect(service.create(ORG_ID, dto)).rejects.toThrow('sent invoice');
      }
      expect(prisma.creditNote.create).not.toHaveBeenCalled();
    });

    it('rejects non-positive and malformed amounts', async () => {
      for (const amount of ['0', '-1', 'abc', '1.00001']) {
        await expect(service.create(ORG_ID, { ...dto, amount })).rejects.toThrow(
          BadRequestException,
        );
      }
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    describe('APPLY_TO_INVOICE targets', () => {
      it('applies to another invoice of the same customer after locking both', async () => {
        prisma.invoice.findFirst.mockImplementation(((args: any) =>
          Promise.resolve(
            args.where.id === 'inv-1'
              ? invoiceRow({ status: 'PAID', balanceDue: dec('0') })
              : invoiceRow({ id: 'inv-2', invoiceNumber: 'INV-0002' }),
          )) as any);
        prisma.invoice.count.mockResolvedValue(2);

        await service.create(ORG_ID, { ...dto, appliedToInvoiceId: 'inv-2' });

        expect(invoicesService.lockInvoices).toHaveBeenCalledWith(prisma, ['inv-1', 'inv-2']);
        expect(prisma.creditNote.create.mock.calls[0][0].data).toMatchObject({
          invoiceId: 'inv-1',
          appliedToInvoiceId: 'inv-2',
        });
        expect(invoicesService.recalculateBalance).toHaveBeenCalledWith(prisma, 'inv-2');
      });

      it('rejects a target that is another customer, closed, or smaller than the credit', async () => {
        prisma.invoice.count.mockResolvedValue(2);
        const target = (o: Record<string, unknown>) =>
          prisma.invoice.findFirst.mockImplementation(((args: any) =>
            Promise.resolve(
              args.where.id === 'inv-1' ? invoiceRow() : invoiceRow({ id: 'inv-2', ...o }),
            )) as any);

        target({ customerId: 'other' });
        await expect(
          service.create(ORG_ID, { ...dto, appliedToInvoiceId: 'inv-2' }),
        ).rejects.toThrow('different customer');
        target({ status: 'PAID', balanceDue: dec('0') });
        await expect(
          service.create(ORG_ID, { ...dto, appliedToInvoiceId: 'inv-2' }),
        ).rejects.toThrow('not open for credit');
        target({ balanceDue: dec('569.99') });
        await expect(
          service.create(ORG_ID, { ...dto, appliedToInvoiceId: 'inv-2' }),
        ).rejects.toThrow('exceeds the balance due');
        expect(prisma.creditNote.create).not.toHaveBeenCalled();
      });

      it('rejects a credit larger than the balance due of the credited invoice itself', async () => {
        prisma.invoice.findFirst.mockResolvedValue(invoiceRow({ balanceDue: dec('100') }) as any);
        await expect(service.create(ORG_ID, dto)).rejects.toThrow('exceeds the balance due');
      });

      it('rejects a target invoice of another organization', async () => {
        prisma.invoice.count.mockResolvedValue(1); // only inv-1 is ours
        await expect(
          service.create(ORG_ID, { ...dto, appliedToInvoiceId: 'foreign' }),
        ).rejects.toThrow('Invoice not found');
        expect(invoicesService.lockInvoices).not.toHaveBeenCalled();
      });

      it('rejects a refund account on an apply credit', async () => {
        await expect(service.create(ORG_ID, { ...dto, refundAccountId: 'bank-1' })).rejects.toThrow(
          'only valid for REFUND',
        );
      });
    });

    describe('REFUND', () => {
      it('credits the refund account instead of AR and leaves invoice balances alone', async () => {
        await service.create(ORG_ID, refundDto);

        const { lines } = journalCall()[1];
        expect(lines).toEqual([
          expect.objectContaining({ accountId: 'returns', debit: '500.0000' }),
          expect.objectContaining({ accountId: 'vat', debit: '70.0000' }),
          expect.objectContaining({ accountId: 'bank-1', credit: '570.0000' }),
        ]);
        expect(lines.some((l) => l.accountId === 'ar')).toBe(false);
        expectBalanced(lines);
        expect(prisma.creditNote.create.mock.calls[0][0].data).toMatchObject({
          type: 'REFUND',
          appliedToInvoiceId: undefined,
        });
        expect(invoicesService.recalculateBalance).not.toHaveBeenCalled();
      });

      it('requires a refund account and rejects applying it to an invoice', async () => {
        await expect(
          service.create(ORG_ID, { ...refundDto, refundAccountId: undefined }),
        ).rejects.toThrow('Choose the bank or cash account');
        await expect(
          service.create(ORG_ID, { ...refundDto, appliedToInvoiceId: 'inv-1' }),
        ).rejects.toThrow('Only APPLY_TO_INVOICE');
      });

      it('only accepts an active bank/cash ASSET account of the organization as refund account', async () => {
        prisma.account.findFirst.mockResolvedValue(null);
        await expect(service.create(ORG_ID, refundDto)).rejects.toThrow(
          'active bank or cash account',
        );
        const where = prisma.account.findFirst.mock.calls[0][0]!.where as any;
        expect(where.AND[0]).toEqual({ id: 'bank-1' });
        expect(where.AND[1]).toMatchObject({
          organizationId: ORG_ID,
          isActive: true,
          deletedAt: null,
          type: 'ASSET',
        });
        expect(prisma.creditNote.create).not.toHaveBeenCalled();
      });

      it('stamps refundedAt with the document date in the same transaction', async () => {
        await service.create(ORG_ID, refundDto);
        expect(prisma.creditNote.create.mock.calls[0][0].data.refundedAt).toEqual(
          new Date('2024-08-01'),
        );
      });

      it('does not set refundedAt on an apply-to-invoice credit', async () => {
        await service.create(ORG_ID, dto);
        expect(prisma.creditNote.create.mock.calls[0][0].data.refundedAt).toBeUndefined();
      });

      it('rejects an amount beyond Decimal(19, 4) integer digits', async () => {
        await expect(
          service.create(ORG_ID, { ...refundDto, amount: '1000000000000000' }),
        ).rejects.toThrow('too large');
      });

      it('cannot refund more than the customer paid on the invoice', async () => {
        prisma.paymentAllocation.findMany.mockResolvedValue([{ amount: dec('500') }] as any);
        await expect(service.create(ORG_ID, refundDto)).rejects.toThrow(
          'exceeds the amount received',
        );

        // Earlier refunds count against what was received.
        prisma.paymentAllocation.findMany.mockResolvedValue([{ amount: dec('1140') }] as any);
        refundedCredits = dec('600');
        await expect(service.create(ORG_ID, refundDto)).rejects.toThrow(
          'exceeds the amount received',
        );
        expect(prisma.creditNote.create).not.toHaveBeenCalled();
      });
    });

    it('commits the note, the balance and the journal together; a journal failure rolls back', async () => {
      const committed: string[] = [];
      let pending: string[] = [];
      (prisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => {
        pending = [];
        const result = await fn(prisma);
        committed.push(...pending);
        return result;
      });
      prisma.creditNote.create.mockImplementation((async (args: any) => {
        pending.push('creditNote');
        return { id: 'cn-1', ...args.data };
      }) as any);
      invoicesService.recalculateBalance.mockImplementation(async () => {
        pending.push('invoice.balance');
      });

      journalsService.create.mockRejectedValue(new BadRequestException('This period is locked'));
      await expect(service.create(ORG_ID, dto)).rejects.toThrow('This period is locked');
      expect(committed).toEqual([]);

      journalsService.create.mockResolvedValue({});
      await service.create(ORG_ID, dto);
      expect(committed).toEqual(['creditNote', 'invoice.balance']);
    });
  });

  describe('update', () => {
    it('only changes the reason of a live credit note in the tenant', async () => {
      prisma.creditNote.updateMany.mockResolvedValue({ count: 1 });
      prisma.creditNote.findFirstOrThrow.mockResolvedValue({ id: 'cn-1' } as any);

      await service.update(ORG_ID, 'cn-1', { reason: 'Corrected' });

      expect(prisma.creditNote.updateMany).toHaveBeenCalledWith({
        where: { id: 'cn-1', organizationId: ORG_ID, deletedAt: null },
        data: { reason: 'Corrected' },
      });
    });

    it('treats another tenant note as not found', async () => {
      prisma.creditNote.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.update(ORG_ID, 'foreign', { reason: 'x' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('void / remove', () => {
    beforeEach(() => {
      prisma.creditNote.findFirst.mockResolvedValue({
        id: 'cn-1',
        appliedToInvoiceId: 'inv-1',
      } as any);
      prisma.creditNote.updateMany.mockResolvedValue({ count: 1 });
      prisma.journal.findFirst.mockResolvedValue({ id: 'j-cn' } as any);
    });

    it('soft-deletes, restores the invoice balance and posts a linked CREDIT_NOTE_VOID reversal', async () => {
      const result = await service.remove(ORG_ID, 'cn-1');

      expect(result.message).toBe('Credit note voided successfully');
      expect(invoicesService.lockInvoices).toHaveBeenCalledWith(prisma, ['inv-1']);
      expect(prisma.creditNote.updateMany).toHaveBeenCalledWith({
        where: { id: 'cn-1', organizationId: ORG_ID, deletedAt: null },
        data: { deletedAt: expect.any(Date) },
      });
      expect(invoicesService.recalculateBalance).toHaveBeenCalledWith(prisma, 'inv-1');
      expect(prisma.journal.findFirst.mock.calls[0][0]!.where).toMatchObject({
        organizationId: ORG_ID,
        sourceType: 'CREDIT_NOTE',
        sourceId: 'cn-1',
      });
      expect(journalsService.reverse).toHaveBeenCalledWith(ORG_ID, 'j-cn', undefined, {
        tx: prisma,
        source: { type: 'CREDIT_NOTE_VOID', id: 'cn-1' },
      });
    });

    it('does not lock or recalculate for a refund note that was never applied', async () => {
      prisma.creditNote.findFirst.mockResolvedValue({
        id: 'cn-1',
        appliedToInvoiceId: null,
      } as any);

      await service.void(ORG_ID, 'cn-1');

      expect(invoicesService.recalculateBalance).not.toHaveBeenCalled();
      expect(journalsService.reverse).toHaveBeenCalledTimes(1);
    });

    it('refuses a legacy credit note without a linked journal', async () => {
      prisma.journal.findFirst.mockResolvedValue(null);

      await expect(service.void(ORG_ID, 'cn-1')).rejects.toThrow('no linked ledger entry');
      expect(journalsService.reverse).not.toHaveBeenCalled();
    });

    it('treats another tenant note, or one already voided, as not found', async () => {
      prisma.creditNote.findFirst.mockResolvedValue(null);
      await expect(service.void(ORG_ID, 'foreign')).rejects.toThrow(NotFoundException);

      prisma.creditNote.findFirst.mockResolvedValue({
        id: 'cn-1',
        appliedToInvoiceId: null,
      } as any);
      prisma.creditNote.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.void(ORG_ID, 'cn-1')).rejects.toThrow(NotFoundException);
      expect(journalsService.reverse).not.toHaveBeenCalled();
    });

    it('bulkDelete voids per record and reports failures', async () => {
      prisma.creditNote.findFirst.mockImplementation(((args: any) =>
        Promise.resolve(
          args.where.id === 'cn-1' ? { id: 'cn-1', appliedToInvoiceId: null } : null,
        )) as any);

      const result = await service.bulkDelete(ORG_ID, ['cn-1', 'foreign']);

      expect(result).toEqual({
        processed: 1,
        total: 2,
        failures: [{ id: 'foreign', reason: 'Credit note not found' }],
      });
    });
  });

  describe('apply', () => {
    beforeEach(() => {
      prisma.creditNote.findFirst.mockResolvedValue({
        id: 'cn-1',
        type: 'APPLY_TO_INVOICE',
        customerId: 'cust-1',
        amount: dec('200'),
        appliedToInvoiceId: null,
      } as any);
      prisma.invoice.count.mockResolvedValue(1);
      prisma.invoice.findFirst.mockResolvedValue(invoiceRow() as any);
      prisma.creditNote.updateMany.mockResolvedValue({ count: 1 });
      prisma.creditNote.findUniqueOrThrow.mockResolvedValue({ id: 'cn-1' } as any);
    });

    it('attaches the note to the invoice and recalculates without posting a journal', async () => {
      await service.apply(ORG_ID, 'cn-1', 'inv-1');

      expect(invoicesService.lockInvoices).toHaveBeenCalledWith(prisma, ['inv-1']);
      expect(prisma.creditNote.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'cn-1',
          organizationId: ORG_ID,
          deletedAt: null,
          appliedToInvoiceId: null,
          type: 'APPLY_TO_INVOICE',
        },
        data: { appliedToInvoiceId: 'inv-1' },
      });
      expect(invoicesService.recalculateBalance).toHaveBeenCalledWith(prisma, 'inv-1');
      expect(journalsService.create).not.toHaveBeenCalled();
    });

    it('rejects an already applied note, a refund note, or a concurrent apply', async () => {
      prisma.creditNote.findFirst.mockResolvedValue({
        id: 'cn-1',
        type: 'APPLY_TO_INVOICE',
        customerId: 'cust-1',
        amount: dec('200'),
        appliedToInvoiceId: 'inv-9',
      } as any);
      await expect(service.apply(ORG_ID, 'cn-1', 'inv-1')).rejects.toThrow('already applied');

      prisma.creditNote.findFirst.mockResolvedValue({
        id: 'cn-1',
        type: 'REFUND',
        customerId: 'cust-1',
        amount: dec('200'),
        appliedToInvoiceId: null,
      } as any);
      await expect(service.apply(ORG_ID, 'cn-1', 'inv-1')).rejects.toThrow('Only APPLY_TO_INVOICE');

      prisma.creditNote.findFirst.mockResolvedValue({
        id: 'cn-1',
        type: 'APPLY_TO_INVOICE',
        customerId: 'cust-1',
        amount: dec('200'),
        appliedToInvoiceId: null,
      } as any);
      prisma.creditNote.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.apply(ORG_ID, 'cn-1', 'inv-1')).rejects.toThrow(ConflictException);
      expect(invoicesService.recalculateBalance).not.toHaveBeenCalled();
    });

    it('rejects another customer, an amount above the balance, and a foreign invoice', async () => {
      prisma.invoice.findFirst.mockResolvedValue(invoiceRow({ customerId: 'other' }) as any);
      await expect(service.apply(ORG_ID, 'cn-1', 'inv-1')).rejects.toThrow('different customer');

      prisma.invoice.findFirst.mockResolvedValue(invoiceRow({ balanceDue: dec('199.99') }) as any);
      await expect(service.apply(ORG_ID, 'cn-1', 'inv-1')).rejects.toThrow(
        'exceeds the balance due',
      );

      prisma.invoice.count.mockResolvedValue(0);
      await expect(service.apply(ORG_ID, 'cn-1', 'foreign')).rejects.toThrow('Invoice not found');
      expect(invoicesService.lockInvoices).toHaveBeenCalledTimes(2); // not for the foreign one
    });

    it('treats another tenant credit note as not found', async () => {
      prisma.creditNote.findFirst.mockResolvedValue(null);
      await expect(service.apply(ORG_ID, 'foreign', 'inv-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('refundAccounts', () => {
    it('lists only active bank/cash asset accounts of the organization', async () => {
      prisma.organization.findUnique.mockResolvedValue({
        defaultBankAccountId: 'bank-1',
        defaultCashAccountId: 'cash-1',
      } as any);
      prisma.account.findMany.mockResolvedValue([
        { id: 'bank-1', code: '1010', name: 'Bank', currency: 'EGP' },
      ] as any);

      const result = await service.refundAccounts(ORG_ID);

      expect(result).toHaveLength(1);
      const where = prisma.account.findMany.mock.calls[0][0]!.where as any;
      expect(where).toMatchObject({
        organizationId: ORG_ID,
        isActive: true,
        deletedAt: null,
        type: 'ASSET',
      });
      expect(where.OR[0]).toEqual({ id: { in: ['bank-1', 'cash-1'] } });
      expect(where.OR[1].bankAccounts.some).toMatchObject({
        organizationId: ORG_ID,
        isActive: true,
        deletedAt: null,
        type: { in: ['BANK', 'PETTY_CASH'] },
      });
    });
  });
});
