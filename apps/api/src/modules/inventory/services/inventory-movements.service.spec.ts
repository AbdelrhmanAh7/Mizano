import { Test, TestingModule } from '@nestjs/testing';
import { InventoryMovementsService } from './inventory-movements.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { createMockPrisma, MockPrismaClient } from '../../../test/mocks/prisma.mock';

describe('InventoryMovementsService', () => {
  let service: InventoryMovementsService;
  let prisma: MockPrismaClient;

  const ORG_ID = 'org-test-001';

  beforeEach(async () => {
    prisma = createMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [InventoryMovementsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<InventoryMovementsService>(InventoryMovementsService);
  });

  describe('findAll', () => {
    it('should return paginated movements', async () => {
      prisma.inventoryMovement.findMany.mockResolvedValue([]);
      prisma.inventoryMovement.count.mockResolvedValue(0);

      const result = await service.findAll(ORG_ID, { page: 1, limit: 20 });

      expect(result.data).toEqual([]);
      expect(result.meta.total).toBe(0);
    });

    it('should reject invalid sortBy and fall back to createdAt', async () => {
      prisma.inventoryMovement.findMany.mockResolvedValue([]);
      prisma.inventoryMovement.count.mockResolvedValue(0);

      await service.findAll(ORG_ID, { sortBy: 'entryDate' });

      const findCall = prisma.inventoryMovement.findMany.mock.calls[0]![0]!;
      expect(findCall.orderBy).toEqual({ createdAt: 'desc' });
    });

    it('should accept valid sortBy fields', async () => {
      prisma.inventoryMovement.findMany.mockResolvedValue([]);
      prisma.inventoryMovement.count.mockResolvedValue(0);

      await service.findAll(ORG_ID, { sortBy: 'quantity', sortOrder: 'asc' });

      const findCall = prisma.inventoryMovement.findMany.mock.calls[0]![0]!;
      expect(findCall.orderBy).toEqual({ quantity: 'asc' });
    });

    it('should filter by itemId and warehouseId', async () => {
      prisma.inventoryMovement.findMany.mockResolvedValue([]);
      prisma.inventoryMovement.count.mockResolvedValue(0);

      await service.findAll(ORG_ID, { itemId: 'item-1', warehouseId: 'wh-1' });

      const findCall = prisma.inventoryMovement.findMany.mock.calls[0]![0]!;
      expect(findCall.where!.itemId).toBe('item-1');
      expect(findCall.where!.warehouseId).toBe('wh-1');
    });

    it('should filter by date range', async () => {
      prisma.inventoryMovement.findMany.mockResolvedValue([]);
      prisma.inventoryMovement.count.mockResolvedValue(0);

      await service.findAll(ORG_ID, {
        dateFrom: '2024-01-01',
        dateTo: '2024-12-31',
      });

      const findCall = prisma.inventoryMovement.findMany.mock.calls[0]![0]!;
      const dateFilter = findCall.where!.createdAt as { gte: Date; lte: Date };
      expect(dateFilter.gte).toEqual(new Date('2024-01-01'));
      expect(dateFilter.lte).toEqual(new Date('2024-12-31'));
    });
  });

  describe('findAllCursor', () => {
    it('should reject invalid sortBy and fall back to createdAt', async () => {
      prisma.inventoryMovement.findMany.mockResolvedValue([]);
      prisma.inventoryMovement.count.mockResolvedValue(0);

      await service.findAllCursor(ORG_ID, { sortBy: 'entryDate', take: 10 });

      const findCall = prisma.inventoryMovement.findMany.mock.calls[0]![0]!;
      expect(findCall.orderBy).toEqual({ createdAt: 'desc' });
    });

    it('should accept valid sortBy fields for cursor pagination', async () => {
      prisma.inventoryMovement.findMany.mockResolvedValue([]);
      prisma.inventoryMovement.count.mockResolvedValue(0);

      await service.findAllCursor(ORG_ID, { sortBy: 'type', take: 10 });

      const findCall = prisma.inventoryMovement.findMany.mock.calls[0]![0]!;
      expect(findCall.orderBy).toEqual({ type: 'desc' });
    });

    it('should include organizationId in where clause', async () => {
      prisma.inventoryMovement.findMany.mockResolvedValue([]);
      prisma.inventoryMovement.count.mockResolvedValue(0);

      await service.findAllCursor(ORG_ID, {});

      const findCall = prisma.inventoryMovement.findMany.mock.calls[0]![0]!;
      expect(findCall.where!.organizationId).toBe(ORG_ID);
    });
  });
});
