import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class CostingService {
  constructor(private prisma: PrismaService) {}

  /**
   * Add a new FIFO cost layer when inventory comes in (purchase, production, adjustment, opening).
   */
  async addCostLayer(
    organizationId: string,
    itemId: string,
    warehouseId: string,
    quantity: Decimal | number,
    costPerUnit: Decimal | number,
    referenceType?: string,
    referenceId?: string,
  ) {
    const qty = new Decimal(quantity.toString());
    const cost = new Decimal(costPerUnit.toString());

    if (qty.lte(0)) return null;

    return this.prisma.inventoryCostLayer.create({
      data: {
        itemId,
        warehouseId,
        quantity: qty,
        originalQty: qty,
        costPerUnit: cost,
        referenceType,
        referenceId,
        organizationId,
      },
    });
  }

  /**
   * Consume inventory using FIFO method. Returns total cost consumed (for COGS calculation).
   * Deducts from oldest cost layers first.
   */
  async consumeFIFO(
    organizationId: string,
    itemId: string,
    warehouseId: string,
    quantity: Decimal | number,
  ): Promise<{ totalCost: Decimal; layersConsumed: number }> {
    const qty = new Decimal(quantity.toString());
    let remaining = qty;
    let totalCost = new Decimal(0);
    let layersConsumed = 0;

    // Fetch layers with remaining quantity, oldest first (FIFO)
    const layers = await this.prisma.inventoryCostLayer.findMany({
      where: {
        organizationId,
        itemId,
        warehouseId,
        quantity: { gt: new Decimal(0) },
      },
      orderBy: { createdAt: 'asc' },
    });

    for (const layer of layers) {
      if (remaining.lte(0)) break;

      const layerQty = layer.quantity;

      if (layerQty.lte(remaining)) {
        // Consume entire layer
        totalCost = totalCost.add(layerQty.mul(layer.costPerUnit));
        remaining = remaining.sub(layerQty);
        layersConsumed++;

        await this.prisma.inventoryCostLayer.update({
          where: { id: layer.id },
          data: { quantity: new Decimal(0) },
        });
      } else {
        // Partially consume layer
        totalCost = totalCost.add(remaining.mul(layer.costPerUnit));
        layersConsumed++;

        await this.prisma.inventoryCostLayer.update({
          where: { id: layer.id },
          data: { quantity: layerQty.sub(remaining) },
        });
        remaining = new Decimal(0);
      }
    }

    return { totalCost, layersConsumed };
  }

  /**
   * Get the total FIFO inventory valuation for an item (or all items).
   */
  async getInventoryValuation(
    organizationId: string,
    itemId?: string,
  ): Promise<{
    totalValue: Decimal;
    items: Array<{
      itemId: string;
      itemName: string;
      sku: string;
      totalQuantity: number;
      totalValue: number;
      avgCostPerUnit: number;
    }>;
  }> {
    const where: { organizationId: string; itemId?: string; quantity: { gt: Decimal } } = {
      organizationId,
      quantity: { gt: new Decimal(0) },
    };
    if (itemId) where.itemId = itemId;

    const layers = await this.prisma.inventoryCostLayer.findMany({
      where,
      include: { item: { select: { id: true, name: true, sku: true } } },
      orderBy: [{ itemId: 'asc' }, { createdAt: 'asc' }],
    });

    // Group by item
    const itemMap = new Map<string, {
      itemName: string;
      sku: string;
      totalQuantity: Decimal;
      totalValue: Decimal;
    }>();

    for (const layer of layers) {
      const existing = itemMap.get(layer.itemId);
      const layerValue = layer.quantity.mul(layer.costPerUnit);

      if (existing) {
        existing.totalQuantity = existing.totalQuantity.add(layer.quantity);
        existing.totalValue = existing.totalValue.add(layerValue);
      } else {
        itemMap.set(layer.itemId, {
          itemName: layer.item.name,
          sku: layer.item.sku,
          totalQuantity: layer.quantity,
          totalValue: layerValue,
        });
      }
    }

    let totalValue = new Decimal(0);
    const items: Array<{
      itemId: string;
      itemName: string;
      sku: string;
      totalQuantity: number;
      totalValue: number;
      avgCostPerUnit: number;
    }> = [];

    for (const [id, data] of itemMap) {
      totalValue = totalValue.add(data.totalValue);
      const qty = parseFloat(data.totalQuantity.toString());
      const val = parseFloat(data.totalValue.toString());
      items.push({
        itemId: id,
        itemName: data.itemName,
        sku: data.sku,
        totalQuantity: qty,
        totalValue: val,
        avgCostPerUnit: qty > 0 ? val / qty : 0,
      });
    }

    return { totalValue, items };
  }

  /**
   * Get the current weighted average cost for an item from remaining FIFO layers.
   */
  async getItemCost(
    organizationId: string,
    itemId: string,
    warehouseId?: string,
  ): Promise<{ avgCostPerUnit: Decimal; totalQuantity: Decimal; totalValue: Decimal }> {
    const where: { organizationId: string; itemId: string; warehouseId?: string; quantity: { gt: Decimal } } = {
      organizationId,
      itemId,
      quantity: { gt: new Decimal(0) },
    };
    if (warehouseId) where.warehouseId = warehouseId;

    const layers = await this.prisma.inventoryCostLayer.findMany({ where });

    let totalQuantity = new Decimal(0);
    let totalValue = new Decimal(0);

    for (const layer of layers) {
      totalQuantity = totalQuantity.add(layer.quantity);
      totalValue = totalValue.add(layer.quantity.mul(layer.costPerUnit));
    }

    const avgCostPerUnit = totalQuantity.gt(0)
      ? totalValue.div(totalQuantity)
      : new Decimal(0);

    return { avgCostPerUnit, totalQuantity, totalValue };
  }
}
