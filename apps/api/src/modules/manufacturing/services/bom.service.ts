import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class BomService {
  constructor(private prisma: PrismaService) {}

  async create(organizationId: string, dto: any) {
    // Verify output item exists
    const outputItem = await this.prisma.item.findFirst({
      where: { id: dto.outputItemId, organizationId },
    });
    if (!outputItem) throw new NotFoundException('Output item not found');

    // Check for existing active BOM for this item
    if (dto.isActive) {
      const existing = await this.prisma.bOM.findFirst({
        where: { outputItemId: dto.outputItemId, organizationId, isActive: true },
      });
      if (existing) {
        throw new BadRequestException('An active BOM already exists for this item');
      }
    }

    // Validate components
    for (const component of dto.components || []) {
      const item = await this.prisma.item.findFirst({
        where: { id: component.itemId, organizationId },
      });
      if (!item) throw new BadRequestException(`Component item ${component.itemId} not found`);
      if (component.itemId === dto.outputItemId) {
        throw new BadRequestException('Output item cannot be a component of itself');
      }
    }

    return this.prisma.bOM.create({
      data: {
        name: dto.name,
        outputItemId: dto.outputItemId,
        outputQuantity: dto.outputQuantity || 1,
        operationsCost: dto.operationsCost ? new Decimal(dto.operationsCost) : new Decimal(0),
        isActive: dto.isActive ?? true,
        organizationId,
        items: {
          create: (dto.components || []).map((c: any) => ({
            itemId: c.itemId,
            quantity: new Decimal(c.quantity),
          })),
        },
      },
      include: {
        outputItem: { select: { id: true, name: true, sku: true } },
        items: { include: { item: { select: { id: true, name: true, sku: true } } } },
      },
    });
  }

  async findAll(organizationId: string, query: { itemId?: string; isActive?: boolean }) {
    const where: any = { organizationId };
    if (query.itemId) where.outputItemId = query.itemId;
    if (query.isActive !== undefined) where.isActive = query.isActive;

    return this.prisma.bOM.findMany({
      where,
      include: {
        outputItem: { select: { id: true, name: true, sku: true } },
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(organizationId: string, id: string) {
    const bom = await this.prisma.bOM.findFirst({
      where: { id, organizationId },
      include: {
        outputItem: true,
        items: {
          include: { item: true },
        },
      },
    });
    if (!bom) throw new NotFoundException('BOM not found');
    return bom;
  }

  async update(organizationId: string, id: string, dto: any) {
    const existing = await this.findOne(organizationId, id);

    // If setting as active, deactivate other BOMs for same item
    if (dto.isActive) {
      await this.prisma.bOM.updateMany({
        where: { outputItemId: existing.outputItemId, organizationId, isActive: true, id: { not: id } },
        data: { isActive: false },
      });
    }

    const data: any = { ...dto };
    delete data.components;
    if (dto.operationsCost !== undefined) data.operationsCost = new Decimal(dto.operationsCost);

    // Update components if provided
    if (dto.components) {
      await this.prisma.bOMItem.deleteMany({ where: { bomId: id } });
      await this.prisma.bOMItem.createMany({
        data: dto.components.map((c: any) => ({
          bomId: id,
          itemId: c.itemId,
          quantity: new Decimal(c.quantity),
        })),
      });
    }

    return this.prisma.bOM.update({
      where: { id },
      data,
      include: {
        outputItem: { select: { id: true, name: true, sku: true } },
        items: { include: { item: { select: { id: true, name: true, sku: true } } } },
      },
    });
  }

  async remove(organizationId: string, id: string) {
    const bom = await this.prisma.bOM.findFirst({
      where: { id, organizationId },
      include: { workOrders: { take: 1 } },
    });
    if (!bom) throw new NotFoundException('BOM not found');
    if (bom.workOrders.length > 0) {
      throw new BadRequestException('Cannot delete BOM with existing work orders');
    }

    await this.prisma.bOMItem.deleteMany({ where: { bomId: id } });
    await this.prisma.bOM.delete({ where: { id } });
    return { message: 'BOM deleted' };
  }

  async calculateMaterialRequirements(organizationId: string, bomId: string, quantity: number) {
    const bom = await this.findOne(organizationId, bomId);
    const outputQty = bom.outputQuantity;
    const multiplier = quantity / outputQty;

    const requirements: Array<{
      item: any;
      requiredQuantity: number;
      currentStock: number;
      shortfall: number;
    }> = [];

    for (const bomItem of bom.items) {
      const baseQty = parseFloat(bomItem.quantity.toString());
      const requiredQty = baseQty * multiplier;

      // Get current stock
      const stockMovements = await this.prisma.inventoryMovement.findMany({
        where: { itemId: bomItem.itemId, organizationId },
      });
      const currentStock = stockMovements.reduce((sum: number, m) => sum + parseFloat(m.quantity.toString()), 0);

      requirements.push({
        item: bomItem.item,
        requiredQuantity: Math.ceil(requiredQty * 100) / 100,
        currentStock,
        shortfall: Math.max(0, requiredQty - currentStock),
      });
    }

    return {
      bom: { id: bom.id, name: bom.name, outputItem: bom.outputItem },
      outputQuantity: quantity,
      requirements,
      hasShortfall: requirements.some((r) => r.shortfall > 0),
    };
  }

  async duplicate(organizationId: string, id: string, newName?: string) {
    const original = await this.findOne(organizationId, id);

    return this.prisma.bOM.create({
      data: {
        name: newName || `${original.name} (Copy)`,
        outputItemId: original.outputItemId,
        outputQuantity: original.outputQuantity,
        operationsCost: original.operationsCost,
        isActive: false,
        organizationId,
        items: {
          create: original.items.map((bomItem: { itemId: string; quantity: Decimal }) => ({
            itemId: bomItem.itemId,
            quantity: bomItem.quantity,
          })),
        },
      },
      include: {
        outputItem: { select: { id: true, name: true, sku: true } },
        items: { include: { item: { select: { id: true, name: true, sku: true } } } },
      },
    });
  }
}
