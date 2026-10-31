import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ItemType } from '@prisma/client';
import { ItemsService } from './items.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { PaginationDto } from '../../../common/dto/pagination.dto';

const mockPrismaService = {
  item: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    findUnique: jest.fn(),
  },
  account: { count: jest.fn() },
};

describe('ItemsService', () => {
  let service: ItemsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ItemsService, { provide: PrismaService, useValue: mockPrismaService }],
    }).compile();

    service = module.get<ItemsService>(ItemsService);
    jest.clearAllMocks();
  });

  describe('create: non-numeric prices', () => {
    const dto = (over: Record<string, unknown>) =>
      ({
        name: 'W',
        sku: 'W-1',
        type: ItemType.GOODS,
        unit: 'pcs',
        sellingPrice: '10',
        ...over,
      }) as never;

    it.each([
      ['sellingPrice', { sellingPrice: 'abc' }],
      ['costPrice', { costPrice: 'x' }],
    ])('rejects a non-numeric %s with 400 before touching the database', async (_f, over) => {
      mockPrismaService.item.findFirst.mockResolvedValue(null);
      await expect(service.create('org-001', dto(over))).rejects.toThrow(BadRequestException);
      expect(mockPrismaService.item.create).not.toHaveBeenCalled();
    });

    it('still accepts valid decimal strings', async () => {
      mockPrismaService.item.findFirst.mockResolvedValue(null);
      mockPrismaService.item.create.mockResolvedValue({ id: 'i1' });
      await service.create('org-001', dto({ sellingPrice: '12.50', costPrice: '5' }));
      expect(mockPrismaService.item.create).toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    const orgId = 'org-001';

    const baseItems = [
      { id: '1', name: 'Widget', sku: 'W-001', type: ItemType.GOODS, deletedAt: null },
      { id: '2', name: 'Service Pack', sku: 'S-001', type: ItemType.SERVICE, deletedAt: null },
    ];

    it('returns paginated items without type filter', async () => {
      mockPrismaService.item.findMany.mockResolvedValue(baseItems);
      mockPrismaService.item.count.mockResolvedValue(2);

      const query: PaginationDto = { page: 1, limit: 20 };
      const result = await service.findAll(orgId, query);

      expect(result.data).toHaveLength(2);
      expect(result.meta.total).toBe(2);
      expect(mockPrismaService.item.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ organizationId: orgId, deletedAt: null }),
        }),
      );
      // type should NOT be in where when not provided
      const whereArg = mockPrismaService.item.findMany.mock.calls[0][0].where;
      expect(whereArg.type).toBeUndefined();
    });

    it('filters by type=GOODS (regression: was rejected with 400)', async () => {
      const goodsItems = [baseItems[0]];
      mockPrismaService.item.findMany.mockResolvedValue(goodsItems);
      mockPrismaService.item.count.mockResolvedValue(1);

      const query: PaginationDto = { page: 1, limit: 20, type: 'GOODS' };
      const result = await service.findAll(orgId, query);

      expect(result.data).toHaveLength(1);
      const whereArg = mockPrismaService.item.findMany.mock.calls[0][0].where;
      expect(whereArg.type).toBe('GOODS');
    });

    it('filters by type=SERVICE', async () => {
      const serviceItems = [baseItems[1]];
      mockPrismaService.item.findMany.mockResolvedValue(serviceItems);
      mockPrismaService.item.count.mockResolvedValue(1);

      const query: PaginationDto = { page: 1, limit: 20, type: 'SERVICE' };
      const result = await service.findAll(orgId, query);

      expect(result.data).toHaveLength(1);
      const whereArg = mockPrismaService.item.findMany.mock.calls[0][0].where;
      expect(whereArg.type).toBe('SERVICE');
    });

    it('combines type filter with search', async () => {
      mockPrismaService.item.findMany.mockResolvedValue([baseItems[0]]);
      mockPrismaService.item.count.mockResolvedValue(1);

      const query: PaginationDto = { page: 1, limit: 20, type: 'GOODS', search: 'Widget' };
      await service.findAll(orgId, query);

      const whereArg = mockPrismaService.item.findMany.mock.calls[0][0].where;
      expect(whereArg.type).toBe('GOODS');
      expect(whereArg.OR).toBeDefined();
    });

    it('does not add type filter when type is undefined', async () => {
      mockPrismaService.item.findMany.mockResolvedValue(baseItems);
      mockPrismaService.item.count.mockResolvedValue(2);

      await service.findAll(orgId, { page: 1, limit: 20 });
      const whereArg = mockPrismaService.item.findMany.mock.calls[0][0].where;
      expect(whereArg).not.toHaveProperty('type');
    });

    it('returns correct pagination meta', async () => {
      mockPrismaService.item.findMany.mockResolvedValue(baseItems.slice(0, 1));
      mockPrismaService.item.count.mockResolvedValue(5);

      const result = await service.findAll(orgId, { page: 2, limit: 1 });
      expect(result.meta.page).toBe(2);
      expect(result.meta.limit).toBe(1);
      expect(result.meta.total).toBe(5);
      expect(result.meta.totalPages).toBe(5);
    });
  });

  describe('findOne', () => {
    it('returns item when found', async () => {
      const item = { id: 'item-1', name: 'Widget', organizationId: 'org-001' };
      mockPrismaService.item.findFirst.mockResolvedValue(item);

      const result = await service.findOne('org-001', 'item-1');
      expect(result).toEqual(item);
    });

    it('throws NotFoundException when item not found', async () => {
      mockPrismaService.item.findFirst.mockResolvedValue(null);
      await expect(service.findOne('org-001', 'missing-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('rejects a non-zero openingStock (stock needs a journal) and creates nothing', async () => {
      mockPrismaService.item.findFirst.mockResolvedValue(null);
      mockPrismaService.account.count.mockResolvedValue(0);
      await expect(
        service.create('org-001', {
          name: 'Widget',
          sku: 'W-009',
          type: ItemType.GOODS,
          sellingPrice: '100.00',
          openingStock: 5,
        }),
      ).rejects.toThrow(/inventory adjustment/);
      expect(mockPrismaService.item.create).not.toHaveBeenCalled();
    });

    it('creates the item with zero stock when openingStock is absent or zero', async () => {
      mockPrismaService.item.findFirst.mockResolvedValue(null);
      mockPrismaService.account.count.mockResolvedValue(0);
      mockPrismaService.item.create.mockResolvedValue({ id: 'i1' });
      await service.create('org-001', {
        name: 'Widget',
        sku: 'W-010',
        type: ItemType.GOODS,
        sellingPrice: '100.00',
        openingStock: 0,
      });
      expect(mockPrismaService.item.create.mock.calls[0][0].data.currentStock).toBe(0);
    });

    it('tracks stock for goods only, so a service never shows as out of stock', async () => {
      mockPrismaService.item.findFirst.mockResolvedValue(null);
      mockPrismaService.account.count.mockResolvedValue(0);
      mockPrismaService.item.create.mockResolvedValue({ id: 'i1' });
      for (const type of [ItemType.GOODS, ItemType.SERVICE, ItemType.DIGITAL]) {
        await service.create('org-001', { name: 'X', sku: `X-${type}`, type, sellingPrice: '1' });
      }
      expect(
        mockPrismaService.item.create.mock.calls.map(
          (call: [{ data: { trackInventory: boolean } }]) => call[0].data.trackInventory,
        ),
      ).toEqual([true, false, false]);
    });

    it('throws ConflictException when SKU already exists', async () => {
      mockPrismaService.item.findFirst.mockResolvedValue({ id: 'existing' });
      await expect(
        service.create('org-001', {
          name: 'Widget',
          sku: 'W-001',
          type: ItemType.GOODS,
          sellingPrice: '100.00',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects an account id that belongs to another organization (tenant isolation)', async () => {
      mockPrismaService.item.findFirst.mockResolvedValue(null);
      mockPrismaService.account.count.mockResolvedValue(1); // 2 distinct ids requested, 1 found

      await expect(
        service.create('org-001', {
          name: 'Widget',
          sku: 'W-002',
          type: ItemType.GOODS,
          sellingPrice: '100.00',
          inventoryAccountId: 'acc-mine',
          purchaseAccountId: 'acc-foreign',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrismaService.account.count).toHaveBeenCalledWith({
        where: {
          id: { in: expect.arrayContaining(['acc-mine', 'acc-foreign']) },
          organizationId: 'org-001',
          deletedAt: null,
        },
      });
      expect(mockPrismaService.item.create).not.toHaveBeenCalled();
    });

    it('creates the item when every referenced account is in the organization', async () => {
      mockPrismaService.item.findFirst.mockResolvedValue(null);
      mockPrismaService.account.count.mockResolvedValue(1);
      mockPrismaService.item.create.mockResolvedValue({ id: 'new' });

      await service.create('org-001', {
        name: 'Widget',
        sku: 'W-003',
        type: ItemType.GOODS,
        sellingPrice: '100.00',
        inventoryAccountId: 'acc-mine',
      });

      expect(mockPrismaService.item.create).toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('rejects a foreign account id on update', async () => {
      mockPrismaService.item.findFirst.mockResolvedValue({ id: 'item-1' });
      mockPrismaService.account.count.mockResolvedValue(0);

      await expect(
        service.update('org-001', 'item-1', { inventoryAccountId: 'acc-foreign' }),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrismaService.item.update).not.toHaveBeenCalled();
    });

    it('rejects a non-numeric sellingPrice or costPrice with 400', async () => {
      mockPrismaService.item.findFirst.mockResolvedValue({ id: 'item-1' });

      await expect(service.update('org-001', 'item-1', { sellingPrice: 'abc' })).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.update('org-001', 'item-1', { costPrice: 'abc' })).rejects.toThrow(
        BadRequestException,
      );
      expect(mockPrismaService.item.update).not.toHaveBeenCalled();
    });

    it('stores valid prices as Decimal and leaves absent ones untouched', async () => {
      mockPrismaService.item.findFirst.mockResolvedValue({ id: 'item-1' });
      mockPrismaService.item.update.mockResolvedValue({ id: 'item-1' });

      await service.update('org-001', 'item-1', { sellingPrice: '12.50', name: 'N' });

      const { data } = mockPrismaService.item.update.mock.calls[0][0] as {
        data: Record<string, { toString(): string } | string>;
      };
      expect(data.sellingPrice.toString()).toBe('12.5');
      expect(data.name).toBe('N');
      expect('costPrice' in data).toBe(false);
    });
  });
});
