import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AdjustmentType, ItemType, Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { cursorPaginate } from '../../../common/utils/cursor-paginate';
import { PrismaService } from '../../../prisma/prisma.service';
import { JournalSourceType, JournalsService } from '../../accounting/services/journals.service';
import { AdjustmentCursorQueryDto, AdjustmentQueryDto } from '../dto/adjustment-query.dto';
import { CreateAdjustmentDto } from '../dto/create-adjustment.dto';

export type AdjustmentStatus = 'POSTED' | 'VOIDED';

/** Ledger facts derived from the adjustment's journals (the adjustment row has no status column). */
export interface AdjustmentLedgerView {
  status: AdjustmentStatus;
  /** Value of the stock change at the cost price used when it was posted, as a decimal string. */
  value: string | null;
  journalId: string | null;
  journalNumber: string | null;
  voidJournalId: string | null;
}

const ADJUSTMENT_INCLUDE = {
  item: { select: { id: true, name: true, sku: true, unit: true } },
  warehouse: { select: { id: true, name: true, code: true } },
  account: { select: { id: true, name: true, code: true } },
} satisfies Prisma.InventoryAdjustmentInclude;

type AdjustmentWithRelations = Prisma.InventoryAdjustmentGetPayload<{
  include: typeof ADJUSTMENT_INCLUDE;
}>;

export type AdjustmentView = AdjustmentWithRelations & AdjustmentLedgerView;

function parseDate(value: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new BadRequestException('Invalid adjustment date');
  return date;
}

@Injectable()
export class AdjustmentsService {
  constructor(
    private prisma: PrismaService,
    private journalsService: JournalsService,
  ) {}

