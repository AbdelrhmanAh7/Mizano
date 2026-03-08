import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { CreditNotesService } from './credit-notes.service';
import { InvoicesService } from './invoices.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { JournalsService } from '../../accounting/services/journals.service';
import { createMockPrisma, MockPrismaClient } from '../../../test/mocks/prisma.mock';
import { createMockCustomer, createMockInvoice } from '../../../test/helpers/test-utils';

function createMockCreditNote(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cn-test-001',
    creditNoteNumber: 'CN-001',
    organizationId: 'org-test-001',
    customerId: 'cust-test-001',
    invoiceId: 'inv-test-001',
    date: new Date('2024-07-01'),
    reason: 'Goods returned',
    amount: new Decimal('200.0000'),
    type: 'APPLY_TO_INVOICE',
    appliedToInvoiceId: null,
    deletedAt: null,
    createdAt: new Date('2024-07-01'),
    updatedAt: new Date('2024-07-01'),
    ...overrides,
  };
}

describe('CreditNotesService', () => {
  let service: CreditNotesService;
  let prisma: MockPrismaClient;
  let invoicesService: { updateBalanceDue: jest.Mock };
  let journalsService: { create: jest.Mock };

  const ORG_ID = 'org-test-001';

  beforeEach(async () => {
    prisma = createMockPrisma();
    invoicesService = {
      updateBalanceDue: jest.fn().mockResolvedValue(undefined),
    };
    journalsService = {
      create: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreditNotesService,
        { provide: PrismaService, useValue: prisma },
        { provide: InvoicesService, useValue: invoicesService },
        { provide: JournalsService, useValue: journalsService },
      ],
    }).compile();

    service = module.get<CreditNotesService>(CreditNotesService);
  });

  describe('create', () => {
    const validDto = {
      customerId: 'cust-test-001',
      invoiceId: 'inv-test-001',
      date: '2024-07-01',
      reason: 'Goods returned',
      amount: '200',
      type: 'APPLY_TO_INVOICE' as const,
      appliedToInvoiceId: 'inv-test-001',
    };

    it('should create a credit note with correct data', async () => {
      const invoice = createMockInvoice({ customerId: 'cust-test-001' });
      prisma.invoice.findFirst.mockResolvedValue(invoice as any);
      prisma.organization.findUnique.mockResolvedValue({
        defaultArAccountId: 'ar-acc',
        defaultSalesReturnsAccountId: 'sr-acc',
        defaultVatPayableAccountId: 'vat-acc',
      } as any);
      prisma.creditNote.findFirst.mockResolvedValue(null); // for numbering
      prisma.creditNote.create.mockResolvedValue(
        createMockCreditNote({
          creditNoteNumber: 'CN-001',
          customer: { id: 'cust-test-001', name: 'Test Customer' },
          invoice: { id: 'inv-test-001', invoiceNumber: 'INV-001' },
        }) as any,
      );

      const result = await service.create(ORG_ID, validDto as any);

      expect(result).toBeDefined();
      expect(result.creditNoteNumber).toBe('CN-001');
    });

    it('should generate CN-001 for first credit note', async () => {
      const invoice = createMockInvoice({ customerId: 'cust-test-001' });
      prisma.invoice.findFirst.mockResolvedValue(invoice as any);
      prisma.organization.findUnique.mockResolvedValue({
        defaultArAccountId: 'ar-acc',
        defaultSalesReturnsAccountId: 'sr-acc',
        defaultVatPayableAccountId: 'vat-acc',
      } as any);
      prisma.creditNote.findFirst.mockResolvedValue(null);
      prisma.creditNote.create.mockResolvedValue(createMockCreditNote() as any);

      await service.create(ORG_ID, validDto as any);

      const createCall = prisma.creditNote.create.mock.calls[0]![0]!;
      expect(createCall.data.creditNoteNumber).toBe('CN-001');
    });

    it('should auto-increment credit note numbers (CN-XXX format)', async () => {
      const invoice = createMockInvoice({ customerId: 'cust-test-001' });
      prisma.invoice.findFirst.mockResolvedValue(invoice as any);
      prisma.organization.findUnique.mockResolvedValue({
        defaultArAccountId: 'ar-acc',
        defaultSalesReturnsAccountId: 'sr-acc',
        defaultVatPayableAccountId: 'vat-acc',
      } as any);
      prisma.creditNote.findFirst.mockResolvedValue({ creditNoteNumber: 'CN-010' } as any);
      prisma.creditNote.create.mockResolvedValue(createMockCreditNote() as any);

      await service.create(ORG_ID, validDto as any);

      const createCall = prisma.creditNote.create.mock.calls[0]![0]!;
      expect(createCall.data.creditNoteNumber).toBe('CN-011');
    });

    it('should always include organizationId in the created record', async () => {
      const invoice = createMockInvoice({ customerId: 'cust-test-001' });
      prisma.invoice.findFirst.mockResolvedValue(invoice as any);
      prisma.organization.findUnique.mockResolvedValue({
        defaultArAccountId: 'ar-acc',
        defaultSalesReturnsAccountId: 'sr-acc',
        defaultVatPayableAccountId: 'vat-acc',
      } as any);
      prisma.creditNote.findFirst.mockResolvedValue(null);
      prisma.creditNote.create.mockResolvedValue(createMockCreditNote() as any);

      await service.create(ORG_ID, validDto as any);

      const createCall = prisma.creditNote.create.mock.calls[0]![0]!;
      expect(createCall.data.organizationId).toBe(ORG_ID);
    });

    it('should store amount as Decimal', async () => {
      const invoice = createMockInvoice({ customerId: 'cust-test-001' });
      prisma.invoice.findFirst.mockResolvedValue(invoice as any);
      prisma.organization.findUnique.mockResolvedValue({
        defaultArAccountId: 'ar-acc',
        defaultSalesReturnsAccountId: 'sr-acc',
        defaultVatPayableAccountId: 'vat-acc',
      } as any);
      prisma.creditNote.findFirst.mockResolvedValue(null);
      prisma.creditNote.create.mockResolvedValue(createMockCreditNote() as any);

      await service.create(ORG_ID, validDto as any);

      const createCall = prisma.creditNote.create.mock.calls[0]![0]!;
      expect(createCall.data.amount).toBeInstanceOf(Decimal);
    });

    it('should throw BadRequestException when invoice not found', async () => {
      prisma.invoice.findFirst.mockResolvedValue(null);

      await expect(service.create(ORG_ID, validDto as any)).rejects.toThrow(BadRequestException);
      await expect(service.create(ORG_ID, validDto as any)).rejects.toThrow('Invoice not found');
    });

    it('should throw BadRequestException when invoice does not belong to customer', async () => {
      const invoice = createMockInvoice({ customerId: 'different-customer' });
      prisma.invoice.findFirst.mockResolvedValue(invoice as any);

      await expect(service.create(ORG_ID, validDto as any)).rejects.toThrow(
        'Invoice does not belong to this customer',
      );
    });

    it('should throw when default accounts are not configured', async () => {
      const invoice = createMockInvoice({ customerId: 'cust-test-001' });
      prisma.invoice.findFirst.mockResolvedValue(invoice as any);
      prisma.organization.findUnique.mockResolvedValue({
        defaultArAccountId: null,
        defaultSalesReturnsAccountId: null,
      } as any);

      await expect(service.create(ORG_ID, validDto as any)).rejects.toThrow(
        /configure default accounts/,
      );
    });

    it('should throw when AR account is missing', async () => {
      const invoice = createMockInvoice({ customerId: 'cust-test-001' });
      prisma.invoice.findFirst.mockResolvedValue(invoice as any);
      prisma.organization.findUnique.mockResolvedValue({
        defaultArAccountId: null,
        defaultSalesReturnsAccountId: 'sr-acc',
      } as any);

      await expect(service.create(ORG_ID, validDto as any)).rejects.toThrow(BadRequestException);
    });

    it('should throw when Sales Returns account is missing', async () => {
      const invoice = createMockInvoice({ customerId: 'cust-test-001' });
      prisma.invoice.findFirst.mockResolvedValue(invoice as any);
      prisma.organization.findUnique.mockResolvedValue({
        defaultArAccountId: 'ar-acc',
        defaultSalesReturnsAccountId: null,
      } as any);

      await expect(service.create(ORG_ID, validDto as any)).rejects.toThrow(BadRequestException);
    });

    it('should create a balanced journal entry (Dr Sales Returns, Cr AR)', async () => {
      const invoice = createMockInvoice({ customerId: 'cust-test-001' });
      prisma.invoice.findFirst.mockResolvedValue(invoice as any);
      prisma.organization.findUnique.mockResolvedValue({
        defaultArAccountId: 'ar-acc',
        defaultSalesReturnsAccountId: 'sr-acc',
        defaultVatPayableAccountId: 'vat-acc',
      } as any);
      prisma.creditNote.findFirst.mockResolvedValue(null);
      prisma.creditNote.create.mockResolvedValue(createMockCreditNote() as any);

      await service.create(ORG_ID, validDto as any);

      expect(journalsService.create).toHaveBeenCalledWith(
        ORG_ID,
        expect.objectContaining({
          lines: expect.arrayContaining([
            expect.objectContaining({
              accountId: 'sr-acc',
              debit: '200.0000',
              credit: '0',
            }),
            expect.objectContaining({
              accountId: 'ar-acc',
              debit: '0',
              credit: '200.0000',
            }),
          ]),
        }),
      );
    });

    it('should update invoice balance when type is APPLY_TO_INVOICE', async () => {
      const invoice = createMockInvoice({ customerId: 'cust-test-001' });
      prisma.invoice.findFirst.mockResolvedValue(invoice as any);
      prisma.organization.findUnique.mockResolvedValue({
        defaultArAccountId: 'ar-acc',
        defaultSalesReturnsAccountId: 'sr-acc',
        defaultVatPayableAccountId: 'vat-acc',
      } as any);
      prisma.creditNote.findFirst.mockResolvedValue(null);
      prisma.creditNote.create.mockResolvedValue(createMockCreditNote() as any);

      await service.create(ORG_ID, validDto as any);

      expect(invoicesService.updateBalanceDue).toHaveBeenCalledWith('inv-test-001');
    });

    it('should NOT update invoice balance when type is REFUND', async () => {
      const refundDto = {
        ...validDto,
        type: 'REFUND' as const,
        appliedToInvoiceId: undefined,
      };

      const invoice = createMockInvoice({ customerId: 'cust-test-001' });
      prisma.invoice.findFirst.mockResolvedValue(invoice as any);
      prisma.organization.findUnique.mockResolvedValue({
        defaultArAccountId: 'ar-acc',
        defaultSalesReturnsAccountId: 'sr-acc',
        defaultVatPayableAccountId: 'vat-acc',
      } as any);
      prisma.creditNote.findFirst.mockResolvedValue(null);
      prisma.creditNote.create.mockResolvedValue(createMockCreditNote({ type: 'REFUND' }) as any);

      await service.create(ORG_ID, refundDto as any);

      expect(invoicesService.updateBalanceDue).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('should return paginated results with meta', async () => {
      prisma.creditNote.findMany.mockResolvedValue([
        createMockCreditNote({ id: 'cn-1' }),
        createMockCreditNote({ id: 'cn-2' }),
      ] as any);
      prisma.creditNote.count.mockResolvedValue(2);

      const result = await service.findAll(ORG_ID, { page: 1, limit: 20 });

      expect(result.data).toHaveLength(2);
      expect(result.meta.total).toBe(2);
      expect(result.meta.totalPages).toBe(1);
    });

    it('should always filter by organizationId and exclude soft-deleted', async () => {
      prisma.creditNote.findMany.mockResolvedValue([]);
      prisma.creditNote.count.mockResolvedValue(0);

      await service.findAll(ORG_ID, {});

      const findCall = prisma.creditNote.findMany.mock.calls[0]![0]!;
      expect(findCall.where!.organizationId).toBe(ORG_ID);
      expect(findCall.where!.deletedAt).toBeNull();
    });

    it('should use default sort by date descending', async () => {
      prisma.creditNote.findMany.mockResolvedValue([]);
      prisma.creditNote.count.mockResolvedValue(0);

      await service.findAll(ORG_ID, {});

      const findCall = prisma.creditNote.findMany.mock.calls[0]![0]!;
      expect(findCall.orderBy).toEqual({ date: 'desc' });
    });

    it('should paginate correctly with skip and take', async () => {
      prisma.creditNote.findMany.mockResolvedValue([]);
      prisma.creditNote.count.mockResolvedValue(50);

      await service.findAll(ORG_ID, { page: 3, limit: 10 });

      const findCall = prisma.creditNote.findMany.mock.calls[0]![0]!;
      expect(findCall.skip).toBe(20); // (3-1) * 10
      expect(findCall.take).toBe(10);
    });

    it('should calculate totalPages correctly', async () => {
      prisma.creditNote.findMany.mockResolvedValue([]);
      prisma.creditNote.count.mockResolvedValue(45);

      const result = await service.findAll(ORG_ID, { page: 1, limit: 20 });

      expect(result.meta.totalPages).toBe(3); // ceil(45/20) = 3
    });
  });

  describe('findOne', () => {
    it('should return credit note with customer and invoice', async () => {
      const creditNote = createMockCreditNote({
        customer: createMockCustomer(),
        invoice: createMockInvoice(),
      });
      prisma.creditNote.findFirst.mockResolvedValue(creditNote as any);

      const result = await service.findOne(ORG_ID, 'cn-test-001');

      expect(result).toBeDefined();
      expect(result.id).toBe('cn-test-001');
    });

    it('should throw NotFoundException for non-existent credit note', async () => {
      prisma.creditNote.findFirst.mockResolvedValue(null);

      await expect(service.findOne(ORG_ID, 'nonexistent')).rejects.toThrow(NotFoundException);
      await expect(service.findOne(ORG_ID, 'nonexistent')).rejects.toThrow('Credit note not found');
    });

    it('should filter by organizationId and exclude soft-deleted', async () => {
      prisma.creditNote.findFirst.mockResolvedValue(null);

      try {
        await service.findOne(ORG_ID, 'cn-1');
      } catch {
        // Expected
      }

      const findCall = prisma.creditNote.findFirst.mock.calls[0]![0]!;
      expect(findCall.where!.organizationId).toBe(ORG_ID);
      expect(findCall.where!.deletedAt).toBeNull();
    });
  });

  describe('update', () => {
    it('should update reason and date fields', async () => {
      const creditNote = createMockCreditNote();
      prisma.creditNote.findFirst.mockResolvedValue(creditNote as any);
      prisma.creditNote.update.mockResolvedValue({
        ...creditNote,
        reason: 'Updated reason',
      } as any);

      const result = await service.update(ORG_ID, 'cn-test-001', {
        reason: 'Updated reason',
      });

      expect(result).toBeDefined();
      const updateCall = prisma.creditNote.update.mock.calls[0]![0]!;
      expect(updateCall.data.reason).toBe('Updated reason');
    });

    it('should throw NotFoundException for non-existent credit note', async () => {
      prisma.creditNote.findFirst.mockResolvedValue(null);

      await expect(service.update(ORG_ID, 'nonexistent', { reason: 'test' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('remove (soft delete)', () => {
    it('should soft-delete a credit note', async () => {
      const creditNote = createMockCreditNote();
      prisma.creditNote.findFirst.mockResolvedValue(creditNote as any);
      prisma.creditNote.update.mockResolvedValue({
        ...creditNote,
        deletedAt: new Date(),
      } as any);

      const result = await service.remove(ORG_ID, 'cn-test-001');

      expect(result.message).toBe('Credit note deleted');
      expect(prisma.creditNote.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ deletedAt: expect.any(Date) }),
        }),
      );
    });

    it('should never hard-delete credit note records', async () => {
      const creditNote = createMockCreditNote();
      prisma.creditNote.findFirst.mockResolvedValue(creditNote as any);
      prisma.creditNote.update.mockResolvedValue({
        ...creditNote,
        deletedAt: new Date(),
      } as any);

      await service.remove(ORG_ID, 'cn-test-001');

      expect(prisma.creditNote.delete).not.toHaveBeenCalled();
      expect(prisma.creditNote.deleteMany).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException for non-existent credit note', async () => {
      prisma.creditNote.findFirst.mockResolvedValue(null);

      await expect(service.remove(ORG_ID, 'nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('apply', () => {
    it('should apply a credit note to an invoice', async () => {
      const creditNote = createMockCreditNote({ appliedToInvoiceId: null });
      prisma.creditNote.findFirst.mockResolvedValue(creditNote as any);
      const invoice = createMockInvoice({ id: 'inv-target' });
      prisma.invoice.findFirst.mockResolvedValue(invoice as any);
      prisma.creditNote.update.mockResolvedValue({
        ...creditNote,
        appliedToInvoiceId: 'inv-target',
        customer: { id: 'cust-test-001', name: 'Test Customer' },
        invoice: { id: 'inv-test-001', invoiceNumber: 'INV-001' },
      } as any);

      const result = await service.apply(ORG_ID, 'cn-test-001', 'inv-target');

      expect(result).toBeDefined();
      expect(prisma.creditNote.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { appliedToInvoiceId: 'inv-target' },
        }),
      );
    });

    it('should update invoice balance after applying credit note', async () => {
      const creditNote = createMockCreditNote({ appliedToInvoiceId: null });
      prisma.creditNote.findFirst.mockResolvedValue(creditNote as any);
      prisma.invoice.findFirst.mockResolvedValue(createMockInvoice() as any);
      prisma.creditNote.update.mockResolvedValue({
        ...creditNote,
        appliedToInvoiceId: 'inv-target',
      } as any);

      await service.apply(ORG_ID, 'cn-test-001', 'inv-target');

      expect(invoicesService.updateBalanceDue).toHaveBeenCalledWith('inv-target');
    });

    it('should reject applying a credit note that is already applied', async () => {
      const creditNote = createMockCreditNote({ appliedToInvoiceId: 'inv-existing' });
      prisma.creditNote.findFirst.mockResolvedValue(creditNote as any);

      await expect(service.apply(ORG_ID, 'cn-test-001', 'inv-target')).rejects.toThrow(
        'Credit note is already applied to an invoice',
      );
    });

    it('should throw BadRequestException when target invoice not found', async () => {
      const creditNote = createMockCreditNote({ appliedToInvoiceId: null });
      prisma.creditNote.findFirst.mockResolvedValue(creditNote as any);
      prisma.invoice.findFirst.mockResolvedValue(null);

      await expect(service.apply(ORG_ID, 'cn-test-001', 'nonexistent')).rejects.toThrow(
        'Invoice not found',
      );
    });

    it('should throw NotFoundException when credit note not found', async () => {
      prisma.creditNote.findFirst.mockResolvedValue(null);

      await expect(service.apply(ORG_ID, 'nonexistent', 'inv-target')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
