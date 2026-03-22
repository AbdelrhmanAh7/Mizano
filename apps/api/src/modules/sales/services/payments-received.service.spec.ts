import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { PaymentsReceivedService } from './payments-received.service';
import { InvoicesService } from './invoices.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { JournalsService } from '../../accounting/services/journals.service';
import { createMockPrisma, MockPrismaClient } from '../../../test/mocks/prisma.mock';
import { createMockCustomer, createMockInvoice } from '../../../test/helpers/test-utils';
import { dec } from '../../../test/helpers/decimal.helpers';

describe('PaymentsReceivedService', () => {
  let service: PaymentsReceivedService;
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
        PaymentsReceivedService,
        { provide: PrismaService, useValue: prisma },
        { provide: InvoicesService, useValue: invoicesService },
        { provide: JournalsService, useValue: journalsService },
      ],
    }).compile();

    service = module.get<PaymentsReceivedService>(PaymentsReceivedService);
  });

  describe('create', () => {
    const validDto = {
      customerId: 'cust-test-001',
      date: '2024-07-15',
      amount: '1000',
      paymentMode: 'BANK_TRANSFER' as any,
      depositToAccountId: 'bank-acc-001',
      allocations: [{ invoiceId: 'inv-1', amount: '1000' }],
    };

    it('should create a payment and generate payment number PMT-001', async () => {
      prisma.customer.findFirst.mockResolvedValue(createMockCustomer() as any);
      prisma.invoice.findFirst.mockResolvedValue(
        createMockInvoice({ customerId: 'cust-test-001' }) as any,
      );
      prisma.organization.findUnique.mockResolvedValue({
        defaultArAccountId: 'ar-acc-001',
      } as any);
      prisma.account.findFirst.mockResolvedValue({
        id: 'bank-acc-001',
        name: 'Business Checking',
        isActive: true,
      } as any);
      prisma.paymentReceived.findFirst.mockResolvedValue(null); // no existing payment

      const mockPayment = {
        id: 'pmt-1',
        paymentNumber: 'PMT-001',
        amount: dec('1000'),
        customer: { id: 'cust-test-001', name: 'Test Customer' },
        allocations: [
          {
            invoiceId: 'inv-1',
            amount: dec('1000'),
            invoice: { id: 'inv-1', invoiceNumber: 'INV-001' },
          },
        ],
      };
      prisma.paymentReceived.create.mockResolvedValue(mockPayment as any);

      const result = await service.create(ORG_ID, validDto);

      expect(result).toBeDefined();
      expect(result.paymentNumber).toBe('PMT-001');
    });

    it('should auto-increment payment numbers', async () => {
      prisma.customer.findFirst.mockResolvedValue(createMockCustomer() as any);
      prisma.invoice.findFirst.mockResolvedValue(
        createMockInvoice({ customerId: 'cust-test-001' }) as any,
      );
      prisma.organization.findUnique.mockResolvedValue({
        defaultArAccountId: 'ar-acc-001',
      } as any);
      prisma.account.findFirst.mockResolvedValue({
        id: 'bank-acc-001',
        name: 'Business Checking',
        isActive: true,
      } as any);
      prisma.paymentReceived.findFirst.mockResolvedValue({
        paymentNumber: 'PMT-010',
      } as any);
      prisma.paymentReceived.create.mockResolvedValue({
        id: 'pmt-2',
        paymentNumber: 'PMT-011',
        amount: dec('1000'),
        customer: { id: 'cust-test-001', name: 'Test Customer' },
        allocations: [],
      } as any);

      await service.create(ORG_ID, validDto);

      const createCall = prisma.paymentReceived.create.mock.calls[0][0];
      expect(createCall.data.paymentNumber).toBe('PMT-011');
    });

    it('should reject when total allocation does not match payment amount', async () => {
      const mismatchDto = {
        ...validDto,
        amount: '1000',
        allocations: [{ invoiceId: 'inv-1', amount: '500' }],
      };

      prisma.customer.findFirst.mockResolvedValue(createMockCustomer() as any);

      await expect(service.create(ORG_ID, mismatchDto)).rejects.toThrow(
        'Total allocation must equal payment amount',
      );
    });

    it('should reject when customer not found', async () => {
      prisma.customer.findFirst.mockResolvedValue(null);

      await expect(service.create(ORG_ID, validDto)).rejects.toThrow('Customer not found');
    });

    it('should reject when invoice does not belong to customer', async () => {
      prisma.customer.findFirst.mockResolvedValue(createMockCustomer() as any);
      // Total allocation matches
      // But invoice not found for this customer
      prisma.invoice.findFirst.mockResolvedValue(null);

      await expect(service.create(ORG_ID, validDto)).rejects.toThrow(/Invoice .* not found/);
    });

    it('should reject when default AR account is not configured', async () => {
      prisma.customer.findFirst.mockResolvedValue(createMockCustomer() as any);
      prisma.invoice.findFirst.mockResolvedValue(
        createMockInvoice({ customerId: 'cust-test-001' }) as any,
      );
      prisma.organization.findUnique.mockResolvedValue({
        defaultArAccountId: null,
      } as any);

      await expect(service.create(ORG_ID, validDto)).rejects.toThrow(
        /configure default Accounts Receivable/,
      );
    });

    it('should reject when deposit account is inactive', async () => {
      prisma.customer.findFirst.mockResolvedValue(createMockCustomer() as any);
      prisma.invoice.findFirst.mockResolvedValue(
        createMockInvoice({ customerId: 'cust-test-001' }) as any,
      );
      prisma.organization.findUnique.mockResolvedValue({
        defaultArAccountId: 'ar-acc-001',
      } as any);
      prisma.account.findFirst.mockResolvedValue(null);

      await expect(service.create(ORG_ID, validDto)).rejects.toThrow(
        'Deposit account not found or inactive',
      );
    });

    it('should create a balanced double-entry journal (Dr Bank, Cr AR)', async () => {
      prisma.customer.findFirst.mockResolvedValue(createMockCustomer() as any);
      prisma.invoice.findFirst.mockResolvedValue(
        createMockInvoice({ customerId: 'cust-test-001' }) as any,
      );
      prisma.organization.findUnique.mockResolvedValue({
        defaultArAccountId: 'ar-acc-001',
      } as any);
      prisma.account.findFirst.mockResolvedValue({
        id: 'bank-acc-001',
        name: 'Business Checking',
        isActive: true,
      } as any);
      prisma.paymentReceived.findFirst.mockResolvedValue(null);
      prisma.paymentReceived.create.mockResolvedValue({
        id: 'pmt-1',
        paymentNumber: 'PMT-001',
        amount: dec('1000'),
        customer: { id: 'cust-test-001', name: 'Test Customer' },
        allocations: [],
      } as any);

      await service.create(ORG_ID, validDto);

      expect(journalsService.create).toHaveBeenCalledWith(
        ORG_ID,
        expect.objectContaining({
          lines: [
            expect.objectContaining({
              accountId: 'bank-acc-001',
              debit: '1000.0000',
              credit: '0',
            }),
            expect.objectContaining({
              accountId: 'ar-acc-001',
              debit: '0',
              credit: '1000.0000',
            }),
          ],
        }),
      );
    });

    it('should update invoice balance for each allocation', async () => {
      const multiAllocDto = {
        ...validDto,
        amount: '1500',
        allocations: [
          { invoiceId: 'inv-1', amount: '1000' },
          { invoiceId: 'inv-2', amount: '500' },
        ],
      };

      prisma.customer.findFirst.mockResolvedValue(createMockCustomer() as any);
      prisma.invoice.findFirst.mockResolvedValue(
        createMockInvoice({ customerId: 'cust-test-001' }) as any,
      );
      prisma.organization.findUnique.mockResolvedValue({
        defaultArAccountId: 'ar-acc-001',
      } as any);
      prisma.account.findFirst.mockResolvedValue({
        id: 'bank-acc-001',
        name: 'Business Checking',
        isActive: true,
      } as any);
      prisma.paymentReceived.findFirst.mockResolvedValue(null);
      prisma.paymentReceived.create.mockResolvedValue({
        id: 'pmt-1',
        paymentNumber: 'PMT-001',
        amount: dec('1500'),
        customer: { id: 'cust-test-001', name: 'Test Customer' },
        allocations: [],
      } as any);

      await service.create(ORG_ID, multiAllocDto);

      expect(invoicesService.updateBalanceDue).toHaveBeenCalledTimes(2);
      expect(invoicesService.updateBalanceDue).toHaveBeenCalledWith('inv-1');
      expect(invoicesService.updateBalanceDue).toHaveBeenCalledWith('inv-2');
    });

    it('should store payment amount as Decimal', async () => {
      prisma.customer.findFirst.mockResolvedValue(createMockCustomer() as any);
      prisma.invoice.findFirst.mockResolvedValue(
        createMockInvoice({ customerId: 'cust-test-001' }) as any,
      );
      prisma.organization.findUnique.mockResolvedValue({
        defaultArAccountId: 'ar-acc-001',
      } as any);
      prisma.account.findFirst.mockResolvedValue({
        id: 'bank-acc-001',
        name: 'Business Checking',
        isActive: true,
      } as any);
      prisma.paymentReceived.findFirst.mockResolvedValue(null);
      prisma.paymentReceived.create.mockResolvedValue({
        id: 'pmt-1',
        paymentNumber: 'PMT-001',
        amount: dec('1000'),
        customer: { id: 'cust-test-001', name: 'Test Customer' },
        allocations: [],
      } as any);

      await service.create(ORG_ID, validDto);

      const createCall = prisma.paymentReceived.create.mock.calls[0][0];
      expect(createCall.data.amount).toBeInstanceOf(Decimal);
    });
  });

  describe('findOne', () => {
    it('should return payment with customer and allocations', async () => {
      const mockPayment = {
        id: 'pmt-1',
        paymentNumber: 'PMT-001',
        organizationId: ORG_ID,
        customer: createMockCustomer(),
        allocations: [],
      };
      prisma.paymentReceived.findFirst.mockResolvedValue(mockPayment as any);

      const result = await service.findOne(ORG_ID, 'pmt-1');
      expect(result.paymentNumber).toBe('PMT-001');
    });

    it('should throw NotFoundException when payment not found', async () => {
      prisma.paymentReceived.findFirst.mockResolvedValue(null);

      await expect(service.findOne(ORG_ID, 'nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('should filter by organizationId and exclude soft-deleted', async () => {
      prisma.paymentReceived.findFirst.mockResolvedValue(null);

      try {
        await service.findOne(ORG_ID, 'pmt-1');
      } catch {
        // Expected
      }

      const findCall = prisma.paymentReceived.findFirst.mock.calls[0]![0]!;
      expect(findCall.where!.organizationId).toBe(ORG_ID);
      expect(findCall.where!.deletedAt).toBeNull();
    });
  });

  describe('findAll', () => {
    it('should return paginated results with default params', async () => {
      const mockPayment = {
        id: 'pmt-1',
        paymentNumber: 'PMT-001',
        amount: dec('1000'),
        customer: { id: 'cust-1', name: 'Acme Corp' },
      };
      prisma.paymentReceived.findMany.mockResolvedValue([mockPayment] as never);
      prisma.paymentReceived.count.mockResolvedValue(1);

      const result = await service.findAll(ORG_ID, {});

      expect(result).toEqual({
        data: [mockPayment],
        meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
      });

      const findManyArgs = prisma.paymentReceived.findMany.mock.calls[0]![0]!;
      expect(findManyArgs.where!.organizationId).toBe(ORG_ID);
      expect(findManyArgs.where!.deletedAt).toBeNull();
      expect(findManyArgs.orderBy).toEqual({ date: 'desc' });
      expect(findManyArgs.skip).toBe(0);
      expect(findManyArgs.take).toBe(20);
    });

    it('should filter by customerId when provided', async () => {
      prisma.paymentReceived.findMany.mockResolvedValue([]);
      prisma.paymentReceived.count.mockResolvedValue(0);

      await service.findAll(ORG_ID, { customerId: 'cust-abc' });

      const whereArg = prisma.paymentReceived.findMany.mock.calls[0]![0]!.where!;
      expect(whereArg.customerId).toBe('cust-abc');
      expect(whereArg.organizationId).toBe(ORG_ID);
      expect(whereArg.deletedAt).toBeNull();
    });

    it('should not add customerId to where when not provided', async () => {
      prisma.paymentReceived.findMany.mockResolvedValue([]);
      prisma.paymentReceived.count.mockResolvedValue(0);

      await service.findAll(ORG_ID, {});

      const whereArg = prisma.paymentReceived.findMany.mock.calls[0]![0]!.where!;
      expect(whereArg.customerId).toBeUndefined();
    });

    it('should filter by paymentMode when provided', async () => {
      prisma.paymentReceived.findMany.mockResolvedValue([]);
      prisma.paymentReceived.count.mockResolvedValue(0);

      await service.findAll(ORG_ID, { paymentMode: 'BANK_TRANSFER' });

      const whereArg = prisma.paymentReceived.findMany.mock.calls[0]![0]!.where!;
      expect(whereArg.paymentMode).toBe('BANK_TRANSFER');
    });

    it('should not add paymentMode to where when not provided', async () => {
      prisma.paymentReceived.findMany.mockResolvedValue([]);
      prisma.paymentReceived.count.mockResolvedValue(0);

      await service.findAll(ORG_ID, {});

      const whereArg = prisma.paymentReceived.findMany.mock.calls[0]![0]!.where!;
      expect(whereArg.paymentMode).toBeUndefined();
    });

    it('should filter by dateFrom only', async () => {
      prisma.paymentReceived.findMany.mockResolvedValue([]);
      prisma.paymentReceived.count.mockResolvedValue(0);

      await service.findAll(ORG_ID, { dateFrom: '2026-01-01' });

      const whereArg = prisma.paymentReceived.findMany.mock.calls[0]![0]!.where!;
      expect(whereArg.date).toBeDefined();
      expect((whereArg.date as Record<string, unknown>).gte).toEqual(new Date('2026-01-01'));
      expect((whereArg.date as Record<string, unknown>).lte).toBeUndefined();
    });

    it('should filter by dateTo only', async () => {
      prisma.paymentReceived.findMany.mockResolvedValue([]);
      prisma.paymentReceived.count.mockResolvedValue(0);

      await service.findAll(ORG_ID, { dateTo: '2026-12-31' });

      const whereArg = prisma.paymentReceived.findMany.mock.calls[0]![0]!.where!;
      expect(whereArg.date).toBeDefined();
      expect((whereArg.date as Record<string, unknown>).lte).toEqual(new Date('2026-12-31'));
      expect((whereArg.date as Record<string, unknown>).gte).toBeUndefined();
    });

    it('should filter by date range (dateFrom and dateTo)', async () => {
      prisma.paymentReceived.findMany.mockResolvedValue([]);
      prisma.paymentReceived.count.mockResolvedValue(0);

      await service.findAll(ORG_ID, { dateFrom: '2026-01-01', dateTo: '2026-06-30' });

      const whereArg = prisma.paymentReceived.findMany.mock.calls[0]![0]!.where!;
      expect(whereArg.date).toBeDefined();
      expect((whereArg.date as Record<string, unknown>).gte).toEqual(new Date('2026-01-01'));
      expect((whereArg.date as Record<string, unknown>).lte).toEqual(new Date('2026-06-30'));
    });

    it('should not add date filter when no date params provided', async () => {
      prisma.paymentReceived.findMany.mockResolvedValue([]);
      prisma.paymentReceived.count.mockResolvedValue(0);

      await service.findAll(ORG_ID, {});

      const whereArg = prisma.paymentReceived.findMany.mock.calls[0]![0]!.where!;
      expect(whereArg.date).toBeUndefined();
    });

    it('should respect page and limit parameters', async () => {
      prisma.paymentReceived.findMany.mockResolvedValue([]);
      prisma.paymentReceived.count.mockResolvedValue(50);

      await service.findAll(ORG_ID, { page: 3, limit: 10 });

      const findManyArgs = prisma.paymentReceived.findMany.mock.calls[0]![0]!;
      expect(findManyArgs.skip).toBe(20); // (3-1) * 10
      expect(findManyArgs.take).toBe(10);
    });

    it('should respect sortBy and sortOrder parameters', async () => {
      prisma.paymentReceived.findMany.mockResolvedValue([]);
      prisma.paymentReceived.count.mockResolvedValue(0);

      await service.findAll(ORG_ID, { sortBy: 'amount', sortOrder: 'asc' });

      const findManyArgs = prisma.paymentReceived.findMany.mock.calls[0]![0]!;
      expect(findManyArgs.orderBy).toEqual({ amount: 'asc' });
    });

    it('should return correct totalPages calculation', async () => {
      prisma.paymentReceived.findMany.mockResolvedValue([]);
      prisma.paymentReceived.count.mockResolvedValue(45);

      const result = await service.findAll(ORG_ID, { limit: 10 });

      expect(result.meta.totalPages).toBe(5); // ceil(45/10)
    });

    it('should combine multiple filters simultaneously', async () => {
      prisma.paymentReceived.findMany.mockResolvedValue([]);
      prisma.paymentReceived.count.mockResolvedValue(0);

      await service.findAll(ORG_ID, {
        customerId: 'cust-xyz',
        paymentMode: 'CASH',
        dateFrom: '2026-03-01',
        dateTo: '2026-03-31',
      });

      const whereArg = prisma.paymentReceived.findMany.mock.calls[0]![0]!.where!;
      expect(whereArg.organizationId).toBe(ORG_ID);
      expect(whereArg.customerId).toBe('cust-xyz');
      expect(whereArg.paymentMode).toBe('CASH');
      expect((whereArg.date as Record<string, unknown>).gte).toEqual(new Date('2026-03-01'));
      expect((whereArg.date as Record<string, unknown>).lte).toEqual(new Date('2026-03-31'));
      expect(whereArg.deletedAt).toBeNull();
    });

    it('should include customer relation in query', async () => {
      prisma.paymentReceived.findMany.mockResolvedValue([]);
      prisma.paymentReceived.count.mockResolvedValue(0);

      await service.findAll(ORG_ID, {});

      const findManyArgs = prisma.paymentReceived.findMany.mock.calls[0]![0]!;
      expect(findManyArgs.include).toEqual({
        customer: { select: { id: true, name: true } },
      });
    });
  });
});
