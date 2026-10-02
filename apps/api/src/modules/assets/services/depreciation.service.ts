import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../../prisma/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';
import { AssetStatus, Prisma } from '@prisma/client';
import { describeError } from '../../../common/utils/redact';

@Injectable()
export class DepreciationService {
  private readonly logger = new Logger(DepreciationService.name);

  constructor(private prisma: PrismaService) {}

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
        this.logger.error(`Failed to run depreciation for org ${org.id}: ${describeError(error)}`);
      }
    }
  }

  /**
   * Run monthly depreciation for a specific organization
   */
  async runMonthlyDepreciation(organizationId: string): Promise<{
    processed: number;
    journalsCreated: number;
    totalDepreciation: number;
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
      include: {
        assetAccount: true,
        depreciationAccount: true,
        accumulatedDeprAccount: true,
      },
    });

    let processed = 0;
    let journalsCreated = 0;
    let totalDepreciation = 0;

    for (const asset of activeAssets) {
      // Get the schedule entry for this month
      const scheduleEntry = await this.prisma.depreciationSchedule.findUnique({
        where: {
          assetId_month_year: {
            assetId: asset.id,
            month: currentMonth,
            year: currentYear,
          },
        },
      });

      if (!scheduleEntry || scheduleEntry.executedAt) {
        continue; // Skip if no schedule or already executed
      }

      const depreciationAmount = scheduleEntry.amount;

      if (depreciationAmount.lessThanOrEqualTo(0)) {
        continue; // Skip if no depreciation
      }

      try {
        await this.prisma.$transaction(async (tx) => {
          // Create depreciation journal entry
          const journalNumber = await this.generateJournalNumber(tx, organizationId);

          const journal = await tx.journal.create({
            data: {
              journalNumber,
              date: today,
              reference: `DEP-${asset.assetNumber}-${currentYear}-${String(currentMonth).padStart(2, '0')}`,
              notes: `Monthly depreciation: ${asset.name}`,
              isPosted: true,
              organizationId,
              lines: {
                create: [
                  {
                    accountId: asset.depreciationAccountId,
                    debit: depreciationAmount,
                    credit: new Decimal(0),
                    description: `Depreciation expense - ${asset.assetNumber}`,
                  },
                  {
                    accountId: asset.accumulatedDeprAccountId,
                    debit: new Decimal(0),
                    credit: depreciationAmount,
                    description: `Accumulated depreciation - ${asset.assetNumber}`,
                  },
                ],
              },
            },
          });

          // Mark schedule entry as executed
          await tx.depreciationSchedule.update({
            where: { id: scheduleEntry.id },
            data: {
              journalId: journal.id,
              executedAt: today,
            },
          });

          // Update asset accumulated depreciation and book value
          await tx.asset.update({
            where: { id: asset.id },
            data: {
              accumulatedDepreciation: scheduleEntry.accumulatedTotal,
              currentBookValue: scheduleEntry.bookValue,
            },
          });

          // Check if fully depreciated
          if (scheduleEntry.bookValue.equals(asset.salvageValue)) {
            await tx.asset.update({
              where: { id: asset.id },
              data: { status: AssetStatus.FULLY_DEPRECIATED },
            });
          }

          journalsCreated++;
        });

        processed++;
        totalDepreciation += depreciationAmount.toNumber();
      } catch (error) {
        this.logger.error(
          `Failed to process depreciation for asset ${asset.id}: ${describeError(error)}`,
        );
      }
    }

    return { processed, journalsCreated, totalDepreciation };
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
    const targetMonth = month || today.getMonth() + 1;
    const targetYear = year || today.getFullYear();

    const asset = await this.prisma.asset.findFirst({
      where: {
        id: assetId,
        organizationId,
        status: AssetStatus.ACTIVE,
        deletedAt: null,
      },
      include: {
        depreciationAccount: true,
        accumulatedDeprAccount: true,
      },
    });

    if (!asset) {
      throw new Error('Asset not found or not active');
    }

    const scheduleEntry = await this.prisma.depreciationSchedule.findUnique({
      where: {
        assetId_month_year: {
          assetId,
          month: targetMonth,
          year: targetYear,
        },
      },
    });

    if (!scheduleEntry) {
      throw new Error('No depreciation scheduled for this period');
    }

    if (scheduleEntry.executedAt) {
      throw new Error('Depreciation already executed for this period');
    }

    const result = await this.prisma.$transaction(async (tx) => {
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

      await tx.depreciationSchedule.update({
        where: { id: scheduleEntry.id },
        data: {
          journalId: journal.id,
          executedAt: new Date(),
        },
      });

      await tx.asset.update({
        where: { id: assetId },
        data: {
          accumulatedDepreciation: scheduleEntry.accumulatedTotal,
          currentBookValue: scheduleEntry.bookValue,
        },
      });

      if (scheduleEntry.bookValue.equals(asset.salvageValue)) {
        await tx.asset.update({
          where: { id: assetId },
          data: { status: AssetStatus.FULLY_DEPRECIATED },
        });
      }

      return {
        journalId: journal.id,
        amount: scheduleEntry.amount.toNumber(),
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
    const schedule = await this.prisma.depreciationSchedule.findFirst({
      where: { id: scheduleId, organizationId },
      include: {
        asset: true,
        journal: true,
      },
    });

    if (!schedule) {
      throw new Error('Depreciation schedule not found');
    }

    if (!schedule.executedAt) {
      throw new Error('Depreciation was not executed');
    }

    await this.prisma.$transaction(async (tx) => {
      // Mark schedule as not executed
      await tx.depreciationSchedule.update({
        where: { id: scheduleId },
        data: {
          journalId: null,
          executedAt: null,
        },
      });

      // Void the journal entry by marking it as not posted
      if (schedule.journalId) {
        await tx.journal.update({
          where: { id: schedule.journalId },
          data: { isPosted: false },
        });
      }

      // Recalculate asset accumulated depreciation
      const executedSchedules = await tx.depreciationSchedule.findMany({
        where: {
          assetId: schedule.assetId,
          executedAt: { not: null },
        },
        orderBy: [{ year: 'desc' }, { month: 'desc' }],
        take: 1,
      });

      const lastExecuted = executedSchedules[0];

      await tx.asset.update({
        where: { id: schedule.assetId },
        data: {
          accumulatedDepreciation: lastExecuted?.accumulatedTotal || new Decimal(0),
          currentBookValue: lastExecuted?.bookValue || schedule.asset.purchasePrice,
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
