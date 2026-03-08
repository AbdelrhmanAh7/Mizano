import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { CustomersService } from './customers.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { createMockPrisma, MockPrismaClient } from '../../../test/mocks/prisma.mock';
import { createMockCustomer } from '../../../test/helpers/test-utils';

describe('CustomersService', () => {
  let service: CustomersService;
  let prisma: MockPrismaClient;

  const ORG_ID = 'org-test-001';

  beforeEach(async () => {
    prisma = createMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [CustomersService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<CustomersService>(CustomersService);
  });

  describe('create', () => {
    const validDto = {
      name: 'Acme Corp',
      email: 'acme@example.com',
      phone: '+1234567890',
      billingAddress: {
        street: '123 Main St',
        city: 'Springfield',
        state: 'IL',
        postalCode: '62701',
        country: 'US',
      },
      shippingAddress: {
        street: '456 Oak Ave',
        city: 'Shelbyville',
        state: 'IL',
        postalCode: '62702',
        country: 'US',
      },
    };

    it('should create a customer with organizationId', async () => {
      const mockCustomer = createMockCustomer({ name: 'Acme Corp' });
      prisma.customer.create.mockResolvedValue(mockCustomer as any);

      const result = await service.create(ORG_ID, validDto as any);

      expect(result).toBeDefined();
      expect(result.name).toBe('Acme Corp');

      const createCall = prisma.customer.create.mock.calls[0]![0]!;
      expect(createCall.data.organizationId).toBe(ORG_ID);
    });

    it('should flatten billing address fields', async () => {
      prisma.customer.create.mockResolvedValue(createMockCustomer() as any);

      await service.create(ORG_ID, validDto as any);

      const createCall = prisma.customer.create.mock.calls[0]![0]!;
      expect(createCall.data.billingStreet).toBe('123 Main St');
      expect(createCall.data.billingCity).toBe('Springfield');
      expect(createCall.data.billingState).toBe('IL');
      expect(createCall.data.billingPostalCode).toBe('62701');
      expect(createCall.data.billingCountry).toBe('US');
    });

    it('should flatten shipping address fields', async () => {
      prisma.customer.create.mockResolvedValue(createMockCustomer() as any);

      await service.create(ORG_ID, validDto as any);

      const createCall = prisma.customer.create.mock.calls[0]![0]!;
      expect(createCall.data.shippingStreet).toBe('456 Oak Ave');
      expect(createCall.data.shippingCity).toBe('Shelbyville');
      expect(createCall.data.shippingState).toBe('IL');
      expect(createCall.data.shippingPostalCode).toBe('62702');
      expect(createCall.data.shippingCountry).toBe('US');
    });

    it('should handle missing address fields gracefully', async () => {
      const dtoNoAddress = { name: 'Simple Customer', email: 'simple@test.com' };
      prisma.customer.create.mockResolvedValue(createMockCustomer() as any);

      await service.create(ORG_ID, dtoNoAddress as any);

      const createCall = prisma.customer.create.mock.calls[0]![0]!;
      expect(createCall.data.billingStreet).toBeUndefined();
      expect(createCall.data.shippingStreet).toBeUndefined();
      expect(createCall.data.organizationId).toBe(ORG_ID);
    });
  });

  describe('findAll', () => {
    it('should return paginated results with meta', async () => {
      prisma.customer.findMany.mockResolvedValue([
        createMockCustomer({ id: 'cust-1', name: 'Customer A' }),
        createMockCustomer({ id: 'cust-2', name: 'Customer B' }),
      ] as any);
      prisma.customer.count.mockResolvedValue(2);
      prisma.invoice.groupBy.mockResolvedValue([] as any);

      const result = await service.findAll(ORG_ID, { page: 1, limit: 20 });

      expect(result.data).toHaveLength(2);
      expect(result.meta.total).toBe(2);
      expect(result.meta.totalPages).toBe(1);
      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(20);
    });

    it('should always filter by organizationId and exclude soft-deleted', async () => {
      prisma.customer.findMany.mockResolvedValue([]);
      prisma.customer.count.mockResolvedValue(0);
      prisma.invoice.groupBy.mockResolvedValue([] as any);

      await service.findAll(ORG_ID, {});

      const findCall = prisma.customer.findMany.mock.calls[0]![0]!;
      expect(findCall.where!.organizationId).toBe(ORG_ID);
      expect(findCall.where!.deletedAt).toBeNull();
    });

    it('should apply search filter across name, email, and phone', async () => {
      prisma.customer.findMany.mockResolvedValue([]);
      prisma.customer.count.mockResolvedValue(0);
      prisma.invoice.groupBy.mockResolvedValue([] as any);

      await service.findAll(ORG_ID, { search: 'acme' });

      const findCall = prisma.customer.findMany.mock.calls[0]![0]!;
      expect((findCall.where as any).OR).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: { contains: 'acme', mode: 'insensitive' } }),
          expect.objectContaining({ email: { contains: 'acme', mode: 'insensitive' } }),
          expect.objectContaining({ phone: { contains: 'acme', mode: 'insensitive' } }),
        ]),
      );
    });

    it('should calculate correct pagination for multiple pages', async () => {
      prisma.customer.findMany.mockResolvedValue([]);
      prisma.customer.count.mockResolvedValue(45);
      prisma.invoice.groupBy.mockResolvedValue([] as any);

      const result = await service.findAll(ORG_ID, { page: 2, limit: 20 });

      expect(result.meta.totalPages).toBe(3);
      expect(result.meta.page).toBe(2);

      const findCall = prisma.customer.findMany.mock.calls[0]![0]!;
      expect(findCall.skip).toBe(20);
      expect(findCall.take).toBe(20);
    });

    it('should batch-calculate outstanding balances using groupBy', async () => {
      const customers = [
        createMockCustomer({ id: 'cust-1' }),
        createMockCustomer({ id: 'cust-2' }),
      ];
      prisma.customer.findMany.mockResolvedValue(customers as any);
      prisma.customer.count.mockResolvedValue(2);
      prisma.invoice.groupBy.mockResolvedValue([
        { customerId: 'cust-1', _sum: { balanceDue: new Decimal('500.0000') } },
      ] as any);

      const result = await service.findAll(ORG_ID, { page: 1, limit: 20 });

      expect((result.data[0] as any).outstandingBalance).toBe('500.0000');
      expect((result.data[1] as any).outstandingBalance).toBe('0.0000');
    });

    it('should use default sort by name ascending', async () => {
      prisma.customer.findMany.mockResolvedValue([]);
      prisma.customer.count.mockResolvedValue(0);
      prisma.invoice.groupBy.mockResolvedValue([] as any);

      await service.findAll(ORG_ID, {});

      const findCall = prisma.customer.findMany.mock.calls[0]![0]!;
      expect(findCall.orderBy).toEqual({ name: 'asc' });
    });
  });

  describe('findOne', () => {
    it('should return customer with outstanding balance', async () => {
      const customer = createMockCustomer({ id: 'cust-1', name: 'Test Customer' });
      prisma.customer.findFirst.mockResolvedValue(customer as any);
      prisma.invoice.findMany.mockResolvedValue([
        { balanceDue: new Decimal('200.0000') },
        { balanceDue: new Decimal('300.0000') },
      ] as any);

      const result = await service.findOne(ORG_ID, 'cust-1');

      expect(result.name).toBe('Test Customer');
      expect(result.outstandingBalance).toBe('500.0000');
    });

    it('should throw NotFoundException for non-existent customer', async () => {
      prisma.customer.findFirst.mockResolvedValue(null);

      await expect(service.findOne(ORG_ID, 'nonexistent')).rejects.toThrow(NotFoundException);
      await expect(service.findOne(ORG_ID, 'nonexistent')).rejects.toThrow('Customer not found');
    });

    it('should filter by organizationId and exclude soft-deleted', async () => {
      prisma.customer.findFirst.mockResolvedValue(null);

      try {
        await service.findOne(ORG_ID, 'cust-1');
      } catch {
        // Expected
      }

      const findCall = prisma.customer.findFirst.mock.calls[0]![0]!;
      expect(findCall.where!.organizationId).toBe(ORG_ID);
      expect(findCall.where!.deletedAt).toBeNull();
    });

    it('should return zero outstanding balance when no invoices exist', async () => {
      prisma.customer.findFirst.mockResolvedValue(createMockCustomer() as any);
      prisma.invoice.findMany.mockResolvedValue([]);

      const result = await service.findOne(ORG_ID, 'cust-test-001');

      expect(result.outstandingBalance).toBe('0.0000');
    });
  });

  describe('getStatement', () => {
    it('should return customer statement with invoices, payments, and credit notes', async () => {
      const customer = createMockCustomer({ id: 'cust-1' });
      prisma.customer.findFirst.mockResolvedValue(customer as any);
      prisma.invoice.findMany.mockResolvedValue([
        { id: 'inv-1', invoiceNumber: 'INV-001', balanceDue: new Decimal('100') },
      ] as any);
      prisma.paymentReceived.findMany.mockResolvedValue([
        { id: 'pmt-1', paymentNumber: 'PMT-001', amount: new Decimal('50') },
      ] as any);
      prisma.creditNote.findMany.mockResolvedValue([
        { id: 'cn-1', creditNoteNumber: 'CN-001', amount: new Decimal('25') },
      ] as any);

      const result = await service.getStatement(ORG_ID, 'cust-1');

      expect(result.customer).toBeDefined();
      expect(result.invoices).toHaveLength(1);
      expect(result.payments).toHaveLength(1);
      expect(result.creditNotes).toHaveLength(1);
    });

    it('should throw NotFoundException when customer does not exist', async () => {
      prisma.customer.findFirst.mockResolvedValue(null);

      await expect(service.getStatement(ORG_ID, 'nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    const updateDto = {
      name: 'Updated Name',
      email: 'updated@example.com',
      billingAddress: {
        street: '789 New St',
        city: 'NewCity',
        state: 'NY',
        postalCode: '10001',
        country: 'US',
      },
    };

    it('should update an existing customer', async () => {
      const customer = createMockCustomer();
      prisma.customer.findFirst.mockResolvedValue(customer as any);
      prisma.customer.update.mockResolvedValue({
        ...customer,
        name: 'Updated Name',
      } as any);

      const result = await service.update(ORG_ID, 'cust-test-001', updateDto as any);

      expect(result.name).toBe('Updated Name');
    });

    it('should throw NotFoundException for non-existent customer', async () => {
      prisma.customer.findFirst.mockResolvedValue(null);

      await expect(service.update(ORG_ID, 'nonexistent', updateDto as any)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should flatten updated billing address fields', async () => {
      prisma.customer.findFirst.mockResolvedValue(createMockCustomer() as any);
      prisma.customer.update.mockResolvedValue(createMockCustomer() as any);

      await service.update(ORG_ID, 'cust-test-001', updateDto as any);

      const updateCall = prisma.customer.update.mock.calls[0]![0]!;
      expect(updateCall.data.billingStreet).toBe('789 New St');
      expect(updateCall.data.billingCity).toBe('NewCity');
    });

    it('should filter by organizationId and exclude soft-deleted when looking up', async () => {
      prisma.customer.findFirst.mockResolvedValue(null);

      try {
        await service.update(ORG_ID, 'cust-1', updateDto as any);
      } catch {
        // Expected
      }

      const findCall = prisma.customer.findFirst.mock.calls[0]![0]!;
      expect(findCall.where!.organizationId).toBe(ORG_ID);
      expect(findCall.where!.deletedAt).toBeNull();
    });
  });

  describe('remove (soft delete)', () => {
    it('should soft-delete a customer without invoices', async () => {
      const customer = createMockCustomer({ invoices: [] });
      prisma.customer.findFirst.mockResolvedValue(customer as any);
      prisma.customer.update.mockResolvedValue({ ...customer, deletedAt: new Date() } as any);

      const result = await service.remove(ORG_ID, 'cust-test-001');

      expect(result.message).toBe('Customer deleted successfully');
      expect(prisma.customer.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ deletedAt: expect.any(Date) }),
        }),
      );
    });

    it('should reject deleting a customer with existing invoices', async () => {
      const customer = createMockCustomer({
        invoices: [{ id: 'inv-1', invoiceNumber: 'INV-001' }],
      });
      prisma.customer.findFirst.mockResolvedValue(customer as any);

      await expect(service.remove(ORG_ID, 'cust-test-001')).rejects.toThrow(BadRequestException);
      await expect(service.remove(ORG_ID, 'cust-test-001')).rejects.toThrow(
        'Cannot delete customer with existing invoices',
      );
    });

    it('should throw NotFoundException for non-existent customer', async () => {
      prisma.customer.findFirst.mockResolvedValue(null);

      await expect(service.remove(ORG_ID, 'nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('should never hard-delete customer records', async () => {
      const customer = createMockCustomer({ invoices: [] });
      prisma.customer.findFirst.mockResolvedValue(customer as any);
      prisma.customer.update.mockResolvedValue({ ...customer, deletedAt: new Date() } as any);

      await service.remove(ORG_ID, 'cust-test-001');

      expect(prisma.customer.delete).not.toHaveBeenCalled();
      expect(prisma.customer.deleteMany).not.toHaveBeenCalled();
    });

    it('should filter by organizationId and exclude soft-deleted when looking up', async () => {
      prisma.customer.findFirst.mockResolvedValue(null);

      try {
        await service.remove(ORG_ID, 'cust-1');
      } catch {
        // Expected
      }

      const findCall = prisma.customer.findFirst.mock.calls[0]![0]!;
      expect(findCall.where!.organizationId).toBe(ORG_ID);
      expect(findCall.where!.deletedAt).toBeNull();
    });
  });
});
