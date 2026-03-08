import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { WarehousesService } from './warehouses.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { createMockPrisma, MockPrismaClient } from '../../../test/mocks/prisma.mock';

describe('WarehousesService', () => {
  let service: WarehousesService;
  let prisma: MockPrismaClient;

  const ORG_ID = 'org-test-001';

  const mockWarehouse = {
    id: 'wh-test-001',
    organizationId: ORG_ID,
    name: 'Main Warehouse',
    code: 'WH-MAIN',
    address: '123 Industrial Rd',
    isDefault: false,
    isActive: true,
    deletedAt: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  beforeEach(async () => {
    prisma = createMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [WarehousesService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<WarehousesService>(WarehousesService);
  });

  describe('create', () => {
    const validDto = {
      name: 'Main Warehouse',
      code: 'WH-MAIN',
      address: '123 Industrial Rd',
      isDefault: false,
    };

    it('should create a warehouse with correct data', async () => {
      prisma.warehouse.findFirst.mockResolvedValue(null);
      prisma.warehouse.create.mockResolvedValue(mockWarehouse as any);

      const result = await service.create(ORG_ID, validDto as any);

      expect(result).toBeDefined();
      expect(prisma.warehouse.create).toHaveBeenCalledWith({
        data: { ...validDto, organizationId: ORG_ID },
      });
    });

    it('should always include organizationId in the created record', async () => {
      prisma.warehouse.findFirst.mockResolvedValue(null);
      prisma.warehouse.create.mockResolvedValue(mockWarehouse as any);

      await service.create(ORG_ID, validDto as any);

      const createCall = prisma.warehouse.create.mock.calls[0][0];
      expect(createCall.data.organizationId).toBe(ORG_ID);
    });

    it('should throw ConflictException when warehouse code already exists', async () => {
      prisma.warehouse.findFirst.mockResolvedValue(mockWarehouse as any);

      await expect(service.create(ORG_ID, validDto as any)).rejects.toThrow(ConflictException);
      await expect(service.create(ORG_ID, validDto as any)).rejects.toThrow(
        'Warehouse code exists',
      );
    });

    it('should check code uniqueness within the organization', async () => {
      prisma.warehouse.findFirst.mockResolvedValue(null);
      prisma.warehouse.create.mockResolvedValue(mockWarehouse as any);

      await service.create(ORG_ID, validDto as any);

      expect(prisma.warehouse.findFirst).toHaveBeenCalledWith({
        where: { code: 'WH-MAIN', organizationId: ORG_ID },
      });
    });

    it('should unset other defaults when creating a default warehouse', async () => {
      prisma.warehouse.findFirst.mockResolvedValue(null);
      prisma.warehouse.updateMany.mockResolvedValue({ count: 1 } as any);
      prisma.warehouse.create.mockResolvedValue({
        ...mockWarehouse,
        isDefault: true,
      } as any);

      await service.create(ORG_ID, { ...validDto, isDefault: true } as any);

      expect(prisma.warehouse.updateMany).toHaveBeenCalledWith({
        where: { organizationId: ORG_ID, isDefault: true },
        data: { isDefault: false },
      });
    });

    it('should not unset other defaults when creating a non-default warehouse', async () => {
      prisma.warehouse.findFirst.mockResolvedValue(null);
      prisma.warehouse.create.mockResolvedValue(mockWarehouse as any);

      await service.create(ORG_ID, { ...validDto, isDefault: false } as any);

      expect(prisma.warehouse.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('should return active warehouses for the organization', async () => {
      const warehouses = [mockWarehouse, { ...mockWarehouse, id: 'wh-2', name: 'Secondary' }];
      prisma.warehouse.findMany.mockResolvedValue(warehouses as any);

      const result = await service.findAll(ORG_ID);

      expect(result).toHaveLength(2);
    });

    it('should filter by organizationId, isActive, and exclude soft-deleted', async () => {
      prisma.warehouse.findMany.mockResolvedValue([]);

      await service.findAll(ORG_ID);

      const findCall = prisma.warehouse.findMany.mock.calls[0]![0] as any;
      expect(findCall.where!).toEqual({
        organizationId: ORG_ID,
        isActive: true,
        deletedAt: null,
      });
    });

    it('should order by name ascending', async () => {
      prisma.warehouse.findMany.mockResolvedValue([]);

      await service.findAll(ORG_ID);

      const findCall = prisma.warehouse.findMany.mock.calls[0]![0] as any;
      expect(findCall.orderBy).toEqual({ name: 'asc' });
    });
  });

  describe('findOne', () => {
    it('should return a warehouse by id', async () => {
      prisma.warehouse.findFirst.mockResolvedValue(mockWarehouse as any);

      const result = await service.findOne(ORG_ID, 'wh-test-001');

      expect(result.id).toBe('wh-test-001');
      expect(result.name).toBe('Main Warehouse');
    });

    it('should throw NotFoundException when warehouse does not exist', async () => {
      prisma.warehouse.findFirst.mockResolvedValue(null);

      await expect(service.findOne(ORG_ID, 'nonexistent')).rejects.toThrow(NotFoundException);
      await expect(service.findOne(ORG_ID, 'nonexistent')).rejects.toThrow('Warehouse not found');
    });

    it('should filter by organizationId and exclude soft-deleted', async () => {
      prisma.warehouse.findFirst.mockResolvedValue(null);

      try {
        await service.findOne(ORG_ID, 'wh-1');
      } catch {
        // Expected
      }

      expect(prisma.warehouse.findFirst).toHaveBeenCalledWith({
        where: { id: 'wh-1', organizationId: ORG_ID, deletedAt: null },
      });
    });
  });

  describe('update', () => {
    it('should update a warehouse', async () => {
      prisma.warehouse.findFirst.mockResolvedValue(mockWarehouse as any);
      prisma.warehouse.update.mockResolvedValue({
        ...mockWarehouse,
        name: 'Updated Warehouse',
      } as any);

      const result = await service.update(ORG_ID, 'wh-test-001', {
        name: 'Updated Warehouse',
      } as any);

      expect(result.name).toBe('Updated Warehouse');
    });

    it('should throw NotFoundException when warehouse does not exist', async () => {
      prisma.warehouse.findFirst.mockResolvedValue(null);

      await expect(
        service.update(ORG_ID, 'nonexistent', { name: 'Updated' } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('should unset other defaults when setting warehouse as default', async () => {
      prisma.warehouse.findFirst.mockResolvedValue(mockWarehouse as any);
      prisma.warehouse.updateMany.mockResolvedValue({ count: 1 } as any);
      prisma.warehouse.update.mockResolvedValue({
        ...mockWarehouse,
        isDefault: true,
      } as any);

      await service.update(ORG_ID, 'wh-test-001', { isDefault: true } as any);

      expect(prisma.warehouse.updateMany).toHaveBeenCalledWith({
        where: { organizationId: ORG_ID, isDefault: true, id: { not: 'wh-test-001' } },
        data: { isDefault: false },
      });
    });

    it('should not unset other defaults when isDefault is not set', async () => {
      prisma.warehouse.findFirst.mockResolvedValue(mockWarehouse as any);
      prisma.warehouse.update.mockResolvedValue(mockWarehouse as any);

      await service.update(ORG_ID, 'wh-test-001', { name: 'Updated' } as any);

      expect(prisma.warehouse.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('should soft-delete a warehouse without movements', async () => {
      prisma.warehouse.findFirst.mockResolvedValue({
        ...mockWarehouse,
        _count: { inventoryMovements: 0 },
      } as any);
      prisma.warehouse.update.mockResolvedValue({} as any);

      const result = await service.remove(ORG_ID, 'wh-test-001');

      expect(result.message).toBe('Warehouse deleted');
      expect(prisma.warehouse.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { deletedAt: expect.any(Date) },
        }),
      );
    });

    it('should throw NotFoundException when warehouse does not exist', async () => {
      prisma.warehouse.findFirst.mockResolvedValue(null);

      await expect(service.remove(ORG_ID, 'nonexistent')).rejects.toThrow(NotFoundException);
      await expect(service.remove(ORG_ID, 'nonexistent')).rejects.toThrow('Warehouse not found');
    });

    it('should throw BadRequestException when warehouse has inventory movements', async () => {
      prisma.warehouse.findFirst.mockResolvedValue({
        ...mockWarehouse,
        _count: { inventoryMovements: 5 },
      } as any);

      await expect(service.remove(ORG_ID, 'wh-test-001')).rejects.toThrow(BadRequestException);
      await expect(service.remove(ORG_ID, 'wh-test-001')).rejects.toThrow(
        'Warehouse has movements',
      );
    });

    it('should never hard-delete warehouses', async () => {
      prisma.warehouse.findFirst.mockResolvedValue({
        ...mockWarehouse,
        _count: { inventoryMovements: 0 },
      } as any);
      prisma.warehouse.update.mockResolvedValue({} as any);

      await service.remove(ORG_ID, 'wh-test-001');

      expect(prisma.warehouse.delete).not.toHaveBeenCalled();
      expect(prisma.warehouse.deleteMany).not.toHaveBeenCalled();
    });
  });
});
