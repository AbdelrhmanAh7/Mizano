import { ConflictException, NotFoundException } from '@nestjs/common';
import { DepreciationService } from './depreciation.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { createMockPrisma, MockPrismaClient } from '../../../test/mocks/prisma.mock';

describe('DepreciationService.runDepreciationForAsset', () => {
  let service: DepreciationService;
  let prisma: MockPrismaClient;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new DepreciationService(prisma as unknown as PrismaService);
  });

  it('answers 404 for an unknown or foreign asset, scoped to the organization', async () => {
    prisma.asset.findFirst.mockResolvedValue(null);

    await expect(
      service.runDepreciationForAsset('org-1', 'asset-x', 1, 2000),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.asset.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'asset-x', organizationId: 'org-1' }),
      }),
    );
  });

  it('answers 404 for a period without a schedule entry (a client error, not a 500)', async () => {
    prisma.asset.findFirst.mockResolvedValue({ id: 'asset-1' } as never);
    prisma.depreciationSchedule.findUnique.mockResolvedValue(null);

    await expect(
      service.runDepreciationForAsset('org-1', 'asset-1', 1, 2000),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('answers 409 when the period was already depreciated', async () => {
    prisma.asset.findFirst.mockResolvedValue({ id: 'asset-1' } as never);
    prisma.depreciationSchedule.findUnique.mockResolvedValue({
      executedAt: new Date('2026-01-31'),
    } as never);

    await expect(
      service.runDepreciationForAsset('org-1', 'asset-1', 1, 2026),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