  /**
   * Posts a stock adjustment: stock (item total and warehouse level), the movement record and the
   * valuation journal commit in one transaction.
   *
   *   INCREASE: Dr item inventory account / Cr adjustment account
   *   DECREASE: Dr adjustment account / Cr item inventory account
   *
   * The value is quantity x the item's cost price and the journal is dated on the adjustment date.
   * Decreases are guarded (the stock row is only decremented while enough remains), so concurrent
   * adjustments can neither oversell stock nor leave the ledger out of step with it.
   */
  async create(organizationId: string, dto: CreateAdjustmentDto): Promise<AdjustmentView> {
    const date = parseDate(dto.date);

    return this.prisma.$transaction(async (tx) => {
      const item = await tx.item.findFirst({
        where: { id: dto.itemId, organizationId, deletedAt: null },
        select: {
          id: true,
          name: true,
          type: true,
          trackInventory: true,
          costPrice: true,
          inventoryAccountId: true,
        },
      });
      if (!item) throw new BadRequestException('Item not found');
      if (item.type !== ItemType.GOODS || !item.trackInventory) {
        throw new BadRequestException(`${item.name} is not an inventory-tracked item`);
      }

      const warehouse = await tx.warehouse.findFirst({
        where: { id: dto.warehouseId, organizationId, deletedAt: null, isActive: true },
        select: { id: true },
      });
      if (!warehouse) throw new BadRequestException('Warehouse not found');

      const adjustmentAccount = await tx.account.findFirst({
        where: { id: dto.accountId, organizationId, deletedAt: null, isActive: true },
        select: { id: true },
      });
      if (!adjustmentAccount) throw new BadRequestException('Adjustment account not found');

      if (!item.inventoryAccountId) {
        throw new BadRequestException(
          `${item.name} has no inventory account; assign one before adjusting its stock`,
        );
      }
      if (item.inventoryAccountId === adjustmentAccount.id) {
        throw new BadRequestException(
          'The adjustment account must differ from the item inventory account',
        );
      }
      const value = item.costPrice.mul(dto.quantity);
      if (value.lessThanOrEqualTo(0)) {
        throw new BadRequestException(
          `${item.name} has no cost price; set one so the adjustment can be valued`,
        );
      }

      const adjustmentNumber = await this.nextAdjustmentNumber(tx, organizationId);
      const adjustment = await tx.inventoryAdjustment.create({
        data: {
          adjustmentNumber,
          date,
          warehouseId: warehouse.id,
          itemId: item.id,
          type: dto.type,
          quantity: dto.quantity,
          reason: dto.reason,
          accountId: adjustmentAccount.id,
          notes: dto.notes,
          organizationId,
        },
        include: ADJUSTMENT_INCLUDE,
      });

      await this.applyStock(tx, {
        organizationId,
        itemId: item.id,
        itemName: item.name,
        warehouseId: warehouse.id,
        type: dto.type,
        quantity: dto.quantity,
        failure: 'Insufficient stock',
      });
      await tx.inventoryMovement.create({
        data: {
          itemId: item.id,
          warehouseId: warehouse.id,
          quantity: new Decimal(
            dto.type === AdjustmentType.INCREASE ? dto.quantity : -dto.quantity,
          ),
          type: 'adjustment',
          movementType: dto.type === AdjustmentType.INCREASE ? 'IN' : 'OUT',
          referenceType: 'adjustment',
          referenceId: adjustment.id,
          reference: adjustmentNumber,
          costPerUnit: item.costPrice,
          // The model has no date column: the movement is dated through createdAt.
          createdAt: date,
          organizationId,
        },
      });

      const increase = dto.type === AdjustmentType.INCREASE;
      const amount = value.toFixed(4);
      const journal = await this.journalsService.create(
        organizationId,
        {
          date: date.toISOString(),
          reference: `Adjustment ${adjustmentNumber}`,
          notes: `Inventory adjustment ${adjustmentNumber} (${dto.reason})`,
          lines: [
            {
              accountId: increase ? item.inventoryAccountId : adjustmentAccount.id,
              debit: amount,
              credit: '0',
              description: `${adjustmentNumber} - ${increase ? 'Inventory increase' : 'Adjustment expense'}`,
            },
            {
              accountId: increase ? adjustmentAccount.id : item.inventoryAccountId,
              debit: '0',
              credit: amount,
              description: `${adjustmentNumber} - ${increase ? 'Adjustment gain' : 'Inventory decrease'}`,
            },
          ],
        },
        { tx, source: { type: JournalSourceType.INVENTORY_ADJUSTMENT, id: adjustment.id } },
      );

      return {
        ...adjustment,
        status: 'POSTED',
        value: amount,
        journalId: journal.id,
        journalNumber: journal.journalNumber,
        voidJournalId: null,
      };
    });
  }

