import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { PaymentsMadeService } from './payments-made.service';
import { BillsService } from './bills.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { JournalsService } from '../../accounting/services/journals.service';
import { createMockPrisma, MockPrismaClient } from '../../../test/mocks/prisma.mock';
import { createMockVendor } from '../../../test/helpers/test-utils';
import { dec } from '../../../test/helpers/decimal.helpers';

describe('PaymentsMadeService', () => {
  let service: PaymentsMadeService;
  let prisma: MockPrismaClient;
  let billsService: { updateBalanceDue: jest.Mock };
  let journalsService: { create: jest.Mock };

  const ORG_ID = 'org-test-001';

  const createMockPayment = (overrides: Record<string, unknown> = {}) => ({
    id: 'pmt-test-001',
    paymentNumber: 'VPMT-001',
    organizationId: ORG_ID,
    vendorId: 'vendor-test-001',
    date: new Date('2024-06-15'),
    amount: dec('1000'),
    paymentMode: 'BANK_TRANSFER',
    paidFromAccountId: 'acc-bank-001',
    reference: 'REF-001',
    notes: 'Test payment',
    deletedAt: null,
    createdAt: new Date('2024-06-15'),
    updatedAt: new Date('2024-06-15'),
    vendor: { id: 'vendor-test-001', name: 'Test Vendor' },
    allocations: [],
    ...overrides,
  });

  beforeEach(async () => {
    prisma = createMockPrisma();
    billsService = { updateBalanceDue: jest.fn().mockResolvedValue({}) };
    journalsService = { create: jest.fn().mockResolvedValue({}) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsMadeService,
        { provide: PrismaService, useValue: prisma },
        { provide: BillsService, useValue: billsService },
        { provide: JournalsService, useValue: journalsService },
      ],
    }).compile();

    service = module.get<PaymentsMadeService>(PaymentsMadeService);
  });

  describe('create', () => {
    const validDto = {
      vendorId: 'vendor-test-001',
      date: '2024-06-15',
      amount: '1000',
      paymentMode: 'BANK_TRANSFER',
      paidFromAccountId: 'acc-bank-001',
      reference: 'REF-001',
      notes: 'Test payment',
      allocations: [
        { billId: 'bill-001', amount: '600' },
        { billId: 'bill-002', amount: '400' },
      ],
    };

    beforeEach(() => {
      prisma.vendor.findFirst.mockResolvedValue(createMockVendor() as any);
      // Mock generatePaymentNumber: no existing payments
      prisma.paymentMade.findFirst.mockResolvedValue(null);
      prisma.paymentMade.create.mockResolvedValue(createMockPayment() as any);
      prisma.organization.findUnique.mockResolvedValue({
        defaultApAccountId: 'ap-account-001',
      } as any);
    });

    it('should create a payment with organizationId', async () => {
      const result = await service.create(ORG_ID, validDto as any);

      expect(result).toBeDefined();
      const createCall = prisma.paymentMade.create.mock.calls[0]![0]!;
      expect(createCall.data.organizationId).toBe(ORG_ID);
    });

    it('should store monetary values as Decimal', async () => {
      await service.create(ORG_ID, validDto as any);

      const createCall = prisma.paymentMade.create.mock.calls[0]![0]!;
      expect(createCall.data.amount).toBeInstanceOf(Decimal);
    });

    it('should store allocation amounts as Decimal', async () => {
      await service.create(ORG_ID, validDto as any);

      const createCall = prisma.paymentMade.create.mock.calls[0]![0]!;
      const allocations = createCall.data.allocations!.create as any[];
      for (const alloc of allocations) {
        expect(alloc.amount).toBeInstanceOf(Decimal);
      }
    });

    it('should throw BadRequestException when vendor not found', async () => {
      prisma.vendor.findFirst.mockResolvedValue(null);

      await expect(service.create(ORG_ID, validDto as any)).rejects.toThrow(BadRequestException);
      await expect(service.create(ORG_ID, validDto as any)).rejects.toThrow('Vendor not found');
    });

    it('should throw BadRequestException when allocations do not equal payment amount', async () => {
      const mismatchDto = {
        ...validDto,
        allocations: [{ billId: 'bill-001', amount: '500' }],
      };

      await expect(service.create(ORG_ID, mismatchDto as any)).rejects.toThrow(BadRequestException);
      await expect(service.create(ORG_ID, mismatchDto as any)).rejects.toThrow(
        'Allocation must equal payment',
      );
    });

    it('should accept allocations within tolerance of 0.01', async () => {
      const almostEqualDto = {
        ...validDto,
        amount: '1000',
        allocations: [{ billId: 'bill-001', amount: '999.995' }],
      };

      // 1000 - 999.995 = 0.005 which is < 0.01 tolerance
      await expect(service.create(ORG_ID, almostEqualDto as any)).resolves.toBeDefined();
    });

    it('should update balance due for each allocated bill', async () => {
      await service.create(ORG_ID, validDto as any);

      expect(billsService.updateBalanceDue).toHaveBeenCalledTimes(2);
      expect(billsService.updateBalanceDue).toHaveBeenCalledWith('bill-001');
      expect(billsService.updateBalanceDue).toHaveBeenCalledWith('bill-002');
    });

    it('should generate payment number VPMT-001 when no prior payments exist', async () => {
      prisma.paymentMade.findFirst.mockResolvedValue(null);

      await service.create(ORG_ID, validDto as any);

      const createCall = prisma.paymentMade.create.mock.calls[0]![0]!;
      expect(createCall.data.paymentNumber).toBe('VPMT-001');
    });

    it('should increment payment number based on last payment', async () => {
      prisma.paymentMade.findFirst.mockResolvedValueOnce({
        paymentNumber: 'VPMT-005',
      } as any);
      prisma.paymentMade.create.mockResolvedValue(
        createMockPayment({ paymentNumber: 'VPMT-006' }) as any,
      );

      await service.create(ORG_ID, validDto as any);

      const createCall = prisma.paymentMade.create.mock.calls[0]![0]!;
      expect(createCall.data.paymentNumber).toBe('VPMT-006');
    });

    it('should create journal entry with AP debit and bank credit', async () => {
      await service.create(ORG_ID, validDto as any);

      expect(journalsService.create).toHaveBeenCalledWith(
        ORG_ID,
        expect.objectContaining({
          lines: expect.arrayContaining([
            expect.objectContaining({
              accountId: 'ap-account-001',
              debit: '1000.0000',
              credit: '0',
            }),
            expect.objectContaining({
              accountId: 'acc-bank-001',
              debit: '0',
              credit: '1000.0000',
            }),
          ]),
        }),
      );
    });

    it('should not create journal entry when paidFromAccountId is missing', async () => {
      const dtoNoPaidFrom = { ...validDto, paidFromAccountId: undefined };

      await service.create(ORG_ID, dtoNoPaidFrom as any);

      expect(journalsService.create).not.toHaveBeenCalled();
    });

    it('should not create journal entry when org has no default AP account', async () => {
      prisma.organization.findUnique.mockResolvedValue({
        defaultApAccountId: null,
      } as any);

      await service.create(ORG_ID, validDto as any);

      expect(journalsService.create).not.toHaveBeenCalled();
    });

    it('should verify vendor belongs to same organization', async () => {
      await service.create(ORG_ID, validDto as any);

      const findCall = prisma.vendor.findFirst.mock.calls[0]![0]!;
      expect(findCall.where!.organizationId).toBe(ORG_ID);
      expect(findCall.where!.deletedAt).toBeNull();
    });
  });

  describe('findAll', () => {
    it('should return paginated results with meta', async () => {
      prisma.paymentMade.findMany.mockResolvedValue([
        createMockPayment({ id: 'p1' }),
        createMockPayment({ id: 'p2' }),
      ] as any);
      prisma.paymentMade.count.mockResolvedValue(2);

      const result = await service.findAll(ORG_ID, { page: 1, limit: 20 });

      expect(result.data).toHaveLength(2);
      expect(result.meta.total).toBe(2);
      expect(result.meta.totalPages).toBe(1);
    });

    it('should always filter by organizationId and exclude soft-deleted', async () => {
      prisma.paymentMade.findMany.mockResolvedValue([]);
      prisma.paymentMade.count.mockResolvedValue(0);

      await service.findAll(ORG_ID, {});

      const findCall = prisma.paymentMade.findMany.mock.calls[0]![0]!;
      expect(findCall.where!.organizationId).toBe(ORG_ID);
      expect(findCall.where!.deletedAt).toBeNull();
    });

    it('should use default sort by date descending', async () => {
      prisma.paymentMade.findMany.mockResolvedValue([]);
      prisma.paymentMade.count.mockResolvedValue(0);

      await service.findAll(ORG_ID, {});

      const findCall = prisma.paymentMade.findMany.mock.calls[0]![0]!;
      expect(findCall.orderBy).toEqual({ date: 'desc' });
    });

    it('should calculate correct pagination', async () => {
      prisma.paymentMade.findMany.mockResolvedValue([]);
      prisma.paymentMade.count.mockResolvedValue(50);

      const result = await service.findAll(ORG_ID, { page: 3, limit: 10 });

      expect(result.meta.totalPages).toBe(5);
      const findCall = prisma.paymentMade.findMany.mock.calls[0]![0]!;
      expect(findCall.skip).toBe(20);
      expect(findCall.take).toBe(10);
    });
  });

  describe('findOne', () => {
    it('should return payment with vendor and allocations', async () => {
      const payment = createMockPayment({
        allocations: [{ id: 'alloc-1', billId: 'bill-001', amount: dec('1000'), bill: {} }],
      });
      prisma.paymentMade.findFirst.mockResolvedValue(payment as any);

      const result = await service.findOne(ORG_ID, 'pmt-test-001');
      expect(result).toBeDefined();
    });

    it('should throw NotFoundException for non-existent payment', async () => {
      prisma.paymentMade.findFirst.mockResolvedValue(null);

      await expect(service.findOne(ORG_ID, 'nonexistent')).rejects.toThrow(NotFoundException);
      await expect(service.findOne(ORG_ID, 'nonexistent')).rejects.toThrow('Payment not found');
    });

    it('should filter by organizationId and exclude soft-deleted', async () => {
      prisma.paymentMade.findFirst.mockResolvedValue(null);

      try {
        await service.findOne(ORG_ID, 'pmt-1');
      } catch {
        // Expected
      }

      const findCall = prisma.paymentMade.findFirst.mock.calls[0]![0]!;
      expect(findCall.where!.organizationId).toBe(ORG_ID);
      expect(findCall.where!.deletedAt).toBeNull();
    });
  });
});
