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