  /**
   * Voids an adjustment: restores the stock and posts a linked reversal of its journal. History
   * is never rewritten; a second void is rejected (the reversal is unique per adjustment).
   */
  async void(organizationId: string, id: string): Promise<AdjustmentView> {
    return this.prisma.$transaction(async (tx) => {
      // Serialize concurrent voids of the same adjustment so the loser sees the reversal.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`inventory-adjustment:${id}`}))`;

      const adjustment = await tx.inventoryAdjustment.findFirst({
        where: { id, organizationId },
        include: ADJUSTMENT_INCLUDE,
      });
      if (!adjustment) throw new NotFoundException('Adjustment not found');

      const journal = await tx.journal.findFirst({
        where: {
          organizationId,
          sourceType: JournalSourceType.INVENTORY_ADJUSTMENT,
          sourceId: id,
          deletedAt: null,
        },
        include: { reversedBy: { select: { id: true } } },
      });
      if (!journal) {
        // Adjustments made before journals were source-linked cannot be voided safely:
        // restoring stock without reversing the valuation entry would unbalance stock vs ledger.
        throw new BadRequestException(
          'This adjustment has no linked ledger entry; correct it with a new adjustment instead',
        );
      }
      if (journal.reversedBy) throw new BadRequestException('Adjustment has already been voided');

      const restore =
        adjustment.type === AdjustmentType.INCREASE
          ? AdjustmentType.DECREASE
          : AdjustmentType.INCREASE;
      await this.applyStock(tx, {
        organizationId,
        itemId: adjustment.itemId,
        itemName: adjustment.item.name,
        warehouseId: adjustment.warehouseId,
        type: restore,
        quantity: adjustment.quantity,
        failure: 'Cannot void: the stock added by this adjustment has since been used',
      });
      const originalMovement = await tx.inventoryMovement.findFirst({
        where: {
          organizationId,
          referenceType: 'adjustment',
          referenceId: id,
          type: 'adjustment',
        },
        select: { costPerUnit: true },
      });
      await tx.inventoryMovement.create({
        data: {
          itemId: adjustment.itemId,
          warehouseId: adjustment.warehouseId,
          quantity: new Decimal(
            restore === AdjustmentType.INCREASE ? adjustment.quantity : -adjustment.quantity,
          ),
          type: 'adjustment_void',
          // Same unit cost as the movement being undone; dated at void time.
          costPerUnit: originalMovement?.costPerUnit ?? 0,
          createdAt: new Date(),
          movementType: restore === AdjustmentType.INCREASE ? 'IN' : 'OUT',
          referenceType: 'adjustment',
          referenceId: adjustment.id,
          reference: adjustment.adjustmentNumber,
          organizationId,
        },
      });

      try {
        await this.journalsService.reverse(organizationId, journal.id, undefined, {
          tx,
          source: { type: JournalSourceType.INVENTORY_ADJUSTMENT_VOID, id },
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new ConflictException('Adjustment has already been voided');
        }
        throw error;
      }

      const [view] = await this.withLedger(tx, organizationId, [adjustment]);
      return view;
    });
  }

  async findAll(organizationId: string, query: AdjustmentQueryDto) {
    const { page = 1, limit = 20, sortBy = 'date', sortOrder = 'desc' } = query;
    const where = this.buildWhere(organizationId, query);
    const [adjustments, total] = await Promise.all([
      this.prisma.inventoryAdjustment.findMany({
        where,
        include: ADJUSTMENT_INCLUDE,
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.inventoryAdjustment.count({ where }),
    ]);
    return {
      data: await this.withLedger(this.prisma, organizationId, adjustments),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findAllCursor(organizationId: string, query: AdjustmentCursorQueryDto) {
    const { cursor, take, sortBy = 'date', sortOrder = 'desc' } = query;
    const page = await cursorPaginate(
      this.prisma.inventoryAdjustment,
      this.buildWhere(organizationId, query),
      { [sortBy]: sortOrder },
      { cursor, take, include: ADJUSTMENT_INCLUDE },
    );
    return {
      ...page,
      data: await this.withLedger(
        this.prisma,
        organizationId,
        page.data as AdjustmentWithRelations[],
      ),
    };
  }

  async findOne(organizationId: string, id: string): Promise<AdjustmentView> {
    const adjustment = await this.prisma.inventoryAdjustment.findFirst({
      where: { id, organizationId },
      include: ADJUSTMENT_INCLUDE,
    });
    if (!adjustment) throw new NotFoundException('Adjustment not found');
    const [view] = await this.withLedger(this.prisma, organizationId, [adjustment]);
    return view;
  }

  // === Helpers ===

  private buildWhere(
    organizationId: string,
    query: Pick<AdjustmentQueryDto, 'search' | 'type'>,
  ): Prisma.InventoryAdjustmentWhereInput {
    const where: Prisma.InventoryAdjustmentWhereInput = { organizationId };
    if (query.type) where.type = query.type;
    if (query.search) {
      where.OR = [
        { adjustmentNumber: { contains: query.search, mode: 'insensitive' } },
        { notes: { contains: query.search, mode: 'insensitive' } },
        { item: { name: { contains: query.search, mode: 'insensitive' } } },
        { item: { sku: { contains: query.search, mode: 'insensitive' } } },
      ];
    }
    return where;
  }

  /** Adds status, value and journal links, read from the adjustments' source-linked journals. */
  private async withLedger(
    db: Prisma.TransactionClient,
    organizationId: string,
    adjustments: AdjustmentWithRelations[],
  ): Promise<AdjustmentView[]> {
    if (adjustments.length === 0) return [];
    const journals = await db.journal.findMany({
      where: {
        organizationId,
        deletedAt: null,
        sourceType: {
          in: [JournalSourceType.INVENTORY_ADJUSTMENT, JournalSourceType.INVENTORY_ADJUSTMENT_VOID],
        },
        sourceId: { in: adjustments.map((a) => a.id) },
      },
      select: {
        id: true,
        journalNumber: true,
        sourceType: true,
        sourceId: true,
        lines: { select: { debit: true } },
      },
    });

    return adjustments.map((adjustment) => {
      const posting = journals.find(
        (j) =>
          j.sourceType === JournalSourceType.INVENTORY_ADJUSTMENT && j.sourceId === adjustment.id,
      );
      const voiding = journals.find(
        (j) =>
          j.sourceType === JournalSourceType.INVENTORY_ADJUSTMENT_VOID &&
          j.sourceId === adjustment.id,
      );
      return {
        ...adjustment,
        status: voiding ? 'VOIDED' : 'POSTED',
        value: posting
          ? posting.lines.reduce((s, l) => s.add(l.debit), new Decimal(0)).toFixed(4)
          : null,
        journalId: posting?.id ?? null,
        journalNumber: posting?.journalNumber ?? null,
        voidJournalId: voiding?.id ?? null,
      };
    });
  }

  /**
   * Moves the item total and the warehouse level. A decrease only lands while enough stock
   * remains (guarded update + count check), so it can never go negative or race.
   */
  private async applyStock(
    tx: Prisma.TransactionClient,
    params: {
      organizationId: string;
      itemId: string;
      itemName: string;
      warehouseId: string;
      type: AdjustmentType;
      quantity: number;
      failure: string;
    },
  ): Promise<void> {
    const { organizationId, itemId, itemName, warehouseId, type, quantity, failure } = params;

    if (type === AdjustmentType.INCREASE) {
      const { count } = await tx.item.updateMany({
        where: { id: itemId, organizationId },
        data: { currentStock: { increment: quantity } },
      });
      if (count === 0) throw new NotFoundException('Item not found');
      await tx.inventoryLevel.upsert({
        where: { itemId_warehouseId: { itemId, warehouseId } },
        update: { quantity: { increment: quantity } },
        create: { itemId, warehouseId, quantity: new Decimal(quantity), organizationId },
      });
      return;
    }

    // The warehouse must hold the quantity: a missing level or an insufficient one is rejected,
    // and the global stock is never decremented on its own.
    const moved = await tx.inventoryLevel.updateMany({
      where: { itemId, warehouseId, organizationId, quantity: { gte: new Decimal(quantity) } },
      data: { quantity: { decrement: quantity } },
    });
    if (moved.count === 0) {
      throw new BadRequestException(`${failure} for ${itemName} in this warehouse`);
    }
    const { count } = await tx.item.updateMany({
      where: { id: itemId, organizationId, currentStock: { gte: quantity } },
      data: { currentStock: { decrement: quantity } },
    });
    if (count === 0) throw new BadRequestException(`${failure} for ${itemName}`);
  }

  /** Serialized per organization so concurrent adjustments never share a number. */
  private async nextAdjustmentNumber(
    tx: Prisma.TransactionClient,
    organizationId: string,
  ): Promise<string> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`inventory-adjustment-number:${organizationId}`}))`;
    const rows = await tx.$queryRaw<{ max: number | null }[]>`
      SELECT MAX(CAST(SUBSTRING("adjustmentNumber" FROM '^ADJ-([0-9]+)$') AS INTEGER)) AS max
      FROM "inventory_adjustments" WHERE "organizationId" = ${organizationId}`;
    const last = Number(rows?.[0]?.max ?? 0);
    return `ADJ-${String(last + 1).padStart(3, '0')}`;
  }
}
