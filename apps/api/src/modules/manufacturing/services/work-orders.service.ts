import { signedMovementQuantity } from '../../inventory/utils/movement-sign';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Item, Prisma, WorkOrderStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { round } from '../../../common/utils/document-totals';
import { PrismaService } from '../../../prisma/prisma.service';
import { JournalSourceType, JournalsService } from '../../accounting/services/journals.service';

/** Stock quantities are stored at 4 dp (Decimal(19, 4)). */
const QUANTITY_SCALE = 4;

export interface CreateWorkOrderData {
  bomId: string;
  quantity: number;
  plannedStartDate?: string;
  plannedEndDate?: string;
  notes?: string;
}

export interface UpdateWorkOrderData {
  quantity?: number;
  plannedStartDate?: string;
  plannedEndDate?: string;
  notes?: string;
  bomId?: string;
}

interface WorkOrderWithBom {
  id: string;
  workOrderNumber: string;
  quantity: number;
  notes: string | null;
  bom: {
    outputItemId: string;
    outputQuantity: number;
    operationsCost: Decimal;
    items: Array<{
      itemId: string;
      quantity: Decimal;
      item: {
        costPrice: Decimal;
      };
    }>;
  };
}

@Injectable()
export class WorkOrdersService {
  constructor(
    private prisma: PrismaService,
    private journalsService: JournalsService,
  ) {}

  async create(organizationId: string, dto: CreateWorkOrderData) {
    const bom = await this.prisma.bOM.findFirst({
      where: { id: dto.bomId, organizationId },
      include: { items: { include: { item: true } } },
    });
    if (!bom) throw new NotFoundException('BOM not found');

    const workOrderNumber = await this.generateWorkOrderNumber(organizationId);

    return this.prisma.workOrder.create({
      data: {
        workOrderNumber,
        bomId: dto.bomId,
        quantity: dto.quantity,
        plannedStartDate: dto.plannedStartDate ? new Date(dto.plannedStartDate) : null,
        plannedEndDate: dto.plannedEndDate ? new Date(dto.plannedEndDate) : null,
        status: WorkOrderStatus.DRAFT,
        notes: dto.notes,
        organizationId,
      } as Prisma.WorkOrderUncheckedCreateInput,
      include: {
        bom: {
          include: {
            outputItem: { select: { id: true, name: true, sku: true } },
            items: { include: { item: { select: { id: true, name: true, sku: true } } } },
          },
        },
      },
    });
  }

  async findAll(
    organizationId: string,
    query: {
      page?: number | string;
      limit?: number | string;
      sortBy?: string;
      sortOrder?: string;
      status?: string;
      bomId?: string;
    },
  ) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const sortBy = query.sortBy || 'plannedStartDate';
    const sortOrder = query.sortOrder || 'asc';

    const where: Prisma.WorkOrderWhereInput = { organizationId, deletedAt: null };
    if (query.status) where.status = query.status as WorkOrderStatus;
    if (query.bomId) where.bomId = query.bomId;

    const [data, total] = await Promise.all([
      this.prisma.workOrder.findMany({
        where,
        include: {
          bom: {
            include: { outputItem: { select: { id: true, name: true, sku: true } } },
          },
        },
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.workOrder.count({ where }),
    ]);

    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(organizationId: string, id: string) {
    const workOrder = await this.prisma.workOrder.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: {
        bom: {
          include: {
            outputItem: true,
            items: { include: { item: true } },
          },
        },
      },
    });
    if (!workOrder) throw new NotFoundException('Work order not found');
    return workOrder;
  }

