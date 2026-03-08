import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { ItemsService } from './items.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { createMockPrisma, MockPrismaClient } from '../../../test/mocks/prisma.mock';
import { createMockItem } from '../../../test/helpers/test-utils';

describe('ItemsService', () => {
  let service: ItemsService;
  let prisma: MockPrismaClient;

  const ORG_ID = 'org-test-001';

  beforeEach(async () => {
    prisma = createMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [ItemsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<ItemsService>(ItemsService);
  });

  describe('create', () => {
    const validDto = {
      name: 'Widget',
      sku: 'WDG-001',
      type: 'GOODS' as const,
      unit: 'PCS',
      sellingPrice: '150.00',
      costPrice: '80.00',
      salesAccountId: 'acc-sales',
      purchaseAccountId: 'acc-purchase',
      inventoryAccountId: 'acc-inventory',
      description: 'A test widget',
      reorderPoint: 10,
      openingStock: 50,
    };

    it('should create an item with correct data', async () => {
      prisma.item.findFirst.mockResolvedValue(null);
      const mockItem = createMockItem({ name: 'Widget', sku: 'WDG-001' });
      prisma.item.create.mockResolvedValue(mockItem as any);

      const result = await service.create(ORG_ID, validDto as any);

      expect(result).toBeDefined();
      expect(prisma.item.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'Widget',
            sku: 'WDG-001',
            organizationId: ORG_ID,
          }),
        }),
      );
    });

    it('should store sellingPrice and costPrice as Decimal', async () => {
      prisma.item.findFirst.mockResolvedValue(null);
      prisma.item.create.mockResolvedValue(createMockItem() as any);

      await service.create(ORG_ID, validDto as any);

      const createCall = prisma.item.create.mock.calls[0]![0] as any;
      expect(createCall.data.sellingPrice).toBeInstanceOf(Decimal);
      expect(createCall.data.costPrice).toBeInstanceOf(Decimal);
    });

    it('should set currentStock from openingStock', async () => {
      prisma.item.findFirst.mockResolvedValue(null);
      prisma.item.create.mockResolvedValue(createMockItem() as any);

      await service.create(ORG_ID, validDto as any);

      const createCall = prisma.item.create.mock.calls[0]![0] as any;
      expect(createCall.data.currentStock).toBe(50);
    });

    it('should default costPrice to 0 when not provided', async () => {
      prisma.item.findFirst.mockResolvedValue(null);
      prisma.item.create.mockResolvedValue(createMockItem() as any);

      const dtoWithoutCost = { ...validDto, costPrice: undefined };
      await service.create(ORG_ID, dtoWithoutCost as any);

      const createCall = prisma.item.create.mock.calls[0]![0] as any;
      expect(createCall.data.costPrice.equals(new Decimal('0'))).toBe(true);
    });

    it('should throw ConflictException when SKU already exists', async () => {
      prisma.item.findFirst.mockResolvedValue(createMockItem() as any);

      await expect(service.create(ORG_ID, validDto as any)).rejects.toThrow(ConflictException);
      await expect(service.create(ORG_ID, validDto as any)).rejects.toThrow('SKU already exists');
    });

    it('should check SKU uniqueness within organization', async () => {
      prisma.item.findFirst.mockResolvedValue(null);
      prisma.item.create.mockResolvedValue(createMockItem() as any);

      await service.create(ORG_ID, validDto as any);

      expect(prisma.item.findFirst).toHaveBeenCalledWith({
        where: { sku: 'WDG-001', organizationId: ORG_ID },
      });
    });

    it('should always include organizationId in created record', async () => {
      prisma.item.findFirst.mockResolvedValue(null);
      prisma.item.create.mockResolvedValue(createMockItem() as any);

      await service.create(ORG_ID, validDto as any);

      const createCall = prisma.item.create.mock.calls[0]![0] as any;
      expect(createCall.data.organizationId).toBe(ORG_ID);
    });
  });

  describe('findAll', () => {
    it('should return paginated items with meta', async () => {
      const items = [createMockItem(), createMockItem({ id: 'item-2', sku: 'TST-002' })];
      prisma.item.findMany.mockResolvedValue(items as any);
      prisma.item.count.mockResolvedValue(2);

      const result = await service.findAll(ORG_ID, { page: 1, limit: 20 });

      expect(result.data).toHaveLength(2);
      expect(result.meta).toEqual({ page: 1, limit: 20, total: 2, totalPages: 1 });
    });

    it('should filter by organizationId and exclude soft-deleted', async () => {
      prisma.item.findMany.mockResolvedValue([]);
      prisma.item.count.mockResolvedValue(0);

      await service.findAll(ORG_ID, {});

      const findCall = prisma.item.findMany.mock.calls[0]![0] as any;
      expect(findCall.where.organizationId).toBe(ORG_ID);
      expect(findCall.where.deletedAt).toBeNull();
    });

    it('should support search by name and SKU', async () => {
      prisma.item.findMany.mockResolvedValue([]);
      prisma.item.count.mockResolvedValue(0);

      await service.findAll(ORG_ID, { search: 'widget' });

      const findCall = prisma.item.findMany.mock.calls[0]![0] as any;
      expect(findCall.where.OR).toEqual([
        { name: { contains: 'widget', mode: 'insensitive' } },
        { sku: { contains: 'widget', mode: 'insensitive' } },
      ]);
    });

    it('should apply sorting', async () => {
      prisma.item.findMany.mockResolvedValue([]);
      prisma.item.count.mockResolvedValue(0);

      await service.findAll(ORG_ID, { sortBy: 'sku', sortOrder: 'desc' });

      const findCall = prisma.item.findMany.mock.calls[0]![0] as any;
      expect(findCall.orderBy).toEqual({ sku: 'desc' });
    });

    it('should apply pagination offset correctly', async () => {
      prisma.item.findMany.mockResolvedValue([]);
      prisma.item.count.mockResolvedValue(50);

      await service.findAll(ORG_ID, { page: 3, limit: 10 });

      const findCall = prisma.item.findMany.mock.calls[0]![0] as any;
      expect(findCall.skip).toBe(20); // (3 - 1) * 10
      expect(findCall.take).toBe(10);
    });
  });

  describe('findOne', () => {
    it('should return an item by id', async () => {
      const item = createMockItem({ id: 'item-1' });
      prisma.item.findFirst.mockResolvedValue(item as any);

      const result = await service.findOne(ORG_ID, 'item-1');

      expect(result.id).toBe('item-1');
    });

    it('should throw NotFoundException when item does not exist', async () => {
      prisma.item.findFirst.mockResolvedValue(null);

      await expect(service.findOne(ORG_ID, 'nonexistent')).rejects.toThrow(NotFoundException);
      await expect(service.findOne(ORG_ID, 'nonexistent')).rejects.toThrow('Item not found');
    });

    it('should filter by organizationId and exclude soft-deleted', async () => {
      prisma.item.findFirst.mockResolvedValue(null);

      try {
        await service.findOne(ORG_ID, 'item-1');
      } catch {
        // Expected
      }

      expect(prisma.item.findFirst).toHaveBeenCalledWith({
        where: { id: 'item-1', organizationId: ORG_ID, deletedAt: null },
      });
    });
  });

  describe('update', () => {
    it('should update an item', async () => {
      const item = createMockItem({ id: 'item-1' });
      prisma.item.findFirst.mockResolvedValue(item as any);
      prisma.item.update.mockResolvedValue({ ...item, name: 'Updated' } as any);

      const result = await service.update(ORG_ID, 'item-1', { name: 'Updated' } as any);

      expect(result.name).toBe('Updated');
    });

    it('should throw NotFoundException when item does not exist', async () => {
      prisma.item.findFirst.mockResolvedValue(null);

      await expect(service.update(ORG_ID, 'nonexistent', {} as any)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should check SKU uniqueness when updating SKU', async () => {
      const item = createMockItem({ id: 'item-1' });
      prisma.item.findFirst
        .mockResolvedValueOnce(item as any) // findOne check
        .mockResolvedValueOnce({ id: 'item-2', sku: 'TAKEN-SKU' } as any); // SKU conflict check

      await expect(service.update(ORG_ID, 'item-1', { sku: 'TAKEN-SKU' } as any)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should exclude own ID when checking SKU uniqueness', async () => {
      const item = createMockItem({ id: 'item-1' });
      prisma.item.findFirst.mockResolvedValueOnce(item as any).mockResolvedValueOnce(null); // no conflict
      prisma.item.update.mockResolvedValue(item as any);

      await service.update(ORG_ID, 'item-1', { sku: 'NEW-SKU' } as any);

      const skuCheckCall = prisma.item.findFirst.mock.calls[1]![0] as any;
      expect(skuCheckCall.where).toEqual({
        sku: 'NEW-SKU',
        organizationId: ORG_ID,
        id: { not: 'item-1' },
      });
    });
  });

  describe('remove', () => {
    it('should soft-delete an item without transactions', async () => {
      const item = createMockItem({ _count: { invoiceLines: 0, billLines: 0 } });
      prisma.item.findFirst.mockResolvedValue(item as any);
      prisma.item.update.mockResolvedValue({} as any);

      const result = await service.remove(ORG_ID, 'item-test-001');

      expect(result.message).toBe('Item deleted');
      expect(prisma.item.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { deletedAt: expect.any(Date) },
        }),
      );
    });

    it('should throw NotFoundException when item does not exist', async () => {
      prisma.item.findFirst.mockResolvedValue(null);

      await expect(service.remove(ORG_ID, 'nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when item has invoice lines', async () => {
      const item = createMockItem({ _count: { invoiceLines: 3, billLines: 0 } });
      prisma.item.findFirst.mockResolvedValue(item as any);

      await expect(service.remove(ORG_ID, 'item-test-001')).rejects.toThrow(BadRequestException);
      await expect(service.remove(ORG_ID, 'item-test-001')).rejects.toThrow(
        'Item has transactions',
      );
    });

    it('should throw BadRequestException when item has bill lines', async () => {
      const item = createMockItem({ _count: { invoiceLines: 0, billLines: 2 } });
      prisma.item.findFirst.mockResolvedValue(item as any);

      await expect(service.remove(ORG_ID, 'item-test-001')).rejects.toThrow(BadRequestException);
    });

    it('should never hard-delete items', async () => {
      const item = createMockItem({ _count: { invoiceLines: 0, billLines: 0 } });
      prisma.item.findFirst.mockResolvedValue(item as any);
      prisma.item.update.mockResolvedValue({} as any);

      await service.remove(ORG_ID, 'item-test-001');

      expect(prisma.item.delete).not.toHaveBeenCalled();
      expect(prisma.item.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('updateStock', () => {
    it('should increase stock correctly', async () => {
      prisma.item.findUnique.mockResolvedValue({ id: 'item-1', currentStock: 10 } as any);
      prisma.item.update.mockResolvedValue({} as any);

      await service.updateStock('item-1', 5, 'increase');

      expect(prisma.item.update).toHaveBeenCalledWith({
        where: { id: 'item-1' },
        data: { currentStock: 15 },
      });
    });

    it('should decrease stock correctly', async () => {
      prisma.item.findUnique.mockResolvedValue({ id: 'item-1', currentStock: 10 } as any);
      prisma.item.update.mockResolvedValue({} as any);

      await service.updateStock('item-1', 3, 'decrease');

      expect(prisma.item.update).toHaveBeenCalledWith({
        where: { id: 'item-1' },
        data: { currentStock: 7 },
      });
    });

    it('should clamp stock to zero (never go negative)', async () => {
      prisma.item.findUnique.mockResolvedValue({ id: 'item-1', currentStock: 3 } as any);
      prisma.item.update.mockResolvedValue({} as any);

      await service.updateStock('item-1', 10, 'decrease');

      expect(prisma.item.update).toHaveBeenCalledWith({
        where: { id: 'item-1' },
        data: { currentStock: 0 },
      });
    });

    it('should throw NotFoundException when item does not exist', async () => {
      prisma.item.findUnique.mockResolvedValue(null);

      await expect(service.updateStock('nonexistent', 5, 'increase')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
