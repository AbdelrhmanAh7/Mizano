import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { VendorsService } from './vendors.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { createMockPrisma, MockPrismaClient } from '../../../test/mocks/prisma.mock';
import { createMockVendor } from '../../../test/helpers/test-utils';

describe('VendorsService', () => {
  let service: VendorsService;
  let prisma: MockPrismaClient;

  const ORG_ID = 'org-test-001';

  beforeEach(async () => {
    prisma = createMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [VendorsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<VendorsService>(VendorsService);
  });

  describe('create', () => {
    const validDto = {
      name: 'Acme Corp',
      email: 'acme@test.com',
      phone: '+1234567890',
      billingAddress: {
        street: '123 Main St',
        city: 'Springfield',
        state: 'IL',
        postalCode: '62701',
        country: 'US',
      },
    };

    it('should create a vendor with organizationId', async () => {
      const mockVendor = createMockVendor({ name: 'Acme Corp' });
      prisma.vendor.create.mockResolvedValue(mockVendor as any);

      const result = await service.create(ORG_ID, validDto as any);

      expect(result).toBeDefined();
      const createCall = prisma.vendor.create.mock.calls[0][0];
      expect(createCall.data.organizationId).toBe(ORG_ID);
    });

    it('should flatten billing address fields into the data', async () => {
      prisma.vendor.create.mockResolvedValue(createMockVendor() as any);

      await service.create(ORG_ID, validDto as any);

      const createCall = prisma.vendor.create.mock.calls[0][0];
      expect(createCall.data.billingStreet).toBe('123 Main St');
      expect(createCall.data.billingCity).toBe('Springfield');
      expect(createCall.data.billingState).toBe('IL');
      expect(createCall.data.billingPostalCode).toBe('62701');
      expect(createCall.data.billingCountry).toBe('US');
    });

    it('should handle missing billing address', async () => {
      prisma.vendor.create.mockResolvedValue(createMockVendor() as any);

      const dto = { name: 'Simple Vendor' };
      await service.create(ORG_ID, dto as any);

      const createCall = prisma.vendor.create.mock.calls[0][0];
      expect(createCall.data.billingStreet).toBeUndefined();
      expect(createCall.data.organizationId).toBe(ORG_ID);
    });

    it('should pass through non-address fields', async () => {
      prisma.vendor.create.mockResolvedValue(createMockVendor() as any);

      await service.create(ORG_ID, validDto as any);

      const createCall = prisma.vendor.create.mock.calls[0][0];
      expect(createCall.data.name).toBe('Acme Corp');
      expect(createCall.data.email).toBe('acme@test.com');
      expect(createCall.data.phone).toBe('+1234567890');
      // billingAddress should NOT be in data (destructured out)
      expect((createCall.data as any).billingAddress).toBeUndefined();
    });
  });

  describe('findAll', () => {
    it('should return paginated results with meta', async () => {
      prisma.vendor.findMany.mockResolvedValue([
        createMockVendor({ id: 'v1' }),
        createMockVendor({ id: 'v2' }),
      ] as any);
      prisma.vendor.count.mockResolvedValue(2);

      const result = await service.findAll(ORG_ID, { page: 1, limit: 20 });

      expect(result.data).toHaveLength(2);
      expect(result.meta.total).toBe(2);
      expect(result.meta.totalPages).toBe(1);
    });

    it('should always filter by organizationId and exclude soft-deleted', async () => {
      prisma.vendor.findMany.mockResolvedValue([]);
      prisma.vendor.count.mockResolvedValue(0);

      await service.findAll(ORG_ID, {});

      const findCall = prisma.vendor.findMany.mock.calls[0]![0]!;
      expect(findCall.where!.organizationId).toBe(ORG_ID);
      expect(findCall.where!.deletedAt).toBeNull();
    });

    it('should apply search filter on name and email', async () => {
      prisma.vendor.findMany.mockResolvedValue([]);
      prisma.vendor.count.mockResolvedValue(0);

      await service.findAll(ORG_ID, { search: 'acme' });

      const findCall = prisma.vendor.findMany.mock.calls[0]![0]!;
      expect(findCall.where!.OR).toBeDefined();
      expect(findCall.where!.OR).toEqual([
        { name: { contains: 'acme', mode: 'insensitive' } },
        { email: { contains: 'acme', mode: 'insensitive' } },
      ]);
    });

    it('should use default sort by name ascending', async () => {
      prisma.vendor.findMany.mockResolvedValue([]);
      prisma.vendor.count.mockResolvedValue(0);

      await service.findAll(ORG_ID, {});

      const findCall = prisma.vendor.findMany.mock.calls[0]![0]!;
      expect(findCall.orderBy).toEqual({ name: 'asc' });
    });

    it('should calculate correct pagination', async () => {
      prisma.vendor.findMany.mockResolvedValue([]);
      prisma.vendor.count.mockResolvedValue(45);

      const result = await service.findAll(ORG_ID, { page: 2, limit: 20 });

      expect(result.meta.totalPages).toBe(3);
      const findCall = prisma.vendor.findMany.mock.calls[0]![0]!;
      expect(findCall.skip).toBe(20);
      expect(findCall.take).toBe(20);
    });
  });

  describe('findOne', () => {
    it('should return vendor by id', async () => {
      const vendor = createMockVendor({ id: 'v1', name: 'Found Vendor' });
      prisma.vendor.findFirst.mockResolvedValue(vendor as any);

      const result = await service.findOne(ORG_ID, 'v1');
      expect(result).toBeDefined();
      expect(result.name).toBe('Found Vendor');
    });

    it('should throw NotFoundException for non-existent vendor', async () => {
      prisma.vendor.findFirst.mockResolvedValue(null);

      await expect(service.findOne(ORG_ID, 'nonexistent')).rejects.toThrow(NotFoundException);
      await expect(service.findOne(ORG_ID, 'nonexistent')).rejects.toThrow('Vendor not found');
    });

    it('should filter by organizationId and exclude soft-deleted', async () => {
      prisma.vendor.findFirst.mockResolvedValue(null);

      try {
        await service.findOne(ORG_ID, 'v1');
      } catch {
        // Expected
      }

      const findCall = prisma.vendor.findFirst.mock.calls[0]![0]!;
      expect(findCall.where!.organizationId).toBe(ORG_ID);
      expect(findCall.where!.deletedAt).toBeNull();
    });
  });

  describe('update', () => {
    it('should update an existing vendor', async () => {
      const vendor = createMockVendor({ id: 'v1' });
      prisma.vendor.findFirst.mockResolvedValue(vendor as any);
      prisma.vendor.update.mockResolvedValue({ ...vendor, name: 'Updated' } as any);

      const result = await service.update(ORG_ID, 'v1', { name: 'Updated' } as any);
      expect(result.name).toBe('Updated');
    });

    it('should throw NotFoundException for non-existent vendor', async () => {
      prisma.vendor.findFirst.mockResolvedValue(null);

      await expect(service.update(ORG_ID, 'nonexistent', {} as any)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should flatten billing address on update', async () => {
      const vendor = createMockVendor({ id: 'v1' });
      prisma.vendor.findFirst.mockResolvedValue(vendor as any);
      prisma.vendor.update.mockResolvedValue(vendor as any);

      await service.update(ORG_ID, 'v1', {
        billingAddress: { street: '456 Oak Ave', city: 'Chicago' },
      } as any);

      const updateCall = prisma.vendor.update.mock.calls[0][0];
      expect(updateCall.data.billingStreet).toBe('456 Oak Ave');
      expect(updateCall.data.billingCity).toBe('Chicago');
    });

    it('should not include billing address fields when not provided', async () => {
      const vendor = createMockVendor({ id: 'v1' });
      prisma.vendor.findFirst.mockResolvedValue(vendor as any);
      prisma.vendor.update.mockResolvedValue(vendor as any);

      await service.update(ORG_ID, 'v1', { name: 'New Name' } as any);

      const updateCall = prisma.vendor.update.mock.calls[0][0];
      expect(updateCall.data.billingStreet).toBeUndefined();
    });
  });

  describe('remove (soft delete)', () => {
    it('should soft-delete a vendor with no bills', async () => {
      const vendor = createMockVendor({ id: 'v1', bills: [] });
      prisma.vendor.findFirst.mockResolvedValue(vendor as any);
      prisma.vendor.update.mockResolvedValue({ ...vendor, deletedAt: new Date() } as any);

      const result = await service.remove(ORG_ID, 'v1');

      expect(result.message).toBe('Vendor deleted');
      expect(prisma.vendor.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ deletedAt: expect.any(Date) }),
        }),
      );
    });

    it('should reject deleting vendor with active bills', async () => {
      const vendor = createMockVendor({
        id: 'v1',
        bills: [{ id: 'bill-1' }],
      });
      prisma.vendor.findFirst.mockResolvedValue(vendor as any);

      await expect(service.remove(ORG_ID, 'v1')).rejects.toThrow(BadRequestException);
      await expect(service.remove(ORG_ID, 'v1')).rejects.toThrow('Cannot delete vendor with bills');
    });

    it('should throw NotFoundException for non-existent vendor', async () => {
      prisma.vendor.findFirst.mockResolvedValue(null);

      await expect(service.remove(ORG_ID, 'nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('should never hard-delete vendor records', async () => {
      const vendor = createMockVendor({ id: 'v1', bills: [] });
      prisma.vendor.findFirst.mockResolvedValue(vendor as any);
      prisma.vendor.update.mockResolvedValue({ ...vendor, deletedAt: new Date() } as any);

      await service.remove(ORG_ID, 'v1');

      expect(prisma.vendor.delete).not.toHaveBeenCalled();
      expect(prisma.vendor.deleteMany).not.toHaveBeenCalled();
    });

    it('should check for active bills (not soft-deleted) when deleting', async () => {
      prisma.vendor.findFirst.mockResolvedValue(null);

      try {
        await service.remove(ORG_ID, 'v1');
      } catch {
        // Expected
      }

      const findCall = prisma.vendor.findFirst.mock.calls[0]![0]! as any;
      expect(findCall.include.bills.where.deletedAt).toBeNull();
    });
  });
});
