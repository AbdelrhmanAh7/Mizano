import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../../prisma/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';
import { AssetStatus, Prisma } from '@prisma/client';
import { describeError } from '../../../common/utils/redact';
import { lockOrganizationLedger } from '../../../common/utils/ledger-lock';
import { JournalsService } from '../../accounting/services/journals.service';
import { money, sumDecimals } from '../../reports/utils/report-utils';

@Injectable()
export class DepreciationService {
  private readonly logger = new Logger(DepreciationService.name);

  constructor(
    private prisma: PrismaService,
    private journalsService: JournalsService,
  ) {}

  /**
   * Run monthly depreciation for all organizations
   * Runs on the last day of every month at midnight
   */
  @Cron('0 0 28-31 * *', { name: 'monthly-depreciation' })
  async runMonthlyDepreciationCron(): Promise<void> {
    const today = new Date();
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();

    // Only run on actual last day of month
    if (today.getDate() !== lastDay) {
      return;
    }

    this.logger.log('Running monthly depreciation for all organizations');

    const organizations = await this.prisma.organization.findMany({
      select: { id: true },
    });

    for (const org of organizations) {
      try {
        const result = await this.runMonthlyDepreciation(org.id);
        this.logger.log(
          `Org ${org.id}: ${result.processed} assets, ${result.journalsCreated} journals created`,
        );
      } catch (error) {
        this.logger.error(
          `Failed to run depreciation for org ${org.id}: ${describeError(error, { includeMessage: false })}`,
        );
      }
    }
  }

  /**
   * Run monthly depreciation for a specific organization
   */
  async runMonthlyDepreciation(organizationId: string): Promise<{
    processed: number;
    journalsCreated: number;
    totalDepreciation: string;
  }> {
    const today = new Date();
    const currentMonth = today.getMonth() + 1;
    const currentYear = today.getFullYear();

    // Get all active assets
    const activeAssets = await this.prisma.asset.findMany({
      where: {
        organizationId,
        status: AssetStatus.ACTIVE,
        deletedAt: null,
      },
      select: { id: true },
    });

    let processed = 0;
    let journalsCreated = 0;
    let totalDepreciation = new Decimal(0);

    for (const asset of activeAssets) {
      try {
        const amount = await this.prisma.$transaction(async (tx) => {
          await lockOrganizationLedger(tx, organizationId);
          const currentAsset = await tx.asset.findFirst({
            where: { id: asset.id, organizationId, status: AssetStatus.ACTIVE, deletedAt: null },
          });
          if (!currentAsset) return null;
          const scheduleEntry = await tx.depreciationSchedule.findFirst({
            where: { assetId: asset.id, organizationId, month: currentMonth, year: currentYear },
          });
          if (
            !scheduleEntry ||
            scheduleEntry.executedAt ||
            scheduleEntry.amount.lessThanOrEqualTo(0)
          ) {
            return null;
          }
          const depreciationAmount = scheduleEntry.amount;
          // Create depreciation journal entry
          const journalNumber = await this.generateJournalNumber(tx, organizationId);

          const journal = await tx.journal.create({
            data: {
              journalNumber,
              date: today,
              reference: `DEP-${currentAsset.assetNumber}-${currentYear}-${String(currentMonth).padStart(2, '0')}`,
              notes: `Monthly depreciation: ${currentAsset.name}`,
              isPosted: true,
              organizationId,
              lines: {
                create: [
                  {
                    accountId: currentAsset.depreciationAccountId,
                    debit: depreciationAmount,
                    credit: new Decimal(0),
                    description: `Depreciation expense - ${currentAsset.assetNumber}`,
                  },
                  {
                    accountId: currentAsset.accumulatedDeprAccountId,
                    debit: new Decimal(0),
                    credit: depreciationAmount,
                    description: `Accumulated depreciation - ${currentAsset.assetNumber}`,
                  },
                ],
              },
            },
          });

          // Mark schedule entry as executed
          const transition = await tx.depreciationSchedule.updateMany({
            where: { id: scheduleEntry.id, organizationId, executedAt: null },
            data: {
              journalId: journal.id,
              executedAt: today,
            },
          });

          if (transition.count !== 1) throw new ConflictException('Depreciation already executed');

          // Update asset accumulated depreciation and book value
          await tx.asset.update({
            where: { id: asset.id, organizationId },
            data: {
              accumulatedDepreciation: scheduleEntry.accumulatedTotal,
              currentBookValue: scheduleEntry.bookValue,
            },
          });

          // Check if fully depreciated
          if (scheduleEntry.bookValue.equals(currentAsset.salvageValue)) {
            await tx.asset.update({
              where: { id: asset.id, organizationId },
              data: { status: AssetStatus.FULLY_DEPRECIATED },
            });
          }

          return depreciationAmount;
        });

        if (amount === null) continue;
        journalsCreated++;
        processed++;
        totalDepreciation = totalDepreciation.add(amount);
      } catch (error) {
        this.logger.error(
          `Failed to process depreciation for asset ${asset.id}: ${describeError(error, { includeMessage: false })}`,
        );
      }
    }

    return { processed, journalsCreated, totalDepreciation: money(totalDepreciation) };
  }

