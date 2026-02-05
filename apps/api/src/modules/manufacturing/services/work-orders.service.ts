import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { WorkOrderStatus } from '@prisma/client';

@Injectable()
export class WorkOrdersService {
  constructor(private prisma: PrismaService) {}

  async create(organizationId: string, dto: any) {
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
    const where: any = { organizationId };
    if (query.status) where.status = query.status;
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
      where: { id, organizationId },
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

  async update(organizationId: string, id: string, dto: any) {
    const workOrder = await this.findOne(organizationId, id);
    if (workOrder.status === WorkOrderStatus.COMPLETED || workOrder.status === WorkOrderStatus.CANCELLED) {
      throw new BadRequestException('Cannot update completed or cancelled work order');
    }

    const data: any = { ...dto };
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
      item: any;
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
      const currentStock = movements.reduce((sum: number, m: { quantity: number }) => sum + m.quantity, 0);

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

  async completeWorkOrder(organizationId: string, id: string, dto: { quantityProduced: number; notes?: string }) {
    const workOrder = await this.findOne(organizationId, id);
    if (workOrder.status !== WorkOrderStatus.IN_PROCESS) {
      throw new BadRequestException('Work order is not in process');
    }

    const quantityProduced = dto.quantityProduced;

    // Consume materials proportionally
    await this.consumeMaterials(organizationId, workOrder, quantityProduced);

    // Add finished goods to inventory
    await this.addFinishedGoods(organizationId, workOrder, quantityProduced);

    // Update work order as completed
    return this.prisma.workOrder.update({
      where: { id },
      data: {
        status: WorkOrderStatus.COMPLETED,
        completedDate: new Date(),
        notes: dto.notes || workOrder.notes,
      },
    });
  }

  private async consumeMaterials(organizationId: string, workOrder: any, quantityProduced: number) {
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

  private async addFinishedGoods(organizationId: string, workOrder: any, quantityProduced: number) {
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

  async recordProduction(organizationId: string, id: string, dto: { quantityProduced: number; notes?: string }) {
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
    const consumed = movements.filter((m) => m.quantity < 0);
    const produced = movements.filter((m) => m.quantity > 0);

    return {
      workOrderId: id,
      workOrderNumber: workOrder.workOrderNumber,
      status: workOrder.status,
      consumed: consumed.map((m) => ({
        item: m.item,
        warehouse: m.warehouse,
        quantity: Math.abs(m.quantity),
        date: m.createdAt,
      })),
      produced: produced.map((m) => ({
        item: m.item,
        warehouse: m.warehouse,
        quantity: m.quantity,
        date: m.createdAt,
      })),
      totalProduced: produced.reduce((sum, m) => sum + m.quantity, 0),
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
