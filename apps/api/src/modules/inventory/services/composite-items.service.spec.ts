import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
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
});
