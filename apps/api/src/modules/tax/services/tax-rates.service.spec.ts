import { BadRequestException } from '@nestjs/common';
import { TaxRatesService } from './tax-rates.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { createMockPrisma, MockPrismaClient } from '../../../test/mocks/prisma.mock';

const ORG = 'org-1';

describe('TaxRatesService', () => {
  let prisma: MockPrismaClient;
  let service: TaxRatesService;

  beforeEach(() => {
    prisma = createMockPrisma();
    prisma.account.count.mockResolvedValue(1);
    prisma.taxRate.findFirst.mockResolvedValue(null);
    prisma.taxRate.create.mockResolvedValue({ id: 'tr-1' } as never);
    prisma.taxRate.update.mockResolvedValue({ id: 'tr-1' } as never);
    service = new TaxRatesService(prisma as unknown as PrismaService);
  });

  const dto = (extra: Record<string, unknown> = {}) =>
    ({ name: 'VAT 14', rate: '14', linkedAccountId: 'acc-vat', ...extra }) as never;

  describe('create', () => {
    it('stores an exact decimal rate for an own linked account', async () => {
      await service.create(ORG, dto({ rate: '14.5' }));

      const data = prisma.taxRate.create.mock.calls[0]![0]!.data;
      expect(data.rate?.toString()).toBe('14.5');
      expect(data.organizationId).toBe(ORG);
      expect(prisma.account.count.mock.calls[0]![0]!.where).toMatchObject({
        id: { in: ['acc-vat'] },
        organizationId: ORG,
        deletedAt: null,
      });
    });

    it('accepts the bounds 0 and 100', async () => {
      await service.create(ORG, dto({ name: 'Zero', rate: '0' }));
      await service.create(ORG, dto({ name: 'Full', rate: '100' }));

      expect(prisma.taxRate.create).toHaveBeenCalledTimes(2);
    });

    it('rejects (400) a rate above 100 before writing', async () => {
      await expect(service.create(ORG, dto({ rate: '100.01' }))).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.taxRate.create).not.toHaveBeenCalled();
    });

    it('rejects (400) a linked or collect account of another organization', async () => {
      prisma.account.count.mockResolvedValue(1);

      await expect(service.create(ORG, dto({ collectAccountId: 'foreign-acc' }))).rejects.toThrow(
        /Account not found/,
      );
      expect(prisma.account.count.mock.calls[0]![0]!.where).toMatchObject({
        id: { in: ['acc-vat', 'foreign-acc'] },
      });
      expect(prisma.taxRate.create).not.toHaveBeenCalled();
    });

    it('rejects (400) a duplicate name', async () => {
      prisma.taxRate.findFirst.mockResolvedValue({ id: 'other' } as never);

      await expect(service.create(ORG, dto())).rejects.toThrow(/already exists/);
    });
  });

  describe('update', () => {
    beforeEach(() => {
      prisma.taxRate.findFirst.mockResolvedValue({ id: 'tr-1' } as never);
    });

    it('rejects (400) a rate above 100 and a foreign linked account, writing nothing', async () => {
      await expect(service.update(ORG, 'tr-1', { rate: '101' })).rejects.toThrow(
        BadRequestException,
      );

      prisma.account.count.mockResolvedValue(0);
      await expect(service.update(ORG, 'tr-1', { linkedAccountId: 'foreign-acc' })).rejects.toThrow(
        /Account not found/,
      );
      expect(prisma.taxRate.update).not.toHaveBeenCalled();
    });

    it('stores the new rate as an exact decimal', async () => {
      await service.update(ORG, 'tr-1', { rate: '15' });

      expect(prisma.taxRate.update.mock.calls[0]![0]!.data.rate?.toString()).toBe('15');
      expect(prisma.account.count).not.toHaveBeenCalled();
    });
  });

  describe('seedDefaultTaxRates', () => {
    it('rejects (400) a linked account of another organization', async () => {
      prisma.account.count.mockResolvedValue(0);

      await expect(service.seedDefaultTaxRates(ORG, 'foreign-acc')).rejects.toThrow(
        /Account not found/,
      );
      expect(prisma.taxRate.create).not.toHaveBeenCalled();
    });
  });
});
