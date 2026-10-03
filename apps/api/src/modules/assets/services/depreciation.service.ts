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
import { AssetStatus } from '@prisma/client';
import { describeError } from '../../../common/utils/redact';
import { lockOrganizationLedger } from '../../../common/utils/ledger-lock';
import { JournalSourceType, JournalsService } from '../../accounting/services/journals.service';
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
    const amounts: Decimal[] = [];

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

          const journal = await this.journalsService.create(
            organizationId,
            {
              date: today.toISOString(),
              reference: `DEP-${currentAsset.assetNumber}-${currentYear}-${String(currentMonth).padStart(2, '0')}`,
              notes: `Monthly depreciation: ${currentAsset.name}`,
              lines: [
                {
                  accountId: currentAsset.depreciationAccountId,
                  debit: scheduleEntry.amount.toFixed(4),
                  credit: '0',
                  description: `Depreciation expense - ${currentAsset.assetNumber}`,
                },
                {
                  accountId: currentAsset.accumulatedDeprAccountId,
                  debit: '0',
                  credit: scheduleEntry.amount.toFixed(4),
                  description: `Accumulated depreciation - ${currentAsset.assetNumber}`,
                },
              ],
            },
            {
              tx,
              source: { type: JournalSourceType.ASSET_DEPRECIATION, id: scheduleEntry.id },
            },
          );

          const transition = await tx.depreciationSchedule.updateMany({
            where: { id: scheduleEntry.id, organizationId, executedAt: null },
            data: { journalId: journal.id, executedAt: today },
          });
          if (transition.count !== 1) {
            throw new ConflictException('Depreciation already executed');
          }

          await tx.asset.update({
            where: { id: asset.id, organizationId },
            data: {
              accumulatedDepreciation: scheduleEntry.accumulatedTotal,
              currentBookValue: scheduleEntry.bookValue,
            },
          });

          if (scheduleEntry.bookValue.equals(currentAsset.salvageValue)) {
            await tx.asset.update({
              where: { id: asset.id, organizationId },
              data: { status: AssetStatus.FULLY_DEPRECIATED },
            });
          }

          return scheduleEntry.amount;
        });

        if (amount === null) continue;
        journalsCreated++;
        processed++;
        amounts.push(amount);
      } catch (error) {
        this.logger.error(
          `Failed to process depreciation for asset ${asset.id}: ${describeError(error, { includeMessage: false })}`,
        );
      }
    }

    return { processed, journalsCreated, totalDepreciation: money(sumDecimals(amounts)) };
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

    return this.prisma.$transaction(async (tx) => {
      await lockOrganizationLedger(tx, organizationId);
      const asset = await tx.asset.findFirst({
        where: {
          id: assetId,
          organizationId,
          status: AssetStatus.ACTIVE,
          deletedAt: null,
        },
      });
      if (!asset) throw new NotFoundException('Asset not found or not active');

      const scheduleEntry = await tx.depreciationSchedule.findFirst({
        where: { assetId, organizationId, month: targetMonth, year: targetYear },
      });
      if (!scheduleEntry) throw new NotFoundException('No depreciation scheduled for this period');
      if (scheduleEntry.executedAt) {
        throw new BadRequestException('Depreciation already executed for this period');
      }

      const date = new Date(targetYear, targetMonth - 1, 1);
      const journal = await this.journalsService.create(
        organizationId,
        {
          date: date.toISOString(),
          reference: `DEP-${asset.assetNumber}-${targetYear}-${String(targetMonth).padStart(2, '0')}`,
          notes: `Monthly depreciation: ${asset.name}`,
          lines: [
            {
              accountId: asset.depreciationAccountId,
              debit: scheduleEntry.amount.toFixed(4),
              credit: '0',
              description: `Depreciation expense - ${asset.assetNumber}`,
            },
            {
              accountId: asset.accumulatedDeprAccountId,
              debit: '0',
              credit: scheduleEntry.amount.toFixed(4),
              description: `Accumulated depreciation - ${asset.assetNumber}`,
            },
          ],
        },
        {
          tx,
          source: { type: JournalSourceType.ASSET_DEPRECIATION, id: scheduleEntry.id },
        },
      );

      const transition = await tx.depreciationSchedule.updateMany({
        where: { id: scheduleEntry.id, organizationId, executedAt: null },
        data: {
          journalId: journal.id,
          executedAt: today,
        },
      });
      if (transition.count !== 1) {
        throw new ConflictException('Depreciation already executed for this period');
      }

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

      return { journalId: journal.id, amount: money(scheduleEntry.amount) };
    });
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

      const totalDepreciation = activeSchedules.reduce((sum, s) => sum + s.amount.toNumber(), 0);

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
   * Reverse a depreciation entry
   */
  async reverseDepreciation(organizationId: string, scheduleId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await lockOrganizationLedger(tx, organizationId);
      const schedule = await tx.depreciationSchedule.findFirst({
        where: {
          id: scheduleId,
          organizationId,
        },
        include: { asset: true },
      });
      if (!schedule) throw new NotFoundException('Depreciation schedule not found');
      if (!schedule.executedAt) throw new BadRequestException('Depreciation was not executed');
      if (!schedule.journalId) {
        throw new BadRequestException('This depreciation entry has no linked ledger entry');
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
          'Only the latest executed depreciation entry can be reversed; reverse later periods first',
        );
      }

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

      await this.journalsService.reverse(organizationId, schedule.journalId, undefined, {
        tx,
        source: { type: JournalSourceType.ASSET_DEPRECIATION_REVERSAL, id: scheduleId },
      });

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
}