  async update(organizationId: string, id: string, dto: UpdateWorkOrderData) {
    const workOrder = await this.findOne(organizationId, id);
    if (
      workOrder.status === WorkOrderStatus.COMPLETED ||
      workOrder.status === WorkOrderStatus.CANCELLED
    ) {
      throw new BadRequestException('Cannot update completed or cancelled work order');
    }

    const data: Record<string, unknown> = { ...dto };
    if (dto.plannedStartDate) data.plannedStartDate = new Date(dto.plannedStartDate);
    if (dto.plannedEndDate) data.plannedEndDate = new Date(dto.plannedEndDate);

    return this.prisma.workOrder.update({
      where: { id },
      data: data as Prisma.WorkOrderUncheckedUpdateInput,
      include: {
        bom: {
          include: { outputItem: { select: { id: true, name: true, sku: true } } },
        },
      },
    });
  }

  async startWorkOrder(organizationId: string, id: string) {
    const workOrder = await this.findOne(organizationId, id);
    if (workOrder.status !== WorkOrderStatus.DRAFT) {
      throw new BadRequestException('Work order cannot be started');
    }

    // Check material availability
    const availability = await this.checkMaterialAvailability(organizationId, id);
    if (!availability.isAvailable) {
      throw new BadRequestException('Insufficient materials. Check material requirements.');
    }

    return this.prisma.workOrder.update({
      where: { id },
      data: {
        status: WorkOrderStatus.IN_PROCESS,
        actualStartDate: new Date(),
      },
    });
  }

  async checkMaterialAvailability(organizationId: string, id: string) {
    const workOrder = await this.findOne(organizationId, id);
    const bom = workOrder.bom;
    const outputQty = bom.outputQuantity;
    const plannedQty = workOrder.quantity;
    const multiplier = plannedQty / outputQty;

    const materials: Array<{
      item: Item;
      required: number;
      available: number;
      shortfall: number;
    }> = [];
    let isAvailable = true;

    for (const bomItem of bom.items) {
      const baseQty = parseFloat(bomItem.quantity.toString());
      const requiredQty = baseQty * multiplier;

      // Get current stock: sum IN movements, subtract OUT movements
      // Handles both old rows (negative qty, no movementType) and new rows (positive qty, movementType)
      const movements = await this.prisma.inventoryMovement.findMany({
        where: {
          itemId: bomItem.itemId,
          organizationId,
        },
        select: { quantity: true, movementType: true },
      });
      const currentStock = movements.reduce(
        (sum: number, m) => sum + signedMovementQuantity(m.quantity, m.movementType),
        0,
      );

      const shortfall = Math.max(0, requiredQty - currentStock);
      if (shortfall > 0) isAvailable = false;

      materials.push({
        item: bomItem.item,
        required: Math.ceil(requiredQty * 100) / 100,
        available: currentStock,
        shortfall,
      });
    }

    return { isAvailable, materials };
  }

