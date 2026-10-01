import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { QuotesService } from './quotes.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { createMockPrisma, MockPrismaClient } from '../../../test/mocks/prisma.mock';
import { createMockCustomer } from '../../../test/helpers/test-utils';
import { dec, expectDecimalEqual } from '../../../test/helpers/decimal.helpers';

const ORG_ID = 'org-test-001';

function quoteRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'q-1',
    quoteNumber: 'QT-0001',
    organizationId: ORG_ID,
    customerId: 'cust-test-001',
    status: 'DRAFT',
    notes: null,
    terms: null,
    deletedAt: null,
    subtotal: dec('89.99'),
    taxAmount: dec('12.6'),
    grandTotal: dec('102.59'),
    lines: [
      {
        itemId: null,
        description: 'Consulting',
        quantity: dec('3'),
        rate: dec('33.33'),
        discount: dec('10'),
        taxRate: dec('14'),
        amount: dec('89.99'),
      },
    ],
    ...overrides,
  };
}

describe('QuotesService', () => {
  let service: QuotesService;
  let prisma: MockPrismaClient;

  beforeEach(async () => {
    prisma = createMockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [QuotesService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(QuotesService);
  });

  describe('create', () => {
    const dto = {
      customerId: 'cust-test-001',
      date: '2024-06-15',
      expiryDate: '2024-07-15',
      lines: [
        { description: 'Consulting', quantity: '3', rate: '33.33', discount: '10', taxRate: '14' },
      ],
    };

    beforeEach(() => {
      prisma.customer.findFirst.mockResolvedValue(createMockCustomer() as any);
      prisma.organization.update.mockResolvedValue({
        quotePrefix: 'QT-',
        quoteNextNumber: 5,
      } as any);
      prisma.quote.count.mockResolvedValue(0);
      prisma.quote.create.mockResolvedValue(quoteRow() as any);
    });

    const data = () => prisma.quote.create.mock.calls[0][0].data as any;

    it('computes totals with the shared Decimal calculator (no float drift)', async () => {
      await service.create(ORG_ID, dto);

      // 3 * 33.33 = 99.99, less 10% = 89.991 -> 89.99; tax 14% of 89.99 = 12.5986 -> 12.60
      expectDecimalEqual(data().subtotal, '89.99');
      expectDecimalEqual(data().taxAmount, '12.6');
      expectDecimalEqual(data().grandTotal, '102.59');
      expect(data().subtotal).toBeInstanceOf(Decimal);
      expect(data().grandTotal).toBeInstanceOf(Decimal);
      expectDecimalEqual(data().lines.create[0].amount, '89.99');
    });

    it('does not accumulate floating point error across lines', async () => {
      await service.create(ORG_ID, {
        ...dto,
        lines: [
          { description: 'A', quantity: '1', rate: '0.1' },
          { description: 'B', quantity: '1', rate: '0.2' },
        ],
      });
      expectDecimalEqual(data().grandTotal, '0.3');
    });

    it('allocates the number from the organization quote counter inside the transaction', async () => {
      await service.create(ORG_ID, dto);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.organization.update.mock.calls[0][0]).toMatchObject({
        where: { id: ORG_ID },
        data: { quoteNextNumber: { increment: 1 } },
      });
      expect(data().quoteNumber).toBe('QT-0004');
      expect(data().organizationId).toBe(ORG_ID);
    });

    it('rejects a customer or item from another organization', async () => {
      prisma.customer.findFirst.mockResolvedValue(null);
      await expect(service.create(ORG_ID, dto)).rejects.toThrow('Customer not found');
      expect(prisma.customer.findFirst.mock.calls[0][0]!.where).toMatchObject({
        organizationId: ORG_ID,
      });

      prisma.customer.findFirst.mockResolvedValue(createMockCustomer() as any);
      prisma.item.count.mockResolvedValue(0);
      await expect(
        service.create(ORG_ID, {
          ...dto,
          lines: [{ itemId: 'foreign', description: 'x', quantity: '1', rate: '1' }],
        }),
      ).rejects.toThrow('Item not found');
      expect(prisma.quote.create).not.toHaveBeenCalled();
    });

    it('rejects an invalid date before opening a transaction', async () => {
      await expect(service.create(ORG_ID, { ...dto, expiryDate: 'later' })).rejects.toThrow(
        'Invalid expiry date',
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    beforeEach(() => {
      prisma.quote.findFirst.mockResolvedValue(quoteRow() as any);
      prisma.quote.updateMany.mockResolvedValue({ count: 1 });
      prisma.quote.update.mockResolvedValue(quoteRow() as any);
    });

    it('replaces the lines and recomputes the totals (lines are no longer dropped)', async () => {
      await service.update(ORG_ID, 'q-1', {
        lines: [{ description: 'New', quantity: '2', rate: '50', taxRate: '10' }],
      });

      expect(prisma.quoteLine.deleteMany).toHaveBeenCalledWith({ where: { quoteId: 'q-1' } });
      const lines = (prisma.quoteLine.createMany.mock.calls[0][0] as any).data;
      expect(lines[0]).toMatchObject({ quoteId: 'q-1', description: 'New' });
      const update = prisma.quote.update.mock.calls[0][0].data as any;
      expectDecimalEqual(update.subtotal, '100');
      expectDecimalEqual(update.taxAmount, '10');
      expectDecimalEqual(update.grandTotal, '110');
    });

    it('only updates drafts, guarded against a concurrent send', async () => {
      prisma.quote.findFirst.mockResolvedValue(quoteRow({ status: 'SENT' }) as any);
      await expect(service.update(ORG_ID, 'q-1', { notes: 'x' })).rejects.toThrow(
        'Only draft quotes can be updated',
      );

      prisma.quote.findFirst.mockResolvedValue(quoteRow() as any);
      prisma.quote.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.update(ORG_ID, 'q-1', { notes: 'x' })).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.quote.update).not.toHaveBeenCalled();
    });

    it('treats another tenant quote as not found', async () => {
      prisma.quote.findFirst.mockResolvedValue(null);
      await expect(service.update(ORG_ID, 'foreign', {})).rejects.toThrow(NotFoundException);
    });
  });

  describe('convertToInvoice', () => {
    beforeEach(() => {
      prisma.quote.findFirst.mockResolvedValue(quoteRow({ status: 'ACCEPTED' }) as any);
      prisma.customer.findFirst.mockResolvedValue(createMockCustomer() as any);
      prisma.quote.updateMany.mockResolvedValue({ count: 1 });
      prisma.organization.update.mockResolvedValue({
        invoicePrefix: 'INV-',
        invoiceNextNumber: 12,
      } as any);
      prisma.invoice.count.mockResolvedValue(0);
      prisma.invoice.create.mockImplementation((async (args: any) => ({
        id: 'inv-new',
        ...args.data,
      })) as any);
    });

    it('creates a draft invoice from the accepted quote, numbered from the invoice counter', async () => {
      const invoice: any = await service.convertToInvoice(ORG_ID, 'q-1');

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(invoice.invoiceNumber).toBe('INV-0011');
      expect(invoice.quoteId).toBe('q-1');
      expect(invoice.customerId).toBe('cust-test-001');
      expect(invoice.organizationId).toBe(ORG_ID);
      // The customer-accepted stored totals are copied verbatim.
      expectDecimalEqual(invoice.subtotal, '89.99');
      expectDecimalEqual(invoice.taxAmount, '12.6');
      expectDecimalEqual(invoice.grandTotal, '102.59');
      expectDecimalEqual(invoice.balanceDue, '102.59');
      expectDecimalEqual(invoice.lines.create[0].amount, '89.99');
    });

    it('copies the stored (accepted) amounts instead of recomputing them', async () => {
      // Stored tax differs from what the calculator would give (12.60): it must still win.
      prisma.quote.findFirst.mockResolvedValue(
        quoteRow({
          status: 'ACCEPTED',
          taxAmount: dec('12.5'),
          grandTotal: dec('102.49'),
        }) as any,
      );
      const invoice: any = await service.convertToInvoice(ORG_ID, 'q-1');

      expectDecimalEqual(invoice.subtotal, '89.99');
      expectDecimalEqual(invoice.taxAmount, '12.5');
      expectDecimalEqual(invoice.grandTotal, '102.49');
      expectDecimalEqual(invoice.balanceDue, '102.49');
      expectDecimalEqual(invoice.shippingAmount, '0');
    });

    it('rejects a quote whose stored totals disagree with its lines, writing nothing', async () => {
      prisma.quote.findFirst.mockResolvedValue(
        quoteRow({ status: 'ACCEPTED', subtotal: dec('90') }) as any,
      );
      await expect(service.convertToInvoice(ORG_ID, 'q-1')).rejects.toThrow(
        'Quote totals do not match its lines',
      );
      expect(prisma.invoice.create).not.toHaveBeenCalled();
      expect(prisma.quote.updateMany).not.toHaveBeenCalled();
    });

    it('converts exactly once: the guarded ACCEPTED -> INVOICED transition gates the invoice', async () => {
      await service.convertToInvoice(ORG_ID, 'q-1');
      expect(prisma.quote.updateMany).toHaveBeenCalledWith({
        where: { id: 'q-1', organizationId: ORG_ID, status: 'ACCEPTED', deletedAt: null },
        data: { status: 'INVOICED' },
      });
      expect(prisma.invoice.create).toHaveBeenCalledTimes(1);

      // A racing/repeated conversion that loses the guard creates nothing.
      prisma.invoice.create.mockClear();
      prisma.quote.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.convertToInvoice(ORG_ID, 'q-1')).rejects.toThrow(
        'Quote has already been converted',
      );
      expect(prisma.invoice.create).not.toHaveBeenCalled();
    });

    it('rejects quotes that are not accepted (including already invoiced)', async () => {
      for (const status of ['DRAFT', 'SENT', 'INVOICED', 'DECLINED']) {
        prisma.quote.findFirst.mockResolvedValue(quoteRow({ status }) as any);
        await expect(service.convertToInvoice(ORG_ID, 'q-1')).rejects.toThrow(
          'Only accepted quotes can be converted',
        );
      }
      expect(prisma.invoice.create).not.toHaveBeenCalled();
    });

    it('treats another tenant quote as not found', async () => {
      prisma.quote.findFirst.mockResolvedValue(null);
      await expect(service.convertToInvoice(ORG_ID, 'foreign')).rejects.toThrow(NotFoundException);
      expect(prisma.quote.findFirst.mock.calls[0][0]!.where).toMatchObject({
        organizationId: ORG_ID,
        deletedAt: null,
      });
    });

    it('rejects when the quote customer no longer exists in the tenant', async () => {
      prisma.customer.findFirst.mockResolvedValue(null);
      await expect(service.convertToInvoice(ORG_ID, 'q-1')).rejects.toThrow('Customer not found');
      expect(prisma.quote.updateMany).not.toHaveBeenCalled();
    });

    it('rolls the status change back when the invoice cannot be created', async () => {
      const committed: string[] = [];
      let pending: string[] = [];
      (prisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => {
        pending = [];
        const result = await fn(prisma);
        committed.push(...pending);
        return result;
      });
      prisma.quote.updateMany.mockImplementation((async () => {
        pending.push('quote.status');
        return { count: 1 };
      }) as any);
      prisma.invoice.create.mockRejectedValue(new BadRequestException('boom'));

      await expect(service.convertToInvoice(ORG_ID, 'q-1')).rejects.toThrow('boom');
      expect(committed).toEqual([]);
    });
  });

  describe('status transitions are guarded', () => {
    it('send/accept/decline only move from the expected status', async () => {
      prisma.quote.updateMany.mockResolvedValue({ count: 1 });
      prisma.quote.findFirstOrThrow.mockResolvedValue(quoteRow({ status: 'SENT' }) as any);

      await service.send(ORG_ID, 'q-1');
      expect(prisma.quote.updateMany).toHaveBeenLastCalledWith({
        where: { id: 'q-1', organizationId: ORG_ID, status: 'DRAFT', deletedAt: null },
        data: { status: 'SENT' },
      });
      await service.accept(ORG_ID, 'q-1');
      expect(prisma.quote.updateMany).toHaveBeenLastCalledWith({
        where: { id: 'q-1', organizationId: ORG_ID, status: 'SENT', deletedAt: null },
        data: { status: 'ACCEPTED' },
      });
      await service.decline(ORG_ID, 'q-1');
      expect(prisma.quote.updateMany).toHaveBeenLastCalledWith({
        where: { id: 'q-1', organizationId: ORG_ID, status: 'SENT', deletedAt: null },
        data: { status: 'DECLINED' },
      });
    });

    it('reports the right error for a wrong status and for another tenant quote', async () => {
      prisma.quote.updateMany.mockResolvedValue({ count: 0 });
      prisma.quote.findFirst.mockResolvedValue({ id: 'q-1' } as any);
      await expect(service.send(ORG_ID, 'q-1')).rejects.toThrow('Only draft quotes can be sent');
      await expect(service.accept(ORG_ID, 'q-1')).rejects.toThrow(
        'Only sent quotes can be accepted',
      );
      await expect(service.decline(ORG_ID, 'q-1')).rejects.toThrow(
        'Only sent quotes can be declined',
      );

      prisma.quote.findFirst.mockResolvedValue(null);
      await expect(service.send(ORG_ID, 'foreign')).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove and bulk operations', () => {
    it('soft-deletes drafts only', async () => {
      prisma.quote.updateMany.mockResolvedValue({ count: 1 });
      await service.remove(ORG_ID, 'q-1');
      expect(prisma.quote.updateMany).toHaveBeenCalledWith({
        where: { id: 'q-1', organizationId: ORG_ID, deletedAt: null, status: 'DRAFT' },
        data: { deletedAt: expect.any(Date) },
      });

      prisma.quote.updateMany.mockResolvedValue({ count: 0 });
      prisma.quote.findFirst.mockResolvedValue({ id: 'q-1' } as any);
      await expect(service.remove(ORG_ID, 'q-1')).rejects.toThrow(
        'Only draft quotes can be deleted',
      );
    });

    it('bulk commands report per-record outcomes', async () => {
      prisma.quote.updateMany.mockImplementation(((args: any) =>
        Promise.resolve({ count: args.where.id === 'ok' ? 1 : 0 })) as any);
      prisma.quote.findFirst.mockResolvedValue(null);
      prisma.quote.findFirstOrThrow.mockResolvedValue(quoteRow() as any);

      const sent = await service.bulkSend(ORG_ID, ['ok', 'foreign']);
      expect(sent).toEqual({
        processed: 1,
        total: 2,
        failures: [{ id: 'foreign', reason: 'Quote not found' }],
      });
      const deleted = await service.bulkDelete(ORG_ID, ['ok', 'foreign']);
      expect(deleted.processed).toBe(1);
      const declined = await service.bulkDecline(ORG_ID, ['foreign']);
      expect(declined.failures).toHaveLength(1);
    });
  });

  describe('clone', () => {
    it('numbers the copy from the quote counter and stays inside the tenant', async () => {
      prisma.quote.findFirst.mockResolvedValue(quoteRow({ status: 'SENT' }) as any);
      prisma.organization.update.mockResolvedValue({
        quotePrefix: 'QT-',
        quoteNextNumber: 3,
      } as any);
      prisma.quote.count.mockResolvedValue(0);
      prisma.quote.create.mockResolvedValue(quoteRow() as any);

      await service.clone(ORG_ID, 'q-1');

      const data = prisma.quote.create.mock.calls[0][0].data as any;
      expect(data.quoteNumber).toBe('QT-0002');
      expect(data.organizationId).toBe(ORG_ID);
      expect(prisma.quote.findFirst.mock.calls[0][0]!.where).toMatchObject({
        organizationId: ORG_ID,
      });
    });
  });
});
