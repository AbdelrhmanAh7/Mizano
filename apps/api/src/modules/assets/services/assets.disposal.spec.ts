import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AssetStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../../../prisma/prisma.service';
import { createMockPrisma } from '../../../test/mocks/prisma.mock';
import { AssetsService } from './assets.service';

const ORG = 'org-1';

function fixture() {
  const prisma = createMockPrisma();
  const calls: string[] = [];
  const asset = {
    id: 'a1',
    assetNumber: 'FA-001',
    name: 'Laptop',
    status: AssetStatus.ACTIVE,
    purchasePrice: new Decimal(1000),
    currentBookValue: new Decimal(900),
    accumulatedDepreciation: new Decimal(100),
    salvageValue: new Decimal(0),
    assetAccountId: 'cost',
    depreciationAccountId: 'dep',
    accumulatedDeprAccountId: 'acc',
  };
  (prisma.$executeRaw as jest.Mock).mockImplementation(async () => {
    calls.push('lock');
    return 1;
  });
  (prisma.asset.findFirst as jest.Mock).mockImplementation(async () => {
    calls.push('asset');
    return asset as never;
  });
  (prisma.asset.update as jest.Mock).mockImplementation(async () => {
    calls.push('update');
    return asset as never;
  });
  (prisma.account.findFirst as jest.Mock).mockImplementation(async () => {
    calls.push('account');
    return { id: 'cash' } as never;
  });
  (prisma.journal.findFirst as jest.Mock).mockImplementation(async () => {
    calls.push('number');
    return null;
  });
  (prisma.journal.create as jest.Mock).mockImplementation(async () => {
    calls.push('journal');
    return { id: 'j1' } as never;
  });
  return { prisma, calls, asset, service: new AssetsService(prisma as unknown as PrismaService) };
}

describe('AssetsService disposal locking', () => {
  it('takes ledger before asset reads/updates, account reads and journal numbering', async () => {
    const { prisma, calls, service } = fixture();
    await service.dispose(ORG, 'a1', { disposalDate: '2026-01-31', disposalAmount: 900 });
    expect(calls).toEqual(['lock', 'asset', 'update', 'account', 'number', 'account', 'journal']);
    expect(prisma.asset.findFirst).toHaveBeenCalledWith({
      where: { id: 'a1', organizationId: ORG, deletedAt: null },
    });
    expect(prisma.asset.update.mock.calls[0][0].where).toEqual({ id: 'a1', organizationId: ORG });
    expect(prisma.depreciationSchedule.deleteMany).toHaveBeenCalledWith({
      where: { assetId: 'a1', organizationId: ORG, executedAt: null },
    });
    for (const [args] of prisma.account.findFirst.mock.calls)
      expect(args?.where?.organizationId).toBe(ORG);
  });

  it('uses the book value updated by depreciation while disposal waited for the lock', async () => {
    const { prisma, service, asset } = fixture();
    (prisma.$executeRaw as jest.Mock).mockImplementation(async () => {
      asset.currentBookValue = new Decimal(800);
      asset.accumulatedDepreciation = new Decimal(200);
      return 1;
    });
    await service.dispose(ORG, 'a1', { disposalDate: '2026-01-31', disposalAmount: 900 });
    expect(prisma.asset.update.mock.calls[0][0].data.disposalGainLoss?.toString()).toBe('100');
    expect(prisma.journal.create.mock.calls[0][0].data.lines).toMatchObject({
      create: expect.arrayContaining([
        expect.objectContaining({ accountId: 'acc', debit: new Decimal(200) }),
      ]),
    });
  });

  it('does not post again if disposal already changed the locked asset status', async () => {
    const { prisma, service } = fixture();
    prisma.asset.findFirst.mockResolvedValue({ status: AssetStatus.DISPOSED } as never);
    await expect(
      service.dispose(ORG, 'a1', { disposalDate: '2026-01-31', disposalAmount: 900 }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.asset.update).not.toHaveBeenCalled();
    expect(prisma.journal.create).not.toHaveBeenCalled();
  });

  it('rejects an asset outside the authorized organization without writing', async () => {
    const { prisma, service } = fixture();
    prisma.asset.findFirst.mockResolvedValue(null);
    await expect(
      service.dispose(ORG, 'foreign', { disposalDate: '2026-01-31', disposalAmount: 900 }),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.asset.update).not.toHaveBeenCalled();
    expect(prisma.account.findFirst).not.toHaveBeenCalled();
  });
});
