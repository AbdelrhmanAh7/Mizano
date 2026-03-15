import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
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
  });
});