  /**
   * Run depreciation for a specific asset (manual trigger)
   */
  async runDepreciationForAsset(
    organizationId: string,
    assetId: string,
    month?: number,
    year?: number,
  ): Promise<{ journalId: string; amount: string }> {
    const today = new Date();
    const targetMonth = month || today.getMonth() + 1;
    const targetYear = year || today.getFullYear();

    const result = await this.prisma.$transaction(async (tx) => {
      await lockOrganizationLedger(tx, organizationId);
      const asset = await tx.asset.findFirst({
        where: {
          id: assetId,
          organizationId,
          status: AssetStatus.ACTIVE,
          deletedAt: null,
        },
      });

      if (!asset) {
        throw new Error('Asset not found or not active');
      }

      const scheduleEntry = await tx.depreciationSchedule.findFirst({
        where: {
          assetId,
          organizationId,
          month: targetMonth,
          year: targetYear,
        },
      });

      if (!scheduleEntry) {
        throw new Error('No depreciation scheduled for this period');
      }

      if (scheduleEntry.executedAt) {
        throw new Error('Depreciation already executed for this period');
      }

      const journalNumber = await this.generateJournalNumber(tx, organizationId);

      const journal = await tx.journal.create({
        data: {
          journalNumber,
          date: new Date(targetYear, targetMonth - 1, 1),
          reference: `DEP-${asset.assetNumber}-${targetYear}-${String(targetMonth).padStart(2, '0')}`,
          notes: `Monthly depreciation: ${asset.name}`,
          isPosted: true,
          organizationId,
          lines: {
            create: [
              {
                accountId: asset.depreciationAccountId,
                debit: scheduleEntry.amount,
                credit: new Decimal(0),
                description: `Depreciation expense - ${asset.assetNumber}`,
              },
              {
                accountId: asset.accumulatedDeprAccountId,
                debit: new Decimal(0),
                credit: scheduleEntry.amount,
                description: `Accumulated depreciation - ${asset.assetNumber}`,
              },
            ],
          },
        },
      });

      const transition = await tx.depreciationSchedule.updateMany({
        where: { id: scheduleEntry.id, organizationId, executedAt: null },
        data: {
          journalId: journal.id,
          executedAt: new Date(),
        },
      });

      if (transition.count !== 1) throw new ConflictException('Depreciation already executed');

      await tx.asset.update({
        where: { id: assetId, organizationId },
        data: {
          accumulatedDepreciation: scheduleEntry.accumulatedTotal,
          currentBookValue: scheduleEntry.bookValue,
        },
      });

      if (scheduleEntry.bookValue.equals(asset.salvageValue)) {
        await tx.asset.update({
          where: { id: assetId, organizationId },
          data: { status: AssetStatus.FULLY_DEPRECIATED },
        });
      }

      return {
        journalId: journal.id,
        amount: money(scheduleEntry.amount),
      };
    });

    return result;
  }

