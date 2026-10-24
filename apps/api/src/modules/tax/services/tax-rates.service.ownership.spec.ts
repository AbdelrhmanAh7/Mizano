import { BadRequestException } from '@nestjs/common';
import { TaxRatesService } from './tax-rates.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { createMockPrisma, MockPrismaClient } from '../../../test/mocks/prisma.mock';

describe('TaxRatesService: tenant-owned accounts and rate bounds', () => {
  const ORG = 'org-1';
  let prisma: MockPrismaClient;
  let service: TaxRatesService;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new TaxRatesService(prisma as unknown as PrismaService);
    prisma.taxRate.findFirst.mockResolvedValue(null as never);
    prisma.taxRate.create.mockResolvedValue({ id: 't1' } as never);
  });

  describe('create', () => {
    it('rejects a linked account of another organization with 400 and writes nothing', async () => {
      prisma.account.count.mockResolvedValue(0 as never);
      await expect(
        service.create(ORG, { name: 'VAT', rate: '5', linkedAccountId: 'foreign' } as never),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.account.count).toHaveBeenCalledWith({
        where: { id: { in: ['foreign'] }, organizationId: ORG, deletedAt: null },
      });
      expect(prisma.taxRate.create).not.toHaveBeenCalled();
    });

    it('checks the collect account too', async () => {
      prisma.account.count.mockResolvedValue(1 as never);
      await expect(
        service.create(ORG, {
          name: 'VAT',
          rate: '5',
          linkedAccountId: 'own',
          collectAccountId: 'foreign',
        } as never),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.taxRate.create).not.toHaveBeenCalled();
    });

    it('creates the rate when the account belongs to the organization', async () => {
      prisma.account.count.mockResolvedValue(1 as never);
      await service.create(ORG, { name: 'VAT', rate: '14', linkedAccountId: 'own' } as never);
      expect(prisma.taxRate.create).toHaveBeenCalledTimes(1);
    });

    it.each(['100.01', '1000'])('rejects rate %s (above 100 percent) with 400', async (rate) => {
      prisma.account.count.mockResolvedValue(1 as never);
      await expect(
        service.create(ORG, { name: 'VAT', rate, linkedAccountId: 'own' } as never),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.taxRate.create).not.toHaveBeenCalled();
    });

    it('accepts exactly 100 percent', async () => {
      prisma.account.count.mockResolvedValue(1 as never);
      await service.create(ORG, { name: 'All', rate: '100', linkedAccountId: 'own' } as never);
      expect(prisma.taxRate.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('update', () => {
    beforeEach(() => {
      prisma.taxRate.findFirst.mockResolvedValue({ id: 't1', organizationId: ORG } as never);
      prisma.taxRate.update.mockResolvedValue({ id: 't1' } as never);
    });

    it('rejects a foreign linked account with 400 and updates nothing', async () => {
      prisma.account.count.mockResolvedValue(0 as never);
      await expect(
        service.update(ORG, 't1', { linkedAccountId: 'foreign' } as never),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.taxRate.update).not.toHaveBeenCalled();
    });

    it('rejects a rate above 100 with 400 and updates nothing', async () => {
      await expect(service.update(ORG, 't1', { rate: '1000' } as never)).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.taxRate.update).not.toHaveBeenCalled();
    });

    it('does not look up accounts when none is supplied', async () => {
      await service.update(ORG, 't1', { rate: '15', isDefault: true } as never);
      expect(prisma.account.count).not.toHaveBeenCalled();
      expect(prisma.taxRate.update).toHaveBeenCalledTimes(1);
    });
  });

  describe('seedDefaultTaxRates', () => {
    it('rejects a missing or foreign linked account with 400', async () => {
      await expect(service.seedDefaultTaxRates(ORG, undefined as never)).rejects.toThrow(
        BadRequestException,
      );
      prisma.account.count.mockResolvedValue(0 as never);
      await expect(service.seedDefaultTaxRates(ORG, 'foreign')).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.taxRate.create).not.toHaveBeenCalled();
    });
  });
});
