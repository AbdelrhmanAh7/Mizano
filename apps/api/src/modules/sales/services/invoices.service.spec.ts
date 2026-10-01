import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { InvoicesService } from './invoices.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { JournalsService } from '../../accounting/services/journals.service';
import { createMockPrisma, MockPrismaClient } from '../../../test/mocks/prisma.mock';
import { createMockCustomer } from '../../../test/helpers/test-utils';
import { dec, expectDecimalEqual } from '../../../test/helpers/decimal.helpers';

const ORG_ID = 'org-test-001';

function invoiceRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'inv-1',
    invoiceNumber: 'INV-0001',
    organizationId: ORG_ID,
    customerId: 'cust-test-001',
    status: 'DRAFT',
    date: new Date('2024-06-15T00:00:00.000Z'),
    dueDate: new Date('2999-01-01T00:00:00.000Z'),
    subtotal: dec('1000'),
    taxAmount: dec('150'),
    shippingAmount: dec('0'),
    grandTotal: dec('1150'),
    balanceDue: dec('1150'),
    lines: [{ id: 'line-1' }],
    deletedAt: null,
    ...overrides,
  };
}

/**
 * Transaction fake with commit/rollback semantics: writes recorded while the callback runs are
 * only "committed" when it resolves; a rejection discards them, like a real rollback.
 */
function trackWrites(prisma: MockPrismaClient) {
  const committed: string[] = [];
  let pending: string[] = [];
  (prisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => {
    pending = [];
    const result = await fn(prisma);
    committed.push(...pending);
    return result;
  });
  return {
    committed,
    write: (name: string) => {
      pending.push(name);
    },
  };
}