  /**
   * Get depreciation forecast for upcoming periods
   */
  async getDepreciationForecast(
    organizationId: string,
    months: number = 12,
  ): Promise<
    {
      month: number;
      year: number;
      totalDepreciation: number;
      assetCount: number;
    }[]
  > {
    const today = new Date();
    const results: {
      month: number;
      year: number;
      totalDepreciation: number;
      assetCount: number;
    }[] = [];

    let currentMonth = today.getMonth() + 1;
    let currentYear = today.getFullYear();

    for (let i = 0; i < months; i++) {
      const schedules = await this.prisma.depreciationSchedule.findMany({
        where: {
          organizationId,
          month: currentMonth,
          year: currentYear,
          executedAt: null,
        },
        include: {
          asset: {
            select: { status: true },
          },
        },
      });

      const activeSchedules = schedules.filter((s) => s.asset.status === AssetStatus.ACTIVE);

      const totalDepreciation = sumDecimals(activeSchedules.map((s) => s.amount)).toNumber();

      results.push({
        month: currentMonth,
        year: currentYear,
        totalDepreciation,
        assetCount: activeSchedules.length,
      });

      currentMonth++;
      if (currentMonth > 12) {
        currentMonth = 1;
        currentYear++;
      }
    }

    return results;
  }

  /**
   * Reverses the latest executed depreciation entry of an asset. Posted history is immutable: the
   * original journal stays posted and a linked, dated reversal journal (the shared
   * `JournalsService.reverse` command: `max(today, original date)`, period lock enforced) takes the
   * expense back. Lock order: ledger -> asset, like depreciation and disposal.
   *
   * Only the latest executed entry can be reversed. The asset's accumulated depreciation and book
   * value follow its latest executed entry, so reversing an earlier month while later ones stay
   * executed would reverse the ledger but leave the asset untouched. A disposed asset is refused:
   * its disposal journal already removed the accumulated depreciation.
   */
  async reverseDepreciation(organizationId: string, scheduleId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await lockOrganizationLedger(tx, organizationId);
      // Everything below is read after the lock, so a concurrent run, reversal or disposal that
      // held it first is already visible.
      const schedule = await tx.depreciationSchedule.findFirst({
        where: { id: scheduleId, organizationId },
        include: { asset: true },
      });

      if (!schedule) {
        throw new NotFoundException('Depreciation schedule not found');
      }
      if (!schedule.executedAt) {
        throw new BadRequestException('Depreciation was not executed');
      }
      if (!schedule.journalId) {
        throw new BadRequestException(
          'This depreciation entry has no linked ledger entry and cannot be reversed',
        );
      }
      if (
        schedule.asset.status === AssetStatus.DISPOSED ||
        schedule.asset.status === AssetStatus.SOLD
      ) {
        throw new BadRequestException('Depreciation of a disposed asset cannot be reversed');
      }

      const later = await tx.depreciationSchedule.findFirst({
        where: {
          assetId: schedule.assetId,
          organizationId,
          executedAt: { not: null },
          OR: [
            { year: { gt: schedule.year } },
            { year: schedule.year, month: { gt: schedule.month } },
          ],
        },
        select: { id: true },
      });
      if (later) {
        throw new BadRequestException(
          'Only the latest executed depreciation entry can be reversed; reverse the later periods first',
        );
      }

      // Guarded transition first: a lost guard aborts before anything is posted.
      const transition = await tx.depreciationSchedule.updateMany({
        where: {
          id: scheduleId,
          organizationId,
          executedAt: { not: null },
          journalId: schedule.journalId,
        },
        data: { journalId: null, executedAt: null },
      });
      if (transition.count !== 1) {
        throw new ConflictException('Depreciation was changed concurrently');
      }

      await this.journalsService.reverse(organizationId, schedule.journalId, undefined, { tx });

      // The previous executed entry (if any) is the asset's new latest one.
      const previous = await tx.depreciationSchedule.findFirst({
        where: { assetId: schedule.assetId, organizationId, executedAt: { not: null } },
        orderBy: [{ year: 'desc' }, { month: 'desc' }],
      });

      await tx.asset.update({
        where: { id: schedule.assetId, organizationId },
        data: {
          accumulatedDepreciation: previous?.accumulatedTotal ?? new Decimal(0),
          currentBookValue: previous?.bookValue ?? schedule.asset.purchasePrice,
          status: AssetStatus.ACTIVE,
        },
      });
    });
  }

  private async generateJournalNumber(
    tx: Prisma.TransactionClient,
    organizationId: string,
  ): Promise<string> {
    const lastJournal = await tx.journal.findFirst({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      select: { journalNumber: true },
    });

    if (!lastJournal?.journalNumber) {
      return 'JRN-001';
    }

    const lastNumber = parseInt(lastJournal.journalNumber.split('-')[1], 10);
    return `JRN-${String(lastNumber + 1).padStart(3, '0')}`;
  }
}
