import { Decimal } from '@prisma/client/runtime/library';
import { BomService } from './bom.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { createMockPrisma } from '../../../test/mocks/prisma.mock';

describe('BomService movement signs', () => {
  it.each(['legacy', 'new'])('%s rows give the same stock and shortfall', async (kind) => {
    const prisma = createMockPrisma();
    const service = new BomService(prisma as unknown as PrismaService);
    jest.spyOn(service, 'findOne').mockResolvedValue({
      id: 'bom',
      name: 'BOM',
      outputQuantity: 1,
      items: [{ itemId: 'item', quantity: new Decimal(4), item: { id: 'item' } }],
    } as never);
    prisma.inventoryMovement.findMany.mockResolvedValue([
      { quantity: new Decimal(5), movementType: kind === 'legacy' ? null : 'IN' },
      { quantity: new Decimal(kind === 'legacy' ? -3 : 3), movementType: 'OUT' },
      {
        quantity: new Decimal(kind === 'legacy' ? -1 : 1),
        movementType: kind === 'legacy' ? null : 'OUT',
      },
    ] as never);
    const result = await service.calculateMaterialRequirements('org', 'bom', 1);
    expect(result.requirements[0].currentStock).toBe(1);
    expect(result.requirements[0].shortfall).toBe(3);
    expect(prisma.inventoryMovement.findMany).toHaveBeenCalledWith({
      where: { itemId: 'item', organizationId: 'org' },
      select: { quantity: true, movementType: true },
    });
  });
});

describe('BomService.create one active BOM per output item', () => {
  const setup = () => {
    const prisma = createMockPrisma();
    prisma.item.findFirst.mockResolvedValue({ id: 'item-out' } as never);
    prisma.bOM.create.mockResolvedValue({ id: 'bom-new' } as never);
    const service = new BomService(prisma as unknown as PrismaService);
    return { prisma, service };
  };

  it.each([
    ['omitted', undefined],
    ['true', true],
  ])('rejects a second active BOM when isActive is %s', async (_name, isActive) => {
    const { prisma, service } = setup();
    prisma.bOM.findFirst.mockResolvedValue({ id: 'bom-old' } as never);

    await expect(
      service.create('org', { name: 'B', outputItemId: 'item-out', isActive }),
    ).rejects.toThrow('An active BOM already exists for this item');
    expect(prisma.bOM.findFirst).toHaveBeenCalledWith({
      where: { outputItemId: 'item-out', organizationId: 'org', isActive: true },
    });
    expect(prisma.bOM.create).not.toHaveBeenCalled();
  });

  it('allows an inactive BOM next to the active one without checking', async () => {
    const { prisma, service } = setup();

    await service.create('org', { name: 'B', outputItemId: 'item-out', isActive: false });

    expect(prisma.bOM.findFirst).not.toHaveBeenCalled();
    expect(prisma.bOM.create).toHaveBeenCalled();
  });

  it('creates the first BOM of an item, active by default', async () => {
    const { prisma, service } = setup();
    prisma.bOM.findFirst.mockResolvedValue(null);

    await service.create('org', { name: 'B', outputItemId: 'item-out' });

    expect(prisma.bOM.create.mock.calls[0][0].data).toMatchObject({
      isActive: true,
      organizationId: 'org',
    });
  });
});