  /**
   * Completes the work order, moves the stock and posts the COGM journal in one transaction.
   * The status change is a guarded transition and the journal is COGM:workOrderId through the
   * ledger command, so a repeated or concurrent completion posts and moves stock once, and a
   * locked period rejects the whole completion.
   */
  async completeWorkOrder(
    organizationId: string,
    id: string,
    dto: { quantityProduced: number; notes?: string },
  ) {
    const workOrder = await this.findOne(organizationId, id);
    if (workOrder.status !== WorkOrderStatus.IN_PROCESS) {
      throw new BadRequestException('Work order is not in process');
    }

    const quantityProduced = dto.quantityProduced;
    const completedDate = new Date();

    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.workOrder.updateMany({
        where: { id, organizationId, status: WorkOrderStatus.IN_PROCESS, deletedAt: null },
        data: {
          status: WorkOrderStatus.COMPLETED,
          completedDate,
          notes: dto.notes || workOrder.notes,
        },
      });
      if (count === 0) throw new ConflictException('Work order has already been completed');

      // Consume materials proportionally
      await this.consumeMaterials(tx, organizationId, workOrder, quantityProduced);

      // Add finished goods to inventory
      await this.addFinishedGoods(tx, organizationId, workOrder, quantityProduced);

      const journalId = await this.createCOGMJournal(
        tx,
        organizationId,
        workOrder,
        quantityProduced,
        completedDate,
      );

      return tx.workOrder.update({ where: { id }, data: { journalId } });
    });
  }

  /** Quantity of each BOM input consumed for `quantityProduced` outputs (4 dp, no integer rounding). */
  private materialQuantities(
    workOrder: WorkOrderWithBom,
    quantityProduced: number,
  ): { itemId: string; quantity: Decimal; costPrice: Decimal }[] {
    const bom = workOrder.bom;
    return bom.items.map((bomItem) => ({
      itemId: bomItem.itemId,
      quantity: new Decimal(bomItem.quantity)
        .mul(quantityProduced)
        .div(bom.outputQuantity)
        .toDecimalPlaces(QUANTITY_SCALE, Decimal.ROUND_HALF_UP),
      costPrice: new Decimal(bomItem.item?.costPrice ?? 0),
    }));
  }

  private async createCOGMJournal(
    tx: Prisma.TransactionClient,
    organizationId: string,
    workOrder: WorkOrderWithBom,
    quantityProduced: number,
    date: Date,
  ): Promise<string | null> {
    const bom = workOrder.bom;

    // Material cost, rounded per input line
    const totalMaterialCost = this.materialQuantities(workOrder, quantityProduced).reduce(
      (sum, m) => sum.add(round(m.costPrice.mul(m.quantity))),
      new Decimal(0),
    );

    // Add operations cost from BOM
    const operationsCost = new Decimal(bom.operationsCost ?? 0);
    const totalCOGM = totalMaterialCost.add(operationsCost);

    // If total COGM is zero, skip journal creation
    if (totalCOGM.isZero()) {
      return null;
    }

    // Find inventory accounts
    // Finished goods account (from output item or default ASSET inventory account)
    const outputItem = await tx.item.findFirst({
      where: { id: bom.outputItemId, organizationId },
      select: { inventoryAccountId: true },
    });

    const finishedGoodsAccount = outputItem?.inventoryAccountId
      ? await tx.account.findFirst({
          where: { id: outputItem.inventoryAccountId, organizationId, deletedAt: null },
        })
      : await tx.account.findFirst({
          where: {
            organizationId,
            type: 'ASSET',
            isActive: true,
            deletedAt: null,
            name: { contains: 'Inventory', mode: 'insensitive' },
          },
          orderBy: { code: 'asc' },
        });

    // Raw materials account (find a second inventory/asset account or use same)
    const rawMaterialsAccount = await tx.account.findFirst({
      where: {
        organizationId,
        type: 'ASSET',
        isActive: true,
        deletedAt: null,
        OR: [
          { name: { contains: 'Raw Material', mode: 'insensitive' } },
          { name: { contains: 'Inventory', mode: 'insensitive' } },
        ],
      },
      orderBy: { code: 'asc' },
    });

    if (!finishedGoodsAccount || !rawMaterialsAccount) {
      // Skip journal creation if accounts not configured
      return null;
    }

    // Manufacturing overhead absorbs the operations cost; without one it is credited to raw
    // materials together with the material cost.
    const overheadAccount = operationsCost.greaterThan(0)
      ? await tx.account.findFirst({
          where: {
            organizationId,
            type: 'EXPENSE',
            isActive: true,
            deletedAt: null,
            OR: [
              { name: { contains: 'Manufacturing', mode: 'insensitive' } },
              { name: { contains: 'Overhead', mode: 'insensitive' } },
            ],
          },
          orderBy: { code: 'asc' },
        })
      : null;
    const rawCredit = overheadAccount ? totalMaterialCost : totalCOGM;
    const ref = workOrder.workOrderNumber;

    const lines = [
      {
        accountId: finishedGoodsAccount.id,
        debit: totalCOGM.toFixed(4),
        credit: '0',
        description: `Finished goods - WO ${ref}`,
      },
      ...(rawCredit.greaterThan(0)
        ? [
            {
              accountId: rawMaterialsAccount.id,
              debit: '0',
              credit: rawCredit.toFixed(4),
              description: `Materials consumed - WO ${ref}`,
            },
          ]
        : []),
      ...(overheadAccount
        ? [
            {
              accountId: overheadAccount.id,
              debit: '0',
              credit: operationsCost.toFixed(4),
              description: `Manufacturing overhead - WO ${ref}`,
            },
          ]
        : []),
    ];

    const journal = await this.journalsService.create(
      organizationId,
      {
        date: date.toISOString(),
        reference: `COGM-${ref}`,
        notes: `Cost of Goods Manufactured - Work Order ${ref}`,
        lines,
      },
      { tx, source: { type: JournalSourceType.COGM, id: workOrder.id } },
    );
    return journal.id;
  }

  private async consumeMaterials(
    db: Prisma.TransactionClient,
    organizationId: string,
    workOrder: WorkOrderWithBom,
    quantityProduced: number,
  ) {
    const warehouseId = await this.defaultWarehouseId(db, organizationId);

    for (const material of this.materialQuantities(workOrder, quantityProduced)) {
      // Create OUT inventory movement (positive quantity, movementType carries direction)
      await db.inventoryMovement.create({
        data: {
          itemId: material.itemId,
          warehouseId,
          type: 'production',
          quantity: material.quantity,
          movementType: 'OUT',
          referenceType: 'workOrder',
          referenceId: workOrder.id,
          organizationId,
        },
      });
    }
  }

  private async addFinishedGoods(
    db: Prisma.TransactionClient,
    organizationId: string,
    workOrder: WorkOrderWithBom,
    quantityProduced: number,
  ) {
    const warehouseId = await this.defaultWarehouseId(db, organizationId);

    await db.inventoryMovement.create({
      data: {
        itemId: workOrder.bom.outputItemId,
        warehouseId,
        type: 'production',
        quantity: quantityProduced,
        movementType: 'IN',
        referenceType: 'workOrder',
        referenceId: workOrder.id,
        organizationId,
      },
    });
  }

  private async defaultWarehouseId(
    db: Prisma.TransactionClient,
    organizationId: string,
  ): Promise<string> {
    const defaultWarehouse = await db.warehouse.findFirst({
      where: { organizationId, isDefault: true },
    });
    if (!defaultWarehouse) {
      throw new BadRequestException('No default warehouse found');
    }
    return defaultWarehouse.id;
  }

  async cancelWorkOrder(organizationId: string, id: string, reason: string) {
    const workOrder = await this.findOne(organizationId, id);
    if (workOrder.status === WorkOrderStatus.COMPLETED) {
      throw new BadRequestException('Cannot cancel completed work order');
    }

    return this.prisma.workOrder.update({
      where: { id },
      data: {
        status: WorkOrderStatus.CANCELLED,
        notes: `${workOrder.notes || ''}\nCancelled: ${reason}`,
      },
    });
  }

  async recordProduction(
    organizationId: string,
    id: string,
    dto: {
      quantityProduced: number;
      quantityRejected?: number;
      wastageQuantity?: number;
      notes?: string;
      date?: string;
    },
  ) {
    const workOrder = await this.findOne(organizationId, id);
    if (workOrder.status !== WorkOrderStatus.IN_PROCESS) {
      throw new BadRequestException('Work order is not in process');
    }

    const quantityProduced = dto.quantityProduced;

    // Create ProductionEntry record
    const entry = await this.prisma.productionEntry.create({
      data: {
        workOrderId: id,
        date: dto.date ? new Date(dto.date) : new Date(),
        quantityProduced: Math.round(quantityProduced),
        quantityRejected: dto.quantityRejected ? Math.round(dto.quantityRejected) : 0,
        wastageQuantity: dto.wastageQuantity ? Math.round(dto.wastageQuantity) : 0,
        notes: dto.notes,
        organizationId,
      },
    });

    // Consume materials proportionally
    await this.consumeMaterials(this.prisma, organizationId, workOrder, quantityProduced);

    // Add finished goods to inventory
    await this.addFinishedGoods(this.prisma, organizationId, workOrder, quantityProduced);

    return entry;
  }

  async getProductionHistory(organizationId: string, id: string) {
    await this.findOne(organizationId, id);

    const entries = await this.prisma.productionEntry.findMany({
      where: { workOrderId: id, organizationId },
      orderBy: { createdAt: 'desc' },
    });

    return entries.map((e) => ({
      id: e.id,
      date: e.date,
      quantityProduced: parseFloat(e.quantityProduced.toString()),
      quantityRejected: parseFloat(e.quantityRejected.toString()),
      wastageQuantity: parseFloat(e.wastageQuantity.toString()),
      notes: e.notes,
      createdAt: e.createdAt,
    }));
  }

  async remove(organizationId: string, id: string) {
    const workOrder = await this.prisma.workOrder.findFirst({
      where: { id, organizationId },
    });
    if (!workOrder) throw new NotFoundException('Work order not found');
    if (workOrder.status !== WorkOrderStatus.DRAFT) {
      throw new BadRequestException('Only draft work orders can be deleted');
    }
    await this.prisma.workOrder.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return { message: 'Work order deleted' };
  }

  // === Bulk Operations ===

  async bulkDelete(organizationId: string, ids: string[]) {
    const result = await this.prisma.workOrder.updateMany({
      where: {
        id: { in: ids },
        organizationId,
        status: WorkOrderStatus.DRAFT,
        deletedAt: null,
      },
      data: { deletedAt: new Date() },
    });
    return { deleted: result.count, total: ids.length };
  }

  async bulkStart(organizationId: string, ids: string[]) {
    const result = await this.prisma.workOrder.updateMany({
      where: {
        id: { in: ids },
        organizationId,
        status: WorkOrderStatus.DRAFT,
      },
      data: { status: WorkOrderStatus.IN_PROCESS, actualStartDate: new Date() },
    });
    return { started: result.count, total: ids.length };
  }

  async bulkComplete(organizationId: string, ids: string[]) {
    const result = await this.prisma.workOrder.updateMany({
      where: {
        id: { in: ids },
        organizationId,
        status: WorkOrderStatus.IN_PROCESS,
      },
      data: { status: WorkOrderStatus.COMPLETED, completedDate: new Date() },
    });
    return { completed: result.count, total: ids.length };
  }

  async bulkCancel(organizationId: string, ids: string[]) {
    const result = await this.prisma.workOrder.updateMany({
      where: {
        id: { in: ids },
        organizationId,
        status: { in: [WorkOrderStatus.DRAFT, WorkOrderStatus.IN_PROCESS] },
      },
      data: { status: WorkOrderStatus.CANCELLED },
    });
    return { cancelled: result.count, total: ids.length };
  }

  async getStats(organizationId: string) {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [statusCounts, activeBoms, completedThisMonth] = await Promise.all([
      this.prisma.workOrder.groupBy({
        by: ['status'],
        where: { organizationId, deletedAt: null },
        _count: { id: true },
      }),
      this.prisma.bOM.count({
        where: { organizationId, isActive: true, deletedAt: null },
      }),
      this.prisma.workOrder.count({
        where: {
          organizationId,
          status: WorkOrderStatus.COMPLETED,
          completedDate: { gte: startOfMonth },
        },
      }),
    ]);

    const counts = Object.fromEntries(statusCounts.map((s) => [s.status, s._count.id]));

    return {
      active: counts['IN_PROCESS'] || 0,
      draft: counts['DRAFT'] || 0,
      activeBoms,
      completedThisMonth,
    };
  }

  private async generateWorkOrderNumber(organizationId: string): Promise<string> {
    const last = await this.prisma.workOrder.findFirst({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      select: { workOrderNumber: true },
    });
    if (!last) return 'WO-001';
    const num = parseInt(last.workOrderNumber.split('-')[1], 10);
    return `WO-${String(num + 1).padStart(3, '0')}`;
  }
}
