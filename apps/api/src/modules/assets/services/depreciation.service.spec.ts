import { BadRequestException, ConflictException } from '@nestjs/common';
import { AssetStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { dec } from '../../../test/helpers/decimal.helpers';
import {
  expectBalanced,
  realJournalsService,
  writtenJournals,
} from '../../../test/helpers/ledger.helpers';
import { createMockPrisma, MockPrismaClient } from '../../../test/mocks/prisma.mock';
import { DepreciationService } from './depreciation.service';

describe('DepreciationService (#130)', () => {
  const ORG = 'org-1';
  const asset = {
    id: 'asset-1',
    assetNumber: 'FA-001',
    name: 'Laptop',
    status: AssetStatus.ACTIVE,
    depreciationAccountId: 'acc-expense',
    accumulatedDeprAccountId: 'acc-accumulated',
    salvageValue: dec('0'),
    purchasePrice: dec('1000'),
  };
  const schedule = {
    id: 'sched-1',
    assetId: asset.id,
    month: 9,
    year: 2026,
    amount: dec('83.33'),
    accumulatedTotal: dec('166.66'),
    bookValue: dec('833.34'),
    organizationId: ORG,
  };
  let prisma: MockPrismaClient;

  function serviceWithLock(lockDate: Date | null = null): DepreciationService {
    return new DepreciationService(
      prisma as unknown as PrismaService,
      realJournalsService(prisma, lockDate),
    );
  }

  beforeEach(() => {
    prisma = createMockPrisma();
    prisma.asset.findFirst.mockResolvedValue(asset as never);
    prisma.depreciationSchedule.findFirst.mockResolvedValue(schedule as never);
    prisma.depreciationSchedule.updateMany.mockResolvedValue({ count: 1 });
    prisma.journal.count.mockResolvedValue(0);
  });

  describe('posting a period', () => {
    it('posts one balanced DEPRECIATION journal on the period end under the ledger lock', async () => {
      const result = await serviceWithLock().runDepreciationForAsset(ORG, asset.id, 9, 2026);

      const [journal, ...rest] = writtenJournals(prisma);
      expect(rest).toHaveLength(0);
      expectBalanced(journal.lines);
      expect(journal.sourceType).toBe('DEPRECIATION');
      expect(journal.sourceId).toBe(schedule.id);
      expect(journal.date.toISOString()).toBe('2026-09-30T00:00:00.000Z');
      expect(result).toEqual({ journalId: 'journal-new', amount: 83.33 });
      expect(prisma.$executeRaw).toHaveBeenCalled();
      expect(prisma.depreciationSchedule.updateMany).toHaveBeenCalledWith({
        where: { id: schedule.id, organizationId: ORG, executedAt: null },
        data: { executedAt: expect.any(Date) },
      });
    });

    it('rejects the posting when the lock date covers the period', async () => {
      const service = serviceWithLock(new Date('2026-09-30T00:00:00.000Z'));

      await expect(service.runDepreciationForAsset(ORG, asset.id, 9, 2026)).rejects.toThrow(
        /locked/,
      );
      expect(prisma.journal.create).not.toHaveBeenCalled();
    });

    it('does not post a period that another run already claimed', async () => {
      prisma.depreciationSchedule.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        serviceWithLock().runDepreciationForAsset(ORG, asset.id, 9, 2026),
      ).rejects.toThrow(ConflictException);
      expect(prisma.journal.create).not.toHaveBeenCalled();
    });

    it('re-runs a reversed period under a new source id', async () => {
      prisma.journal.count.mockResolvedValue(1);

      await serviceWithLock().runDepreciationForAsset(ORG, asset.id, 9, 2026);

      expect(writtenJournals(prisma)[0].sourceId).toBe(`${schedule.id}:1`);
    });

    it('the monthly run skips a period the manual run posted meanwhile', async () => {
      prisma.depreciationSchedule.findMany.mockResolvedValue([{ assetId: asset.id }] as never);
      prisma.depreciationSchedule.updateMany.mockResolvedValue({ count: 0 });

      const result = await serviceWithLock().runMonthlyDepreciation(ORG);

      expect(result).toEqual({ processed: 0, journalsCreated: 0, totalDepreciation: 0 });
      expect(prisma.journal.create).not.toHaveBeenCalled();
    });
  });

  describe('reverseDepreciation', () => {
    const original = {
      id: 'journal-orig',
      journalNumber: 'JRN-007',
      date: new Date('2026-09-30T00:00:00.000Z'),
      isPosted: true,
      reversalOfId: null,
      reversedBy: null,
      sourceType: 'DEPRECIATION',
      lines: [
        { accountId: 'acc-expense', debit: dec('83.33'), credit: dec('0'), description: 'Dep' },
        { accountId: 'acc-accumulated', debit: dec('0'), credit: dec('83.33'), description: 'Acc' },
      ],
    };

    beforeEach(() => {
      prisma.depreciationSchedule.findFirst.mockResolvedValue({
        ...schedule,
        executedAt: new Date(),
        journalId: original.id,
        asset,
      } as never);
      prisma.journal.findFirst.mockResolvedValue(original as never);
    });

    it('creates a linked, balanced reversal and never un-posts the original', async () => {
      await serviceWithLock().reverseDepreciation(ORG, schedule.id);

      const [reversal] = writtenJournals(prisma);
      expect(reversal.reversalOfId).toBe(original.id);
      expect(reversal.isPosted).toBe(true);
      expect(reversal.sourceType).toBe('DEPRECIATION_REVERSAL');
      expect(reversal.sourceId).toBe(original.id);
      expectBalanced(reversal.lines);
      expect(reversal.lines.find((l) => l.accountId === 'acc-expense')?.credit).toEqual(
        dec('83.33'),
      );
      expect(prisma.journal.update).not.toHaveBeenCalled();
      expect(prisma.journal.updateMany).not.toHaveBeenCalled();
      expect(prisma.depreciationSchedule.updateMany).toHaveBeenCalledWith({
        where: { id: schedule.id, organizationId: ORG, journalId: original.id },
        data: { journalId: null, executedAt: null },
      });
    });

    it('rejects a reversal dated inside a locked period', async () => {
      const service = serviceWithLock(new Date('2099-01-01T00:00:00.000Z'));

      await expect(service.reverseDepreciation(ORG, schedule.id)).rejects.toThrow(/locked/);
      expect(prisma.journal.create).not.toHaveBeenCalled();
    });

    it('rejects reversing a period that was never posted', async () => {
      prisma.depreciationSchedule.findFirst.mockResolvedValue({
        ...schedule,
        executedAt: null,
        journalId: null,
        asset,
      } as never);

      await expect(serviceWithLock().reverseDepreciation(ORG, schedule.id)).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
