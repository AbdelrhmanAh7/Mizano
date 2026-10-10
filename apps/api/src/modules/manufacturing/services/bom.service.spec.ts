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
