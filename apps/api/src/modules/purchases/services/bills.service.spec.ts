import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { BillsService } from './bills.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { createMockPrisma, MockPrismaClient } from '../../../test/mocks/prisma.mock';
import { createMockBill, createMockVendor } from '../../../test/helpers/test-utils';
import { dec, expectDecimalEqual } from '../../../test/helpers/decimal.helpers';

describe('BillsService', () => {
  let service: BillsService;
  let prisma: MockPrismaClient;

  const ORG_ID = 'org-test-001';

  beforeEach(async () => {
    prisma = createMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillsService,
        { provide: PrismaService, useValue: prisma },
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
      lines: [
        { description: 'Office supplies', quantity: '10', rate: '50', taxRate: '15' },
      ],
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
        lines: [
          { description: 'Item', quantity: '4', rate: '250' },
        ],
      };

      await service.create(ORG_ID, noTaxDto);

      const createCall = prisma.bill.create.mock.calls[0][0];
      const data = createCall.data;

      // subtotal = 4 * 250 = 1000, tax = 0
      expectDecimalEqual(data.subtotal as any, '1000');
      expectDecimalEqual(data.taxAmount as any, '0');
      expectDecimalEqual(data.grandTotal as any, '1000');
    });

    it('should throw BadRequestException when vendor not found', async () => {
      prisma.vendor.findFirst.mockResolvedValue(null);

      await expect(service.create(ORG_ID, validDto)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.create(ORG_ID, validDto)).rejects.toThrow(
        'Vendor not found',
      );
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

      await expect(service.findOne(ORG_ID, 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
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

      await expect(
        service.update(ORG_ID, 'bill-1', { notes: 'updated' }),
      ).rejects.toThrow('Only draft bills can be updated');
    });

    it('should throw NotFoundException for non-existent bill', async () => {
      prisma.bill.findFirst.mockResolvedValue(null);

      await expect(
        service.update(ORG_ID, 'nonexistent', {}),
      ).rejects.toThrow(NotFoundException);
    });

    it('should allow updating DRAFT bills', async () => {
      const draftBill = createMockBill({ id: 'bill-1', status: 'DRAFT' });
      prisma.bill.findFirst.mockResolvedValue(draftBill as any);
      prisma.bill.update.mockResolvedValue({ ...draftBill, notes: 'updated' } as any);

      const result = await service.update(ORG_ID, 'bill-1', { notes: 'updated' });
      expect(result.notes).toBe('updated');
    });
  });

  describe('approve (status transition DRAFT -> OPEN)', () => {
    it('should transition a DRAFT bill to OPEN', async () => {
      const draftBill = createMockBill({ id: 'bill-1', status: 'DRAFT' });
      prisma.bill.findFirst.mockResolvedValue(draftBill as any);
      prisma.bill.update.mockResolvedValue({ ...draftBill, status: 'OPEN' } as any);

      const result = await service.approve(ORG_ID, 'bill-1');
      expect(result.status).toBe('OPEN');
    });

    it('should reject approving a non-DRAFT bill', async () => {
      const openBill = createMockBill({ status: 'OPEN' });
      prisma.bill.findFirst.mockResolvedValue(openBill as any);

      await expect(service.approve(ORG_ID, 'bill-1')).rejects.toThrow(
        'Only draft bills can be approved',
      );
    });

    it('should throw NotFoundException for non-existent bill', async () => {
      prisma.bill.findFirst.mockResolvedValue(null);

      await expect(service.approve(ORG_ID, 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateBalanceDue', () => {
    it('should mark bill as PAID when fully paid', async () => {
      const bill = createMockBill({
        id: 'bill-1',
        grandTotal: dec('575'),
        status: 'OPEN',
        billAllocations: [{ amount: dec('575') }],
      });
      prisma.bill.findUnique.mockResolvedValue(bill as any);
      prisma.bill.update.mockResolvedValue({} as any);

      await service.updateBalanceDue('bill-1');

      const updateCall = prisma.bill.update.mock.calls[0]![0]!;
      expect(updateCall.data.status).toBe('PAID');
      expectDecimalEqual(updateCall.data.balanceDue as any, '0');
    });

    it('should mark bill as PARTIALLY_PAID for partial payments', async () => {
      const bill = createMockBill({
        id: 'bill-1',
        grandTotal: dec('575'),
        status: 'OPEN',
        billAllocations: [{ amount: dec('200') }],
      });
      prisma.bill.findUnique.mockResolvedValue(bill as any);
      prisma.bill.update.mockResolvedValue({} as any);

      await service.updateBalanceDue('bill-1');

      const updateCall = prisma.bill.update.mock.calls[0]![0]!;
      expect(updateCall.data.status).toBe('PARTIALLY_PAID');
      expectDecimalEqual(updateCall.data.balanceDue as any, '375');
    });

    it('should not update when bill not found', async () => {
      prisma.bill.findUnique.mockResolvedValue(null);

      await service.updateBalanceDue('nonexistent');

      expect(prisma.bill.update).not.toHaveBeenCalled();
    });

    it('should handle overpayment by capping balance at zero', async () => {
      const bill = createMockBill({
        id: 'bill-1',
        grandTotal: dec('500'),
        status: 'OPEN',
        billAllocations: [
          { amount: dec('300') },
          { amount: dec('300') },
        ],
      });
      prisma.bill.findUnique.mockResolvedValue(bill as any);
      prisma.bill.update.mockResolvedValue({} as any);

      await service.updateBalanceDue('bill-1');

      const updateCall = prisma.bill.update.mock.calls[0]![0]!;
      expect(updateCall.data.status).toBe('PAID');
      // Math.max(0, -100) = 0
      expectDecimalEqual(updateCall.data.balanceDue as any, '0');
    });
  });

  describe('remove (soft delete)', () => {
    it('should soft-delete a DRAFT bill', async () => {
      const draftBill = createMockBill({ id: 'bill-1', status: 'DRAFT' });
      prisma.bill.findFirst.mockResolvedValue(draftBill as any);
      prisma.bill.update.mockResolvedValue({ ...draftBill, deletedAt: new Date() } as any);

      const result = await service.remove(ORG_ID, 'bill-1');

      expect(result.message).toBe('Bill deleted successfully');
      expect(prisma.bill.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ deletedAt: expect.any(Date) }),
        }),
      );
    });

    it('should reject deleting non-DRAFT bills', async () => {
      const openBill = createMockBill({ status: 'OPEN' });
      prisma.bill.findFirst.mockResolvedValue(openBill as any);

      await expect(service.remove(ORG_ID, 'bill-1')).rejects.toThrow(
        'Only draft bills can be deleted',
      );
    });

    it('should never hard-delete financial records', async () => {
      const draftBill = createMockBill({ id: 'bill-1', status: 'DRAFT' });
      prisma.bill.findFirst.mockResolvedValue(draftBill as any);
      prisma.bill.update.mockResolvedValue({ ...draftBill, deletedAt: new Date() } as any);

      await service.remove(ORG_ID, 'bill-1');

      expect(prisma.bill.delete).not.toHaveBeenCalled();
      expect(prisma.bill.deleteMany).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException for non-existent bill', async () => {
      prisma.bill.findFirst.mockResolvedValue(null);

      await expect(service.remove(ORG_ID, 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
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
