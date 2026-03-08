import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { QuotesService } from './quotes.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { createMockPrisma, MockPrismaClient } from '../../../test/mocks/prisma.mock';
import { createMockCustomer } from '../../../test/helpers/test-utils';
import { dec, expectDecimalEqual } from '../../../test/helpers/decimal.helpers';

function createMockQuote(overrides: Record<string, unknown> = {}) {
  return {
    id: 'quote-test-001',
    quoteNumber: 'EST-001',
    organizationId: 'org-test-001',
    customerId: 'cust-test-001',
    status: 'DRAFT',
    date: new Date('2024-06-15'),
    expiryDate: new Date('2024-07-15'),
    subtotal: new Decimal('1000.0000'),
    taxAmount: new Decimal('150.0000'),
    grandTotal: new Decimal('1150.0000'),
    notes: null,
    terms: null,
    deletedAt: null,
    createdAt: new Date('2024-06-15'),
    updatedAt: new Date('2024-06-15'),
    ...overrides,
  };
}

describe('QuotesService', () => {
  let service: QuotesService;
  let prisma: MockPrismaClient;

  const ORG_ID = 'org-test-001';

  beforeEach(async () => {
    prisma = createMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [QuotesService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<QuotesService>(QuotesService);
  });

  describe('create', () => {
    const validDto = {
      customerId: 'cust-test-001',
      date: '2024-06-15',
      expiryDate: '2024-07-15',
      lines: [{ description: 'Consulting services', quantity: '10', rate: '100', taxRate: '15' }],
    };

    it('should create a quote with correct total calculation', async () => {
      prisma.customer.findFirst.mockResolvedValue(createMockCustomer() as any);
      prisma.quote.findFirst.mockResolvedValue(null); // no existing quote for numbering

      const mockQuote = createMockQuote({
        subtotal: dec('1000'),
        taxAmount: dec('150'),
        grandTotal: dec('1150'),
        customer: { id: 'cust-test-001', name: 'Test Customer' },
        lines: [{ amount: dec('1000') }],
      });
      prisma.quote.create.mockResolvedValue(mockQuote as any);

      const result = await service.create(ORG_ID, validDto as any);

      expect(result).toBeDefined();

      const createCall = prisma.quote.create.mock.calls[0]![0]!;
      const data = createCall.data;

      // subtotal = 10 * 100 = 1000
      expectDecimalEqual(data.subtotal as any, '1000');
      // tax = 1000 * 0.15 = 150
      expectDecimalEqual(data.taxAmount as any, '150');
      // grandTotal = 1000 + 150 = 1150
      expectDecimalEqual(data.grandTotal as any, '1150');
    });

    it('should calculate line totals with discount applied', async () => {
      const dtoWithDiscount = {
        customerId: 'cust-test-001',
        date: '2024-06-15',
        expiryDate: '2024-07-15',
        lines: [{ description: 'Item', quantity: '5', rate: '200', discount: '10', taxRate: '20' }],
      };

      prisma.customer.findFirst.mockResolvedValue(createMockCustomer() as any);
      prisma.quote.findFirst.mockResolvedValue(null);
      prisma.quote.create.mockResolvedValue(createMockQuote() as any);

      await service.create(ORG_ID, dtoWithDiscount as any);

      const createCall = prisma.quote.create.mock.calls[0]![0]!;
      const data = createCall.data;

      // lineTotal = 5 * 200 * (1 - 10/100) = 900
      expectDecimalEqual(data.subtotal as any, '900');
      // lineTax = 900 * (20/100) = 180
      expectDecimalEqual(data.taxAmount as any, '180');
      // grandTotal = 900 + 180 = 1080
      expectDecimalEqual(data.grandTotal as any, '1080');
    });

    it('should handle multiple line items', async () => {
      const multiLineDto = {
        customerId: 'cust-test-001',
        date: '2024-06-15',
        expiryDate: '2024-07-15',
        lines: [
          { description: 'Service A', quantity: '2', rate: '500', taxRate: '10' },
          { description: 'Service B', quantity: '3', rate: '300', taxRate: '10' },
        ],
      };

      prisma.customer.findFirst.mockResolvedValue(createMockCustomer() as any);
      prisma.quote.findFirst.mockResolvedValue(null);
      prisma.quote.create.mockResolvedValue(createMockQuote() as any);

      await service.create(ORG_ID, multiLineDto as any);

      const createCall = prisma.quote.create.mock.calls[0]![0]!;
      const data = createCall.data;

      // Line A: 2 * 500 = 1000, tax = 100
      // Line B: 3 * 300 = 900, tax = 90
      // subtotal = 1900, taxAmount = 190, grandTotal = 2090
      expectDecimalEqual(data.subtotal as any, '1900');
      expectDecimalEqual(data.taxAmount as any, '190');
      expectDecimalEqual(data.grandTotal as any, '2090');
    });

    it('should throw BadRequestException when customer not found', async () => {
      prisma.customer.findFirst.mockResolvedValue(null);

      await expect(service.create(ORG_ID, validDto as any)).rejects.toThrow(BadRequestException);
      await expect(service.create(ORG_ID, validDto as any)).rejects.toThrow('Customer not found');
    });

    it('should generate EST-001 for first quote', async () => {
      prisma.customer.findFirst.mockResolvedValue(createMockCustomer() as any);
      prisma.quote.findFirst.mockResolvedValue(null);
      prisma.quote.create.mockResolvedValue(createMockQuote() as any);

      await service.create(ORG_ID, validDto as any);

      const createCall = prisma.quote.create.mock.calls[0]![0]!;
      expect(createCall.data.quoteNumber).toBe('EST-001');
    });

    it('should auto-increment quote numbers (EST-XXX format)', async () => {
      prisma.customer.findFirst.mockResolvedValue(createMockCustomer() as any);
      prisma.quote.findFirst.mockResolvedValue({ quoteNumber: 'EST-015' } as any);
      prisma.quote.create.mockResolvedValue(createMockQuote() as any);

      await service.create(ORG_ID, validDto as any);

      const createCall = prisma.quote.create.mock.calls[0]![0]!;
      expect(createCall.data.quoteNumber).toBe('EST-016');
    });

    it('should always include organizationId in the created record', async () => {
      prisma.customer.findFirst.mockResolvedValue(createMockCustomer() as any);
      prisma.quote.findFirst.mockResolvedValue(null);
      prisma.quote.create.mockResolvedValue(createMockQuote() as any);

      await service.create(ORG_ID, validDto as any);

      const createCall = prisma.quote.create.mock.calls[0]![0]!;
      expect(createCall.data.organizationId).toBe(ORG_ID);
    });

    it('should store monetary values as Decimal', async () => {
      prisma.customer.findFirst.mockResolvedValue(createMockCustomer() as any);
      prisma.quote.findFirst.mockResolvedValue(null);
      prisma.quote.create.mockResolvedValue(createMockQuote() as any);

      await service.create(ORG_ID, validDto as any);

      const createCall = prisma.quote.create.mock.calls[0]![0]!;
      const data = createCall.data;

      expect(data.subtotal).toBeInstanceOf(Decimal);
      expect(data.taxAmount).toBeInstanceOf(Decimal);
      expect(data.grandTotal).toBeInstanceOf(Decimal);
    });

    it('should create quote lines with nested create', async () => {
      prisma.customer.findFirst.mockResolvedValue(createMockCustomer() as any);
      prisma.quote.findFirst.mockResolvedValue(null);
      prisma.quote.create.mockResolvedValue(createMockQuote() as any);

      await service.create(ORG_ID, validDto as any);

      const createCall = prisma.quote.create.mock.calls[0]![0]! as any;
      expect(createCall.data.lines).toBeDefined();
      expect(createCall.data.lines.create).toHaveLength(1);
      expect(createCall.data.lines.create[0].description).toBe('Consulting services');
      expect(createCall.data.lines.create[0].quantity).toBeInstanceOf(Decimal);
      expect(createCall.data.lines.create[0].rate).toBeInstanceOf(Decimal);
    });

    it('should include customer and lines in response', async () => {
      prisma.customer.findFirst.mockResolvedValue(createMockCustomer() as any);
      prisma.quote.findFirst.mockResolvedValue(null);
      prisma.quote.create.mockResolvedValue(createMockQuote() as any);

      await service.create(ORG_ID, validDto as any);

      const createCall = prisma.quote.create.mock.calls[0]![0]! as any;
      expect(createCall.include).toBeDefined();
      expect(createCall.include.customer).toBeDefined();
      expect(createCall.include.lines).toBe(true);
    });
  });

  describe('findAll', () => {
    it('should return paginated results with meta', async () => {
      prisma.quote.findMany.mockResolvedValue([
        createMockQuote({ id: 'q1', quoteNumber: 'EST-001' }),
        createMockQuote({ id: 'q2', quoteNumber: 'EST-002' }),
      ] as any);
      prisma.quote.count.mockResolvedValue(2);

      const result = await service.findAll(ORG_ID, { page: 1, limit: 20 });

      expect(result.data).toHaveLength(2);
      expect(result.meta.total).toBe(2);
      expect(result.meta.totalPages).toBe(1);
    });

    it('should always filter by organizationId and exclude soft-deleted', async () => {
      prisma.quote.findMany.mockResolvedValue([]);
      prisma.quote.count.mockResolvedValue(0);

      await service.findAll(ORG_ID, {});

      const findCall = prisma.quote.findMany.mock.calls[0]![0]!;
      expect(findCall.where!.organizationId).toBe(ORG_ID);
      expect(findCall.where!.deletedAt).toBeNull();
    });

    it('should apply search filter across quoteNumber and customer name', async () => {
      prisma.quote.findMany.mockResolvedValue([]);
      prisma.quote.count.mockResolvedValue(0);

      await service.findAll(ORG_ID, { search: 'EST-001' });

      const findCall = prisma.quote.findMany.mock.calls[0]![0]!;
      expect(findCall.where!.OR).toBeDefined();
      expect(findCall.where!.OR).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ quoteNumber: { contains: 'EST-001', mode: 'insensitive' } }),
          expect.objectContaining({
            customer: { name: { contains: 'EST-001', mode: 'insensitive' } },
          }),
        ]),
      );
    });

    it('should use default sort by date descending', async () => {
      prisma.quote.findMany.mockResolvedValue([]);
      prisma.quote.count.mockResolvedValue(0);

      await service.findAll(ORG_ID, {});

      const findCall = prisma.quote.findMany.mock.calls[0]![0]!;
      expect(findCall.orderBy).toEqual({ date: 'desc' });
    });

    it('should paginate correctly with skip and take', async () => {
      prisma.quote.findMany.mockResolvedValue([]);
      prisma.quote.count.mockResolvedValue(50);

      await service.findAll(ORG_ID, { page: 3, limit: 10 });

      const findCall = prisma.quote.findMany.mock.calls[0]![0]!;
      expect(findCall.skip).toBe(20); // (3-1) * 10
      expect(findCall.take).toBe(10);
    });

    it('should calculate totalPages correctly', async () => {
      prisma.quote.findMany.mockResolvedValue([]);
      prisma.quote.count.mockResolvedValue(45);

      const result = await service.findAll(ORG_ID, { page: 1, limit: 20 });

      expect(result.meta.totalPages).toBe(3); // ceil(45/20) = 3
    });
  });

  describe('findOne', () => {
    it('should return quote with customer and lines', async () => {
      const quote = createMockQuote({
        id: 'q-1',
        customer: createMockCustomer(),
        lines: [],
      });
      prisma.quote.findFirst.mockResolvedValue(quote as any);

      const result = await service.findOne(ORG_ID, 'q-1');

      expect(result).toBeDefined();
      expect(result.id).toBe('q-1');
    });

    it('should throw NotFoundException for non-existent quote', async () => {
      prisma.quote.findFirst.mockResolvedValue(null);

      await expect(service.findOne(ORG_ID, 'nonexistent')).rejects.toThrow(NotFoundException);
      await expect(service.findOne(ORG_ID, 'nonexistent')).rejects.toThrow('Quote not found');
    });

    it('should filter by organizationId and exclude soft-deleted', async () => {
      prisma.quote.findFirst.mockResolvedValue(null);

      try {
        await service.findOne(ORG_ID, 'q-1');
      } catch {
        // Expected
      }

      const findCall = prisma.quote.findFirst.mock.calls[0]![0]!;
      expect(findCall.where!.organizationId).toBe(ORG_ID);
      expect(findCall.where!.deletedAt).toBeNull();
    });
  });

  describe('update', () => {
    it('should only allow updating DRAFT quotes', async () => {
      const sentQuote = createMockQuote({ status: 'SENT' });
      prisma.quote.findFirst.mockResolvedValue(sentQuote as any);

      await expect(service.update(ORG_ID, 'q-1', { notes: 'updated' } as any)).rejects.toThrow(
        'Only draft quotes can be updated',
      );
    });

    it('should reject updating ACCEPTED quotes', async () => {
      const acceptedQuote = createMockQuote({ status: 'ACCEPTED' });
      prisma.quote.findFirst.mockResolvedValue(acceptedQuote as any);

      await expect(service.update(ORG_ID, 'q-1', { notes: 'updated' } as any)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject updating DECLINED quotes', async () => {
      const declinedQuote = createMockQuote({ status: 'DECLINED' });
      prisma.quote.findFirst.mockResolvedValue(declinedQuote as any);

      await expect(service.update(ORG_ID, 'q-1', { notes: 'updated' } as any)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject updating INVOICED quotes', async () => {
      const invoicedQuote = createMockQuote({ status: 'INVOICED' });
      prisma.quote.findFirst.mockResolvedValue(invoicedQuote as any);

      await expect(service.update(ORG_ID, 'q-1', { notes: 'updated' } as any)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException for non-existent quote', async () => {
      prisma.quote.findFirst.mockResolvedValue(null);

      await expect(service.update(ORG_ID, 'nonexistent', {} as any)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should update a DRAFT quote successfully', async () => {
      const draftQuote = createMockQuote({ status: 'DRAFT' });
      prisma.quote.findFirst.mockResolvedValue(draftQuote as any);
      prisma.quote.update.mockResolvedValue({ ...draftQuote, notes: 'new notes' } as any);

      const result = await service.update(ORG_ID, 'q-1', { notes: 'new notes' } as any);

      expect(result).toBeDefined();
      expect(prisma.quote.update).toHaveBeenCalled();
    });
  });

  describe('send (status transition DRAFT -> SENT)', () => {
    it('should transition quote from DRAFT to SENT', async () => {
      const draftQuote = createMockQuote({ status: 'DRAFT' });
      prisma.quote.findFirst.mockResolvedValue(draftQuote as any);
      prisma.quote.update.mockResolvedValue({ ...draftQuote, status: 'SENT' } as any);

      const result = await service.send(ORG_ID, 'q-1');

      expect(result.status).toBe('SENT');
    });

    it('should reject sending a non-DRAFT quote', async () => {
      const sentQuote = createMockQuote({ status: 'SENT' });
      prisma.quote.findFirst.mockResolvedValue(sentQuote as any);

      await expect(service.send(ORG_ID, 'q-1')).rejects.toThrow('Only draft quotes can be sent');
    });

    it('should reject sending an ACCEPTED quote', async () => {
      const acceptedQuote = createMockQuote({ status: 'ACCEPTED' });
      prisma.quote.findFirst.mockResolvedValue(acceptedQuote as any);

      await expect(service.send(ORG_ID, 'q-1')).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException for non-existent quote', async () => {
      prisma.quote.findFirst.mockResolvedValue(null);

      await expect(service.send(ORG_ID, 'nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('accept (status transition SENT -> ACCEPTED)', () => {
    it('should transition quote from SENT to ACCEPTED', async () => {
      const sentQuote = createMockQuote({ status: 'SENT' });
      prisma.quote.findFirst.mockResolvedValue(sentQuote as any);
      prisma.quote.update.mockResolvedValue({ ...sentQuote, status: 'ACCEPTED' } as any);

      const result = await service.accept(ORG_ID, 'q-1');

      expect(result.status).toBe('ACCEPTED');
    });

    it('should reject accepting a DRAFT quote', async () => {
      const draftQuote = createMockQuote({ status: 'DRAFT' });
      prisma.quote.findFirst.mockResolvedValue(draftQuote as any);

      await expect(service.accept(ORG_ID, 'q-1')).rejects.toThrow(
        'Only sent quotes can be accepted',
      );
    });

    it('should reject accepting an already ACCEPTED quote', async () => {
      const acceptedQuote = createMockQuote({ status: 'ACCEPTED' });
      prisma.quote.findFirst.mockResolvedValue(acceptedQuote as any);

      await expect(service.accept(ORG_ID, 'q-1')).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException for non-existent quote', async () => {
      prisma.quote.findFirst.mockResolvedValue(null);

      await expect(service.accept(ORG_ID, 'nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('decline (status transition SENT -> DECLINED)', () => {
    it('should transition quote from SENT to DECLINED', async () => {
      const sentQuote = createMockQuote({ status: 'SENT' });
      prisma.quote.findFirst.mockResolvedValue(sentQuote as any);
      prisma.quote.update.mockResolvedValue({ ...sentQuote, status: 'DECLINED' } as any);

      const result = await service.decline(ORG_ID, 'q-1');

      expect(result.status).toBe('DECLINED');
    });

    it('should reject declining a DRAFT quote', async () => {
      const draftQuote = createMockQuote({ status: 'DRAFT' });
      prisma.quote.findFirst.mockResolvedValue(draftQuote as any);

      await expect(service.decline(ORG_ID, 'q-1')).rejects.toThrow(
        'Only sent quotes can be declined',
      );
    });

    it('should throw NotFoundException for non-existent quote', async () => {
      prisma.quote.findFirst.mockResolvedValue(null);

      await expect(service.decline(ORG_ID, 'nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('convertToInvoice (ACCEPTED -> INVOICED)', () => {
    it('should convert an ACCEPTED quote to an invoice', async () => {
      const acceptedQuote = createMockQuote({
        status: 'ACCEPTED',
        subtotal: dec('1000'),
        taxAmount: dec('150'),
        grandTotal: dec('1150'),
        lines: [
          {
            itemId: 'item-1',
            description: 'Service',
            quantity: dec('10'),
            rate: dec('100'),
            discount: dec('0'),
            taxRate: dec('15'),
            amount: dec('1000'),
          },
        ],
      });
      prisma.quote.findFirst.mockResolvedValue(acceptedQuote as any);
      prisma.invoice.findFirst.mockResolvedValue(null); // for invoice numbering
      prisma.invoice.create.mockResolvedValue({
        id: 'inv-new',
        invoiceNumber: 'INV-001',
        quoteId: 'quote-test-001',
      } as any);
      prisma.quote.update.mockResolvedValue({
        ...acceptedQuote,
        status: 'INVOICED',
      } as any);

      const result = await service.convertToInvoice(ORG_ID, 'quote-test-001');

      expect(result).toBeDefined();
      expect(result.invoiceNumber).toBe('INV-001');

      // Verify invoice was created with quote data
      const createCall = prisma.invoice.create.mock.calls[0]![0]!;
      expect(createCall.data.quoteId).toBe('quote-test-001');
      expect(createCall.data.organizationId).toBe(ORG_ID);
      expectDecimalEqual(createCall.data.subtotal as any, '1000');
      expectDecimalEqual(createCall.data.grandTotal as any, '1150');
      expectDecimalEqual(createCall.data.balanceDue as any, '1150');

      // Verify quote status was updated to INVOICED
      expect(prisma.quote.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'INVOICED' },
        }),
      );
    });

    it('should reject converting a non-ACCEPTED quote', async () => {
      const draftQuote = createMockQuote({ status: 'DRAFT', lines: [] });
      prisma.quote.findFirst.mockResolvedValue(draftQuote as any);

      await expect(service.convertToInvoice(ORG_ID, 'q-1')).rejects.toThrow(
        'Only accepted quotes can be converted',
      );
    });

    it('should reject converting a SENT quote', async () => {
      const sentQuote = createMockQuote({ status: 'SENT', lines: [] });
      prisma.quote.findFirst.mockResolvedValue(sentQuote as any);

      await expect(service.convertToInvoice(ORG_ID, 'q-1')).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException for non-existent quote', async () => {
      prisma.quote.findFirst.mockResolvedValue(null);

      await expect(service.convertToInvoice(ORG_ID, 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should generate INV-001 for first invoice from quote', async () => {
      const acceptedQuote = createMockQuote({
        status: 'ACCEPTED',
        lines: [],
      });
      prisma.quote.findFirst.mockResolvedValue(acceptedQuote as any);
      prisma.invoice.findFirst.mockResolvedValue(null);
      prisma.invoice.create.mockResolvedValue({ invoiceNumber: 'INV-001' } as any);
      prisma.quote.update.mockResolvedValue({} as any);

      await service.convertToInvoice(ORG_ID, 'q-1');

      const createCall = prisma.invoice.create.mock.calls[0]![0]!;
      expect(createCall.data.invoiceNumber).toBe('INV-001');
    });

    it('should auto-increment invoice number from existing invoices', async () => {
      const acceptedQuote = createMockQuote({
        status: 'ACCEPTED',
        lines: [],
      });
      prisma.quote.findFirst.mockResolvedValue(acceptedQuote as any);
      prisma.invoice.findFirst.mockResolvedValue({ invoiceNumber: 'INV-042' } as any);
      prisma.invoice.create.mockResolvedValue({ invoiceNumber: 'INV-043' } as any);
      prisma.quote.update.mockResolvedValue({} as any);

      await service.convertToInvoice(ORG_ID, 'q-1');

      const createCall = prisma.invoice.create.mock.calls[0]![0]!;
      expect(createCall.data.invoiceNumber).toBe('INV-043');
    });
  });

  describe('remove (soft delete)', () => {
    it('should soft-delete a quote', async () => {
      const quote = createMockQuote();
      prisma.quote.findFirst.mockResolvedValue(quote as any);
      prisma.quote.update.mockResolvedValue({ ...quote, deletedAt: new Date() } as any);

      const result = await service.remove(ORG_ID, 'q-1');

      expect(result.message).toBe('Quote deleted successfully');
      expect(prisma.quote.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ deletedAt: expect.any(Date) }),
        }),
      );
    });

    it('should never hard-delete quote records', async () => {
      const quote = createMockQuote();
      prisma.quote.findFirst.mockResolvedValue(quote as any);
      prisma.quote.update.mockResolvedValue({ ...quote, deletedAt: new Date() } as any);

      await service.remove(ORG_ID, 'q-1');

      expect(prisma.quote.delete).not.toHaveBeenCalled();
      expect(prisma.quote.deleteMany).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException for non-existent quote', async () => {
      prisma.quote.findFirst.mockResolvedValue(null);

      await expect(service.remove(ORG_ID, 'nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('bulkDelete', () => {
    it('should soft-delete only DRAFT quotes for the organization', async () => {
      prisma.quote.updateMany.mockResolvedValue({ count: 3 } as any);

      const result = await service.bulkDelete(ORG_ID, ['q-1', 'q-2', 'q-3', 'q-4']);

      expect(result.deleted).toBe(3);
      expect(result.total).toBe(4);

      const updateCall = prisma.quote.updateMany.mock.calls[0]![0]!;
      expect(updateCall.where!.organizationId).toBe(ORG_ID);
      expect(updateCall.where!.status).toBe('DRAFT');
      expect(updateCall.where!.deletedAt).toBeNull();
      expect(updateCall.data.deletedAt).toBeDefined();
    });
  });

  describe('bulkSend', () => {
    it('should send only DRAFT quotes for the organization', async () => {
      prisma.quote.updateMany.mockResolvedValue({ count: 2 } as any);

      const result = await service.bulkSend(ORG_ID, ['q-1', 'q-2', 'q-3']);

      expect(result.sent).toBe(2);
      expect(result.total).toBe(3);

      const updateCall = prisma.quote.updateMany.mock.calls[0]![0]!;
      expect(updateCall.where!.organizationId).toBe(ORG_ID);
      expect(updateCall.where!.status).toBe('DRAFT');
      expect(updateCall.data.status).toBe('SENT');
    });
  });

  describe('bulkDecline', () => {
    it('should decline only SENT quotes for the organization', async () => {
      prisma.quote.updateMany.mockResolvedValue({ count: 1 } as any);

      const result = await service.bulkDecline(ORG_ID, ['q-1', 'q-2']);

      expect(result.declined).toBe(1);
      expect(result.total).toBe(2);

      const updateCall = prisma.quote.updateMany.mock.calls[0]![0]!;
      expect(updateCall.where!.organizationId).toBe(ORG_ID);
      expect(updateCall.where!.status).toBe('SENT');
      expect(updateCall.data.status).toBe('DECLINED');
    });
  });
});
