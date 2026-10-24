import { BadRequestException } from '@nestjs/common';
import { AssetType } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { createMockPrisma } from '../../../test/mocks/prisma.mock';
import { CreateAssetDto } from '../dto/assets.dto';
import { AssetsService } from './assets.service';

describe('AssetsService.create account ownership', () => {
  const dto = {
    name: 'Laptop',
    assetType: AssetType.ELECTRONICS,
    purchaseDate: '2025-01-15',
    purchasePrice: 12000,
    salvageValue: 2000,
    usefulLifeYears: 5,
    assetAccountId: 'acc-asset',
    depreciationAccountId: 'acc-expense',
    accumulatedDeprAccountId: 'acc-accum',
  } as CreateAssetDto;

  const setup = () => {
    const prisma = createMockPrisma();
    return { prisma, service: new AssetsService(prisma as unknown as PrismaService) };
  };

  it("refuses another organization's account before touching any asset data", async () => {
    const { prisma, service } = setup();
    prisma.account.count.mockResolvedValue(2); // one of the three ids is not ours

    await expect(service.create('org-a', dto)).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.account.count).toHaveBeenCalledWith({
      where: { id: { in: ['acc-asset', 'acc-expense', 'acc-accum'] }, organizationId: 'org-a' },
    });
    expect(prisma.asset.create).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('counts a repeated account id once', async () => {
    const { prisma, service } = setup();
    prisma.account.count.mockResolvedValue(2);
    prisma.asset.findFirst.mockResolvedValue(null);
    prisma.$transaction.mockRejectedValue(new Error('stop after the ownership check'));

    await expect(
      service.create('org-a', { ...dto, depreciationAccountId: 'acc-asset' }),
    ).rejects.toThrow('stop after the ownership check');
    expect(prisma.account.count).toHaveBeenCalledWith({
      where: { id: { in: ['acc-asset', 'acc-accum'] }, organizationId: 'org-a' },
    });
  });
});
