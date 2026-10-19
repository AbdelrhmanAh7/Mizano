import { Test, TestingModule } from '@nestjs/testing';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../../../prisma/prisma.service';
import { createMockPrisma, MockPrismaClient } from '../../../test/mocks/prisma.mock';
import { CostingService } from './costing.service';

const ORG = 'org-1';

describe('CostingService', () => {
  let service: CostingService;
  let prisma: MockPrismaClient;

  beforeEach(async () => {
    prisma = createMockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [CostingService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(CostingService);
  });

  describe('getInventoryValuation', () => {
    it('calculates valuation from cost layers when present', async () => {
      prisma.inventoryCostLayer.findMany.mockResolvedValue([
        {
          id: 'l-1',
          itemId: 'item-1',
          quantity: new Decimal('10'),
          costPerUnit: new Decimal('60.25'),
          item: { id: 'item-1', name: 'Item 1', sku: 'SKU-1' },
        },
      ] as never);

      const result = await service.getInventoryValuation(ORG, 'item-1');

      expect(prisma.inventoryCostLayer.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: ORG,
          itemId: 'item-1',
          quantity: { gt: expect.any(Decimal) },
        },
        include: { item: { select: { id: true, name: true, sku: true } } },
        orderBy: [{ itemId: 'asc' }, { createdAt: 'asc' }],
      });
      expect(result.totalValue.toString()).toBe('602.5');
      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toEqual({
        itemId: 'item-1',
        itemName: 'Item 1',
        sku: 'SKU-1',
        totalQuantity: 10,
        totalValue: 602.5,
        avgCostPerUnit: 60.25,
      });
    });

    it('falls back to inventory levels and costPrice when no cost layers exist', async () => {
      prisma.inventoryCostLayer.findMany.mockResolvedValue([]);
      prisma.item.findMany.mockResolvedValue([
        {
          id: 'item-2',
          name: 'Item 2',
          sku: 'SKU-2',
          costPrice: new Decimal('50.00'),
          currentStock: 5,
          inventoryLevels: [{ quantity: new Decimal('3') }, { quantity: new Decimal('2') }],
        },
      ] as never);

      const result = await service.getInventoryValuation(ORG, 'item-2');

      expect(result.totalValue.toString()).toBe('250');
      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toEqual({
        itemId: 'item-2',
        itemName: 'Item 2',
        sku: 'SKU-2',
        totalQuantity: 5,
        totalValue: 250,
        avgCostPerUnit: 50,
      });
    });
  });
});
