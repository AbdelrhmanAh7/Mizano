import { BadRequestException } from '@nestjs/common';
import { WorkOrderStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { WorkOrdersService } from './work-orders.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { createMockPrisma } from '../../../test/mocks/prisma.mock';

describe('WorkOrdersService movement signs', () => {
  it.each(['legacy', 'new'])('%s rows give the same stock and shortfall', async (kind) => {
    const prisma = createMockPrisma();
    const service = new WorkOrdersService(prisma as unknown as PrismaService);
    jest.spyOn(service, 'findOne').mockResolvedValue({
      quantity: 1,
      bom: {
        id: 'bom',
        name: 'BOM',
        outputQuantity: 1,
        items: [{ itemId: 'item', quantity: new Decimal(4), item: { id: 'item' } }],
      },
    } as never);
    prisma.inventoryMovement.findMany.mockResolvedValue([
      { quantity: new Decimal(5), movementType: kind === 'legacy' ? null : 'IN' },
      { quantity: new Decimal(kind === 'legacy' ? -3 : 3), movementType: 'OUT' },
      {
        quantity: new Decimal(kind === 'legacy' ? -1 : 1),
        movementType: kind === 'legacy' ? null : 'OUT',
      },
    ] as never);
    const result = await service.checkMaterialAvailability('org', 'wo');
    expect(result.materials[0].available).toBe(1);
    expect(result.materials[0].shortfall).toBe(3);
    expect(prisma.inventoryMovement.findMany).toHaveBeenCalledWith({
      where: { itemId: 'item', organizationId: 'org' },
      select: { quantity: true, movementType: true },
    });
  });
});

describe('WorkOrdersService.completeWorkOrder wire-contract (@issue-401)', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: WorkOrdersService;
  let consumeSpy: jest.SpyInstance;
  let addFinishedGoodsSpy: jest.SpyInstance;
  let createCogmSpy: jest.SpyInstance;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new WorkOrdersService(prisma as unknown as PrismaService);
    jest.spyOn(service, 'findOne').mockResolvedValue({
      id: 'wo-1',
      status: WorkOrderStatus.IN_PROCESS,
      notes: 'existing note',
    } as never);
    consumeSpy = jest.spyOn(service as any, 'consumeMaterials').mockResolvedValue(undefined);
    addFinishedGoodsSpy = jest
      .spyOn(service as any, 'addFinishedGoods')
      .mockResolvedValue(undefined);
    createCogmSpy = jest.spyOn(service as any, 'createCOGMJournal').mockResolvedValue('journal-1');
    prisma.workOrder.update.mockResolvedValue({
      id: 'wo-1',
      status: WorkOrderStatus.COMPLETED,
    } as never);
  });

  it('completes work order when legacy frontend producedQuantity payload key is provided', async () => {
    const result = await service.completeWorkOrder('org-1', 'wo-1', {
      producedQuantity: 5,
    });

    expect(consumeSpy).toHaveBeenCalledWith('org-1', expect.anything(), 5);
    expect(addFinishedGoodsSpy).toHaveBeenCalledWith('org-1', expect.anything(), 5);
    expect(createCogmSpy).toHaveBeenCalledWith('org-1', expect.anything(), 5);
    expect(prisma.workOrder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'wo-1' },
        data: expect.objectContaining({
          status: WorkOrderStatus.COMPLETED,
          journalId: 'journal-1',
        }),
      }),
    );
    expect(result.status).toBe(WorkOrderStatus.COMPLETED);
  });

  it('completes work order when canonical quantityProduced payload key is provided', async () => {
    const result = await service.completeWorkOrder('org-1', 'wo-1', {
      quantityProduced: 8,
    });

    expect(consumeSpy).toHaveBeenCalledWith('org-1', expect.anything(), 8);
    expect(addFinishedGoodsSpy).toHaveBeenCalledWith('org-1', expect.anything(), 8);
    expect(createCogmSpy).toHaveBeenCalledWith('org-1', expect.anything(), 8);
    expect(result.status).toBe(WorkOrderStatus.COMPLETED);
  });

  it('allows explicit boundary zero completion quantity via producedQuantity', async () => {
    const result = await service.completeWorkOrder('org-1', 'wo-1', {
      producedQuantity: 0,
    });

    expect(consumeSpy).toHaveBeenCalledWith('org-1', expect.anything(), 0);
    expect(addFinishedGoodsSpy).toHaveBeenCalledWith('org-1', expect.anything(), 0);
    expect(result.status).toBe(WorkOrderStatus.COMPLETED);
  });

  it('rejects with BadRequestException when completion quantity is omitted or undefined', async () => {
    await expect(service.completeWorkOrder('org-1', 'wo-1', {} as any)).rejects.toThrow(
      new BadRequestException('quantityProduced or producedQuantity is required'),
    );
  });

  it('rejects with BadRequestException when completion quantity is null or NaN', async () => {
    await expect(
      service.completeWorkOrder('org-1', 'wo-1', { producedQuantity: null as any }),
    ).rejects.toThrow(new BadRequestException('quantityProduced or producedQuantity is required'));

    await expect(
      service.completeWorkOrder('org-1', 'wo-1', { quantityProduced: NaN }),
    ).rejects.toThrow(new BadRequestException('quantityProduced or producedQuantity is required'));
  });

  it('rejects with BadRequestException when work order is not IN_PROCESS', async () => {
    jest.spyOn(service, 'findOne').mockResolvedValueOnce({
      id: 'wo-1',
      status: WorkOrderStatus.DRAFT,
    } as never);

    await expect(
      service.completeWorkOrder('org-1', 'wo-1', { producedQuantity: 10 }),
    ).rejects.toThrow(new BadRequestException('Work order is not in process'));
  });
});
