import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class InventoryLevelsService {
  constructor(private prisma: PrismaService) {}

  async findAll(
    organizationId: string,
    filters?: { itemId?: string; warehouseId?: string },
  ): Promise<{
    data: Awaited<ReturnType<typeof this.prisma.inventoryLevel.findMany>>;
  }> {
    const where: Prisma.InventoryLevelWhereInput = { organizationId };
    if (filters?.itemId) where.itemId = filters.itemId;
    if (filters?.warehouseId) where.warehouseId = filters.warehouseId;

    const levels = await this.prisma.inventoryLevel.findMany({
      where,
      include: {
        item: { select: { id: true, name: true, sku: true, unit: true } },
        warehouse: { select: { id: true, name: true, code: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
    return { data: levels };
  }

  async findByItem(
    organizationId: string,
    itemId: string,
  ): Promise<{
    data: Awaited<ReturnType<typeof this.prisma.inventoryLevel.findMany>>;
  }> {
    const levels = await this.prisma.inventoryLevel.findMany({
      where: { organizationId, itemId },
      include: {
        warehouse: { select: { id: true, name: true, code: true } },
      },
    });
    return { data: levels };
  }
}
