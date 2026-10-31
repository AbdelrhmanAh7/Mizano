import { PrismaService } from '../../../prisma/prisma.service';
import { createMockPrisma } from '../../../test/mocks/prisma.mock';
import { ImportService } from './import.service';

/* eslint-disable @typescript-eslint/no-explicit-any */
describe('ImportService items: only goods track stock', () => {
  let prisma: any;
  let service: ImportService;
  const importItem = (row: Record<string, unknown>, updateExisting = false): Promise<string> =>
    (service as any).importItem('org-1', row, updateExisting);

  beforeEach(() => {
    prisma = createMockPrisma();
    const none = {} as never;
    service = new ImportService(
      prisma as unknown as PrismaService,
      none,
      none,
      none,
      none,
      none,
      none,
      none,
    );
    prisma.item.create.mockResolvedValue({ id: 'it1' });
    prisma.item.update.mockResolvedValue({ id: 'it1' });
  });

  it('never tracks stock for an imported service, even when the file says so', async () => {
    await importItem({ name: 'Consulting', sku: 'S-1', type: 'service', trackInventory: true });
    expect(prisma.item.create.mock.calls[0][0].data).toMatchObject({
      type: 'SERVICE',
      trackInventory: false,
    });
  });

  it('tracks stock for goods by default', async () => {
    await importItem({ name: 'Widget', sku: 'G-1' });
    expect(prisma.item.create.mock.calls[0][0].data).toMatchObject({
      type: 'GOODS',
      trackInventory: true,
    });
  });

  it('turns tracking off when updating an existing service item', async () => {
    prisma.item.findFirst.mockResolvedValue({ id: 'it1', type: 'SERVICE', trackInventory: true });
    await importItem({ sku: 'S-1', trackInventory: true }, true);
    expect(prisma.item.update.mock.calls[0][0].data.trackInventory).toBe(false);
  });
});
