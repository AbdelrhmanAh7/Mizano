import { Decimal } from '@prisma/client/runtime/library';
import {
  NOTIFICATION_BATCH_SIZE,
  NOTIFICATION_QUERY_LIMIT,
  NotificationsService,
} from './notifications.service';
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

describe('NotificationsService cursor paging', () => {
  type Args = { take: number; skip?: number; cursor?: { id: string }; orderBy?: { id: string } };

  /** Serve `rows` through a Prisma-like cursor/take/skip findMany and record the calls. */
  const pagedFindMany = <T extends { id: string }>(rows: T[]): jest.Mock<Promise<T[]>, [Args]> =>
    jest.fn(async ({ take, skip = 0, cursor }: Args) => {
      const from = cursor ? rows.findIndex((r) => r.id === cursor.id) + skip : skip;
      return rows.slice(from, from + take);
    });

  const rowsFor = (n: number, extra: Record<string, unknown>): { id: string }[] =>
    Array.from({ length: n }, (_, i) => ({
      id: `r${String(i).padStart(4, '0')}`,
      organizationId: 'org',
      organization: { users: [{ id: 'admin' }] },
      invoiceNumber: `INV-${i}`,
      billNumber: `BILL-${i}`,
      dueDate: new Date(Date.now() + 86_400_000),
      name: `Item ${i}`,
      reorderPoint: 5,
      ...extra,
    }));

  const setup = () => {
    const prisma = createMockPrisma();
    const service = new NotificationsService(prisma as unknown as PrismaService);
    const notify = jest.spyOn(service, 'createForUser').mockResolvedValue({} as never);
    prisma.organization.findMany.mockResolvedValue([{ id: 'org' }] as never);
    return { prisma, service, notify };
  };

  const expectAdvancing = (calls: Args[][], total: number): void => {
    const pages = calls.map(([args]) => args);
    expect(pages.length).toBe(
      Math.ceil(total / NOTIFICATION_QUERY_LIMIT) +
        (total % NOTIFICATION_QUERY_LIMIT === 0 ? 1 : 0),
    );
    expect(pages[0].cursor).toBeUndefined();
    pages.forEach((args) => {
      expect(args.take).toBe(NOTIFICATION_QUERY_LIMIT);
      expect(args.orderBy).toEqual({ id: 'asc' });
    });
    const cursors = pages.slice(1).map((args) => args.cursor?.id);
    expect(cursors[0]).toBe(`r${String(NOTIFICATION_QUERY_LIMIT - 1).padStart(4, '0')}`);
    expect(new Set(cursors).size).toBe(cursors.length);
    pages.slice(1).forEach((args) => expect(args.skip).toBe(1));
  };

  it('notifies for every overdue invoice of an org with more than one page', async () => {
    const { prisma, service, notify } = setup();
    const total = 2 * NOTIFICATION_QUERY_LIMIT + 50;
    const findMany = pagedFindMany(rowsFor(total, {}));
    prisma.invoice.findMany.mockImplementation(findMany as never);

    await service.checkOverdueInvoices();

    expect(notify).toHaveBeenCalledTimes(total);
    expect(
      new Set(notify.mock.calls.map((c) => (c[5] as { entityId: string }).entityId)).size,
    ).toBe(total);
    expectAdvancing(findMany.mock.calls, total);
    expect(findMany.mock.calls[0][0]).toMatchObject({ where: { organizationId: 'org' } });
  });

  it('notifies for every upcoming bill of an org with more than one page', async () => {
    const { prisma, service, notify } = setup();
    const total = NOTIFICATION_QUERY_LIMIT + 1;
    const findMany = pagedFindMany(rowsFor(total, {}));
    prisma.bill.findMany.mockImplementation(findMany as never);

    await service.checkUpcomingBillPayments();

    expect(notify).toHaveBeenCalledTimes(total);
    expectAdvancing(findMany.mock.calls, total);
  });

  it('checks stock for every goods item of an org with more than one page', async () => {
    const { prisma, service, notify } = setup();
    const total = NOTIFICATION_QUERY_LIMIT + 20;
    const findMany = pagedFindMany(rowsFor(total, {}));
    prisma.item.findMany.mockImplementation(findMany as never);
    prisma.inventoryMovement.findMany.mockResolvedValue([] as never);

    await service.checkLowInventory();

    expect(notify).toHaveBeenCalledTimes(total);
    expectAdvancing(findMany.mock.calls, total);
  });

  it('pages organizations by cursor too, so tenants past the first batch are not skipped', async () => {
    const { prisma, service } = setup();
    const orgs = Array.from({ length: NOTIFICATION_BATCH_SIZE + 5 }, (_, i) => ({
      id: `o${String(i).padStart(3, '0')}`,
    }));
    const findMany = pagedFindMany(orgs);
    prisma.organization.findMany.mockImplementation(findMany as never);
    prisma.invoice.findMany.mockResolvedValue([] as never);

    await service.checkOverdueInvoices();

    const queried = prisma.invoice.findMany.mock.calls.map(
      ([args]) => (args as { where: { organizationId: string } }).where.organizationId,
    );
    expect(queried).toEqual(orgs.map((o) => o.id));
  });
});
