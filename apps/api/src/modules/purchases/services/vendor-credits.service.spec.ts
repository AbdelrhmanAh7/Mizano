import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { VendorCreditsService } from './vendor-credits.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { JournalsService } from '../../accounting/services/journals.service';
import { createMockPrisma, MockPrismaClient } from '../../../test/mocks/prisma.mock';
import { createMockVendor, createMockBill } from '../../../test/helpers/test-utils';
import { dec, expectDecimalEqual } from '../../../test/helpers/decimal.helpers';

describe('VendorCreditsService', () => {
  let service: VendorCreditsService;
  let prisma: MockPrismaClient;
  let journalsService: { create: jest.Mock };

  const ORG_ID = 'org-test-001';

  const createMockVendorCredit = (overrides: Record<string, unknown> = {}) => ({
    id: 'vc-test-001',
    creditNumber: 'VC-001',
    organizationId: ORG_ID,
    vendorId: 'vendor-test-001',
    billId: 'bill-test-001',
    appliedToBillId: null,
    date: new Date('2024-06-15'),
    reason: 'Defective goods',
    amount: dec('200'),
    refundedAt: null,
    deletedAt: null,
    createdAt: new Date('2024-06-15'),
    updatedAt: new Date('2024-06-15'),
    vendor: { id: 'vendor-test-001', name: 'Test Vendor', email: 'vendor@test.com' },
    bill: { id: 'bill-test-001', billNumber: 'BILL-001', total: dec('500'), status: 'OPEN' },
    appliedToBill: null,
    ...overrides,
  });

  beforeEach(async () => {
    prisma = createMockPrisma();
    journalsService = { create: jest.fn().mockResolvedValue({}) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VendorCreditsService,
        { provide: PrismaService, useValue: prisma },
        { provide: JournalsService, useValue: journalsService },
      ],
    }).compile();

    service = module.get<VendorCreditsService>(VendorCreditsService);
  });

  describe('create', () => {
    const validDto = {
      vendorId: 'vendor-test-001',
      billId: 'bill-test-001',
      amount: '200',
      reason: 'Defective goods',
      date: '2024-06-15',
    };

    beforeEach(() => {
      prisma.vendor.findFirst.mockResolvedValue(createMockVendor() as any);
      prisma.bill.findFirst.mockResolvedValue(createMockBill() as any);
      // Mock generateCreditNumber: no existing credits
      prisma.vendorCredit.findFirst.mockResolvedValue(null);
      prisma.vendorCredit.create.mockResolvedValue(createMockVendorCredit() as any);
      prisma.organization.findUnique.mockResolvedValue({
        defaultApAccountId: 'ap-account-001',
      } as any);
      prisma.billLine.findFirst.mockResolvedValue({
        accountId: 'acc-expense-001',
      } as any);
    });

    it('should create a vendor credit with organizationId', async () => {
      const result = await service.create(ORG_ID, validDto as any);

      expect(result).toBeDefined();
      const createCall = prisma.vendorCredit.create.mock.calls[0]![0]!;
      expect(createCall.data.organizationId).toBe(ORG_ID);
    });

    it('should store amount as Decimal', async () => {
      await service.create(ORG_ID, validDto as any);

      const createCall = prisma.vendorCredit.create.mock.calls[0]![0]!;
      expect(createCall.data.amount).toBeInstanceOf(Decimal);
      expectDecimalEqual(createCall.data.amount as any, '200');
    });

    it('should throw BadRequestException when vendor not found', async () => {
      prisma.vendor.findFirst.mockResolvedValue(null);

      await expect(service.create(ORG_ID, validDto as any)).rejects.toThrow(BadRequestException);
      await expect(service.create(ORG_ID, validDto as any)).rejects.toThrow('Vendor not found');
    });

    it('should throw BadRequestException when bill not found', async () => {
      prisma.vendor.findFirst.mockResolvedValue(createMockVendor() as any);
      prisma.bill.findFirst.mockResolvedValue(null);

      await expect(service.create(ORG_ID, validDto as any)).rejects.toThrow(BadRequestException);
      await expect(service.create(ORG_ID, validDto as any)).rejects.toThrow('Bill not found');
    });

    it('should verify vendor belongs to same organization', async () => {
      await service.create(ORG_ID, validDto as any);

      const vendorFind = prisma.vendor.findFirst.mock.calls[0]![0]!;
      expect(vendorFind.where!.organizationId).toBe(ORG_ID);
      expect(vendorFind.where!.deletedAt).toBeNull();
    });

    it('should verify bill belongs to same organization', async () => {
      await service.create(ORG_ID, validDto as any);

      const billFind = prisma.bill.findFirst.mock.calls[0]![0]!;
      expect(billFind.where!.organizationId).toBe(ORG_ID);
      expect(billFind.where!.deletedAt).toBeNull();
    });

    it('should generate credit number VC-001 when no prior credits exist', async () => {
      await service.create(ORG_ID, validDto as any);

      const createCall = prisma.vendorCredit.create.mock.calls[0]![0]!;
      expect(createCall.data.creditNumber).toBe('VC-001');
    });

    it('should increment credit number based on last credit', async () => {
      prisma.vendorCredit.findFirst.mockResolvedValue({
        creditNumber: 'VC-010',
      } as any);
      prisma.vendorCredit.create.mockResolvedValue(
        createMockVendorCredit({ creditNumber: 'VC-011' }) as any,
      );

      await service.create(ORG_ID, validDto as any);

      const createCall = prisma.vendorCredit.create.mock.calls[0]![0]!;
      expect(createCall.data.creditNumber).toBe('VC-011');
    });

    it('should create journal entry with AP debit and expense credit', async () => {
      await service.create(ORG_ID, validDto as any);

      expect(journalsService.create).toHaveBeenCalledWith(
        ORG_ID,
        expect.objectContaining({
          lines: expect.arrayContaining([
            expect.objectContaining({
              accountId: 'ap-account-001',
              debit: '200.0000',
              credit: '0',
            }),
            expect.objectContaining({
              accountId: 'acc-expense-001',
              debit: '0',
              credit: '200.0000',
            }),
          ]),
        }),
      );
    });

    it('should not create journal entry when org has no default AP account', async () => {
      prisma.organization.findUnique.mockResolvedValue({
        defaultApAccountId: null,
      } as any);

      await service.create(ORG_ID, validDto as any);

      expect(journalsService.create).not.toHaveBeenCalled();
    });

    it('should not create journal entry when bill has no line with accountId', async () => {
      prisma.billLine.findFirst.mockResolvedValue(null);

      await service.create(ORG_ID, validDto as any);

      expect(journalsService.create).not.toHaveBeenCalled();
    });

    it('should use current date when dto.date is not provided', async () => {
      const dtoNoDate = { ...validDto, date: undefined };
      await service.create(ORG_ID, dtoNoDate as any);

      const createCall = prisma.vendorCredit.create.mock.calls[0]![0]!;
      expect(createCall.data.date).toBeInstanceOf(Date);
    });

    it('should default reason to empty string when not provided', async () => {
      const dtoNoReason = { ...validDto, reason: undefined };
      await service.create(ORG_ID, dtoNoReason as any);

      const createCall = prisma.vendorCredit.create.mock.calls[0]![0]!;
      expect(createCall.data.reason).toBe('');
    });
  });

  describe('findAll', () => {
    it('should return paginated results with meta', async () => {
      prisma.vendorCredit.findMany.mockResolvedValue([
        createMockVendorCredit({ id: 'vc1' }),
        createMockVendorCredit({ id: 'vc2' }),
      ] as any);
      prisma.vendorCredit.count.mockResolvedValue(2);

      const result = await service.findAll(ORG_ID, { page: 1, limit: 20 });

      expect(result.data).toHaveLength(2);
      expect(result.meta.total).toBe(2);
      expect(result.meta.totalPages).toBe(1);
    });

    it('should always filter by organizationId and exclude soft-deleted', async () => {
      prisma.vendorCredit.findMany.mockResolvedValue([]);
      prisma.vendorCredit.count.mockResolvedValue(0);

      await service.findAll(ORG_ID, {});

      const findCall = prisma.vendorCredit.findMany.mock.calls[0]![0]!;
      expect((findCall.where as any).organizationId).toBe(ORG_ID);
      expect((findCall.where as any).deletedAt).toBeNull();
    });

    it('should filter by vendorId when provided', async () => {
      prisma.vendorCredit.findMany.mockResolvedValue([]);
      prisma.vendorCredit.count.mockResolvedValue(0);

      await service.findAll(ORG_ID, { vendorId: 'vendor-001' });

      const findCall = prisma.vendorCredit.findMany.mock.calls[0]![0]!;
      expect((findCall.where as any).vendorId).toBe('vendor-001');
    });

    it('should calculate correct pagination', async () => {
      prisma.vendorCredit.findMany.mockResolvedValue([]);
      prisma.vendorCredit.count.mockResolvedValue(55);

      const result = await service.findAll(ORG_ID, { page: 3, limit: 10 });

      expect(result.meta.totalPages).toBe(6);
      const findCall = prisma.vendorCredit.findMany.mock.calls[0]![0]!;
      expect(findCall.skip).toBe(20);
      expect(findCall.take).toBe(10);
    });
  });

  describe('findOne', () => {
    it('should return vendor credit with vendor and bill details', async () => {
      const credit = createMockVendorCredit();
      prisma.vendorCredit.findFirst.mockResolvedValue(credit as any);

      const result = await service.findOne(ORG_ID, 'vc-test-001');
      expect(result).toBeDefined();
    });

    it('should throw NotFoundException for non-existent vendor credit', async () => {
      prisma.vendorCredit.findFirst.mockResolvedValue(null);

      await expect(service.findOne(ORG_ID, 'nonexistent')).rejects.toThrow(NotFoundException);
      await expect(service.findOne(ORG_ID, 'nonexistent')).rejects.toThrow(
        'Vendor credit not found',
      );
    });

    it('should filter by organizationId and exclude soft-deleted', async () => {
      prisma.vendorCredit.findFirst.mockResolvedValue(null);

      try {
        await service.findOne(ORG_ID, 'vc-1');
      } catch {
        // Expected
      }

      const findCall = prisma.vendorCredit.findFirst.mock.calls[0]![0]!;
      expect(findCall.where!.organizationId).toBe(ORG_ID);
      expect(findCall.where!.deletedAt).toBeNull();
    });
  });

  describe('applyToBill', () => {
    it('should apply vendor credit to a target bill', async () => {
      const credit = createMockVendorCredit({ appliedToBillId: null });
      prisma.vendorCredit.findFirst.mockResolvedValue(credit as any);
      prisma.bill.findFirst.mockResolvedValue(createMockBill({ id: 'bill-target' }) as any);
      prisma.vendorCredit.update.mockResolvedValue({
        ...credit,
        appliedToBillId: 'bill-target',
      } as any);

      await service.applyToBill(ORG_ID, 'vc-test-001', 'bill-target');

      expect(prisma.vendorCredit.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { appliedToBillId: 'bill-target' },
        }),
      );
    });

    it('should throw BadRequestException when credit is already applied', async () => {
      const credit = createMockVendorCredit({ appliedToBillId: 'bill-existing' });
      prisma.vendorCredit.findFirst.mockResolvedValue(credit as any);

      await expect(service.applyToBill(ORG_ID, 'vc-test-001', 'bill-new')).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.applyToBill(ORG_ID, 'vc-test-001', 'bill-new')).rejects.toThrow(
        'Vendor credit is already applied to a bill',
      );
    });

    it('should throw BadRequestException when target bill not found', async () => {
      const credit = createMockVendorCredit({ appliedToBillId: null });
      prisma.vendorCredit.findFirst.mockResolvedValue(credit as any);
      prisma.bill.findFirst.mockResolvedValue(null);

      await expect(service.applyToBill(ORG_ID, 'vc-test-001', 'nonexistent')).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.applyToBill(ORG_ID, 'vc-test-001', 'nonexistent')).rejects.toThrow(
        'Target bill not found',
      );
    });

    it('should throw NotFoundException when vendor credit not found', async () => {
      prisma.vendorCredit.findFirst.mockResolvedValue(null);

      await expect(service.applyToBill(ORG_ID, 'nonexistent', 'bill-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should verify target bill belongs to same organization', async () => {
      const credit = createMockVendorCredit({ appliedToBillId: null });
      prisma.vendorCredit.findFirst.mockResolvedValue(credit as any);
      prisma.bill.findFirst.mockResolvedValue(null);

      try {
        await service.applyToBill(ORG_ID, 'vc-test-001', 'bill-target');
      } catch {
        // Expected
      }

      const billFindCall = prisma.bill.findFirst.mock.calls[0]![0]!;
      expect(billFindCall.where!.organizationId).toBe(ORG_ID);
      expect(billFindCall.where!.deletedAt).toBeNull();
    });
  });

  describe('refund', () => {
    it('should mark vendor credit as refunded', async () => {
      const credit = createMockVendorCredit({ refundedAt: null });
      prisma.vendorCredit.findFirst.mockResolvedValue(credit as any);
      prisma.vendorCredit.update.mockResolvedValue({
        ...credit,
        refundedAt: new Date(),
      } as any);

      await service.refund(ORG_ID, 'vc-test-001', { bankAccountId: 'bank-001' });

      expect(prisma.vendorCredit.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ refundedAt: expect.any(Date) }),
        }),
      );
    });

    it('should throw BadRequestException when credit has already been refunded', async () => {
      const credit = createMockVendorCredit({ refundedAt: new Date('2024-06-01') });
      prisma.vendorCredit.findFirst.mockResolvedValue(credit as any);

      await expect(
        service.refund(ORG_ID, 'vc-test-001', { bankAccountId: 'bank-001' }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.refund(ORG_ID, 'vc-test-001', { bankAccountId: 'bank-001' }),
      ).rejects.toThrow('Vendor credit has already been refunded');
    });

    it('should throw NotFoundException when vendor credit not found', async () => {
      prisma.vendorCredit.findFirst.mockResolvedValue(null);

      await expect(
        service.refund(ORG_ID, 'nonexistent', { bankAccountId: 'bank-001' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should use provided date for refund', async () => {
      const credit = createMockVendorCredit({ refundedAt: null });
      prisma.vendorCredit.findFirst.mockResolvedValue(credit as any);
      prisma.vendorCredit.update.mockResolvedValue({
        ...credit,
        refundedAt: new Date('2024-07-01'),
      } as any);

      await service.refund(ORG_ID, 'vc-test-001', {
        bankAccountId: 'bank-001',
        date: '2024-07-01',
      });

      const updateCall = prisma.vendorCredit.update.mock.calls[0]![0]!;
      const refundedAt = updateCall.data.refundedAt as Date;
      expect(refundedAt.toISOString()).toContain('2024-07-01');
    });

    it('should use current date when date is not provided', async () => {
      const credit = createMockVendorCredit({ refundedAt: null });
      prisma.vendorCredit.findFirst.mockResolvedValue(credit as any);
      prisma.vendorCredit.update.mockResolvedValue({
        ...credit,
        refundedAt: new Date(),
      } as any);

      const before = new Date();
      await service.refund(ORG_ID, 'vc-test-001', { bankAccountId: 'bank-001' });
      const after = new Date();

      const updateCall = prisma.vendorCredit.update.mock.calls[0]![0]!;
      const refundedAt = updateCall.data.refundedAt as Date;
      expect(refundedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(refundedAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });
});
