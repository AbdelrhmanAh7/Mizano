import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../../../prisma/prisma.service';
import { CurrencyService } from './currency.service';

const ORG = 'org-1';

function build() {
  const prisma = {
    organization: { findUnique: jest.fn().mockResolvedValue({ baseCurrency: 'USD' }) },
    exchangeRate: { findMany: jest.fn() },
  };
  return { prisma, service: new CurrencyService(prisma as unknown as PrismaService) };
}

describe('CurrencyService.getLatestRates', () => {
  it('reads the latest rate per target currency of the base currency through the typed client, scoped to the organization', async () => {
    const { prisma, service } = build();
    const date = new Date('2026-03-10T00:00:00.000Z');
    prisma.exchangeRate.findMany.mockResolvedValue([
      {
        id: 'r1',
        fromCurrency: 'USD',
        toCurrency: 'EGP',
        rate: new Decimal('48.5'),
        date,
        source: 'MANUAL',
        organizationId: ORG,
        createdAt: date,
      },
    ]);

    const latest = await service.getLatestRates(ORG);

    expect(prisma.exchangeRate.findMany).toHaveBeenCalledWith({
      where: { organizationId: ORG, fromCurrency: 'USD' },
      orderBy: [{ toCurrency: 'asc' }, { date: 'desc' }],
      distinct: ['toCurrency'],
    });
    expect(latest).toEqual([
      { fromCurrency: 'USD', toCurrency: 'EGP', rate: 48.5, date, source: 'MANUAL' },
    ]);
  });

  it('uses the requested base currency (upper-cased) instead of the organization base', async () => {
    const { prisma, service } = build();
    prisma.exchangeRate.findMany.mockResolvedValue([]);

    await expect(service.getLatestRates(ORG, 'eur')).resolves.toEqual([]);
    expect(prisma.exchangeRate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: ORG, fromCurrency: 'EUR' } }),
    );
  });

  it('feeds the currency info response without any raw SQL', async () => {
    const { prisma, service } = build();
    prisma.exchangeRate.findMany.mockResolvedValue([]);

    const info = await service.getCurrencyInfo(ORG);

    expect(info.baseCurrency).toBe('USD');
    expect(info.latestRates).toEqual([]);
    expect(info.supportedCurrencies).toContain('EGP');
  });
});
