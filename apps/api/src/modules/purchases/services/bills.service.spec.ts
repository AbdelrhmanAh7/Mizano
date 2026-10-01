import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { BillsService } from './bills.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { JournalsService } from '../../accounting/services/journals.service';
import { createMockPrisma, MockPrismaClient } from '../../../test/mocks/prisma.mock';
import { createMockBill, createMockVendor } from '../../../test/helpers/test-utils';
import { dec, expectDecimalEqual } from '../../../test/helpers/decimal.helpers';

describe('BillsService', () => {
  let service: BillsService;
  let prisma: MockPrismaClient;
  let journalsService: { create: jest.Mock };

  const ORG_ID = 'org-test-001';

  beforeEach(async () => {
    prisma = createMockPrisma();
    journalsService = { create: jest.fn().mockResolvedValue({}) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillsService,
        { provide: PrismaService, useValue: prisma },
        { provide: JournalsService, useValue: journalsService },
      ],
    }).compile();

    service = module.get<BillsService>(BillsService);
  });

  describe('create', () => {
    const validDto = {
      vendorId: 'vendor-test-001',
      billNumber: 'BILL-001',
      date: '2024-06-15',
      dueDate: '2024-07-15',
      lines: [{ description: 'Office supplies', quantity: '10', rate: '50', taxRate: '15' }],
    };

    it('should create a bill with correct total calculation', async () => {
      prisma.vendor.findFirst.mockResolvedValue(createMockVendor() as any);

      const mockBill = createMockBill({
        billNumber: 'BILL-001',
        subtotal: dec('500'),
        taxAmount: dec('75'),
        grandTotal: dec('575'),
        vendor: { id: 'vendor-test-001', name: 'Test Vendor' },
        lines: [],
      });
      prisma.bill.create.mockResolvedValue(mockBill as any);

      const result = await service.create(ORG_ID, validDto);

      expect(result).toBeDefined();

      const createCall = prisma.bill.create.mock.calls[0][0];
      const data = createCall.data;

      // subtotal = 10 * 50 = 500
      expectDecimalEqual(data.subtotal as any, '500');
      // taxAmount = 500 * 0.15 = 75
      expectDecimalEqual(data.taxAmount as any, '75');
      // grandTotal = 500 + 75 = 575
      expectDecimalEqual(data.grandTotal as any, '575');
      // balanceDue = grandTotal
      expectDecimalEqual(data.balanceDue as any, '575');
    });

    it('should handle multiple line items', async () => {
      prisma.vendor.findFirst.mockResolvedValue(createMockVendor() as any);
      prisma.bill.create.mockResolvedValue(createMockBill() as any);

      const multiLineDto = {
        ...validDto,
        lines: [
          { description: 'Item A', quantity: '5', rate: '100', taxRate: '10' },
          { description: 'Item B', quantity: '3', rate: '200', taxRate: '10' },
        ],
      };

      await service.create(ORG_ID, multiLineDto);

      const createCall = prisma.bill.create.mock.calls[0][0];
      const data = createCall.data;

      // Line A: 5 * 100 = 500, tax = 50
      // Line B: 3 * 200 = 600, tax = 60
      // subtotal = 1100, taxAmount = 110, grandTotal = 1210
      expectDecimalEqual(data.subtotal as any, '1100');
      expectDecimalEqual(data.taxAmount as any, '110');
      expectDecimalEqual(data.grandTotal as any, '1210');
    });

    it('should handle lines without tax', async () => {
      prisma.vendor.findFirst.mockResolvedValue(createMockVendor() as any);
      prisma.bill.create.mockResolvedValue(createMockBill() as any);

      const noTaxDto = {
        ...validDto,
        lines: [{ description: 'Item', quantity: '4', rate: '250' }],
      };

      await service.create(ORG_ID, noTaxDto);

      const createCall = prisma.bill.create.mock.calls[0][0];
      const data = createCall.data;

      // subtotal = 4 * 250 = 1000, tax = 0
      expectDecimalEqual(data.subtotal as any, '1000');
      expectDecimalEqual(data.taxAmount as any, '0');
      expectDecimalEqual(data.grandTotal as any, '1000');
    });

    it('should compute 2 x 100 at 14% as net 200, tax 28, gross 228 (tax is a percent)', async () => {
      prisma.vendor.findFirst.mockResolvedValue(createMockVendor() as any);
      prisma.bill.create.mockResolvedValue(createMockBill() as any);

      await service.create(ORG_ID, {
        ...validDto,
        lines: [{ description: 'CPU', quantity: '2', rate: '100', taxRate: '14' }],
      });

      const data = prisma.bill.create.mock.calls[0][0].data as any;
      expectDecimalEqual(data.subtotal, '200');
      expectDecimalEqual(data.taxAmount, '28');
      expectDecimalEqual(data.grandTotal, '228');
      expectDecimalEqual(data.lines.create[0].taxRate, '14');
      expectDecimalEqual(data.lines.create[0].amount, '200');
    });

    it('should reject an expense account from another organization', async () => {
      prisma.vendor.findFirst.mockResolvedValue(createMockVendor() as any);
      prisma.account.count.mockResolvedValue(0);

      await expect(
        service.create(ORG_ID, {
          ...validDto,
          lines: [{ accountId: 'foreign-acc', quantity: '1', rate: '1' }],
        }),
      ).rejects.toThrow('Account not found');
      expect(prisma.bill.create).not.toHaveBeenCalled();
    });

    it('should auto-number the bill when no bill number is given', async () => {
      prisma.vendor.findFirst.mockResolvedValue(createMockVendor() as any);
      prisma.organization.update.mockResolvedValue({
        billPrefix: 'BILL-',
        billNextNumber: 8,
      } as any);
      prisma.bill.count.mockResolvedValue(0);
      prisma.bill.create.mockResolvedValue(createMockBill() as any);

      await service.create(ORG_ID, { ...validDto, billNumber: undefined });

      expect(prisma.organization.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { billNextNumber: { increment: 1 } } }),
      );
      expect(prisma.bill.create.mock.calls[0][0].data.billNumber).toBe('BILL-0007');
    });

    it('should skip numbers already used by existing bills', async () => {
      prisma.vendor.findFirst.mockResolvedValue(createMockVendor() as any);
      prisma.organization.update
        .mockResolvedValueOnce({ billPrefix: 'BILL-', billNextNumber: 2 } as any)
        .mockResolvedValueOnce({ billPrefix: 'BILL-', billNextNumber: 3 } as any);
      prisma.bill.count.mockResolvedValueOnce(1).mockResolvedValueOnce(0);
      prisma.bill.create.mockResolvedValue(createMockBill() as any);

      await service.create(ORG_ID, { ...validDto, billNumber: undefined });

      expect(prisma.bill.create.mock.calls[0][0].data.billNumber).toBe('BILL-0002');
    });

    it('should throw BadRequestException when vendor not found', async () => {
      prisma.vendor.findFirst.mockResolvedValue(null);

      await expect(service.create(ORG_ID, validDto)).rejects.toThrow(BadRequestException);
      await expect(service.create(ORG_ID, validDto)).rejects.toThrow('Vendor not found');
    });

    it('should include organizationId in created bill', async () => {
      prisma.vendor.findFirst.mockResolvedValue(createMockVendor() as any);
      prisma.bill.create.mockResolvedValue(createMockBill() as any);

      await service.create(ORG_ID, validDto);

      const createCall = prisma.bill.create.mock.calls[0][0];
      expect(createCall.data.organizationId).toBe(ORG_ID);
    });

    it('should store monetary values as Decimal', async () => {
      prisma.vendor.findFirst.mockResolvedValue(createMockVendor() as any);
      prisma.bill.create.mockResolvedValue(createMockBill() as any);

      await service.create(ORG_ID, validDto);

      const createCall = prisma.bill.create.mock.calls[0][0];
      const data = createCall.data;

      expect(data.subtotal).toBeInstanceOf(Decimal);
      expect(data.taxAmount).toBeInstanceOf(Decimal);
      expect(data.grandTotal).toBeInstanceOf(Decimal);
      expect(data.balanceDue).toBeInstanceOf(Decimal);
    });
  });

  describe('findOne', () => {
    it('should return bill with vendor and lines', async () => {
      const bill = createMockBill({
        vendor: createMockVendor(),
        lines: [],
        billAllocations: [],
      });
      prisma.bill.findFirst.mockResolvedValue(bill as any);

      const result = await service.findOne(ORG_ID, 'bill-test-001');
      expect(result).toBeDefined();
    });

    it('should throw NotFoundException for non-existent bill', async () => {
      prisma.bill.findFirst.mockResolvedValue(null);

      await expect(service.findOne(ORG_ID, 'nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('should filter by organizationId and exclude soft-deleted', async () => {
      prisma.bill.findFirst.mockResolvedValue(null);

      try {
        await service.findOne(ORG_ID, 'bill-1');
      } catch {
        // Expected
      }

      const findCall = prisma.bill.findFirst.mock.calls[0]![0]!;
      expect(findCall.where!.organizationId).toBe(ORG_ID);
      expect(findCall.where!.deletedAt).toBeNull();
    });
  });

  describe('update', () => {
    it('should only allow updating DRAFT bills', async () => {
      const openBill = createMockBill({ status: 'OPEN' });
      prisma.bill.findFirst.mockResolvedValue(openBill as any);

      await expect(service.update(ORG_ID, 'bill-1', { notes: 'updated' })).rejects.toThrow(
        'Only draft bills can be updated',
      );
    });

    it('should throw NotFoundException for non-existent bill', async () => {
      prisma.bill.findFirst.mockResolvedValue(null);

      await expect(service.update(ORG_ID, 'nonexistent', {})).rejects.toThrow(NotFoundException);
    });

    it('should allow updating DRAFT bills', async () => {
      const draftBill = createMockBill({ id: 'bill-1', status: 'DRAFT' });
      prisma.bill.findFirst.mockResolvedValue(draftBill as any);
      prisma.bill.updateMany.mockResolvedValue({ count: 1 });
      prisma.bill.update.mockResolvedValue({ ...draftBill, notes: 'updated' } as any);

      const result = await service.update(ORG_ID, 'bill-1', { notes: 'updated' });
      expect(result.notes).toBe('updated');
    });

    it('should recalculate totals when lines are replaced', async () => {
      prisma.bill.findFirst.mockResolvedValue(createMockBill({ status: 'DRAFT' }) as any);
      prisma.bill.updateMany.mockResolvedValue({ count: 1 });
      prisma.bill.update.mockResolvedValue({} as any);

      await service.update(ORG_ID, 'bill-1', {
        lines: [{ description: 'x', quantity: '2', rate: '100', taxRate: '14' }],
      });

      expect(prisma.billLine.deleteMany).toHaveBeenCalledWith({ where: { billId: 'bill-1' } });
      const data = prisma.bill.update.mock.calls[0]![0]!.data as any;
      expectDecimalEqual(data.subtotal, '200');
      expectDecimalEqual(data.taxAmount, '28');
      expectDecimalEqual(data.grandTotal, '228');
    });

    it('should reject a project from another organization', async () => {
      prisma.bill.findFirst.mockResolvedValue(createMockBill({ status: 'DRAFT' }) as any);
      prisma.project.findFirst.mockResolvedValue(null);

      await expect(service.update(ORG_ID, 'bill-1', { projectId: 'foreign' })).rejects.toThrow(
        'Project not found',
      );
      expect(prisma.bill.update).not.toHaveBeenCalled();
    });
  });

  describe('approve (status transition DRAFT -> OPEN)', () => {
    const draftBill = () =>
      createMockBill({
        id: 'bill-1',
        status: 'DRAFT',
        billNumber: 'BILL-001',
        date: new Date('2024-06-15'),
        subtotal: dec('500'),
        grandTotal: dec('575'),
        taxAmount: dec('75'),
        lines: [{ accountId: 'acc-1', amount: dec('500'), description: 'Office supplies' }],
      });

    beforeEach(() => {
      prisma.organization.findUnique.mockResolvedValue({
        defaultApAccountId: 'ap-acc-1',
        defaultVatReceivableAccountId: 'vat-acc-1',
      } as any);
    });

    it('should transition DRAFT to OPEN and post one balanced journal in the same transaction', async () => {
      const bill = draftBill();
      prisma.bill.findFirst.mockResolvedValue(bill as any);
      prisma.bill.updateMany.mockResolvedValue({ count: 1 });
      prisma.bill.findUniqueOrThrow.mockResolvedValue({ ...bill, status: 'OPEN' } as any);

      const result = await service.approve(ORG_ID, 'bill-1');
      expect(result.status).toBe('OPEN');

      const [orgId, dto, options] = journalsService.create.mock.calls[0];
      expect(orgId).toBe(ORG_ID);
      expect(options.tx).toBe(prisma);
      expect(options.source).toEqual({ type: 'BILL_APPROVAL', id: 'bill-1' });
      // Accounting date is the bill date, not "now"
      expect(dto.date).toBe(new Date('2024-06-15').toISOString());
      expect(dto.lines).toEqual([
        expect.objectContaining({ accountId: 'acc-1', debit: '500.0000' }),
        expect.objectContaining({ accountId: 'vat-acc-1', debit: '75.0000' }),
        expect.objectContaining({ accountId: 'ap-acc-1', credit: '575.0000' }),
      ]);
    });

    it('should post nothing when a concurrent approval already won', async () => {
      prisma.bill.findFirst.mockResolvedValue(draftBill() as any);
      prisma.bill.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.approve(ORG_ID, 'bill-1')).rejects.toThrow(
        'Bill has already been approved',
      );
      expect(journalsService.create).not.toHaveBeenCalled();
    });

    it('should propagate a journal failure so the transaction rolls back', async () => {
      prisma.bill.findFirst.mockResolvedValue(draftBill() as any);
      prisma.bill.updateMany.mockResolvedValue({ count: 1 });
      journalsService.create.mockRejectedValue(new Error('This period is locked'));

      await expect(service.approve(ORG_ID, 'bill-1')).rejects.toThrow('This period is locked');
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('should reject a taxed bill when no VAT receivable account is configured', async () => {
      prisma.bill.findFirst.mockResolvedValue(draftBill() as any);
      prisma.organization.findUnique.mockResolvedValue({ defaultApAccountId: 'ap' } as any);

      await expect(service.approve(ORG_ID, 'bill-1')).rejects.toThrow('VAT Receivable');
      expect(prisma.bill.updateMany).not.toHaveBeenCalled();
    });

    it('should reject approving a non-DRAFT bill', async () => {
      prisma.bill.findFirst.mockResolvedValue(createMockBill({ status: 'OPEN' }) as any);

      await expect(service.approve(ORG_ID, 'bill-1')).rejects.toThrow(
        'Only draft bills can be approved',
      );
    });

    it('should throw NotFoundException for non-existent bill', async () => {
      prisma.bill.findFirst.mockResolvedValue(null);

      await expect(service.approve(ORG_ID, 'nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('bulkApprove should reuse approve and report per-record failures', async () => {
      prisma.bill.findFirst
        .mockResolvedValueOnce(draftBill() as any)
        .mockResolvedValueOnce(createMockBill({ id: 'bill-2', status: 'OPEN' }) as any);
      prisma.bill.updateMany.mockResolvedValue({ count: 1 });
      prisma.bill.findUniqueOrThrow.mockResolvedValue({} as any);

      const result = await service.bulkApprove(ORG_ID, ['bill-1', 'bill-2']);

      expect(result.processed).toBe(1);
      expect(result.failures).toEqual([
        { id: 'bill-2', reason: 'Only draft bills can be approved' },
      ]);
      expect(journalsService.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('recalculateBalance', () => {
    const setup = (grandTotal: string, paid: string[]) => {
      prisma.bill.findUnique.mockResolvedValue(
        createMockBill({
          id: 'bill-1',
          grandTotal: dec(grandTotal),
          status: 'OPEN',
          dueDate: new Date(Date.now() + 86400000),
        }) as any,
      );
      prisma.billAllocation.findMany.mockResolvedValue(
        paid.map((a) => ({ amount: dec(a) })) as any,
      );
      prisma.bill.update.mockResolvedValue({} as any);
    };

    it('should mark bill as PAID when fully paid', async () => {
      setup('575', ['575']);
      await service.recalculateBalance(prisma as any, 'bill-1');
      const data = prisma.bill.update.mock.calls[0]![0]!.data as any;
      expect(data.status).toBe('PAID');
      expectDecimalEqual(data.balanceDue, '0');
    });

    it('should mark bill as PARTIALLY_PAID for partial payments', async () => {
      setup('575', ['200']);
      await service.recalculateBalance(prisma as any, 'bill-1');
      const data = prisma.bill.update.mock.calls[0]![0]!.data as any;
      expect(data.status).toBe('PARTIALLY_PAID');
      expectDecimalEqual(data.balanceDue, '375');
    });

    it('should return to OPEN when all payments were voided', async () => {
      setup('575', []);
      await service.recalculateBalance(prisma as any, 'bill-1');
      const data = prisma.bill.update.mock.calls[0]![0]!.data as any;
      expect(data.status).toBe('OPEN');
      expectDecimalEqual(data.balanceDue, '575');
    });

    it('should only count allocations of non-deleted payments', async () => {
      setup('575', []);
      await service.recalculateBalance(prisma as any, 'bill-1');
      expect(prisma.billAllocation.findMany.mock.calls[0]![0]!.where).toEqual({
        billId: 'bill-1',
        payment: { deletedAt: null },
      });
    });

    it('should throw NotFoundException when bill not found', async () => {
      prisma.bill.findUnique.mockResolvedValue(null);
      await expect(service.recalculateBalance(prisma as any, 'x')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('remove (soft delete)', () => {
    it('should soft-delete a DRAFT bill with a guarded update', async () => {
      prisma.bill.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.remove(ORG_ID, 'bill-1');

      expect(result.message).toBe('Bill deleted successfully');
      expect(prisma.bill.updateMany).toHaveBeenCalledWith({
        where: { id: 'bill-1', organizationId: ORG_ID, deletedAt: null, status: 'DRAFT' },
        data: { deletedAt: expect.any(Date) },
      });
      expect(prisma.bill.delete).not.toHaveBeenCalled();
      expect(prisma.bill.deleteMany).not.toHaveBeenCalled();
    });

    it('should reject deleting non-DRAFT bills', async () => {
      prisma.bill.updateMany.mockResolvedValue({ count: 0 });
      prisma.bill.findFirst.mockResolvedValue({ id: 'bill-1' } as any);

      await expect(service.remove(ORG_ID, 'bill-1')).rejects.toThrow(
        'Only draft bills can be deleted',
      );
    });

    it('should throw NotFoundException for non-existent bill', async () => {
      prisma.bill.updateMany.mockResolvedValue({ count: 0 });
      prisma.bill.findFirst.mockResolvedValue(null);

      await expect(service.remove(ORG_ID, 'nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('checkDuplicate', () => {
    it('should detect exact bill number match', async () => {
      prisma.bill.findFirst.mockResolvedValue({ id: 'existing-bill' } as any);

      const result = await service.checkDuplicate(ORG_ID, {
        vendorId: 'vendor-1',
        billNumber: 'VB-001',
      });

      expect(result.isDuplicate).toBe(true);
      expect(result.matchType).toBe('exact_number');
      expect(result.similarity).toBe(1.0);
      expect(result.existingBillId).toBe('existing-bill');
    });

    it('should detect amount + date proximity match', async () => {
      // First call (exact number check) returns null, second returns match
      prisma.bill.findFirst
        .mockResolvedValueOnce(null) // no exact number match
        .mockResolvedValueOnce({ id: 'similar-bill' } as any); // amount/date match

      const result = await service.checkDuplicate(ORG_ID, {
        vendorId: 'vendor-1',
        billNumber: 'VB-NEW',
        amount: 1000,
        date: '2024-06-15',
      });

      expect(result.isDuplicate).toBe(true);
      expect(result.matchType).toBe('amount_date');
      expect(result.similarity).toBe(0.9);
    });

    it('should return no duplicate when no matches found', async () => {
      prisma.bill.findFirst.mockResolvedValue(null);

      const result = await service.checkDuplicate(ORG_ID, {
        vendorId: 'vendor-1',
        billNumber: 'VB-UNIQUE',
        amount: 999,
        date: '2024-06-15',
      });

      expect(result.isDuplicate).toBe(false);
      expect(result.matchType).toBe('none');
      expect(result.similarity).toBe(0);
      expect(result.existingBillId).toBeNull();
    });
  });

  describe('findAll', () => {
    it('should return paginated results with meta', async () => {
      prisma.bill.findMany.mockResolvedValue([
        createMockBill({ id: 'b1' }),
        createMockBill({ id: 'b2' }),
      ] as any);
      prisma.bill.count.mockResolvedValue(2);

      const result = await service.findAll(ORG_ID, { page: 1, limit: 20 });

      expect(result.data).toHaveLength(2);
      expect(result.meta.total).toBe(2);
      expect(result.meta.totalPages).toBe(1);
    });

    it('should always filter by organizationId and exclude soft-deleted', async () => {
      prisma.bill.findMany.mockResolvedValue([]);
      prisma.bill.count.mockResolvedValue(0);

      await service.findAll(ORG_ID, {});

      const findCall = prisma.bill.findMany.mock.calls[0]![0]!;
      expect(findCall.where!.organizationId).toBe(ORG_ID);
      expect(findCall.where!.deletedAt).toBeNull();
    });
  });
});
