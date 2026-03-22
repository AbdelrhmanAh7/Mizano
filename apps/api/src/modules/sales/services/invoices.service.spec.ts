import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { InvoicesService } from './invoices.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { JournalsService } from '../../accounting/services/journals.service';
import { createMockPrisma, MockPrismaClient } from '../../../test/mocks/prisma.mock';
import { createMockInvoice, createMockCustomer } from '../../../test/helpers/test-utils';
import { dec, expectDecimalEqual } from '../../../test/helpers/decimal.helpers';

describe('InvoicesService', () => {
  let service: InvoicesService;
  let prisma: MockPrismaClient;
  let journalsService: { create: jest.Mock };

  const ORG_ID = 'org-test-001';

  beforeEach(async () => {
    prisma = createMockPrisma();
    journalsService = {
      create: jest.fn().mockResolvedValue({}),
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

    it('should create an invoice with correct total calculation', async () => {
      prisma.customer.findFirst.mockResolvedValue(createMockCustomer() as any);
      prisma.invoice.findFirst.mockResolvedValue(null); // no existing invoice for numbering

      const mockInvoice = createMockInvoice({
        invoiceNumber: 'INV-001',
        subtotal: dec('1000'),
        taxAmount: dec('150'),
        grandTotal: dec('1150'),
        balanceDue: dec('1150'),
        lines: [{ amount: dec('1000') }],
        customer: { id: 'cust-test-001', name: 'Test Customer', email: 'test@test.com' },
      });
      prisma.invoice.create.mockResolvedValue(mockInvoice as any);

      const result = await service.create(ORG_ID, validDto);

      expect(result).toBeDefined();
      // Verify the create call had correct calculated totals
      const createCall = prisma.invoice.create.mock.calls[0][0];
      const data = createCall.data;

      // subtotal = 10 * 100 = 1000
      expectDecimalEqual(data.subtotal as any, '1000');
      // tax = 1000 * 0.15 = 150
      expectDecimalEqual(data.taxAmount as any, '150');
      // grandTotal = 1000 + 150 = 1150
      expectDecimalEqual(data.grandTotal as any, '1150');
      // balanceDue = grandTotal
      expectDecimalEqual(data.balanceDue as any, '1150');
    });

    it('should calculate line totals with discount applied', async () => {
      const dtoWithDiscount = {
        customerId: 'cust-test-001',
        date: '2024-06-15',
        dueDate: '2024-07-15',
        lines: [{ description: 'Item', quantity: '5', rate: '200', discount: '10', taxRate: '20' }],
      };

      prisma.customer.findFirst.mockResolvedValue(createMockCustomer() as any);
      prisma.invoice.findFirst.mockResolvedValue(null);
      prisma.invoice.create.mockResolvedValue(createMockInvoice() as any);

      await service.create(ORG_ID, dtoWithDiscount);

      const createCall = prisma.invoice.create.mock.calls[0][0];
      const data = createCall.data;

      // lineTotal = 5 * 200 * (1 - 10/100) = 900
      expectDecimalEqual(data.subtotal as any, '900');
      // lineTax = 900 * (20/100) = 180
      expectDecimalEqual(data.taxAmount as any, '180');
      // grandTotal = 900 + 180 = 1080
      expectDecimalEqual(data.grandTotal as any, '1080');
    });

    it('should include shipping amount in grandTotal', async () => {
      const dtoWithShipping = {
        ...validDto,
        shippingAmount: '50',
      };

      prisma.customer.findFirst.mockResolvedValue(createMockCustomer() as any);
      prisma.invoice.findFirst.mockResolvedValue(null);
      prisma.invoice.create.mockResolvedValue(createMockInvoice() as any);

      await service.create(ORG_ID, dtoWithShipping);

      const createCall = prisma.invoice.create.mock.calls[0][0];
      const data = createCall.data;

      // subtotal = 1000, tax = 150, shipping = 50
      // grandTotal = 1000 + 150 + 50 = 1200
      expectDecimalEqual(data.grandTotal as any, '1200');
    });

    it('should handle multiple line items', async () => {
      const multiLineDto = {
        customerId: 'cust-test-001',
        date: '2024-06-15',
        dueDate: '2024-07-15',
        lines: [
          { description: 'Service A', quantity: '2', rate: '500', taxRate: '10' },
          { description: 'Service B', quantity: '3', rate: '300', taxRate: '10' },
        ],
      };

      prisma.customer.findFirst.mockResolvedValue(createMockCustomer() as any);
      prisma.invoice.findFirst.mockResolvedValue(null);
      prisma.invoice.create.mockResolvedValue(createMockInvoice() as any);

      await service.create(ORG_ID, multiLineDto);

      const createCall = prisma.invoice.create.mock.calls[0][0];
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

      await expect(service.create(ORG_ID, validDto)).rejects.toThrow(BadRequestException);
      await expect(service.create(ORG_ID, validDto)).rejects.toThrow('Customer not found');
    });

    it('should generate INV-001 for first invoice', async () => {
      prisma.customer.findFirst.mockResolvedValue(createMockCustomer() as any);
      prisma.invoice.findFirst.mockResolvedValue(null);
      prisma.invoice.create.mockResolvedValue(createMockInvoice() as any);

      await service.create(ORG_ID, validDto);

      const createCall = prisma.invoice.create.mock.calls[0][0];
      expect(createCall.data.invoiceNumber).toBe('INV-001');
    });

    it('should auto-increment invoice numbers (INV-XXX format)', async () => {
      prisma.customer.findFirst.mockResolvedValue(createMockCustomer() as any);
      prisma.invoice.findFirst.mockResolvedValue({ invoiceNumber: 'INV-015' } as any);
      prisma.invoice.create.mockResolvedValue(createMockInvoice() as any);

      await service.create(ORG_ID, validDto);

      const createCall = prisma.invoice.create.mock.calls[0][0];
      expect(createCall.data.invoiceNumber).toBe('INV-016');
    });

    it('should always include organizationId in the created record', async () => {
      prisma.customer.findFirst.mockResolvedValue(createMockCustomer() as any);
      prisma.invoice.findFirst.mockResolvedValue(null);
      prisma.invoice.create.mockResolvedValue(createMockInvoice() as any);

      await service.create(ORG_ID, validDto);

      const createCall = prisma.invoice.create.mock.calls[0][0];
      expect(createCall.data.organizationId).toBe(ORG_ID);
    });

    it('should store monetary values as Decimal, not floating-point numbers', async () => {
      prisma.customer.findFirst.mockResolvedValue(createMockCustomer() as any);
      prisma.invoice.findFirst.mockResolvedValue(null);
      prisma.invoice.create.mockResolvedValue(createMockInvoice() as any);

      await service.create(ORG_ID, validDto);

      const createCall = prisma.invoice.create.mock.calls[0][0];
      const data = createCall.data;

      expect(data.subtotal).toBeInstanceOf(Decimal);
      expect(data.taxAmount).toBeInstanceOf(Decimal);
      expect(data.grandTotal).toBeInstanceOf(Decimal);
      expect(data.balanceDue).toBeInstanceOf(Decimal);
    });
  });

  describe('findOne', () => {
    it('should return invoice with customer and lines', async () => {
      const invoice = createMockInvoice({
        id: 'inv-1',
        customer: createMockCustomer(),
        lines: [],
        paymentAllocations: [],
        creditNotes: [],
      });
      prisma.invoice.findFirst.mockResolvedValue(invoice as any);

      const result = await service.findOne(ORG_ID, 'inv-1');
      expect(result).toBeDefined();
      expect(result.id).toBe('inv-1');
    });

    it('should throw NotFoundException for non-existent invoice', async () => {
      prisma.invoice.findFirst.mockResolvedValue(null);

      await expect(service.findOne(ORG_ID, 'nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('should filter by organizationId and exclude soft-deleted', async () => {
      prisma.invoice.findFirst.mockResolvedValue(null);

      try {
        await service.findOne(ORG_ID, 'inv-1');
      } catch {
        // Expected
      }

      const findCall = prisma.invoice.findFirst.mock.calls[0]![0]!;
      expect(findCall.where!.organizationId).toBe(ORG_ID);
      expect(findCall.where!.deletedAt).toBeNull();
    });
  });

  describe('update', () => {
    it('should only allow updating DRAFT invoices', async () => {
      const sentInvoice = createMockInvoice({ status: 'SENT' });
      prisma.invoice.findFirst.mockResolvedValue(sentInvoice as any);

      await expect(service.update(ORG_ID, 'inv-1', { notes: 'updated' } as any)).rejects.toThrow(
        'Only draft invoices can be updated',
      );
    });

    it('should reject updating PAID invoices', async () => {
      const paidInvoice = createMockInvoice({ status: 'PAID' });
      prisma.invoice.findFirst.mockResolvedValue(paidInvoice as any);

      await expect(service.update(ORG_ID, 'inv-1', { notes: 'updated' } as any)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject updating VOID invoices', async () => {
      const voidInvoice = createMockInvoice({ status: 'VOID' });
      prisma.invoice.findFirst.mockResolvedValue(voidInvoice as any);

      await expect(service.update(ORG_ID, 'inv-1', { notes: 'updated' } as any)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException for non-existent invoice', async () => {
      prisma.invoice.findFirst.mockResolvedValue(null);

      await expect(service.update(ORG_ID, 'nonexistent', {} as any)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('send (status transition DRAFT -> SENT)', () => {
    it('should transition invoice from DRAFT to SENT', async () => {
      const invoice = createMockInvoice({
        status: 'DRAFT',
        grandTotal: dec('1150'),
        subtotal: dec('1000'),
        taxAmount: dec('150'),
        shippingAmount: dec('0'),
        invoiceNumber: 'INV-001',
      });
      prisma.invoice.findFirst.mockResolvedValue(invoice as any);
      prisma.organization.findUnique.mockResolvedValue({
        defaultArAccountId: 'ar-acc',
        defaultRevenueAccountId: 'rev-acc',
        defaultVatPayableAccountId: 'vat-acc',
      } as any);
      prisma.invoice.update.mockResolvedValue({
        ...invoice,
        status: 'SENT',
      } as any);

      const result = await service.send(ORG_ID, 'inv-1');

      expect(result.status).toBe('SENT');
    });

    it('should create a balanced journal entry when sending invoice', async () => {
      const invoice = createMockInvoice({
        status: 'DRAFT',
        grandTotal: dec('1150'),
        subtotal: dec('1000'),
        taxAmount: dec('150'),
        shippingAmount: dec('0'),
        invoiceNumber: 'INV-001',
      });
      prisma.invoice.findFirst.mockResolvedValue(invoice as any);
      prisma.organization.findUnique.mockResolvedValue({
        defaultArAccountId: 'ar-acc',
        defaultRevenueAccountId: 'rev-acc',
        defaultVatPayableAccountId: 'vat-acc',
      } as any);
      prisma.invoice.update.mockResolvedValue({ ...invoice, status: 'SENT' } as any);

      await service.send(ORG_ID, 'inv-1');

      expect(journalsService.create).toHaveBeenCalledWith(
        ORG_ID,
        expect.objectContaining({
          lines: expect.arrayContaining([
            expect.objectContaining({ accountId: 'ar-acc', debit: '1150.0000', credit: '0' }),
            expect.objectContaining({ accountId: 'rev-acc', debit: '0', credit: '1000.0000' }),
            expect.objectContaining({ accountId: 'vat-acc', debit: '0', credit: '150.0000' }),
          ]),
        }),
      );
    });

    it('should reject sending a non-DRAFT invoice', async () => {
      const sentInvoice = createMockInvoice({ status: 'SENT' });
      prisma.invoice.findFirst.mockResolvedValue(sentInvoice as any);

      await expect(service.send(ORG_ID, 'inv-1')).rejects.toThrow(
        'Only draft invoices can be sent',
      );
    });

    it('should throw when default accounts are not configured', async () => {
      const invoice = createMockInvoice({ status: 'DRAFT' });
      prisma.invoice.findFirst.mockResolvedValue(invoice as any);
      prisma.organization.findUnique.mockResolvedValue({
        defaultArAccountId: null,
        defaultRevenueAccountId: null,
      } as any);

      await expect(service.send(ORG_ID, 'inv-1')).rejects.toThrow(/configure default accounts/);
    });
  });

  describe('voidInvoice', () => {
    it('should void an invoice without payments', async () => {
      const invoice = createMockInvoice({
        status: 'SENT',
        paymentAllocations: [],
      });
      prisma.invoice.findFirst.mockResolvedValue(invoice as any);
      prisma.invoice.update.mockResolvedValue({ ...invoice, status: 'VOID' } as any);

      const result = await service.voidInvoice(ORG_ID, 'inv-1');
      expect(result.status).toBe('VOID');
    });

    it('should prevent voiding an invoice with existing payments', async () => {
      const invoice = createMockInvoice({
        paymentAllocations: [{ id: 'pa-1', amount: dec('500') }],
      });
      prisma.invoice.findFirst.mockResolvedValue(invoice as any);

      await expect(service.voidInvoice(ORG_ID, 'inv-1')).rejects.toThrow(
        'Cannot void invoice with payments',
      );
    });
  });

  describe('remove (soft delete)', () => {
    it('should soft-delete a DRAFT invoice', async () => {
      const invoice = createMockInvoice({ status: 'DRAFT', paymentAllocations: [] });
      prisma.invoice.findFirst.mockResolvedValue(invoice as any);
      prisma.invoice.update.mockResolvedValue({ ...invoice, deletedAt: new Date() } as any);

      const result = await service.remove(ORG_ID, 'inv-1');

      expect(result.message).toBe('Invoice deleted successfully');
      expect(prisma.invoice.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ deletedAt: expect.any(Date) }),
        }),
      );
    });

    it('should only allow deleting DRAFT invoices', async () => {
      const sentInvoice = createMockInvoice({ status: 'SENT', paymentAllocations: [] });
      prisma.invoice.findFirst.mockResolvedValue(sentInvoice as any);

      await expect(service.remove(ORG_ID, 'inv-1')).rejects.toThrow(
        'Only draft invoices can be deleted',
      );
    });

    it('should never hard-delete financial records', async () => {
      const invoice = createMockInvoice({ status: 'DRAFT', paymentAllocations: [] });
      prisma.invoice.findFirst.mockResolvedValue(invoice as any);
      prisma.invoice.update.mockResolvedValue({ ...invoice, deletedAt: new Date() } as any);

      await service.remove(ORG_ID, 'inv-1');

      expect(prisma.invoice.delete).not.toHaveBeenCalled();
      expect(prisma.invoice.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('recordPayment', () => {
    it('should record a full payment and update balance', async () => {
      const invoice = createMockInvoice({
        status: 'SENT',
        grandTotal: dec('1000'),
        balanceDue: dec('1000'),
        customer: { id: 'cust-1', name: 'Customer' },
      });
      prisma.invoice.findFirst.mockResolvedValue(invoice as any);
      prisma.paymentReceived.findFirst.mockResolvedValue(null);
      prisma.paymentReceived.create.mockResolvedValue({
        id: 'pmt-1',
        paymentNumber: 'PMT-001',
        amount: dec('1000'),
        allocations: [{ invoiceId: 'inv-test-001', amount: dec('1000') }],
        customer: { id: 'cust-1', name: 'Customer' },
      } as any);

      // Mock for updateBalanceDue
      prisma.invoice.findUnique.mockResolvedValue({
        ...invoice,
        paymentAllocations: [{ amount: dec('1000') }],
        creditNotes: [],
      } as any);
      prisma.invoice.update.mockResolvedValue({} as any);

      const result = await service.recordPayment(ORG_ID, 'inv-test-001', {
        amount: 1000,
        date: '2024-07-01',
        bankAccountId: 'bank-1',
      });

      expect(result).toBeDefined();
      expect(result.paymentNumber).toBe('PMT-001');
    });

    it('should reject payment exceeding balance due', async () => {
      const invoice = createMockInvoice({
        status: 'SENT',
        grandTotal: dec('1000'),
        balanceDue: dec('500'),
        customer: { id: 'cust-1', name: 'Customer' },
      });
      prisma.invoice.findFirst.mockResolvedValue(invoice as any);

      await expect(
        service.recordPayment(ORG_ID, 'inv-1', {
          amount: 600,
          date: '2024-07-01',
          bankAccountId: 'bank-1',
        }),
      ).rejects.toThrow('Payment amount exceeds balance due');
    });

    it('should reject payment on a DRAFT invoice', async () => {
      const invoice = createMockInvoice({ status: 'DRAFT' });
      prisma.invoice.findFirst.mockResolvedValue(invoice as any);

      await expect(
        service.recordPayment(ORG_ID, 'inv-1', {
          amount: 100,
          date: '2024-07-01',
          bankAccountId: 'bank-1',
        }),
      ).rejects.toThrow('Cannot record payment for a draft invoice');
    });

    it('should reject payment on a VOID invoice', async () => {
      const invoice = createMockInvoice({ status: 'VOID' });
      prisma.invoice.findFirst.mockResolvedValue(invoice as any);

      await expect(
        service.recordPayment(ORG_ID, 'inv-1', {
          amount: 100,
          date: '2024-07-01',
          bankAccountId: 'bank-1',
        }),
      ).rejects.toThrow('Cannot record payment for a voided invoice');
    });
  });

  describe('updateBalanceDue', () => {
    it('should mark invoice as PAID when fully paid', async () => {
      const invoice = createMockInvoice({
        id: 'inv-1',
        grandTotal: dec('1000'),
        status: 'SENT',
        paymentAllocations: [{ amount: dec('1000') }],
        creditNotes: [],
      });
      prisma.invoice.findUnique.mockResolvedValue(invoice as any);
      prisma.invoice.update.mockResolvedValue({} as any);

      await service.updateBalanceDue('inv-1');

      const updateCall = prisma.invoice.update.mock.calls[0]![0]!;
      expect(updateCall.data.status).toBe('PAID');
      expectDecimalEqual(updateCall.data.balanceDue as any, '0');
    });

    it('should mark invoice as PARTIALLY_PAID for partial payments', async () => {
      const invoice = createMockInvoice({
        id: 'inv-1',
        grandTotal: dec('1000'),
        status: 'SENT',
        paymentAllocations: [{ amount: dec('400') }],
        creditNotes: [],
      });
      prisma.invoice.findUnique.mockResolvedValue(invoice as any);
      prisma.invoice.update.mockResolvedValue({} as any);

      await service.updateBalanceDue('inv-1');

      const updateCall = prisma.invoice.update.mock.calls[0]![0]!;
      expect(updateCall.data.status).toBe('PARTIALLY_PAID');
      expectDecimalEqual(updateCall.data.balanceDue as any, '600');
    });

    it('should account for credit notes in balance calculation', async () => {
      const invoice = createMockInvoice({
        id: 'inv-1',
        grandTotal: dec('1000'),
        status: 'SENT',
        paymentAllocations: [{ amount: dec('500') }],
        creditNotes: [{ type: 'APPLY_TO_INVOICE', amount: dec('500'), deletedAt: null }],
      });
      prisma.invoice.findUnique.mockResolvedValue(invoice as any);
      prisma.invoice.update.mockResolvedValue({} as any);

      await service.updateBalanceDue('inv-1');

      const updateCall = prisma.invoice.update.mock.calls[0]![0]!;
      // 1000 - 500 (payment) - 500 (credit) = 0
      expect(updateCall.data.status).toBe('PAID');
      expectDecimalEqual(updateCall.data.balanceDue as any, '0');
    });
  });
});
