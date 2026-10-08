import { Decimal } from '@prisma/client/runtime/library';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { createMockPrisma } from '../../../test/mocks/prisma.mock';

describe('NotificationsService movement signs', () => {
  it.each(['legacy', 'new'])('%s rows report the same low stock', async (kind) => {
    const prisma = createMockPrisma();
    const service = new NotificationsService(prisma as unknown as PrismaService);
    const notify = jest.spyOn(service, 'createForUser').mockResolvedValue({} as never);
    prisma.organization.findMany.mockResolvedValue([{ id: 'org' }] as never);
    prisma.item.findMany.mockResolvedValue([
      {
        id: 'item',
        name: 'Widget',
        organizationId: 'org',
        reorderPoint: 2,
        organization: { users: [{ id: 'admin' }] },
      },
    ] as never);
    prisma.inventoryMovement.findMany.mockResolvedValue([
      { quantity: new Decimal(5), movementType: kind === 'legacy' ? null : 'IN' },
      { quantity: new Decimal(kind === 'legacy' ? -3 : 3), movementType: 'OUT' },
      {
        quantity: new Decimal(kind === 'legacy' ? -1 : 1),
        movementType: kind === 'legacy' ? null : 'OUT',
      },
    ] as never);
    await service.checkLowInventory();
    expect(notify).toHaveBeenCalledWith(
      'admin',
      'org',
      'LOW_STOCK',
      'Low Stock Alert',
      'Widget is running low (1 remaining).',
      { entityType: 'item', entityId: 'item' },
    );
    expect(prisma.inventoryMovement.findMany).toHaveBeenCalledWith({
      where: { itemId: 'item', organizationId: 'org' },
      select: { quantity: true, movementType: true },
    });
  });
});
