import { PriceListsService } from './price-lists.service';
import { createMockPrisma, MockPrismaClient } from '../../../test/mocks/prisma.mock';

describe('PriceListsService.findAll', () => {
  let prisma: MockPrismaClient;
  let service: PriceListsService;

  beforeEach(() => {
    prisma = createMockPrisma();
    prisma.priceList.findMany.mockResolvedValue([] as any);
    service = new PriceListsService(prisma as any);
  });

  it('returns every list of the tenant (active and inactive) by default', async () => {
    await service.findAll('org-1');
    expect(prisma.priceList.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: 'org-1' } }),
    );
  });

  it('keeps the active-only filter when activeOnly is true', async () => {
    await service.findAll('org-1', true);
    expect(prisma.priceList.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: 'org-1', isActive: true } }),
    );
  });
});

describe('PriceListsService writes', () => {
  let prisma: MockPrismaClient;
  let service: PriceListsService;

  beforeEach(() => {
    prisma = createMockPrisma();
    prisma.priceList.create.mockResolvedValue({ id: 'pl-1' } as any);
    prisma.priceList.findFirst.mockResolvedValue({ id: 'pl-1', organizationId: 'org-1' } as any);
    prisma.priceList.update.mockResolvedValue({ id: 'pl-1' } as any);
    service = new PriceListsService(prisma as any);
  });

  it('creates the list with exact decimal adjustment and custom prices', async () => {
    prisma.item.count.mockResolvedValue(1 as any);
    await service.create('org-1', {
      name: 'Wholesale',
      type: 'PERCENTAGE',
      adjustment: '-10.5',
      items: [{ itemId: 'item-1', customPrice: '95.1234' }],
    });
    expect(prisma.item.count).toHaveBeenCalledWith({
      where: { id: { in: ['item-1'] }, organizationId: 'org-1', deletedAt: null },
    });
    const { data } = prisma.priceList.create.mock.calls[0][0] as any;
    expect(data.organizationId).toBe('org-1');
    expect(data.adjustment.toString()).toBe('-10.5');
    expect(data.items.create[0].customPrice.toString()).toBe('95.1234');
  });

  it('refuses items of another tenant', async () => {
    prisma.item.count.mockResolvedValue(0 as any);
    await expect(
      service.create('org-1', {
        name: 'Wholesale',
        type: 'FIXED',
        adjustment: '0',
        items: [{ itemId: 'foreign-item', customPrice: '1' }],
      }),
    ).rejects.toThrow('Item not found');
    expect(prisma.priceList.create).not.toHaveBeenCalled();
  });

  it('updates only the list fields, never its tenant or relations', async () => {
    await service.update('org-1', 'pl-1', {
      name: 'Retail',
      adjustment: '5',
      organizationId: 'org-2',
      customers: { connect: [{ id: 'foreign-customer' }] },
    } as any);
    const { data } = prisma.priceList.update.mock.calls[0][0] as any;
    expect(data).not.toHaveProperty('organizationId', 'org-2');
    expect(data.customers).toBeUndefined();
    expect(data.organizationId).toBeUndefined();
    expect(data.name).toBe('Retail');
    expect(data.adjustment.toString()).toBe('5');
  });
});
