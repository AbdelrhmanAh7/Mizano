import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Item, Prisma, WorkOrderStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../../../prisma/prisma.service';

interface CreateWorkOrderData {
  bomId: string;
  quantity: number;
  plannedStartDate?: string;
  notes?: string;
}

interface UpdateWorkOrderData {
  quantity?: number;
  plannedStartDate?: string;
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
  constructor(private prisma: PrismaService) {}

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
        status: WorkOrderStatus.DRAFT,
        notes: dto.notes,
        organizationId,
      },
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

  async findAll(organizationId: string, query: { status?: string; bomId?: string }) {
    const where: Prisma.WorkOrderWhereInput = { organizationId, deletedAt: null };
    if (query.status) where.status = query.status as WorkOrderStatus;
    if (query.bomId) where.bomId = query.bomId;

    return this.prisma.workOrder.findMany({
      where,
      include: {
        bom: {
          include: { outputItem: { select: { id: true, name: true, sku: true } } },
        },
      },
      orderBy: { plannedStartDate: 'asc' },
    });
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

    const data: Prisma.WorkOrderUncheckedUpdateInput = { ...dto };
    if (dto.plannedStartDate) data.plannedStartDate = new Date(dto.plannedStartDate);

    return this.prisma.workOrder.update({
      where: { id },
      data,
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

      // Get current stock
      const movements = await this.prisma.inventoryMovement.findMany({
        where: {
          itemId: bomItem.itemId,
          organizationId,
        },
      });
      const currentStock = movements.reduce(
        (sum: number, m) => sum + parseFloat(m.quantity.toString()),
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

    // Consume materials proportionally
    await this.consumeMaterials(organizationId, workOrder, quantityProduced);

    // Add finished goods to inventory
    await this.addFinishedGoods(organizationId, workOrder, quantityProduced);

    // Create COGM journal entry
    const journalId = await this.createCOGMJournal(organizationId, workOrder, quantityProduced);

    // Update work order as completed
    return this.prisma.workOrder.update({
      where: { id },
      data: {
        status: WorkOrderStatus.COMPLETED,
        completedDate: new Date(),
        notes: dto.notes || workOrder.notes,
        journalId,
      },
    });
  }

  private async createCOGMJournal(
    organizationId: string,
    workOrder: WorkOrderWithBom,
    quantityProduced: number,
  ): Promise<string | null> {
    const bom = workOrder.bom;
    const outputQty = bom.outputQuantity;
    const multiplier = quantityProduced / outputQty;

    // Calculate total material cost
    let totalMaterialCost = new Decimal(0);
    for (const bomItem of bom.items) {
      const baseQty = parseFloat(bomItem.quantity.toString());
      const consumeQty = Math.round(baseQty * multiplier);
      const costPrice = bomItem.item?.costPrice
        ? new Decimal(bomItem.item.costPrice.toString())
        : new Decimal(0);
      totalMaterialCost = totalMaterialCost.add(costPrice.mul(consumeQty));
    }

    // Add operations cost from BOM
    const operationsCost = bom.operationsCost
      ? new Decimal(bom.operationsCost.toString())
      : new Decimal(0);
    const totalCOGM = totalMaterialCost.add(operationsCost);

    // If total COGM is zero, skip journal creation
    if (totalCOGM.equals(0)) {
      return null;
    }

    // Find inventory accounts
    // Finished goods account (from output item or default ASSET inventory account)
    const outputItem = await this.prisma.item.findFirst({
      where: { id: bom.outputItemId, organizationId },
      select: { inventoryAccountId: true },
    });

    const finishedGoodsAccount = outputItem?.inventoryAccountId
      ? await this.prisma.account.findFirst({
          where: { id: outputItem.inventoryAccountId, organizationId },
        })
      : await this.prisma.account.findFirst({
          where: {
            organizationId,
            type: 'ASSET',
            isActive: true,
            name: { contains: 'Inventory', mode: 'insensitive' },
          },
        });

    // Raw materials account (find a second inventory/asset account or use same)
    const rawMaterialsAccount = await this.prisma.account.findFirst({
      where: {
        organizationId,
        type: 'ASSET',
        isActive: true,
        OR: [
          { name: { contains: 'Raw Material', mode: 'insensitive' } },
          { name: { contains: 'Inventory', mode: 'insensitive' } },
        ],
      },
    });

    if (!finishedGoodsAccount || !rawMaterialsAccount) {
      // Skip journal creation if accounts not configured
      return null;
    }

    return this.prisma.$transaction(async (tx) => {
      const journalNumber = await this.generateJournalNumberTx(tx, organizationId);

      const journalLines: Array<{
        accountId: string;
        debit: Decimal;
        credit: Decimal;
        description: string;
      }> = [];

      // Debit: Finished Goods Inventory (total COGM)
      journalLines.push({
        accountId: finishedGoodsAccount.id,
        debit: totalCOGM,
        credit: new Decimal(0),
        description: `Finished goods - WO ${workOrder.workOrderNumber}`,
      });

      // Credit: Raw Materials Inventory (material cost)
      if (totalMaterialCost.greaterThan(0)) {
        journalLines.push({
          accountId: rawMaterialsAccount.id,
          debit: new Decimal(0),
          credit: totalMaterialCost,
          description: `Materials consumed - WO ${workOrder.workOrderNumber}`,
        });
      }

      // Credit: Manufacturing Overhead (operations cost) if > 0
      if (operationsCost.greaterThan(0)) {
        const overheadAccount = await tx.account.findFirst({
          where: {
            organizationId,
            type: 'EXPENSE',
            isActive: true,
            OR: [
              { name: { contains: 'Manufacturing', mode: 'insensitive' } },
              { name: { contains: 'Overhead', mode: 'insensitive' } },
            ],
          },
        });

        if (overheadAccount) {
          journalLines.push({
            accountId: overheadAccount.id,
            debit: new Decimal(0),
            credit: operationsCost,
            description: `Manufacturing overhead - WO ${workOrder.workOrderNumber}`,
          });
        } else {
          // Credit operations cost to raw materials account as fallback
          journalLines[1].credit = journalLines[1].credit.add(operationsCost);
        }
      }

      const journal = await tx.journal.create({
        data: {
          journalNumber,
          date: new Date(),
          reference: `COGM-${workOrder.workOrderNumber}`,
          notes: `Cost of Goods Manufactured - Work Order ${workOrder.workOrderNumber}`,
          isPosted: true,
          organizationId,
          lines: { create: journalLines },
        },
      });

      return journal.id;
    });
  }

  private async generateJournalNumberTx(
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

  private async consumeMaterials(
    organizationId: string,
    workOrder: WorkOrderWithBom,
    quantityProduced: number,
  ) {
    const bom = workOrder.bom;
    const outputQty = bom.outputQuantity;
    const multiplier = quantityProduced / outputQty;

    // Get default warehouse
    const defaultWarehouse = await this.prisma.warehouse.findFirst({
      where: { organizationId, isDefault: true },
    });
    const warehouseId = defaultWarehouse?.id;

    if (!warehouseId) {
      throw new BadRequestException('No default warehouse found');
    }

    for (const bomItem of bom.items) {
      const baseQty = parseFloat(bomItem.quantity.toString());
      const consumeQty = Math.round(baseQty * multiplier);

      // Create negative inventory movement
      await this.prisma.inventoryMovement.create({
        data: {
          itemId: bomItem.itemId,
          warehouseId,
          type: 'production',
          quantity: -consumeQty,
          referenceType: 'workOrder',
          referenceId: workOrder.id,
          organizationId,
        },
      });
    }
  }

  private async addFinishedGoods(
    organizationId: string,
    workOrder: WorkOrderWithBom,
    quantityProduced: number,
  ) {
    // Get default warehouse
    const defaultWarehouse = await this.prisma.warehouse.findFirst({
      where: { organizationId, isDefault: true },
    });
    const warehouseId = defaultWarehouse?.id;

    if (!warehouseId) {
      throw new BadRequestException('No default warehouse found');
    }

    await this.prisma.inventoryMovement.create({
      data: {
        itemId: workOrder.bom.outputItemId,
        warehouseId,
        type: 'production',
        quantity: quantityProduced,
        referenceType: 'workOrder',
        referenceId: workOrder.id,
        organizationId,
      },
    });
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
    dto: { quantityProduced: number; notes?: string },
  ) {
    const workOrder = await this.findOne(organizationId, id);
    if (workOrder.status !== WorkOrderStatus.IN_PROCESS) {
      throw new BadRequestException('Work order is not in process');
    }

    const quantityProduced = dto.quantityProduced;

    // Consume materials proportionally
    await this.consumeMaterials(organizationId, workOrder, quantityProduced);

    // Add finished goods to inventory
    await this.addFinishedGoods(organizationId, workOrder, quantityProduced);

    // Update work order notes with production entry
    const timestamp = new Date().toISOString();
    const productionNote = `[${timestamp}] Produced: ${quantityProduced} units${dto.notes ? ' - ' + dto.notes : ''}`;

    return this.prisma.workOrder.update({
      where: { id },
      data: {
        notes: workOrder.notes ? `${workOrder.notes}\n${productionNote}` : productionNote,
      },
      include: {
        bom: {
          include: { outputItem: { select: { id: true, name: true, sku: true } } },
        },
      },
    });
  }

  async getProductionHistory(organizationId: string, id: string) {
    const workOrder = await this.findOne(organizationId, id);

    // Get all inventory movements related to this work order
    const movements = await this.prisma.inventoryMovement.findMany({
      where: {
        organizationId,
        referenceType: 'workOrder',
        referenceId: id,
      },
      include: {
        item: { select: { id: true, name: true, sku: true } },
        warehouse: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Separate consumed materials and produced goods
    const consumed = movements.filter((m) => parseFloat(m.quantity.toString()) < 0);
    const produced = movements.filter((m) => parseFloat(m.quantity.toString()) > 0);

    return {
      workOrderId: id,
      workOrderNumber: workOrder.workOrderNumber,
      status: workOrder.status,
      consumed: consumed.map((m) => ({
        item: m.item,
        warehouse: m.warehouse,
        quantity: Math.abs(parseFloat(m.quantity.toString())),
        date: m.createdAt,
      })),
      produced: produced.map((m) => ({
        item: m.item,
        warehouse: m.warehouse,
        quantity: parseFloat(m.quantity.toString()),
        date: m.createdAt,
      })),
      totalProduced: produced.reduce((sum, m) => sum + parseFloat(m.quantity.toString()), 0),
    };
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
