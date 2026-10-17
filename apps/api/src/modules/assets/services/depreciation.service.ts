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
import { lockOrganizationLedger } from '../../../common/utils/ledger-lock';
import { describeError } from '../../../common/utils/redact';
import { JournalSourceType, JournalsService } from '../../accounting/services/journals.service';

interface Period {
  month: number;
  year: number;
}

/** Last day of a schedule month (UTC): the accounting date of its depreciation journal. */
function periodEnd(month: number, year: number): Date {
  return new Date(Date.UTC(year, month, 0));
}

const isAfter = (a: Period, b: Period): boolean =>
  a.year > b.year || (a.year === b.year && a.month > b.month);

/** Schedule rows strictly after a period. */
function after(p: Period): Prisma.DepreciationScheduleWhereInput {
  return { OR: [{ year: { gt: p.year } }, { year: p.year, month: { gt: p.month } }] };
}

/** Schedule rows strictly before a period. */
function before(p: Period): Prisma.DepreciationScheduleWhereInput {
  return { OR: [{ year: { lt: p.year } }, { year: p.year, month: { lt: p.month } }] };
}

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
   * Posts every active asset's open periods up to the current month, oldest first, resuming
   * after the asset's latest posted period; an asset with nothing posted yet starts at the
   * current month. Shares {@link postSchedule} with the manual run, so a schedule already posted
   * by either is skipped, and a missed month is caught up instead of blocking the next one.
   */
  async runMonthlyDepreciation(organizationId: string): Promise<{
    processed: number;
    journalsCreated: number;
    totalDepreciation: number;
  }> {
    const today = new Date();
    const current: Period = { month: today.getUTCMonth() + 1, year: today.getUTCFullYear() };

    const open = await this.prisma.depreciationSchedule.findMany({
      where: {
        organizationId,
        executedAt: null,
        amount: { gt: 0 },
        OR: [{ year: { lt: current.year } }, { year: current.year, month: { lte: current.month } }],
        asset: { organizationId, status: AssetStatus.ACTIVE, deletedAt: null },
      },
      select: { assetId: true, month: true, year: true },
      orderBy: [{ year: 'asc' }, { month: 'asc' }],
    });
    const assetIds = [...new Set(open.map((s) => s.assetId))];
    const latestPosted = await this.prisma.depreciationSchedule.findMany({
      where: { organizationId, assetId: { in: assetIds }, executedAt: { not: null } },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
      distinct: ['assetId'],
      select: { assetId: true, month: true, year: true },
    });
    const resumeAfter = new Map(latestPosted.map((s) => [s.assetId, s]));

    let journalsCreated = 0;
    let totalDepreciation = new Decimal(0);

    for (const assetId of assetIds) {
      const last = resumeAfter.get(assetId);
      const due = open.filter(
        (s) =>
          s.assetId === assetId &&
          (last ? isAfter(s, last) : s.month === current.month && s.year === current.year),
      );
      for (const { month, year } of due) {
        try {
          const posted = await this.postSchedule(organizationId, assetId, month, year);
          journalsCreated++;
          totalDepreciation = totalDepreciation.add(posted.amount);
        } catch (error) {
          // Posted meanwhile by a manual run: carry on with the next period.
          if (error instanceof ConflictException) continue;
          this.logger.error(
            `Failed to process depreciation for asset ${assetId}: ${describeError(error, { includeMessage: false })}`,
          );
          // Its later periods cannot post past the one that failed.
          break;
        }
      }
    }

    return {
      processed: journalsCreated,
      journalsCreated,
      totalDepreciation: totalDepreciation.toNumber(),
    };
  }

  /**
   * Run depreciation for a specific asset (manual trigger)
   */
  async runDepreciationForAsset(
    organizationId: string,
    assetId: string,
    month?: number,
    year?: number,
  ): Promise<{ journalId: string; amount: number }> {
    const today = new Date();
    const posted = await this.postSchedule(
      organizationId,
      assetId,
      Number(month) || today.getUTCMonth() + 1,
      Number(year) || today.getUTCFullYear(),
    );
    return { journalId: posted.journalId, amount: posted.amount.toNumber() };
  }

  /**
   * Posts one schedule period through the ledger command, dated on the period end. Under the
   * ledger lock the period order is checked, the schedule is claimed by a guarded update, and the
   * journal carries DEPRECIATION:scheduleId, so a concurrent cron and manual run post it once. A
   * period re-run after a reversal gets the suffix `:<n>` (n = reversed postings so far).
   */
  private async postSchedule(
    organizationId: string,
    assetId: string,
    month: number,
    year: number,
  ): Promise<{ journalId: string; amount: Decimal }> {
    return this.prisma.$transaction(async (tx) => {
      await lockOrganizationLedger(tx, organizationId);

      const asset = await tx.asset.findFirst({
        where: { id: assetId, organizationId, status: AssetStatus.ACTIVE, deletedAt: null },
      });
      if (!asset) throw new NotFoundException('Asset not found or not active');

      const schedule = await tx.depreciationSchedule.findFirst({
        where: { assetId, organizationId, month, year },
      });
      if (!schedule) throw new NotFoundException('No depreciation scheduled for this period');
      if (!schedule.amount.greaterThan(0)) {
        throw new BadRequestException('Nothing to depreciate for this period');
      }
      await this.assertPostable(tx, organizationId, schedule);

      const { count } = await tx.depreciationSchedule.updateMany({
        where: { id: schedule.id, organizationId, executedAt: null },
        data: { executedAt: new Date() },
      });
      if (count === 0) throw new ConflictException('Depreciation already executed for this period');

      const reversed = await tx.journal.count({
        where: {
          organizationId,
          sourceType: JournalSourceType.DEPRECIATION,
          sourceId: { startsWith: schedule.id },
          reversedBy: { isNot: null },
        },
      });
      const amount = schedule.amount.toFixed(4);
      const journal = await this.journalsService.create(
        organizationId,
        {
          date: periodEnd(month, year).toISOString(),
          reference: `DEP-${asset.assetNumber}-${year}-${String(month).padStart(2, '0')}`,
          notes: `Monthly depreciation: ${asset.name}`,
          lines: [
            {
              accountId: asset.depreciationAccountId,
              debit: amount,
              credit: '0',
              description: `Depreciation expense - ${asset.assetNumber}`,
            },
            {
              accountId: asset.accumulatedDeprAccountId,
              debit: '0',
              credit: amount,
              description: `Accumulated depreciation - ${asset.assetNumber}`,
            },
          ],
        },
        {
          tx,
          source: {
            type: JournalSourceType.DEPRECIATION,
            id: reversed === 0 ? schedule.id : `${schedule.id}:${reversed}`,
          },
        },
      );

      await tx.depreciationSchedule.update({
        where: { id: schedule.id },
        data: { journalId: journal.id },
      });
      await this.syncAssetRegister(tx, organizationId, asset);

      return { journalId: journal.id, amount: schedule.amount };
    });
  }

  /**
   * Periods post in order: never behind a later posted period, and once an asset has posted
   * depreciation no open period may be skipped. The first posting may start at any period, so a
   * backdated asset begins depreciating in the period it is first run.
   */
  private async assertPostable(
    tx: Prisma.TransactionClient,
    organizationId: string,
    schedule: Period & { assetId: string },
  ): Promise<void> {
    const latest = await tx.depreciationSchedule.findFirst({
      where: { assetId: schedule.assetId, organizationId, executedAt: { not: null } },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
      select: { month: true, year: true },
    });
    if (!latest) return;
    if (isAfter(latest, schedule)) {
      throw new BadRequestException(
        'A later depreciation period is already posted; reverse it first',
      );
    }
    const skipped = await tx.depreciationSchedule.findFirst({
      where: {
        assetId: schedule.assetId,
        organizationId,
        executedAt: null,
        amount: { gt: 0 },
        AND: [after(latest), before(schedule)],
      },
      select: { id: true },
    });
    if (skipped) throw new BadRequestException('Post the earlier open depreciation periods first');
  }

  /**
   * The asset register follows the ledger: accumulated depreciation is the sum of the posted
   * periods, the book value is cost less that sum, and the asset is fully depreciated once its
   * book value reaches the salvage value.
   */
  private async syncAssetRegister(
    tx: Prisma.TransactionClient,
    organizationId: string,
    asset: { id: string; purchasePrice: Decimal; salvageValue: Decimal },
  ): Promise<void> {
    const posted = await tx.depreciationSchedule.aggregate({
      where: { assetId: asset.id, organizationId, executedAt: { not: null } },
      _sum: { amount: true },
    });
    const accumulated = posted._sum.amount ?? new Decimal(0);
    const bookValue = asset.purchasePrice.sub(accumulated);
    await tx.asset.update({
      where: { id: asset.id },
      data: {
        accumulatedDepreciation: accumulated,
        currentBookValue: bookValue,
        status: bookValue.greaterThan(asset.salvageValue)
          ? AssetStatus.ACTIVE
          : AssetStatus.FULLY_DEPRECIATED,
      },
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

      const totalDepreciation = activeSchedules
        .reduce((sum, s) => sum.add(s.amount), new Decimal(0))
        .toNumber();

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
   * Reverses the asset's latest posted depreciation period with a linked reversal journal. The
   * original journal stays posted (history is immutable); the schedule is reopened so the period
   * can be re-run, and the asset register follows the remaining posted periods.
   */
  async reverseDepreciation(organizationId: string, scheduleId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await lockOrganizationLedger(tx, organizationId);

      const schedule = await tx.depreciationSchedule.findFirst({
        where: { id: scheduleId, organizationId },
        include: { asset: true },
      });
      if (!schedule) throw new NotFoundException('Depreciation schedule not found');
      if (!schedule.executedAt || !schedule.journalId) {
        throw new BadRequestException('Depreciation was not executed');
      }
      if (schedule.asset.status === AssetStatus.DISPOSED) {
        throw new BadRequestException('Cannot reverse depreciation of a disposed asset');
      }
      const later = await tx.depreciationSchedule.findFirst({
        where: {
          assetId: schedule.assetId,
          organizationId,
          executedAt: { not: null },
          ...after(schedule),
        },
        select: { id: true },
      });
      if (later) throw new BadRequestException('Reverse the later depreciation periods first');

      const { count } = await tx.depreciationSchedule.updateMany({
        where: { id: scheduleId, organizationId, journalId: schedule.journalId },
        data: { journalId: null, executedAt: null },
      });
      if (count === 0) throw new ConflictException('Depreciation has already been reversed');

      await this.journalsService.reverse(organizationId, schedule.journalId, undefined, {
        tx,
        source: { type: JournalSourceType.DEPRECIATION_REVERSAL, id: schedule.journalId },
      });

      await this.syncAssetRegister(tx, organizationId, schedule.asset);
    });
  }
}
