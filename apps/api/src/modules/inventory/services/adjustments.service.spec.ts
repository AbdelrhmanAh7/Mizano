import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../../../prisma/prisma.service';
import { createMockPrisma } from '../../../test/mocks/prisma.mock';
import { JournalsService } from '../../accounting/services/journals.service';
import { AdjustmentsService } from './adjustments.service';

const ORG = 'org-1';
const INVENTORY = 'acc-inventory';
const SHRINKAGE = 'acc-shrinkage';
const dec = (v: string): Decimal => new Decimal(v);

const baseDto = {
  date: '2026-03-10',
  warehouseId: 'wh-1',
  itemId: 'item-1',
  type: 'INCREASE' as const,
  quantity: 3,
  reason: 'STOCKTAKE' as const,
  accountId: SHRINKAGE,
  notes: 'count',
};

describe('AdjustmentsService', () => {
  let service: AdjustmentsService;
  let prisma: any;
  let journals: { create: jest.Mock; reverse: jest.Mock };

  beforeEach(async () => {
    prisma = createMockPrisma();
    journals = {
      create: jest.fn().mockResolvedValue({ id: 'j1', journalNumber: 'JRN-001' }),
      reverse: jest.fn().mockResolvedValue({ id: 'j2' }),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdjustmentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: JournalsService, useValue: journals },
      ],
    }).compile();
    service = module.get(AdjustmentsService);

    prisma.item.findFirst.mockResolvedValue({
      id: 'item-1',
      name: 'Widget',
      type: 'GOODS',
      trackInventory: true,
      costPrice: dec('0.3333'),
      inventoryAccountId: INVENTORY,
    });
    prisma.warehouse.findFirst.mockResolvedValue({ id: 'wh-1' });
    prisma.account.findFirst.mockResolvedValue({ id: SHRINKAGE });
    prisma.$queryRaw.mockResolvedValue([{ max: 6 }]);
    prisma.inventoryAdjustment.create.mockImplementation(async (args: any) => ({
      id: 'adj-1',
      ...args.data,
      item: { id: 'item-1', name: 'Widget', sku: 'W', unit: null },
      warehouse: { id: 'wh-1', name: 'Main', code: 'MAIN' },
      account: { id: SHRINKAGE, name: 'Shrinkage', code: '5500' },
    }));
    prisma.item.updateMany.mockResolvedValue({ count: 1 });
    prisma.inventoryLevel.findUnique.mockResolvedValue(null);
    prisma.inventoryLevel.updateMany.mockResolvedValue({ count: 1 });
  });

  describe('create', () => {
    it('INCREASE: updates stock and posts Dr inventory / Cr adjustment account atomically', async () => {
      const result = await service.create(ORG, baseDto);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.inventoryAdjustment.create.mock.calls[0][0].data).toEqual(
        expect.objectContaining({
          adjustmentNumber: 'ADJ-007',
          organizationId: ORG,
          itemId: 'item-1',
          warehouseId: 'wh-1',
          quantity: 3,
        }),
      );
      expect(prisma.item.updateMany).toHaveBeenCalledWith({
        where: { id: 'item-1', organizationId: ORG },
        data: { currentStock: { increment: 3 } },
      });
      expect(prisma.inventoryLevel.upsert.mock.calls[0][0].update).toEqual({
        quantity: { increment: 3 },
      });
      const movement = prisma.inventoryMovement.create.mock.calls[0][0].data;
      expect(movement).toEqual(
        expect.objectContaining({
          type: 'adjustment',
          movementType: 'IN',
          referenceType: 'adjustment',
          referenceId: 'adj-1',
          organizationId: ORG,
        }),
      );
      expect((movement.quantity as Decimal).toString()).toBe('3');

      const [orgId, journalDto, options] = journals.create.mock.calls[0];
      expect(orgId).toBe(ORG);
      expect(options).toEqual({
        tx: prisma,
        source: { type: 'INVENTORY_ADJUSTMENT', id: 'adj-1' },
      });
      expect(journalDto.date).toBe(new Date('2026-03-10').toISOString());
      // 0.3333 x 3 = 0.9999 exactly (a float would give 0.9998999...).
      expect(journalDto.lines).toEqual([
        expect.objectContaining({ accountId: INVENTORY, debit: '0.9999', credit: '0' }),
        expect.objectContaining({ accountId: SHRINKAGE, debit: '0', credit: '0.9999' }),
      ]);
      expect(result).toEqual(
        expect.objectContaining({ status: 'POSTED', value: '0.9999', journalId: 'j1' }),
      );
    });

    it('DECREASE: guards the stock row and posts Dr adjustment account / Cr inventory', async () => {
      await service.create(ORG, { ...baseDto, type: 'DECREASE' });

      expect(prisma.item.updateMany).toHaveBeenCalledWith({
        where: { id: 'item-1', organizationId: ORG, currentStock: { gte: 3 } },
        data: { currentStock: { decrement: 3 } },
      });
      expect(prisma.inventoryMovement.create.mock.calls[0][0].data.movementType).toBe('OUT');
      expect(
        (prisma.inventoryMovement.create.mock.calls[0][0].data.quantity as Decimal).toString(),
      ).toBe('-3');
      expect(journals.create.mock.calls[0][1].lines).toEqual([
        expect.objectContaining({ accountId: SHRINKAGE, debit: '0.9999', credit: '0' }),
        expect.objectContaining({ accountId: INVENTORY, debit: '0', credit: '0.9999' }),
      ]);
    });

    it('DECREASE with insufficient stock is rejected and posts nothing (no silent clamping)', async () => {
      prisma.item.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.create(ORG, { ...baseDto, type: 'DECREASE' })).rejects.toThrow(
        'Insufficient stock for Widget',
      );
      expect(prisma.inventoryMovement.create).not.toHaveBeenCalled();
      expect(journals.create).not.toHaveBeenCalled();
    });

    it('DECREASE is rejected when a tracked warehouse holds less than the quantity', async () => {
      prisma.inventoryLevel.findUnique.mockResolvedValue({ id: 'lvl-1', quantity: dec('2') });
      prisma.inventoryLevel.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.create(ORG, { ...baseDto, type: 'DECREASE' })).rejects.toThrow(
        'in this warehouse',
      );
      expect(journals.create).not.toHaveBeenCalled();
    });

    it('rejects item, warehouse and account ids from another organization', async () => {
      prisma.item.findFirst.mockResolvedValueOnce(null);
      await expect(service.create(ORG, baseDto)).rejects.toThrow('Item not found');
      expect(prisma.item.findFirst.mock.calls[0][0].where).toEqual(
        expect.objectContaining({ id: 'item-1', organizationId: ORG, deletedAt: null }),
      );

      prisma.warehouse.findFirst.mockResolvedValueOnce(null);
      await expect(service.create(ORG, baseDto)).rejects.toThrow('Warehouse not found');
      expect(prisma.warehouse.findFirst.mock.calls[0][0].where.organizationId).toBe(ORG);

      prisma.account.findFirst.mockResolvedValueOnce(null);
      await expect(service.create(ORG, baseDto)).rejects.toThrow('Adjustment account not found');
      expect(prisma.account.findFirst.mock.calls[0][0].where.organizationId).toBe(ORG);

      expect(prisma.inventoryAdjustment.create).not.toHaveBeenCalled();
      expect(journals.create).not.toHaveBeenCalled();
    });

    it('refuses items that cannot be valued or posted instead of skipping the journal', async () => {
      const item = {
        id: 'item-1',
        name: 'Widget',
        type: 'GOODS',
        trackInventory: true,
        costPrice: dec('10'),
        inventoryAccountId: INVENTORY,
      };

      prisma.item.findFirst.mockResolvedValueOnce({ ...item, inventoryAccountId: null });
      await expect(service.create(ORG, baseDto)).rejects.toThrow('no inventory account');

      prisma.item.findFirst.mockResolvedValueOnce({ ...item, costPrice: dec('0') });
      await expect(service.create(ORG, baseDto)).rejects.toThrow('no cost price');

      prisma.item.findFirst.mockResolvedValueOnce({ ...item, type: 'SERVICE' });
      await expect(service.create(ORG, baseDto)).rejects.toThrow('not an inventory-tracked item');

      prisma.item.findFirst.mockResolvedValueOnce(item);
      prisma.account.findFirst.mockResolvedValueOnce({ id: INVENTORY });
      await expect(service.create(ORG, { ...baseDto, accountId: INVENTORY })).rejects.toThrow(
        'must differ',
      );

      expect(prisma.inventoryAdjustment.create).not.toHaveBeenCalled();
      expect(journals.create).not.toHaveBeenCalled();
    });

    it('rejects an invalid date before touching the database', async () => {
      await expect(service.create(ORG, { ...baseDto, date: 'not-a-date' })).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('a ledger failure (e.g. locked period) rolls the whole transaction back', async () => {
      journals.create.mockRejectedValue(new BadRequestException('This period is locked.'));
      await expect(service.create(ORG, baseDto)).rejects.toThrow('locked');
    });
  });

  describe('void', () => {
    const adjustmentRow = (type: 'INCREASE' | 'DECREASE') => ({
      id: 'adj-1',
      adjustmentNumber: 'ADJ-007',
      type,
      quantity: 3,
      itemId: 'item-1',
      warehouseId: 'wh-1',
      item: { id: 'item-1', name: 'Widget', sku: 'W', unit: null },
    });

    beforeEach(() => {
      prisma.journal.findFirst.mockResolvedValue({ id: 'j1', reversedBy: null });
      prisma.journal.findMany.mockResolvedValue([]);
    });

    it('voiding an INCREASE removes the stock again and posts the linked VOID reversal', async () => {
      prisma.inventoryAdjustment.findFirst.mockResolvedValue(adjustmentRow('INCREASE'));

      await service.void(ORG, 'adj-1');

      expect(prisma.item.updateMany).toHaveBeenCalledWith({
        where: { id: 'item-1', organizationId: ORG, currentStock: { gte: 3 } },
        data: { currentStock: { decrement: 3 } },
      });
      expect(prisma.inventoryMovement.create.mock.calls[0][0].data).toEqual(
        expect.objectContaining({ type: 'adjustment_void', movementType: 'OUT' }),
      );
      expect(journals.reverse).toHaveBeenCalledWith(ORG, 'j1', undefined, {
        tx: prisma,
        source: { type: 'INVENTORY_ADJUSTMENT_VOID', id: 'adj-1' },
      });
    });

    it('voiding a DECREASE puts the stock back', async () => {
      prisma.inventoryAdjustment.findFirst.mockResolvedValue(adjustmentRow('DECREASE'));

      await service.void(ORG, 'adj-1');

      expect(prisma.item.updateMany).toHaveBeenCalledWith({
        where: { id: 'item-1', organizationId: ORG },
        data: { currentStock: { increment: 3 } },
      });
    });

    it('cannot void when the added stock has already been used', async () => {
      prisma.inventoryAdjustment.findFirst.mockResolvedValue(adjustmentRow('INCREASE'));
      prisma.item.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.void(ORG, 'adj-1')).rejects.toThrow('Cannot void');
      expect(journals.reverse).not.toHaveBeenCalled();
    });

    it('rejects a second void and adjustments without a linked journal', async () => {
      prisma.inventoryAdjustment.findFirst.mockResolvedValue(adjustmentRow('INCREASE'));
      prisma.journal.findFirst.mockResolvedValue({ id: 'j1', reversedBy: { id: 'j2' } });
      await expect(service.void(ORG, 'adj-1')).rejects.toThrow('already been voided');

      prisma.journal.findFirst.mockResolvedValue(null);
      await expect(service.void(ORG, 'adj-1')).rejects.toThrow('no linked ledger entry');
      expect(journals.reverse).not.toHaveBeenCalled();
    });

    it('maps a concurrent duplicate void (unique violation) to a conflict', async () => {
      prisma.inventoryAdjustment.findFirst.mockResolvedValue(adjustmentRow('DECREASE'));
      journals.reverse.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );
      await expect(service.void(ORG, 'adj-1')).rejects.toThrow(ConflictException);
    });

    it('is tenant scoped', async () => {
      prisma.inventoryAdjustment.findFirst.mockResolvedValue(null);
      await expect(service.void('other-org', 'adj-1')).rejects.toThrow(NotFoundException);
      expect(prisma.inventoryAdjustment.findFirst.mock.calls[0][0].where).toEqual({
        id: 'adj-1',
        organizationId: 'other-org',
      });
    });
  });

  describe('reads', () => {
    it('findAll derives status and value from the source-linked journals', async () => {
      prisma.inventoryAdjustment.findMany.mockResolvedValue([{ id: 'a1' }, { id: 'a2' }]);
      prisma.inventoryAdjustment.count.mockResolvedValue(2);
      prisma.journal.findMany.mockResolvedValue([
        {
          id: 'j1',
          journalNumber: 'JRN-001',
          sourceType: 'INVENTORY_ADJUSTMENT',
          sourceId: 'a1',
          lines: [{ debit: dec('0.1') }, { debit: dec('0.2') }],
        },
        {
          id: 'j2',
          journalNumber: 'JRN-002',
          sourceType: 'INVENTORY_ADJUSTMENT_VOID',
          sourceId: 'a1',
          lines: [{ debit: dec('0') }],
        },
        {
          id: 'j3',
          journalNumber: 'JRN-003',
          sourceType: 'INVENTORY_ADJUSTMENT',
          sourceId: 'a2',
          lines: [{ debit: dec('5') }],
        },
      ]);

      const { data, meta } = await service.findAll(ORG, { type: 'INCREASE', search: 'wid' });

      expect(prisma.inventoryAdjustment.findMany.mock.calls[0][0].where).toEqual(
        expect.objectContaining({ organizationId: ORG, type: 'INCREASE' }),
      );
      expect(data[0]).toEqual(
        expect.objectContaining({
          id: 'a1',
          status: 'VOIDED',
          value: '0.3000',
          voidJournalId: 'j2',
        }),
      );
      expect(data[1]).toEqual(
        expect.objectContaining({ id: 'a2', status: 'POSTED', value: '5.0000' }),
      );
      expect(meta).toEqual({ page: 1, limit: 20, total: 2, totalPages: 1 });
    });

    it('findOne is tenant scoped', async () => {
      prisma.inventoryAdjustment.findFirst.mockResolvedValue(null);
      await expect(service.findOne('other-org', 'a1')).rejects.toThrow(NotFoundException);
      expect(prisma.inventoryAdjustment.findFirst.mock.calls[0][0].where).toEqual({
        id: 'a1',
        organizationId: 'other-org',
      });
    });
  });
});
