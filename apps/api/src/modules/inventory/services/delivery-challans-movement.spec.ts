import { DeliveryChallansService } from '../../sales/services/delivery-challans.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { createMockPrisma } from '../../../test/mocks/prisma.mock';

describe('Delivery challan movement writers', () => {
  it.each([
    ['decreaseInventory', 'OUT', 'decrement'],
    ['increaseInventory', 'IN', 'increment'],
  ] as const)('%s writes a positive directed movement', async (method, direction, operation) => {
    const prisma = createMockPrisma();
    const service = new DeliveryChallansService(prisma as unknown as PrismaService);
    prisma.inventoryLevel.findFirst.mockResolvedValue({ id: 'level', warehouseId: 'wh' } as never);
    await service[method]('org', 'item', 3, 'wh', 'challan');
    const data = prisma.inventoryMovement.create.mock.calls[0][0].data;
    expect(data.quantity.toString()).toBe('3');
    expect(data.movementType).toBe(direction);
    expect(data.organizationId).toBe('org');
    const update = prisma.inventoryLevel.update.mock.calls[0][0].data.quantity;
    expect((update as Record<string, unknown>)[operation]?.toString()).toBe('3');
  });
});
