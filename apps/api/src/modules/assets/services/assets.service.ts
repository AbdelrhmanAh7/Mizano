import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AssetStatus, DepreciationMethod, Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';
import { cursorPaginate } from '../../../common/utils/cursor-paginate';
import { round } from '../../../common/utils/document-totals';
import { lockOrganizationLedger } from '../../../common/utils/ledger-lock';
import { PrismaService } from '../../../prisma/prisma.service';
import { JournalSourceType, JournalsService } from '../../accounting/services/journals.service';
import { AssetQueryDto, CreateAssetDto, DisposeAssetDto, UpdateAssetDto } from '../dto/assets.dto';

@Injectable()
export class AssetsService {
  private readonly logger = new Logger(AssetsService.name);

  constructor(
    private prisma: PrismaService,
    private journalsService: JournalsService,
  ) {}

  /**
   * Create a new asset with depreciation schedule
   */
  async create(organizationId: string, dto: CreateAssetDto): Promise<unknown> {
    // Generate asset number
    const assetNumber = await this.generateAssetNumber(organizationId);

    const purchasePrice = new Decimal(dto.purchasePrice);
    const salvageValue = new Decimal(dto.salvageValue);
    const totalMonths = dto.usefulLifeYears * 12;
    const method = dto.depreciationMethod || DepreciationMethod.STRAIGHT_LINE;
    const monthlyDepreciation =
      method === DepreciationMethod.STRAIGHT_LINE
        ? round(purchasePrice.sub(salvageValue).div(totalMonths))
        : new Decimal(0); // Will be calculated per period for declining balance

    // Create asset with depreciation schedule in transaction
    const asset = await this.prisma.$transaction(async (tx) => {
      const newAsset = await tx.asset.create({
        data: {
          assetNumber,
          name: dto.name,
          description: dto.description,
          assetType: dto.assetType,
          purchaseDate: new Date(dto.purchaseDate),
          purchasePrice,
          salvageValue,
          usefulLifeYears: dto.usefulLifeYears,
          depreciationMethod: method,
          monthlyDepreciation,
          accumulatedDepreciation: new Decimal(0),
          currentBookValue: purchasePrice,
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

      const purchaseDate = new Date(dto.purchaseDate);
      await tx.depreciationSchedule.createMany({
        data: this.scheduleRows(
          { assetId: newAsset.id, organizationId },
          {
            month: purchaseDate.getMonth() + 1,
            year: purchaseDate.getFullYear(),
            bookValue: purchasePrice,
            accumulated: new Decimal(0),
          },
          totalMonths,
          salvageValue,
          method,
          dto.usefulLifeYears,
        ),
      });

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
   * Dispose an asset (sell or write off). The status change is a guarded transition under the
   * ledger lock and the disposal journal is posted through the ledger command as
   * ASSET_DISPOSAL:assetId, so a repeated or concurrent disposal posts once.
   */
  async dispose(organizationId: string, assetId: string, dto: DisposeAssetDto): Promise<unknown> {
    const disposalDate = new Date(dto.disposalDate);
    const disposalAmount = new Decimal(dto.disposalAmount);

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

      const gainLoss = disposalAmount.minus(asset.currentBookValue);
      const { count } = await tx.asset.updateMany({
        where: { id: assetId, organizationId, status: AssetStatus.ACTIVE, deletedAt: null },
        data: {
          status: AssetStatus.DISPOSED,
          disposalDate,
          disposalAmount,
          disposalGainLoss: gainLoss,
        },
      });
      if (count === 0) {
        throw new ConflictException('Asset is already disposed');
      }

      // Delete future unposted depreciation schedules
      await tx.depreciationSchedule.deleteMany({
        where: { assetId, organizationId, executedAt: null },
      });

      const journal = await this.createDisposalJournal(
        tx,
        organizationId,
        asset,
        disposalDate,
        disposalAmount,
        gainLoss,
      );

      const updatedAsset = await tx.asset.findUniqueOrThrow({ where: { id: assetId } });
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

  /**
   * Schedule rows in Decimal at currency scale. Straight-line periods are rounded and the last
   * one absorbs the remainder, so the rows sum exactly to the depreciable amount and end on the
   * salvage value. Double-declining periods never go below the salvage value.
   */
  private scheduleRows(
    ids: { assetId: string; organizationId: string },
    start: { month: number; year: number; bookValue: Decimal; accumulated: Decimal },
    periods: number,
    salvageValue: Decimal,
    method: DepreciationMethod,
    usefulLifeYears: number,
  ): Prisma.DepreciationScheduleCreateManyInput[] {
    const rows: Prisma.DepreciationScheduleCreateManyInput[] = [];
    const straightLine = round(start.bookValue.sub(salvageValue).div(periods));
    let { month, year, bookValue, accumulated } = start;

    for (let period = 1; period <= periods; period++) {
      const remaining = Decimal.max(bookValue.sub(salvageValue), 0);
      let amount: Decimal;
      if (method === DepreciationMethod.STRAIGHT_LINE) {
        amount = period === periods ? remaining : Decimal.min(straightLine, remaining);
      } else {
        amount = Decimal.min(round(bookValue.mul(2).div(usefulLifeYears).div(12)), remaining);
      }
      accumulated = accumulated.add(amount);
      bookValue = bookValue.sub(amount);

      rows.push({ ...ids, month, year, amount, accumulatedTotal: accumulated, bookValue });

      month++;
      if (month > 12) {
        month = 1;
        year++;
      }
    }
    return rows;
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
    let currentBookValue: Decimal;
    let accumulatedTotal: Decimal;

    if (lastExecuted) {
      startMonth = lastExecuted.month + 1;
      startYear = lastExecuted.year;
      if (startMonth > 12) {
        startMonth = 1;
        startYear++;
      }
      currentBookValue = lastExecuted.bookValue;
      accumulatedTotal = lastExecuted.accumulatedTotal;
    } else {
      const purchaseDate = new Date(asset.purchaseDate);
      startMonth = purchaseDate.getMonth() + 1;
      startYear = purchaseDate.getFullYear();
      currentBookValue = asset.purchasePrice;
      accumulatedTotal = new Decimal(0);
    }

    // Calculate remaining periods
    const purchaseDate = new Date(asset.purchaseDate);
    const endMonth = purchaseDate.getMonth() + 1;
    const endYear = purchaseDate.getFullYear() + asset.usefulLifeYears;

    const remainingMonths = this.monthsBetween(startMonth, startYear, endMonth, endYear);
    if (remainingMonths <= 0 || !currentBookValue.greaterThan(asset.salvageValue)) return;

    // The remaining value is spread straight-line over the remaining months.
    await tx.depreciationSchedule.createMany({
      data: this.scheduleRows(
        { assetId: asset.id, organizationId },
        {
          month: startMonth,
          year: startYear,
          bookValue: currentBookValue,
          accumulated: accumulatedTotal,
        },
        remainingMonths,
        asset.salvageValue,
        DepreciationMethod.STRAIGHT_LINE,
        asset.usefulLifeYears,
      ),
    });
  }

  private monthsBetween(
    startMonth: number,
    startYear: number,
    endMonth: number,
    endYear: number,
  ): number {
    return (endYear - startYear) * 12 + (endMonth - startMonth);
  }

  /**
   * Dr proceeds (cash) + Dr accumulated depreciation + Dr loss / Cr asset cost + Cr gain, posted
   * through the ledger command. A required account that is missing rejects the disposal instead
   * of dropping its line and leaving the journal unbalanced.
   */
  private async createDisposalJournal(
    tx: Prisma.TransactionClient,
    organizationId: string,
    asset: {
      id: string;
      assetNumber: string;
      name: string;
      accumulatedDeprAccountId: string;
      assetAccountId: string;
      accumulatedDepreciation: Decimal;
      purchasePrice: Decimal;
    },
    disposalDate: Date,
    disposalAmount: Decimal,
    gainLoss: Decimal,
  ): Promise<{ id: string }> {
    const lines: { accountId: string; debit: string; credit: string; description: string }[] = [];
    const debit = (accountId: string, amount: Decimal, description: string): void => {
      lines.push({ accountId, debit: amount.toFixed(4), credit: '0', description });
    };
    const credit = (accountId: string, amount: Decimal, description: string): void => {
      lines.push({ accountId, debit: '0', credit: amount.toFixed(4), description });
    };

    if (disposalAmount.greaterThan(0)) {
      const cashAccount = await tx.account.findFirst({
        where: {
          organizationId,
          type: 'ASSET',
          isActive: true,
          deletedAt: null,
          code: { startsWith: '1' },
          id: { notIn: [asset.assetAccountId, asset.accumulatedDeprAccountId] },
        },
        orderBy: { code: 'asc' },
      });
      if (!cashAccount) {
        throw new BadRequestException(
          'A cash/bank account is required to record disposal proceeds',
        );
      }
      debit(cashAccount.id, disposalAmount, `Asset disposal proceeds - ${asset.assetNumber}`);
    }

    if (asset.accumulatedDepreciation.greaterThan(0)) {
      debit(
        asset.accumulatedDeprAccountId,
        asset.accumulatedDepreciation,
        `Remove accumulated depreciation - ${asset.assetNumber}`,
      );
    }
    if (asset.purchasePrice.greaterThan(0)) {
      credit(asset.assetAccountId, asset.purchasePrice, `Remove asset - ${asset.assetNumber}`);
    }

    if (!gainLoss.isZero()) {
      const gainLossAccount =
        (await tx.account.findFirst({
          where: { organizationId, deletedAt: null, code: { in: ['7100', '6100'] } },
          orderBy: { code: 'desc' },
        })) ??
        (await tx.account.findFirst({
          where: {
            organizationId,
            deletedAt: null,
            isActive: true,
            type: gainLoss.isPositive() ? 'INCOME' : 'EXPENSE',
          },
          orderBy: { code: 'asc' },
        }));
      if (!gainLossAccount) {
        throw new BadRequestException('A gain/loss account is required to record the disposal');
      }
      if (gainLoss.isPositive()) {
        credit(gainLossAccount.id, gainLoss, `Gain on disposal - ${asset.assetNumber}`);
      } else {
        debit(gainLossAccount.id, gainLoss.abs(), `Loss on disposal - ${asset.assetNumber}`);
      }
    }

    return this.journalsService.create(
      organizationId,
      {
        date: disposalDate.toISOString(),
        reference: `DISPOSAL-${asset.assetNumber}`,
        notes: `Asset disposal: ${asset.name}`,
        lines,
      },
      { tx, source: { type: JournalSourceType.ASSET_DISPOSAL, id: asset.id } },
    );
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
