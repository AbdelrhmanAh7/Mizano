import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CompositeItemsService } from './composite-items.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { createMockPrisma, MockPrismaClient } from '../../../test/mocks/prisma.mock';

describe('CompositeItemsService', () => {
  let service: CompositeItemsService;
  let prisma: MockPrismaClient;

  const ORG_ID = 'org-test-001';

  beforeEach(async () => {
    prisma = createMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [CompositeItemsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<CompositeItemsService>(CompositeItemsService);
  });

  describe('findAllCursor', () => {
    it('should return cursor-paginated results', async () => {
      const items = [
        { id: 'ci-1', name: 'Bundle A', components: [] },
        { id: 'ci-2', name: 'Bundle B', components: [] },
      ];
      prisma.compositeItem.findMany.mockResolvedValue(items as any);
      prisma.compositeItem.count.mockResolvedValue(2);

      const result = await service.findAllCursor(ORG_ID, { take: 50 });

      expect(result.data).toHaveLength(2);
      expect(result.meta.total).toBe(2);
      expect(result.meta.hasMore).toBe(false);
    });

    it('should reject invalid sortBy and fall back to name', async () => {
      prisma.compositeItem.findMany.mockResolvedValue([]);
      prisma.compositeItem.count.mockResolvedValue(0);

      await service.findAllCursor(ORG_ID, { sortBy: 'invalidField', take: 10 });

      const findCall = prisma.compositeItem.findMany.mock.calls[0]![0]!;
      expect(findCall.orderBy).toEqual({ name: 'asc' });
    });

    it('should accept valid sortBy fields', async () => {
      prisma.compositeItem.findMany.mockResolvedValue([]);
      prisma.compositeItem.count.mockResolvedValue(0);

      await service.findAllCursor(ORG_ID, { sortBy: 'createdAt', sortOrder: 'desc', take: 10 });

      const findCall = prisma.compositeItem.findMany.mock.calls[0]![0]!;
      expect(findCall.orderBy).toEqual({ createdAt: 'desc' });
    });

    it('should filter by search term', async () => {
      prisma.compositeItem.findMany.mockResolvedValue([]);
      prisma.compositeItem.count.mockResolvedValue(0);

      await service.findAllCursor(ORG_ID, { search: 'bundle', take: 10 });

      const findCall = prisma.compositeItem.findMany.mock.calls[0]![0]!;
      expect(findCall.where!.OR).toEqual([
        { name: { contains: 'bundle', mode: 'insensitive' } },
        { sku: { contains: 'bundle', mode: 'insensitive' } },
      ]);
    });

    it('should include organizationId in where clause', async () => {
      prisma.compositeItem.findMany.mockResolvedValue([]);
      prisma.compositeItem.count.mockResolvedValue(0);

      await service.findAllCursor(ORG_ID, {});

      const findCall = prisma.compositeItem.findMany.mock.calls[0]![0]!;
      expect(findCall.where!.organizationId).toBe(ORG_ID);
    });
  });

  describe('findAll', () => {
    it('should return offset-paginated results', async () => {
      prisma.compositeItem.findMany.mockResolvedValue([]);
      prisma.compositeItem.count.mockResolvedValue(0);

      const result = await service.findAll(ORG_ID, { page: 1, limit: 20 });

      expect(result.data).toEqual([]);
      expect(result.meta.total).toBe(0);
    });
  });

  describe('findOne', () => {
    it('should throw NotFoundException when item does not exist', async () => {
      prisma.compositeItem.findFirst.mockResolvedValue(null);

      await expect(service.findOne(ORG_ID, 'nonexistent')).rejects.toThrow(NotFoundException);
    });
  });
  describe('component items belong to the organization', () => {
    const body = {
      name: 'Bundle',
      sku: 'BNDL-1',
      sellingPrice: '100.00',
      components: [
        { itemId: 'item-1', quantity: 1 },
        { itemId: 'item-x', quantity: 2 },
      ],
    };

    it('create refuses an item of another organization (or a deleted one)', async () => {
      prisma.compositeItem.findFirst.mockResolvedValue(null);
      prisma.item.findMany.mockResolvedValue([{ id: 'item-1' }] as never);

      await expect(service.create(ORG_ID, body)).rejects.toThrow('Component item item-x not found');
      expect(prisma.item.findMany.mock.calls[0]![0]!.where).toEqual({
        id: { in: ['item-1', 'item-x'] },
        organizationId: ORG_ID,
        deletedAt: null,
      });
      expect(prisma.compositeItem.create).not.toHaveBeenCalled();
    });

    it('create refuses the same item twice', async () => {
      prisma.compositeItem.findFirst.mockResolvedValue(null);
      await expect(
        service.create(ORG_ID, {
          ...body,
          components: [
            { itemId: 'item-1', quantity: 1 },
            { itemId: 'item-1', quantity: 2 },
          ],
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.compositeItem.create).not.toHaveBeenCalled();
    });

    it('create stores the sent SKU, decimal price and whole quantities', async () => {
      prisma.compositeItem.findFirst.mockResolvedValue(null);
      prisma.item.findMany.mockResolvedValue([{ id: 'item-1' }, { id: 'item-x' }] as never);
      prisma.compositeItem.create.mockResolvedValue({ id: 'ci-1' } as never);

      await service.create(ORG_ID, body);
      const { data } = prisma.compositeItem.create.mock.calls[0]![0] as unknown as {
        data: {
          sku: string;
          sellingPrice: { toString(): string };
          organizationId: string;
          components: { create: Array<{ itemId: string; quantity: number }> };
        };
      };
      expect(data.sku).toBe('BNDL-1');
      expect(data.sellingPrice.toString()).toBe('100');
      expect(data.organizationId).toBe(ORG_ID);
      expect(data.components.create).toEqual(body.components);
    });

    it('update refuses a foreign item before deleting the old components', async () => {
      prisma.compositeItem.findFirst.mockResolvedValueOnce({ id: 'ci-1', components: [] } as never);
      prisma.item.findMany.mockResolvedValue([{ id: 'item-1' }] as never);

      await expect(service.update(ORG_ID, 'ci-1', { components: body.components })).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.compositeItemComponent.deleteMany).not.toHaveBeenCalled();
      expect(prisma.compositeItem.update).not.toHaveBeenCalled();
    });

    it('update replaces the components inside one transaction', async () => {
      prisma.compositeItem.findFirst.mockResolvedValueOnce({ id: 'ci-1', components: [] } as never);
      prisma.item.findMany.mockResolvedValue([{ id: 'item-1' }, { id: 'item-x' }] as never);
      prisma.compositeItem.update.mockResolvedValue({ id: 'ci-1' } as never);

      await service.update(ORG_ID, 'ci-1', {
        components: body.components,
        sellingPrice: null,
      } as never);
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.compositeItemComponent.deleteMany).toHaveBeenCalledWith({
        where: { compositeItemId: 'ci-1' },
      });
      const { data } = prisma.compositeItem.update.mock.calls[0]![0] as unknown as {
        data: Record<string, unknown>;
      };
      expect(data).not.toHaveProperty('sellingPrice');
      expect(data).not.toHaveProperty('organizationId');
    });

    it('assemble refuses a warehouse of another organization or a deleted one', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue({ name: 'Bundle', components: [] } as never);
      prisma.warehouse.findFirst.mockResolvedValue(null);

      await expect(
        service.assemble(ORG_ID, 'bundle', { quantity: 1, warehouseId: 'wh-x' }),
      ).rejects.toThrow('Warehouse not found');
      expect(prisma.warehouse.findFirst.mock.calls[0]![0]!.where).toEqual({
        id: 'wh-x',
        organizationId: ORG_ID,
        deletedAt: null,
      });
    });
  });

  it('assembly writes positive OUT quantities and decrements component stock', async () => {
    jest.spyOn(service, 'findOne').mockResolvedValue({
      name: 'Bundle',
      components: [{ itemId: 'item', quantity: 2, item: { name: 'Part' } }],
    } as never);
    jest.spyOn(service, 'checkAvailability').mockResolvedValue({ isAvailable: true } as never);
    prisma.warehouse.findFirst.mockResolvedValue({ id: 'wh' } as never);
    await service.assemble(ORG_ID, 'bundle', { quantity: 3, warehouseId: 'wh' });
    const data = prisma.inventoryMovement.create.mock.calls[0][0].data;
    expect(data.quantity.toString()).toBe('6');
    expect(data.movementType).toBe('OUT');
    expect(prisma.item.update).toHaveBeenCalledWith({
      where: { id: 'item' },
      data: { currentStock: { decrement: 6 } },
    });
  });
});
