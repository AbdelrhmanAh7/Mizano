import { AssetStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { createMockPrisma } from '../../../test/mocks/prisma.mock';
import { PrismaService } from '../../../prisma/prisma.service';
import { JournalSourceType, JournalsService } from '../../accounting/services/journals.service';
import { DepreciationService } from './depreciation.service';

describe('DepreciationService ledger postings', () => {
  const organizationId = 'org-1';
  const assetId = 'asset-1';
  const scheduleId = 'schedule-1';
  const asset = {
    id: assetId,
    assetNumber: 'FA-001',
    name: 'Equipment',
    status: AssetStatus.ACTIVE,
    deletedAt: null,
    depreciationAccountId: 'expense',
    accumulatedDeprAccountId: 'accumulated',
    accumulatedDepreciation: new Decimal('0.1250'),
    currentBookValue: new Decimal('99.8750'),
    salvageValue: new Decimal('0'),
    purchasePrice: new Decimal('100'),
  };
  const schedule = {
    id: scheduleId,
    assetId,
    organizationId,
    month: 1,
    year: 2026,
    amount: new Decimal('0.1250'),
    accumulatedTotal: new Decimal('0.1250'),
    bookValue: new Decimal('99.8750'),
    executedAt: null,
    journalId: null,
    asset,
  };

  it('posts the scheduled amount through JournalsService under the ledger lock', async () => {
    const prisma = createMockPrisma();
    const journalsService = {
      create: jest.fn().mockResolvedValue({ id: 'journal-1' }),
    } as unknown as JournalsService;
    prisma.asset.findFirst.mockResolvedValue(asset as never);
    prisma.depreciationSchedule.findFirst.mockResolvedValue(schedule as never);
    prisma.depreciationSchedule.updateMany.mockResolvedValue({ count: 1 } as never);

    const service = new DepreciationService(prisma as unknown as PrismaService, journalsService);
    const result = await service.runDepreciationForAsset(organizationId, assetId, 1, 2026);

    expect(result).toEqual({ journalId: 'journal-1', amount: '0.1250' });
    expect(prisma.$executeRaw).toHaveBeenCalled();
    expect(journalsService.create).toHaveBeenCalledWith(
      organizationId,
      expect.objectContaining({
        date: '2026-01-01T00:00:00.000Z',
        lines: [
          expect.objectContaining({ accountId: 'expense', debit: '0.1250', credit: '0' }),
          expect.objectContaining({ accountId: 'accumulated', debit: '0', credit: '0.1250' }),
        ],
      }),
      {
        tx: prisma,
        source: { type: JournalSourceType.ASSET_DEPRECIATION, id: scheduleId },
      },
    );
    expect(prisma.journal.create).not.toHaveBeenCalled();
    expect(prisma.depreciationSchedule.updateMany).toHaveBeenCalledWith({
      where: { id: scheduleId, organizationId, executedAt: null },
      data: { journalId: 'journal-1', executedAt: expect.any(Date) },
    });
  });

  it('reverses depreciation through a linked journal instead of unposting history', async () => {
    const prisma = createMockPrisma();
    const journalsService = {
      create: jest.fn(),
      reverse: jest.fn().mockResolvedValue({ id: 'reversal-1' }),
    } as unknown as JournalsService;
    prisma.depreciationSchedule.findFirst
      .mockResolvedValueOnce({
        ...schedule,
        executedAt: new Date(),
        journalId: 'journal-1',
      } as never)
      .mockResolvedValueOnce(null as never)
      .mockResolvedValueOnce(null as never);
    prisma.depreciationSchedule.updateMany.mockResolvedValue({ count: 1 } as never);

    const service = new DepreciationService(prisma as unknown as PrismaService, journalsService);
    await service.reverseDepreciation(organizationId, scheduleId);

    expect(prisma.$executeRaw).toHaveBeenCalled();
    expect(prisma.depreciationSchedule.updateMany).toHaveBeenCalledWith({
      where: {
        id: scheduleId,
        organizationId,
        executedAt: { not: null },
        journalId: 'journal-1',
      },
      data: { journalId: null, executedAt: null },
    });
    expect(journalsService.reverse).toHaveBeenCalledWith(organizationId, 'journal-1', undefined, {
      tx: prisma,
      source: { type: JournalSourceType.ASSET_DEPRECIATION_REVERSAL, id: scheduleId },
    });
    expect(prisma.journal.update).not.toHaveBeenCalled();
  });
});