describe('InvoicesService', () => {
  let service: InvoicesService;
  let prisma: MockPrismaClient;
  let journalsService: { create: jest.Mock; reverse: jest.Mock };

  beforeEach(async () => {
    prisma = createMockPrisma();
    journalsService = {
      create: jest.fn().mockResolvedValue({}),
      reverse: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvoicesService,
        { provide: PrismaService, useValue: prisma },
        { provide: JournalsService, useValue: journalsService },
      ],
    }).compile();

    service = module.get<InvoicesService>(InvoicesService);
  });

  describe('create', () => {
    const validDto = {
      customerId: 'cust-test-001',
      date: '2024-06-15',
      dueDate: '2024-07-15',
      lines: [{ description: 'Consulting services', quantity: '10', rate: '100', taxRate: '15' }],
    };

    beforeEach(() => {
      prisma.customer.findFirst.mockResolvedValue(createMockCustomer() as any);
      prisma.organization.update.mockResolvedValue({
        invoicePrefix: 'INV-',
        invoiceNextNumber: 8,
      } as any);
      prisma.invoice.count.mockResolvedValue(0);
      prisma.invoice.create.mockResolvedValue(invoiceRow() as any);
    });

    function createdData() {
      return prisma.invoice.create.mock.calls[0][0].data as any;
    }

    it('creates a draft with exact Decimal totals (tax percent applied to the line net)', async () => {
      await service.create(ORG_ID, validDto);

      const data = createdData();
      expectDecimalEqual(data.subtotal, '1000');
      expectDecimalEqual(data.taxAmount, '150');
      expectDecimalEqual(data.grandTotal, '1150');
      expectDecimalEqual(data.balanceDue, '1150');
      expect(data.subtotal).toBeInstanceOf(Decimal);
      expect(data.grandTotal).toBeInstanceOf(Decimal);
      expect(data.organizationId).toBe(ORG_ID);
    });

    it('applies the line discount before tax', async () => {
      await service.create(ORG_ID, {
        ...validDto,
        lines: [{ description: 'Item', quantity: '5', rate: '200', discount: '10', taxRate: '20' }],
      });

      const data = createdData();
      expectDecimalEqual(data.subtotal, '900'); // 5 * 200 * 0.9
      expectDecimalEqual(data.taxAmount, '180'); // 900 * 20%
      expectDecimalEqual(data.grandTotal, '1080');
    });

    it('includes shipping in the grand total and balance due', async () => {
      await service.create(ORG_ID, { ...validDto, shippingAmount: '50' });

      const data = createdData();
      expectDecimalEqual(data.shippingAmount, '50');
      expectDecimalEqual(data.grandTotal, '1200');
      expectDecimalEqual(data.balanceDue, '1200');
    });

    it('does not accumulate floating point error across lines', async () => {
      await service.create(ORG_ID, {
        ...validDto,
        lines: [
          { description: 'A', quantity: '1', rate: '0.1' },
          { description: 'B', quantity: '1', rate: '0.2' },
        ],
      });
      expectDecimalEqual(createdData().subtotal, '0.3');
      expectDecimalEqual(createdData().grandTotal, '0.3');
    });

    it('rejects malformed quantities instead of storing garbage', async () => {
      await expect(
        service.create(ORG_ID, {
          ...validDto,
          lines: [{ description: 'x', quantity: 'ten', rate: '1' }],
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.invoice.create).not.toHaveBeenCalled();
    });

    it('rejects an invalid date before touching the database', async () => {
      await expect(service.create(ORG_ID, { ...validDto, date: 'nope' })).rejects.toThrow(
        'Invalid invoice date',
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('numbers from the organization counter inside the creating transaction', async () => {
      await service.create(ORG_ID, validDto);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.organization.update).toHaveBeenCalledWith({
        where: { id: ORG_ID },
        data: { invoiceNextNumber: { increment: 1 } },
        select: { invoicePrefix: true, invoiceNextNumber: true },
      });
      expect(createdData().invoiceNumber).toBe('INV-0007');
    });

    it('skips numbers that are already used', async () => {
      prisma.organization.update
        .mockResolvedValueOnce({ invoicePrefix: 'INV-', invoiceNextNumber: 8 } as any)
        .mockResolvedValueOnce({ invoicePrefix: 'INV-', invoiceNextNumber: 9 } as any);
      prisma.invoice.count.mockResolvedValueOnce(1).mockResolvedValueOnce(0);

      await service.create(ORG_ID, validDto);

      expect(createdData().invoiceNumber).toBe('INV-0008');
    });

    it('maps a unique-number race to a 409', async () => {
      prisma.invoice.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }),
      );
      await expect(service.create(ORG_ID, validDto)).rejects.toThrow(ConflictException);
    });

    it('rejects a customer from another organization', async () => {
      prisma.customer.findFirst.mockResolvedValue(null);

      await expect(service.create(ORG_ID, validDto)).rejects.toThrow('Customer not found');
      expect(prisma.customer.findFirst.mock.calls[0][0]!.where).toMatchObject({
        organizationId: ORG_ID,
        deletedAt: null,
      });
      expect(prisma.invoice.create).not.toHaveBeenCalled();
    });

    it('rejects items, projects and quotes from another organization', async () => {
      prisma.item.count.mockResolvedValue(0);
      await expect(
        service.create(ORG_ID, {
          ...validDto,
          lines: [{ itemId: 'foreign-item', description: 'x', quantity: '1', rate: '1' }],
        }),
      ).rejects.toThrow('Item not found');
      expect(prisma.item.count.mock.calls[0][0]!.where).toMatchObject({ organizationId: ORG_ID });

      prisma.project.findFirst.mockResolvedValue(null);
      await expect(service.create(ORG_ID, { ...validDto, projectId: 'foreign' })).rejects.toThrow(
        'Project not found',
      );
      expect(prisma.project.findFirst.mock.calls[0][0]!.where).toMatchObject({
        organizationId: ORG_ID,
      });

      prisma.quote.findFirst.mockResolvedValue(null);
      await expect(service.create(ORG_ID, { ...validDto, quoteId: 'foreign' })).rejects.toThrow(
        'Quote not found',
      );
      expect(prisma.quote.findFirst.mock.calls[0][0]!.where).toMatchObject({
        organizationId: ORG_ID,
      });
      expect(prisma.invoice.create).not.toHaveBeenCalled();
    });

    it('rejects a quote that belongs to a different customer', async () => {
      prisma.quote.findFirst.mockResolvedValue({ id: 'q1', customerId: 'someone-else' } as any);
      await expect(service.create(ORG_ID, { ...validDto, quoteId: 'q1' })).rejects.toThrow(
        'different customer',
      );
    });
  });

  describe('update', () => {
    beforeEach(() => {
      prisma.invoice.findFirst.mockResolvedValue(invoiceRow() as any);
      prisma.invoice.updateMany.mockResolvedValue({ count: 1 });
      prisma.invoice.update.mockResolvedValue(invoiceRow() as any);
    });

    it.each(['SENT', 'PAID', 'VOID', 'PARTIALLY_PAID', 'OVERDUE'])(
      'rejects updating a %s invoice',
      async (status) => {
        prisma.invoice.findFirst.mockResolvedValue(invoiceRow({ status }) as any);
        await expect(service.update(ORG_ID, 'inv-1', { notes: 'x' })).rejects.toThrow(
          'Only draft invoices can be updated',
        );
        expect(prisma.invoice.update).not.toHaveBeenCalled();
      },
    );

    it('takes the invoice row lock before reading the draft it edits', async () => {
      await service.update(ORG_ID, 'inv-1', { notes: 'x' });
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
      expect(String((prisma.$queryRaw as jest.Mock).mock.calls[0][0])).toContain('FOR UPDATE');
      expect(prisma.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.invoice.findFirst.mock.invocationCallOrder[1],
      );
    });

    it('rejects line totals that overflow Decimal(19, 4) before writing', async () => {
      await expect(
        service.update(ORG_ID, 'inv-1', {
          lines: [{ description: 'Huge', quantity: '999999999999999', rate: '999999999999999' }],
        }),
      ).rejects.toThrow('too large');
      expect(prisma.invoiceLine.createMany).not.toHaveBeenCalled();
    });

    it('treats another tenant invoice as not found', async () => {
      prisma.invoice.findFirst.mockResolvedValue(null);
      await expect(service.update(ORG_ID, 'foreign', {})).rejects.toThrow(NotFoundException);
      expect(prisma.invoice.findFirst.mock.calls[0][0]!.where).toMatchObject({
        organizationId: ORG_ID,
        deletedAt: null,
      });
    });

    it('is guarded: a concurrent send that won the row makes the update a 409', async () => {
      prisma.invoice.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.update(ORG_ID, 'inv-1', { notes: 'x' })).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.invoice.update).not.toHaveBeenCalled();
      expect(prisma.invoice.updateMany.mock.calls[0][0]).toMatchObject({
        where: { id: 'inv-1', organizationId: ORG_ID, status: 'DRAFT', deletedAt: null },
      });
    });

    it('replaces the lines and re-derives all totals as Decimal', async () => {
      await service.update(ORG_ID, 'inv-1', {
        lines: [{ description: 'New', quantity: '3', rate: '100', taxRate: '14' }],
        shippingAmount: '10',
      });

      expect(prisma.invoiceLine.deleteMany).toHaveBeenCalledWith({ where: { invoiceId: 'inv-1' } });
      const lines = (prisma.invoiceLine.createMany.mock.calls[0][0] as any).data;
      expect(lines).toHaveLength(1);
      expect(lines[0].invoiceId).toBe('inv-1');
      expectDecimalEqual(lines[0].amount, '300');
      const data = prisma.invoice.update.mock.calls[0][0].data as any;
      expectDecimalEqual(data.subtotal, '300');
      expectDecimalEqual(data.taxAmount, '42');
      expectDecimalEqual(data.grandTotal, '352');
      expectDecimalEqual(data.balanceDue, '352');
    });

    it('re-derives the gross total when only shipping changes', async () => {
      await service.update(ORG_ID, 'inv-1', { shippingAmount: '25' });

      expect(prisma.invoiceLine.deleteMany).not.toHaveBeenCalled();
      const data = prisma.invoice.update.mock.calls[0][0].data as any;
      expectDecimalEqual(data.grandTotal, '1175'); // 1000 + 150 + 25
      expectDecimalEqual(data.balanceDue, '1175');
    });

    it('checks every referenced id against the tenant', async () => {
      prisma.customer.findFirst.mockResolvedValue(null);
      await expect(service.update(ORG_ID, 'inv-1', { customerId: 'foreign' })).rejects.toThrow(
        'Customer not found',
      );
      expect(prisma.invoice.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('send', () => {
    const accounts = {
      defaultArAccountId: 'ar-acc',
      defaultRevenueAccountId: 'rev-acc',
      defaultVatPayableAccountId: 'vat-acc',
      baseCurrency: 'USD',
    };

    beforeEach(() => {
      prisma.invoice.findFirst.mockResolvedValue(invoiceRow() as any);
      prisma.organization.findUnique.mockResolvedValue(accounts as any);
      prisma.invoice.updateMany.mockResolvedValue({ count: 1 });
      prisma.invoice.findUniqueOrThrow.mockResolvedValue(invoiceRow({ status: 'SENT' }) as any);
    });

    function journalCall() {
      return journalsService.create.mock.calls[0] as [
        string,
        { date: string; reference: string; lines: Array<Record<string, string>> },
        { tx: unknown; source: { type: string; id: string } },
      ];
    }

    it('locks the invoice row, then the ledger, before reading the posted values and settings', async () => {
      await service.send(ORG_ID, 'inv-1');

      const rowLock = prisma.$queryRaw.mock.invocationCallOrder[0];
      const ledgerLock = prisma.$executeRaw.mock.invocationCallOrder[0];
      const findCalls = prisma.invoice.findFirst.mock.invocationCallOrder;
      // findFirst[0] is the tenant-scoped ownership check, findFirst[1] the posting read.
      expect(findCalls[0]).toBeLessThan(rowLock);
      expect(rowLock).toBeLessThan(ledgerLock);
      expect(ledgerLock).toBeLessThan(findCalls[1]);
      expect(ledgerLock).toBeLessThan(prisma.organization.findUnique.mock.invocationCallOrder[0]);
      expect(String((prisma.$queryRaw as jest.Mock).mock.calls[0][0])).toContain('FOR UPDATE');
    });

    it('treats another tenant invoice as not found without locking it', async () => {
      prisma.invoice.findFirst.mockResolvedValue(null);
      await expect(service.send(ORG_ID, 'foreign')).rejects.toThrow(NotFoundException);
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });

    it('refuses to post a foreign-currency invoice into the single-currency ledger', async () => {
      prisma.invoice.findFirst.mockResolvedValue(invoiceRow({ currencyCode: 'EUR' }) as any);

      await expect(service.send(ORG_ID, 'inv-1')).rejects.toThrow(
        'differs from the base currency USD',
      );
      expect(prisma.invoice.updateMany).not.toHaveBeenCalled();
      expect(journalsService.create).not.toHaveBeenCalled();
    });

    it('sends the draft and posts exactly one journal tied to the INVOICE_SEND event', async () => {
      const result = await service.send(ORG_ID, 'inv-1');

      expect(result.status).toBe('SENT');
      expect(journalsService.create).toHaveBeenCalledTimes(1);
      const [orgId, dto, options] = journalCall();
      expect(orgId).toBe(ORG_ID);
      expect(options).toEqual({ tx: prisma, source: { type: 'INVOICE_SEND', id: 'inv-1' } });
      expect(dto.reference).toBe('Invoice INV-0001');
      // Dated on the invoice (document) date, not on the day it was sent.
      expect(dto.date).toBe('2024-06-15T00:00:00.000Z');
    });

    it('posts Dr AR / Cr Revenue / Cr VAT Payable and the entry balances', async () => {
      await service.send(ORG_ID, 'inv-1');

      const { lines } = journalCall()[1];
      expect(lines).toEqual([
        expect.objectContaining({ accountId: 'ar-acc', debit: '1150.0000', credit: '0' }),
        expect.objectContaining({ accountId: 'rev-acc', debit: '0', credit: '1000.0000' }),
        expect.objectContaining({ accountId: 'vat-acc', debit: '0', credit: '150.0000' }),
      ]);
      const debit = lines.reduce((s, l) => s.add(l.debit), new Decimal(0));
      const credit = lines.reduce((s, l) => s.add(l.credit), new Decimal(0));
      expect(debit.equals(credit)).toBe(true);
    });

    it('balances when the invoice has shipping and line discounts (revenue = gross - VAT)', async () => {
      // 5 * 200 less 10% = 900 net, 20% VAT = 180, shipping 50 -> gross 1130.
      prisma.invoice.findFirst.mockResolvedValue(
        invoiceRow({
          subtotal: dec('900'),
          taxAmount: dec('180'),
          shippingAmount: dec('50'),
          grandTotal: dec('1130'),
          balanceDue: dec('1130'),
        }) as any,
      );

      await service.send(ORG_ID, 'inv-1');

      const { lines } = journalCall()[1];
      expect(lines[0]).toMatchObject({ accountId: 'ar-acc', debit: '1130.0000' });
      expect(lines[1]).toMatchObject({ accountId: 'rev-acc', credit: '950.0000' }); // 900 + 50
      expect(lines[2]).toMatchObject({ accountId: 'vat-acc', credit: '180.0000' });
      const debit = lines.reduce((s, l) => s.add(l.debit), new Decimal(0));
      const credit = lines.reduce((s, l) => s.add(l.credit), new Decimal(0));
      expect(debit.equals(credit)).toBe(true);
    });

    it('omits the VAT line for a zero-tax invoice', async () => {
      prisma.invoice.findFirst.mockResolvedValue(
        invoiceRow({
          subtotal: dec('400'),
          taxAmount: dec('0'),
          grandTotal: dec('400'),
          balanceDue: dec('400'),
        }) as any,
      );
      prisma.organization.findUnique.mockResolvedValue({
        ...accounts,
        defaultVatPayableAccountId: null,
      } as any);

      await service.send(ORG_ID, 'inv-1');

      expect(journalCall()[1].lines).toHaveLength(2);
    });

    it('never silently drops the VAT line: a taxed invoice needs a VAT Payable account', async () => {
      prisma.organization.findUnique.mockResolvedValue({
        ...accounts,
        defaultVatPayableAccountId: null,
      } as any);

      await expect(service.send(ORG_ID, 'inv-1')).rejects.toThrow(/VAT Payable/);
      expect(prisma.invoice.updateMany).not.toHaveBeenCalled();
      expect(journalsService.create).not.toHaveBeenCalled();
    });

    it('requires the default AR and revenue accounts', async () => {
      prisma.organization.findUnique.mockResolvedValue({
        defaultArAccountId: null,
        defaultRevenueAccountId: null,
      } as any);

      await expect(service.send(ORG_ID, 'inv-1')).rejects.toThrow(/configure default accounts/);
      expect(prisma.invoice.updateMany).not.toHaveBeenCalled();
    });

    it('transitions with a guard on the DRAFT status and stamps the issue date', async () => {
      await service.send(ORG_ID, 'inv-1');

      expect(prisma.invoice.updateMany).toHaveBeenCalledWith({
        where: { id: 'inv-1', organizationId: ORG_ID, status: 'DRAFT', deletedAt: null },
        data: { status: 'SENT', issueDate: expect.any(Date) },
      });
    });

    it('rejects a repeated send: the invoice is no longer a draft, nothing is posted', async () => {
      prisma.invoice.findFirst.mockResolvedValue(invoiceRow({ status: 'SENT' }) as any);

      await expect(service.send(ORG_ID, 'inv-1')).rejects.toThrow(
        'Only draft invoices can be sent',
      );
      expect(journalsService.create).not.toHaveBeenCalled();
    });

    it('a concurrent send that lost the guarded transition gets a 409 and posts nothing', async () => {
      prisma.invoice.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.send(ORG_ID, 'inv-1')).rejects.toThrow(ConflictException);
      expect(journalsService.create).not.toHaveBeenCalled();
    });

    it('rejects an invoice without lines or without a positive total', async () => {
      prisma.invoice.findFirst.mockResolvedValue(invoiceRow({ lines: [] }) as any);
      await expect(service.send(ORG_ID, 'inv-1')).rejects.toThrow('no lines');

      prisma.invoice.findFirst.mockResolvedValue(
        invoiceRow({ grandTotal: dec('0'), taxAmount: dec('0') }) as any,
      );
      await expect(service.send(ORG_ID, 'inv-1')).rejects.toThrow('greater than zero');
      expect(journalsService.create).not.toHaveBeenCalled();
    });

    it('treats another tenant invoice as not found', async () => {
      prisma.invoice.findFirst.mockResolvedValue(null);
      await expect(service.send(ORG_ID, 'foreign')).rejects.toThrow(NotFoundException);
      expect(prisma.invoice.findFirst.mock.calls[0][0]!.where).toMatchObject({
        organizationId: ORG_ID,
        deletedAt: null,
      });
    });

    it('commits the status change only together with the journal (rolls back on journal failure)', async () => {
      const writes = trackWrites(prisma);
      prisma.invoice.updateMany.mockImplementation((async () => {
        writes.write('invoice.status');
        return { count: 1 };
      }) as any);
      journalsService.create.mockRejectedValue(new BadRequestException('This period is locked'));

      await expect(service.send(ORG_ID, 'inv-1')).rejects.toThrow('This period is locked');
      expect(writes.committed).toEqual([]);

      journalsService.create.mockResolvedValue({});
      await service.send(ORG_ID, 'inv-1');
      expect(writes.committed).toEqual(['invoice.status']);
    });
  });

  describe('voidInvoice', () => {
    beforeEach(() => {
      prisma.invoice.findFirst.mockResolvedValue(invoiceRow({ status: 'SENT' }) as any);
      prisma.paymentAllocation.count.mockResolvedValue(0);
      prisma.creditNote.count.mockResolvedValue(0);
      prisma.invoice.updateMany.mockResolvedValue({ count: 1 });
      prisma.journal.findFirst.mockResolvedValue({ id: 'j-send' } as any);
      prisma.invoice.findUniqueOrThrow.mockResolvedValue(invoiceRow({ status: 'VOID' }) as any);
    });

    it('voids a sent invoice and reverses its INVOICE_SEND journal with an INVOICE_VOID source', async () => {
      const result = await service.voidInvoice(ORG_ID, 'inv-1');

      expect(result.status).toBe('VOID');
      expect(prisma.invoice.updateMany).toHaveBeenCalledWith({
        where: { id: 'inv-1', organizationId: ORG_ID, status: 'SENT', deletedAt: null },
        data: { status: 'VOID' },
      });
      expect(prisma.journal.findFirst.mock.calls[0][0]!.where).toMatchObject({
        organizationId: ORG_ID,
        sourceType: 'INVOICE_SEND',
        sourceId: 'inv-1',
      });
      expect(journalsService.reverse).toHaveBeenCalledTimes(1);
      expect(journalsService.reverse).toHaveBeenCalledWith(ORG_ID, 'j-send', undefined, {
        tx: prisma,
        source: { type: 'INVOICE_VOID', id: 'inv-1' },
      });
    });

    it('locks the invoice row for the transaction', async () => {
      await service.voidInvoice(ORG_ID, 'inv-1');
      expect(prisma.$queryRaw).toHaveBeenCalled();
      const [strings] = (prisma.$queryRaw as jest.Mock).mock.calls[0];
      expect(strings.join('?')).toMatch(/FOR UPDATE/);
    });

    it('cancels a draft without any journal', async () => {
      prisma.invoice.findFirst.mockResolvedValue(invoiceRow({ status: 'DRAFT' }) as any);

      await service.voidInvoice(ORG_ID, 'inv-1');

      expect(prisma.invoice.updateMany.mock.calls[0][0]).toMatchObject({
        where: { status: 'DRAFT' },
        data: { status: 'VOID' },
      });
      expect(prisma.journal.findFirst).not.toHaveBeenCalled();
      expect(journalsService.reverse).not.toHaveBeenCalled();
    });

    it('refuses an invoice with live payments and writes nothing', async () => {
      prisma.paymentAllocation.count.mockResolvedValue(1);

      await expect(service.voidInvoice(ORG_ID, 'inv-1')).rejects.toThrow('void the payments first');
      expect(prisma.paymentAllocation.count.mock.calls[0][0]!.where).toMatchObject({
        invoiceId: 'inv-1',
        payment: { deletedAt: null },
      });
      expect(prisma.invoice.updateMany).not.toHaveBeenCalled();
      expect(journalsService.reverse).not.toHaveBeenCalled();
    });

    it('refuses an invoice with live credit notes (issued against or applied to it)', async () => {
      prisma.creditNote.count.mockResolvedValue(1);

      await expect(service.voidInvoice(ORG_ID, 'inv-1')).rejects.toThrow(
        'void the credit notes first',
      );
      expect(prisma.creditNote.count.mock.calls[0][0]!.where).toMatchObject({
        organizationId: ORG_ID,
        deletedAt: null,
        OR: [{ invoiceId: 'inv-1' }, { appliedToInvoiceId: 'inv-1' }],
      });
      expect(journalsService.reverse).not.toHaveBeenCalled();
    });

    it('refuses to void a legacy sent invoice that has no linked journal', async () => {
      prisma.journal.findFirst.mockResolvedValue(null);

      await expect(service.voidInvoice(ORG_ID, 'inv-1')).rejects.toThrow('no linked ledger entry');
      expect(journalsService.reverse).not.toHaveBeenCalled();
    });

    it('rolls the status change back when the reversal fails (period locked)', async () => {
      const writes = trackWrites(prisma);
      prisma.invoice.updateMany.mockImplementation((async () => {
        writes.write('invoice.status');
        return { count: 1 };
      }) as any);
      journalsService.reverse.mockRejectedValue(new BadRequestException('This period is locked'));

      await expect(service.voidInvoice(ORG_ID, 'inv-1')).rejects.toThrow('This period is locked');
      expect(writes.committed).toEqual([]);
    });

    it('rejects an already void invoice', async () => {
      prisma.invoice.findFirst.mockResolvedValue(invoiceRow({ status: 'VOID' }) as any);
      await expect(service.voidInvoice(ORG_ID, 'inv-1')).rejects.toThrow('already void');
    });

    it('treats another tenant invoice as not found and takes no lock', async () => {
      prisma.invoice.findFirst.mockResolvedValue(null);

      await expect(service.voidInvoice(ORG_ID, 'foreign')).rejects.toThrow(NotFoundException);
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
      expect(prisma.invoice.findFirst.mock.calls[0][0]!.where).toMatchObject({
        organizationId: ORG_ID,
      });
    });

    it('a concurrent change under the guard is a 409', async () => {
      prisma.invoice.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.voidInvoice(ORG_ID, 'inv-1')).rejects.toThrow(ConflictException);
      expect(journalsService.reverse).not.toHaveBeenCalled();
    });
  });

  describe('remove (soft delete)', () => {
    it('soft-deletes a draft with a guarded update', async () => {
      prisma.invoice.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.remove(ORG_ID, 'inv-1');

      expect(result.message).toBe('Invoice deleted successfully');
      expect(prisma.invoice.updateMany).toHaveBeenCalledWith({
        where: { id: 'inv-1', organizationId: ORG_ID, deletedAt: null, status: 'DRAFT' },
        data: { deletedAt: expect.any(Date) },
      });
      expect(prisma.invoice.delete).not.toHaveBeenCalled();
      expect(prisma.invoice.deleteMany).not.toHaveBeenCalled();
    });

    it('only deletes drafts', async () => {
      prisma.invoice.updateMany.mockResolvedValue({ count: 0 });
      prisma.invoice.findFirst.mockResolvedValue({ id: 'inv-1' } as any);

      await expect(service.remove(ORG_ID, 'inv-1')).rejects.toThrow(
        'Only draft invoices can be deleted',
      );
    });

    it('reports another tenant invoice as not found', async () => {
      prisma.invoice.updateMany.mockResolvedValue({ count: 0 });
      prisma.invoice.findFirst.mockResolvedValue(null);

      await expect(service.remove(ORG_ID, 'foreign')).rejects.toThrow(NotFoundException);
    });
  });

  describe('recalculateBalance', () => {
    const allocations = (...amounts: string[]) => amounts.map((a) => ({ amount: dec(a) }));
    const run = (
      invoice: Record<string, unknown>,
      paid: string[] = [],
      credited: string[] = [],
    ) => {
      prisma.invoice.findUnique.mockResolvedValue(invoiceRow(invoice) as any);
      prisma.paymentAllocation.findMany.mockResolvedValue(allocations(...paid) as any);
      prisma.creditNote.findMany.mockResolvedValue(allocations(...credited) as any);
      prisma.invoice.update.mockResolvedValue({} as any);
      return service.recalculateBalance(prisma, 'inv-1');
    };
    const updated = () => prisma.invoice.update.mock.calls[0][0].data as any;

    it('is PAID with a zero balance when fully paid', async () => {
      await run({ status: 'SENT', grandTotal: dec('1000') }, ['1000']);
      expect(updated().status).toBe('PAID');
      expectDecimalEqual(updated().balanceDue, '0');
    });

    it('is PARTIALLY_PAID for a partial payment', async () => {
      await run({ status: 'SENT', grandTotal: dec('1000') }, ['400']);
      expect(updated().status).toBe('PARTIALLY_PAID');
      expectDecimalEqual(updated().balanceDue, '600');
    });

    it('counts credit notes applied to the invoice', async () => {
      await run({ status: 'SENT', grandTotal: dec('1000') }, ['500'], ['500']);
      expect(updated().status).toBe('PAID');
      expectDecimalEqual(updated().balanceDue, '0');

      prisma.invoice.update.mockClear();
      await run({ status: 'SENT', grandTotal: dec('1000') }, [], ['250.25']);
      expect(updated().status).toBe('PARTIALLY_PAID');
      expectDecimalEqual(updated().balanceDue, '749.75');
    });

    it('reads live allocations only and credit notes by appliedToInvoiceId', async () => {
      await run({ status: 'SENT' });

      expect(prisma.paymentAllocation.findMany.mock.calls[0][0]!.where).toEqual({
        invoiceId: 'inv-1',
        payment: { deletedAt: null },
      });
      expect(prisma.creditNote.findMany.mock.calls[0][0]!.where).toEqual({
        appliedToInvoiceId: 'inv-1',
        deletedAt: null,
      });
    });

    it('never goes negative', async () => {
      await run({ status: 'SENT', grandTotal: dec('100') }, ['150']);
      expectDecimalEqual(updated().balanceDue, '0');
    });

    it('sums exactly in Decimal (0.1 + 0.2 settles 0.3)', async () => {
      await run({ status: 'SENT', grandTotal: dec('0.3') }, ['0.1', '0.2']);
      expect(updated().status).toBe('PAID');
    });

    it('returns an unpaid invoice to SENT, or OVERDUE when past due', async () => {
      await run({ status: 'PAID', grandTotal: dec('100') });
      expect(updated().status).toBe('SENT');
      expectDecimalEqual(updated().balanceDue, '100');

      prisma.invoice.update.mockClear();
      await run({ status: 'PAID', grandTotal: dec('100'), dueDate: new Date('2020-01-01') });
      expect(updated().status).toBe('OVERDUE');
    });

    it.each(['DRAFT', 'VOID'])('never touches a %s invoice', async (status) => {
      await run({ status }, ['10']);
      expect(prisma.invoice.update).not.toHaveBeenCalled();
    });

    it('fails loudly for a missing invoice', async () => {
      prisma.invoice.findUnique.mockResolvedValue(null);
      await expect(service.recalculateBalance(prisma, 'x')).rejects.toThrow(NotFoundException);
    });
  });

  describe('lockInvoices / updateBalanceDue', () => {
    it('locks distinct ids in sorted order to avoid deadlocks', async () => {
      await service.lockInvoices(prisma, ['b', 'a', 'b']);

      const calls = (prisma.$queryRaw as jest.Mock).mock.calls;
      expect(calls.map((c) => c[1])).toEqual(['a', 'b']);
      expect(calls[0][0].join('?')).toMatch(/FROM "invoices" WHERE id = \? FOR UPDATE/);
    });

    it('updateBalanceDue locks and recalculates inside one transaction (legacy callers)', async () => {
      prisma.invoice.findUnique.mockResolvedValue(
        invoiceRow({ status: 'SENT', grandTotal: dec('100') }) as any,
      );
      prisma.paymentAllocation.findMany.mockResolvedValue([{ amount: dec('100') }] as any);
      prisma.creditNote.findMany.mockResolvedValue([] as any);

      await service.updateBalanceDue('inv-1');

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.$queryRaw).toHaveBeenCalled();
      expect(prisma.invoice.update.mock.calls[0][0].data).toMatchObject({ status: 'PAID' });
    });
  });

  describe('markOverdueInvoices', () => {
    it('only marks invoices that are open, past due and still owed', async () => {
      prisma.invoice.updateMany.mockResolvedValue({ count: 0 });

      await service.markOverdueInvoices();

      const args = prisma.invoice.updateMany.mock.calls[0][0] as any;
      expect(args.where.status).toEqual({ in: ['SENT', 'PARTIALLY_PAID'] });
      expect(args.where.balanceDue).toEqual({ gt: 0 });
      expect(args.where.deletedAt).toBeNull();
      expect(args.where.dueDate.lt).toBeInstanceOf(Date);
      expect(args.data).toEqual({ status: 'OVERDUE' });
    });
  });

  describe('bulk operations reuse the single-record commands', () => {
    it('bulkSend reports per-invoice failures and posts each success once', async () => {
      prisma.invoice.findFirst.mockImplementation(((args: any) =>
        Promise.resolve(
          args.where.id === 'ok'
            ? invoiceRow({ id: 'ok' })
            : args.where.id === 'sent'
              ? invoiceRow({ id: 'sent', status: 'SENT' })
              : null,
        )) as any);
      prisma.organization.findUnique.mockResolvedValue({
        defaultArAccountId: 'ar',
        defaultRevenueAccountId: 'rev',
        defaultVatPayableAccountId: 'vat',
      } as any);
      prisma.invoice.updateMany.mockResolvedValue({ count: 1 });
      prisma.invoice.findUniqueOrThrow.mockResolvedValue(invoiceRow({ status: 'SENT' }) as any);

      const result = await service.bulkSend(ORG_ID, ['ok', 'sent', 'foreign', 'ok']);

      expect(result.processed).toBe(1);
      expect(result.total).toBe(3);
      expect(result.failures).toEqual([
        { id: 'sent', reason: 'Only draft invoices can be sent' },
        { id: 'foreign', reason: 'Invoice not found' },
      ]);
      expect(journalsService.create).toHaveBeenCalledTimes(1);
    });

    it('bulkVoid and bulkDelete return the same per-record outcome shape', async () => {
      prisma.invoice.findFirst.mockResolvedValue(null);
      prisma.invoice.updateMany.mockResolvedValue({ count: 0 });

      const voided = await service.bulkVoid(ORG_ID, ['x']);
      expect(voided).toEqual({
        processed: 0,
        total: 1,
        failures: [{ id: 'x', reason: 'Invoice not found' }],
      });
      const deleted = await service.bulkDelete(ORG_ID, ['x']);
      expect(deleted.failures).toEqual([{ id: 'x', reason: 'Invoice not found' }]);
    });
  });

  describe('findOne', () => {
    it('should return invoice with customer, lines and live settlement', async () => {
      prisma.invoice.findFirst.mockResolvedValue(invoiceRow({ id: 'inv-1' }) as any);

      const result = await service.findOne(ORG_ID, 'inv-1');
      expect(result.id).toBe('inv-1');

      const include = (prisma.invoice.findFirst.mock.calls[0][0] as any).include;
      expect(include.paymentAllocations.where).toEqual({ payment: { deletedAt: null } });
      expect(include.appliedCredits.where).toEqual({ deletedAt: null });
    });

    it('should throw NotFoundException for non-existent invoice', async () => {
      prisma.invoice.findFirst.mockResolvedValue(null);
      await expect(service.findOne(ORG_ID, 'nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('should filter by organizationId and exclude soft-deleted', async () => {
      prisma.invoice.findFirst.mockResolvedValue(null);

      await expect(service.findOne(ORG_ID, 'inv-1')).rejects.toThrow(NotFoundException);

      const findCall = prisma.invoice.findFirst.mock.calls[0]![0]!;
      expect(findCall.where!.organizationId).toBe(ORG_ID);
      expect(findCall.where!.deletedAt).toBeNull();
    });
  });

  describe('clone', () => {
    it('numbers the copy from the counter in one transaction and keeps the tenant', async () => {
      prisma.invoice.findFirst.mockResolvedValue({ ...invoiceRow(), lines: [] } as any);
      prisma.organization.update.mockResolvedValue({
        invoicePrefix: 'INV-',
        invoiceNextNumber: 3,
      } as any);
      prisma.invoice.count.mockResolvedValue(0);
      prisma.invoice.create.mockResolvedValue(invoiceRow() as any);

      await service.clone(ORG_ID, 'inv-1');

      const data = prisma.invoice.create.mock.calls[0][0].data as any;
      expect(data.invoiceNumber).toBe('INV-0002');
      expect(data.organizationId).toBe(ORG_ID);
      expect(prisma.invoice.findFirst.mock.calls[0][0]!.where).toMatchObject({
        organizationId: ORG_ID,
      });
    });

    it('treats another tenant invoice as not found', async () => {
      prisma.invoice.findFirst.mockResolvedValue(null);
      await expect(service.clone(ORG_ID, 'foreign')).rejects.toThrow(NotFoundException);
    });
  });

  describe('taxRateOptions', () => {
    it('returns only active, non-deleted SALES/BOTH rates of the organization as decimal strings', async () => {
      prisma.taxRate.findMany.mockResolvedValue([
        { id: 't1', name: 'VAT 14%', rate: dec('14') },
        { id: 't2', name: 'Both', rate: dec('5.5') },
      ] as any);

      const result = await service.taxRateOptions(ORG_ID);

      expect(result).toEqual([
        { id: 't1', name: 'VAT 14%', rate: '14.00' },
        { id: 't2', name: 'Both', rate: '5.50' },
      ]);
      expect(prisma.taxRate.findMany.mock.calls[0][0]!.where).toEqual({
        organizationId: ORG_ID,
        isActive: true,
        deletedAt: null,
        type: { in: ['SALES', 'BOTH'] },
      });
    });
  });
});
