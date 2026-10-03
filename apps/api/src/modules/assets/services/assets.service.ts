import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AssetStatus, DepreciationMethod, Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';
import { cursorPaginate } from '../../../common/utils/cursor-paginate';
import { PrismaService } from '../../../prisma/prisma.service';
import { AssetQueryDto, CreateAssetDto, DisposeAssetDto, UpdateAssetDto } from '../dto/assets.dto';
import { lockOrganizationLedger } from '../../../common/utils/ledger-lock';

@Injectable()
export class AssetsService {
  private readonly logger = new Logger(AssetsService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Create a new asset with depreciation schedule
   */
  async create(organizationId: string, dto: CreateAssetDto): Promise<unknown> {
    // Generate asset number
    const assetNumber = await this.generateAssetNumber(organizationId);

    // Calculate monthly depreciation
    const depreciableAmount = dto.purchasePrice - dto.salvageValue;
    const totalMonths = dto.usefulLifeYears * 12;
    const monthlyDepreciation =
      dto.depreciationMethod === DepreciationMethod.STRAIGHT_LINE
        ? depreciableAmount / totalMonths
        : 0; // Will be calculated per period for declining balance

    // Create asset with depreciation schedule in transaction
    const asset = await this.prisma.$transaction(async (tx) => {
      const newAsset = await tx.asset.create({
        data: {
          assetNumber,
          name: dto.name,
          description: dto.description,
          assetType: dto.assetType,
          purchaseDate: new Date(dto.purchaseDate),
          purchasePrice: new Decimal(dto.purchasePrice),
          salvageValue: new Decimal(dto.salvageValue),
          usefulLifeYears: dto.usefulLifeYears,
          depreciationMethod: dto.depreciationMethod || DepreciationMethod.STRAIGHT_LINE,
          monthlyDepreciation: new Decimal(monthlyDepreciation),
          accumulatedDepreciation: new Decimal(0),
          currentBookValue: new Decimal(dto.purchasePrice),
          status: AssetStatus.ACTIVE,
          assetAccountId: dto.assetAccountId,
          depreciationAccountId: dto.depreciationAccountId,
          accumulatedDeprAccountId: dto.accumulatedDeprAccountId,
          organizationId,
        },
        include: {
          assetAccount: true,
          depreciationAccount: true,
          accumulatedDeprAccount: true,
        },
      });

      // Generate depreciation schedule
      await this.generateDepreciationSchedule(
        tx,
        newAsset.id,
        organizationId,
        new Date(dto.purchaseDate),
        dto.purchasePrice,
        dto.salvageValue,
        dto.usefulLifeYears,
        dto.depreciationMethod || DepreciationMethod.STRAIGHT_LINE,
      );

      return newAsset;
    });

    return this.formatAssetResponse(asset);
  }

  /**
   * Get all assets with filtering and pagination
   */
  async findAll(
    organizationId: string,
    query: AssetQueryDto,
  ): Promise<{ data: Record<string, unknown>[]; total: number }> {
    const where: Prisma.AssetWhereInput = {
      organizationId,
      deletedAt: null,
    };

    if (query.status) {
      where.status = query.status;
    }

    if (query.assetType) {
      where.assetType = query.assetType;
    }

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { assetNumber: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.asset.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: query.limit || 50,
        skip: query.offset || 0,
      }),
      this.prisma.asset.count({ where }),
    ]);

    return {
      data: data.map((asset) => this.formatAssetResponse(asset as Record<string, unknown>)),
      total,
    };
  }

  /**
   * Get all assets with cursor-based pagination
   */
  async findAllCursor(organizationId: string, query: CursorPaginationDto) {
    const where: Record<string, unknown> = {
      organizationId,
      deletedAt: null,
    };

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { assetNumber: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const orderBy = { [query.sortBy || 'createdAt']: query.sortOrder || 'desc' };

    return cursorPaginate(this.prisma.asset, where, orderBy, {
      cursor: query.cursor,
      take: query.take,
    });
  }

  /**
   * Get asset by ID with depreciation schedule
   */
  async findOne(organizationId: string, assetId: string): Promise<unknown> {
    const asset = await this.prisma.asset.findFirst({
      where: {
        id: assetId,
        organizationId,
        deletedAt: null,
      },
      include: {
        assetAccount: { select: { id: true, name: true, code: true } },
        depreciationAccount: { select: { id: true, name: true, code: true } },
        accumulatedDeprAccount: { select: { id: true, name: true, code: true } },
        depreciationSchedule: {
          orderBy: [{ year: 'asc' }, { month: 'asc' }],
        },
      },
    });

    if (!asset) {
      throw new NotFoundException('Asset not found');
    }

    return this.formatAssetDetailResponse(asset);
  }

  /**
   * Update an asset
   */
  async update(organizationId: string, assetId: string, dto: UpdateAssetDto): Promise<unknown> {
    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId, organizationId, deletedAt: null },
    });

    if (!asset) {
      throw new NotFoundException('Asset not found');
    }

    if (asset.status !== AssetStatus.ACTIVE) {
      throw new BadRequestException('Cannot update a disposed or fully depreciated asset');
    }

    // If useful life or salvage value changed, recalculate schedule
    const needsRecalc = dto.usefulLifeYears !== undefined || dto.salvageValue !== undefined;

    const updated = await this.prisma.$transaction(async (tx) => {
      const updatedAsset = await tx.asset.update({
        where: { id: assetId },
        data: {
          name: dto.name,
          description: dto.description,
          salvageValue: dto.salvageValue !== undefined ? new Decimal(dto.salvageValue) : undefined,
          usefulLifeYears: dto.usefulLifeYears,
        },
        include: {
          assetAccount: { select: { id: true, name: true, code: true } },
          depreciationAccount: { select: { id: true, name: true, code: true } },
          accumulatedDeprAccount: { select: { id: true, name: true, code: true } },
        },
      });

      if (needsRecalc) {
        // Delete future unposted schedules
        await tx.depreciationSchedule.deleteMany({
          where: {
            assetId,
            executedAt: null,
          },
        });

        // Regenerate schedule from current position
        await this.regenerateScheduleFromCurrent(tx, updatedAsset, organizationId);
      }

      return updatedAsset;
    });

    return this.formatAssetResponse(updated);
  }

  /**
   * Dispose an asset (sell or write off)
   */
  async dispose(organizationId: string, assetId: string, dto: DisposeAssetDto): Promise<unknown> {
    // Ledger first, then the asset snapshot and mutations, matching depreciation.
    const disposed = await this.prisma.$transaction(async (tx) => {
      await lockOrganizationLedger(tx, organizationId);
      const asset = await tx.asset.findFirst({
        where: { id: assetId, organizationId, deletedAt: null },
      });

      if (!asset) {
        throw new NotFoundException('Asset not found');
      }

      if (asset.status !== AssetStatus.ACTIVE) {
        throw new BadRequestException('Asset is already disposed');
      }

      // Calculate gain/loss on disposal
      const disposalAmount = new Decimal(dto.disposalAmount);
      const bookValue = asset.currentBookValue;
      const gainLoss = disposalAmount.minus(bookValue);

      // Update asset status
      const updatedAsset = await tx.asset.update({
        where: { id: assetId, organizationId },
        data: {
          status: AssetStatus.DISPOSED,
          disposalDate: new Date(dto.disposalDate),
          disposalAmount,
          disposalGainLoss: gainLoss,
        },
      });

      // Delete future unposted depreciation schedules
      await tx.depreciationSchedule.deleteMany({
        where: {
          assetId,
          organizationId,
          executedAt: null,
        },
      });

      // Create disposal journal entry
      const journal = await this.createDisposalJournal(
        tx,
        organizationId,
        asset,
        new Date(dto.disposalDate),
        disposalAmount,
        gainLoss,
      );

      return { ...updatedAsset, disposalJournalId: journal.id };
    });

    return this.formatAssetResponse(disposed);
  }

  /**
   * Get depreciation schedule for an asset
   */
  async getDepreciationSchedule(organizationId: string, assetId: string): Promise<unknown[]> {
    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId, organizationId, deletedAt: null },
    });

    if (!asset) {
      throw new NotFoundException('Asset not found');
    }

    const schedules = await this.prisma.depreciationSchedule.findMany({
      where: { assetId },
      orderBy: [{ year: 'asc' }, { month: 'asc' }],
      include: {
        journal: { select: { id: true, journalNumber: true } },
      },
    });

    return schedules.map((s) => ({
      id: s.id,
      month: s.month,
      year: s.year,
      amount: s.amount.toNumber(),
      accumulatedTotal: s.accumulatedTotal.toNumber(),
      bookValue: s.bookValue.toNumber(),
      journalId: s.journalId,
      journalNumber: s.journal?.journalNumber,
      executedAt: s.executedAt,
    }));
  }

  /**
   * Get asset summary/statistics
   */
  async getSummary(organizationId: string): Promise<unknown> {
    const assets = await this.prisma.asset.findMany({
      where: { organizationId, deletedAt: null },
    });

    const activeAssets = assets.filter((a) => a.status === AssetStatus.ACTIVE);

    const byType: Record<string, number> = {};
    for (const asset of assets) {
      byType[asset.assetType] = (byType[asset.assetType] || 0) + 1;
    }

    return {
      totalAssets: assets.length,
      activeAssets: activeAssets.length,
      totalPurchaseValue: activeAssets.reduce((sum, a) => sum + a.purchasePrice.toNumber(), 0),
      totalBookValue: activeAssets.reduce((sum, a) => sum + a.currentBookValue.toNumber(), 0),
      totalAccumulatedDepreciation: activeAssets.reduce(
        (sum, a) => sum + a.accumulatedDepreciation.toNumber(),
        0,
      ),
      monthlyDepreciation: activeAssets.reduce(
        (sum, a) => sum + a.monthlyDepreciation.toNumber(),
        0,
      ),
      byType,
    };
  }

  /**
   * Soft delete an asset
   */
  async remove(organizationId: string, assetId: string): Promise<void> {
    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId, organizationId, deletedAt: null },
    });

    if (!asset) {
      throw new NotFoundException('Asset not found');
    }

    // Check if any depreciation has been posted
    const postedSchedules = await this.prisma.depreciationSchedule.count({
      where: { assetId, executedAt: { not: null } },
    });

    if (postedSchedules > 0) {
      throw new BadRequestException(
        'Cannot delete asset with posted depreciation. Dispose instead.',
      );
    }

    await this.prisma.$transaction([
      this.prisma.depreciationSchedule.deleteMany({ where: { assetId } }),
      this.prisma.asset.update({
        where: { id: assetId },
        data: { deletedAt: new Date() },
      }),
    ]);
  }

  // ============ Helper Methods ============

  private async generateAssetNumber(organizationId: string): Promise<string> {
    const lastAsset = await this.prisma.asset.findFirst({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      select: { assetNumber: true },
    });

    if (!lastAsset?.assetNumber) {
      return 'FA-001';
    }

    const lastNumber = parseInt(lastAsset.assetNumber.split('-')[1], 10);
    return `FA-${String(lastNumber + 1).padStart(3, '0')}`;
  }

  private async generateDepreciationSchedule(
    tx: Prisma.TransactionClient,
    assetId: string,
    organizationId: string,
    purchaseDate: Date,
    purchasePrice: number,
    salvageValue: number,
    usefulLifeYears: number,
    method: DepreciationMethod,
  ): Promise<void> {
    const depreciableAmount = purchasePrice - salvageValue;
    const totalMonths = usefulLifeYears * 12;
    const schedules: Prisma.DepreciationScheduleCreateManyInput[] = [];

    let currentMonth = purchaseDate.getMonth() + 1;
    let currentYear = purchaseDate.getFullYear();
    let accumulatedTotal = 0;
    let bookValue = purchasePrice;
    for (let period = 1; period <= totalMonths; period++) {
      let monthlyAmount: number;

      if (method === DepreciationMethod.STRAIGHT_LINE) {
        monthlyAmount = depreciableAmount / totalMonths;
      } else {
        // Declining balance (double declining)
        const annualRate = 2 / usefulLifeYears;
        monthlyAmount = Math.max(0, (bookValue * annualRate) / 12);

        // Don't depreciate below salvage value
        if (bookValue - monthlyAmount < salvageValue) {
          monthlyAmount = Math.max(0, bookValue - salvageValue);
        }
      }

      accumulatedTotal += monthlyAmount;
      bookValue -= monthlyAmount;

      schedules.push({
        assetId,
        month: currentMonth,
        year: currentYear,
        amount: new Decimal(monthlyAmount),
        accumulatedTotal: new Decimal(accumulatedTotal),
        bookValue: new Decimal(Math.max(bookValue, salvageValue)),
        organizationId,
      });

      // Move to next month
      currentMonth++;
      if (currentMonth > 12) {
        currentMonth = 1;
        currentYear++;
      }
    }

    await tx.depreciationSchedule.createMany({ data: schedules });
  }

  private async regenerateScheduleFromCurrent(
    tx: Prisma.TransactionClient,
    asset: {
      id: string;
      salvageValue: Decimal;
      usefulLifeYears: number;
      purchasePrice: Decimal;
      purchaseDate: Date;
      depreciationMethod: DepreciationMethod;
    },
    organizationId: string,
  ): Promise<void> {
    // Get last executed schedule
    const lastExecuted = await tx.depreciationSchedule.findFirst({
      where: { assetId: asset.id, executedAt: { not: null } },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    });

    let startMonth: number;
    let startYear: number;
    let currentBookValue: number;
    let accumulatedTotal: number;

    if (lastExecuted) {
      startMonth = lastExecuted.month + 1;
      startYear = lastExecuted.year;
      if (startMonth > 12) {
        startMonth = 1;
        startYear++;
      }
      currentBookValue = lastExecuted.bookValue.toNumber();
      accumulatedTotal = lastExecuted.accumulatedTotal.toNumber();
    } else {
      const purchaseDate = new Date(asset.purchaseDate);
      startMonth = purchaseDate.getMonth() + 1;
      startYear = purchaseDate.getFullYear();
      currentBookValue = asset.purchasePrice.toNumber();
      accumulatedTotal = 0;
    }

    // Calculate remaining periods
    const purchaseDate = new Date(asset.purchaseDate);
    const endMonth = purchaseDate.getMonth() + 1;
    const endYear = purchaseDate.getFullYear() + asset.usefulLifeYears;

    const depreciableAmount = currentBookValue - asset.salvageValue.toNumber();
    const remainingMonths = this.monthsBetween(startMonth, startYear, endMonth, endYear);

    if (remainingMonths <= 0 || depreciableAmount <= 0) return;

    const monthlyAmount = depreciableAmount / remainingMonths;
    const schedules: Prisma.DepreciationScheduleCreateManyInput[] = [];

    let month = startMonth;
    let year = startYear;
    let bookValue = currentBookValue;

    for (let i = 0; i < remainingMonths; i++) {
      const amount = Math.min(monthlyAmount, bookValue - asset.salvageValue.toNumber());
      accumulatedTotal += amount;
      bookValue -= amount;

      schedules.push({
        assetId: asset.id,
        month,
        year,
        amount: new Decimal(amount),
        accumulatedTotal: new Decimal(accumulatedTotal),
        bookValue: new Decimal(Math.max(bookValue, asset.salvageValue.toNumber())),
        organizationId,
      });

      month++;
      if (month > 12) {
        month = 1;
        year++;
      }
    }

    if (schedules.length > 0) {
      await tx.depreciationSchedule.createMany({ data: schedules });
    }
  }

  private monthsBetween(
    startMonth: number,
    startYear: number,
    endMonth: number,
    endYear: number,
  ): number {
    return (endYear - startYear) * 12 + (endMonth - startMonth);
  }

  private async createDisposalJournal(
    tx: Prisma.TransactionClient,
    organizationId: string,
    asset: {
      id: string;
      assetNumber: string;
      name: string;
      depreciationAccountId: string;
      accumulatedDeprAccountId: string;
      assetAccountId: string;
      salvageValue: Decimal;
      accumulatedDepreciation: Decimal;
      purchasePrice: Decimal;
    },
    disposalDate: Date,
    disposalAmount: Decimal,
    gainLoss: Decimal,
  ): Promise<{ id: string }> {
    // Get or create gain/loss account
    let gainLossAccount = await tx.account.findFirst({
      where: {
        organizationId,
        code: { in: ['7100', '6100'] }, // Common gain/loss codes
      },
    });

    if (!gainLossAccount) {
      // Use a general expense/income account
      gainLossAccount = await tx.account.findFirst({
        where: {
          organizationId,
          type: gainLoss.isPositive() ? 'INCOME' : 'EXPENSE',
        },
      });
    }

    // Generate journal number
    const journalNumber = await this.generateJournalNumber(tx, organizationId);

    // Build journal lines
    const lines: Prisma.JournalLineUncheckedCreateWithoutJournalInput[] = [];

    // Debit: Cash/Bank (disposal amount received)
    if (disposalAmount.greaterThan(0)) {
      const cashAccount = await tx.account.findFirst({
        where: { organizationId, type: 'ASSET', code: { startsWith: '1' } },
      });
      if (cashAccount) {
        lines.push({
          accountId: cashAccount.id,
          debit: disposalAmount,
          credit: new Decimal(0),
          description: `Asset disposal proceeds - ${asset.assetNumber}`,
        });
      }
    }

    // Debit: Accumulated Depreciation
    lines.push({
      accountId: asset.accumulatedDeprAccountId,
      debit: asset.accumulatedDepreciation,
      credit: new Decimal(0),
      description: `Remove accumulated depreciation - ${asset.assetNumber}`,
    });

    // Credit: Asset Account (original cost)
    lines.push({
      accountId: asset.assetAccountId,
      debit: new Decimal(0),
      credit: asset.purchasePrice,
      description: `Remove asset - ${asset.assetNumber}`,
    });

    // Gain or Loss on disposal
    if (!gainLoss.isZero() && gainLossAccount) {
      if (gainLoss.isPositive()) {
        // Credit: Gain on disposal
        lines.push({
          accountId: gainLossAccount.id,
          debit: new Decimal(0),
          credit: gainLoss,
          description: `Gain on disposal - ${asset.assetNumber}`,
        });
      } else {
        // Debit: Loss on disposal
        lines.push({
          accountId: gainLossAccount.id,
          debit: gainLoss.abs(),
          credit: new Decimal(0),
          description: `Loss on disposal - ${asset.assetNumber}`,
        });
      }
    }

    // Create journal
    const journal = await tx.journal.create({
      data: {
        journalNumber,
        date: disposalDate,
        reference: `DISPOSAL-${asset.assetNumber}`,
        notes: `Asset disposal: ${asset.name}`,
        isPosted: true,
        organizationId,
        lines: {
          create: lines,
        },
      },
    });

    return journal;
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

  private toNum(val: unknown): number | undefined {
    if (val === null || val === undefined) return undefined;
    if (val instanceof Decimal) return val.toNumber();
    return Number(val);
  }

  private formatAssetResponse(asset: Record<string, unknown>): Record<string, unknown> {
    return {
      id: asset.id,
      assetNumber: asset.assetNumber,
      name: asset.name,
      description: asset.description,
      assetType: asset.assetType,
      purchaseDate: asset.purchaseDate,
      purchasePrice: this.toNum(asset.purchasePrice),
      salvageValue: this.toNum(asset.salvageValue),
      usefulLifeYears: asset.usefulLifeYears,
      depreciationMethod: asset.depreciationMethod,
      monthlyDepreciation: this.toNum(asset.monthlyDepreciation),
      accumulatedDepreciation: this.toNum(asset.accumulatedDepreciation),
      currentBookValue: this.toNum(asset.currentBookValue),
      status: asset.status,
      disposalDate: asset.disposalDate,
      disposalAmount: this.toNum(asset.disposalAmount),
      disposalGainLoss: this.toNum(asset.disposalGainLoss),
      createdAt: asset.createdAt,
      updatedAt: asset.updatedAt,
    };
  }

  private formatAssetDetailResponse(asset: Record<string, unknown>): Record<string, unknown> {
    return {
      ...this.formatAssetResponse(asset),
      depreciationSchedule: (
        asset.depreciationSchedule as Record<string, unknown>[] | undefined
      )?.map((s) => ({
        id: s.id,
        month: s.month,
        year: s.year,
        amount: this.toNum(s.amount),
        accumulatedTotal: this.toNum(s.accumulatedTotal),
        bookValue: this.toNum(s.bookValue),
        journalId: s.journalId,
        executedAt: s.executedAt,
      })),
      assetAccount: asset.assetAccount,
      depreciationAccount: asset.depreciationAccount,
      accumulatedDeprAccount: asset.accumulatedDeprAccount,
    };
  }
}
