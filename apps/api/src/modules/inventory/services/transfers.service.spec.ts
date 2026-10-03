import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { TransfersService } from './transfers.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { createMockPrisma, MockPrismaClient } from '../../../test/mocks/prisma.mock';
import { TransferStatus } from '@prisma/client';

const ORG = 'org-1';
const ITEM_ID = 'item-1';
const FROM_WH = 'wh-from';
const TO_WH = 'wh-to';

describe('TransfersService', () => {
  let service: TransfersService;
  let prisma: MockPrismaClient;

  beforeEach(async () => {
    prisma = createMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [TransfersService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<TransfersService>(TransfersService);

    prisma.warehouse.findFirst
      .mockResolvedValueOnce({
        id: FROM_WH,
        name: 'From WH',
        code: 'FW',
        organizationId: ORG,
        isDefault: false,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        city: null,
        country: null,
        street: null,
        state: null,
        postalCode: null,
      })
      .mockResolvedValueOnce({
        id: TO_WH,
        name: 'To WH',
        code: 'TW',
        organizationId: ORG,
        isDefault: false,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        city: null,
        country: null,
        street: null,
        state: null,
        postalCode: null,
      });
    prisma.item.findFirst.mockResolvedValue({
      id: ITEM_ID,
      name: 'Widget',
      organizationId: ORG,
      taxRate: null,
      description: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      type: 'GOODS',
      sku: 'WID',
      unit: null,
      trackInventory: true,
      costPrice: new Decimal(0),
      sellingPrice: new Decimal(0),
      reorderLevel: null,
      reorderPoint: null,
      currentStock: 0,
      inventoryAccountId: null,
      deletedAt: null,
      isActive: true,
      salesPrice: new Decimal(0),
      salesAccountId: null,
      purchasePrice: new Decimal(0),
      purchaseAccountId: null,
    });
    prisma.$queryRaw.mockResolvedValue([{ max: 5 }]);
    prisma.inventoryTransfer.create.mockResolvedValue({
      id: 'trf-1',
      transferNumber: 'TRF-006',
      fromWarehouseId: FROM_WH,
      toWarehouseId: TO_WH,
      date: new Date(),
      notes: null,
      status: TransferStatus.PENDING,
      organizationId: ORG,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  describe('complete', () => {
    it('creates OUT movement at source and IN movement at destination, both with positive quantity', async () => {
      const transfer = {
        id: 'trf-1',
        transferNumber: 'TRF-006',
        fromWarehouseId: FROM_WH,
        toWarehouseId: TO_WH,
        status: TransferStatus.PENDING,
        date: new Date(),
        notes: null,
        organizationId: ORG,
        createdAt: new Date(),
        updatedAt: new Date(),
        lines: [{ itemId: ITEM_ID, quantity: new Decimal(10), id: 'line-1', transferId: 'trf-1' }],
      };
      prisma.inventoryTransfer.findFirst.mockResolvedValue(transfer);
      prisma.inventoryLevel.findUnique.mockResolvedValue({
        quantity: new Decimal(100),
        id: 'lvl-1',
        itemId: ITEM_ID,
        warehouseId: FROM_WH,
        organizationId: ORG,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await service.complete(ORG, 'trf-1');

      // Verify OUT movement at source warehouse
      const outMovement = prisma.inventoryMovement.create.mock.calls[0]?.[0]?.data;
      expect(outMovement).toBeDefined();
      expect(outMovement.warehouseId).toBe(FROM_WH);
      expect(outMovement.movementType).toBe('OUT');
      expect(outMovement.quantity.toString()).toBe('10');
      expect((outMovement.quantity as Decimal).greaterThan(0)).toBe(true);

      // Verify IN movement at destination warehouse
      const inMovement = prisma.inventoryMovement.create.mock.calls[1]?.[0]?.data;
      expect(inMovement).toBeDefined();
      expect(inMovement.warehouseId).toBe(TO_WH);
      expect(inMovement.movementType).toBe('IN');
      expect(inMovement.quantity.toString()).toBe('10');
      expect((inMovement.quantity as Decimal).greaterThan(0)).toBe(true);
    });

    it('rejects completion when source warehouse has insufficient stock', async () => {
      const transfer = {
        id: 'trf-1',
        transferNumber: 'TRF-006',
        fromWarehouseId: FROM_WH,
        toWarehouseId: TO_WH,
        status: TransferStatus.PENDING,
        date: new Date(),
        notes: null,
        organizationId: ORG,
        createdAt: new Date(),
        updatedAt: new Date(),
        lines: [{ itemId: ITEM_ID, quantity: new Decimal(10), id: 'line-1', transferId: 'trf-1' }],
      };
      prisma.inventoryTransfer.findFirst.mockResolvedValue(transfer);
      prisma.inventoryLevel.findUnique.mockResolvedValue({
        quantity: new Decimal(5),
        id: 'lvl-1',
        itemId: ITEM_ID,
        warehouseId: FROM_WH,
        organizationId: ORG,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await expect(service.complete(ORG, 'trf-1')).rejects.toThrow(BadRequestException);
      expect(prisma.inventoryMovement.create).not.toHaveBeenCalled();
    });
  });
});
