import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { PaymentsReceivedService } from './payments-received.service';
import { InvoicesService } from './invoices.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { JournalsService } from '../../accounting/services/journals.service';
import { createMockPrisma, MockPrismaClient } from '../../../test/mocks/prisma.mock';
import { createMockCustomer, createMockInvoice } from '../../../test/helpers/test-utils';
import { dec, expectDecimalEqual } from '../../../test/helpers/decimal.helpers';

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
    it('should return paginated results with meta', async () => {
      prisma.paymentReceived.findMany.mockResolvedValue([
        { id: 'pmt-1', paymentNumber: 'PMT-001' },
        { id: 'pmt-2', paymentNumber: 'PMT-002' },
      ] as any);
      prisma.paymentReceived.count.mockResolvedValue(2);

      const result = await service.findAll(ORG_ID, { page: 1, limit: 20 });

      expect(result.data).toHaveLength(2);
      expect(result.meta.total).toBe(2);
      expect(result.meta.totalPages).toBe(1);
    });

    it('should always filter by organizationId', async () => {
      prisma.paymentReceived.findMany.mockResolvedValue([]);
      prisma.paymentReceived.count.mockResolvedValue(0);

      await service.findAll(ORG_ID, {});

      const findCall = prisma.paymentReceived.findMany.mock.calls[0]![0]!;
      expect(findCall.where!.organizationId).toBe(ORG_ID);
    });
  });
});
