import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';
import { cursorPaginate } from '../../../common/utils/cursor-paginate';
import { Decimal } from '@prisma/client/runtime/library';
import {
  AssembleCompositeItemDto,
  CompositeItemComponentDto,
  CreateCompositeItemDto,
  UpdateCompositeItemDto,
} from '../dto/composite-item.dto';

@Injectable()
export class CompositeItemsService {
  constructor(private prisma: PrismaService) {}

  async create(organizationId: string, dto: CreateCompositeItemDto) {
    const existing = await this.prisma.compositeItem.findFirst({
      where: { sku: dto.sku, organizationId },
    });
    if (existing) throw new BadRequestException('SKU already exists for a composite item');

    await this.assertComponentsInOrg(organizationId, dto.components);

    return this.prisma.compositeItem.create({
      data: {
        name: dto.name,
        sku: dto.sku,
        sellingPrice: new Decimal(dto.sellingPrice ?? '0'),
        description: dto.description,
        organizationId,
        components: {
          create: dto.components.map((comp) => ({
            itemId: comp.itemId,
            quantity: comp.quantity,
          })),
        },
      },
      include: {
        components: {
          include: {
            item: {
              select: {
                id: true,
                name: true,
                sku: true,
                unit: true,
                costPrice: true,
                currentStock: true,
              },
            },
          },
        },
      },
    });
  }

  /**
   * A bundle may only hold the tenant's own live items, each once: another organization's item
   * id is reported as not found, exactly like an unknown one.
   */
  private async assertComponentsInOrg(
    organizationId: string,
    components: CompositeItemComponentDto[],
  ): Promise<void> {
    const ids = components.map((comp) => comp.itemId);
    const unique = [...new Set(ids)];
    if (unique.length !== ids.length) {
      throw new BadRequestException('Each item can appear only once in a composite item');
    }
    const found = await this.prisma.item.findMany({
      where: { id: { in: unique }, organizationId, deletedAt: null },
      select: { id: true },
    });
    const foundIds = new Set(found.map((item) => item.id));
    const missing = unique.find((id) => !foundIds.has(id));
    if (missing) throw new NotFoundException(`Component item ${missing} not found`);
  }

  private static readonly ALLOWED_SORT_FIELDS = ['id', 'name', 'sku', 'createdAt', 'updatedAt'];

  async findAllCursor(organizationId: string, query: CursorPaginationDto) {
    const { cursor, take, search, sortOrder = 'asc' } = query;
    const sortBy = CompositeItemsService.ALLOWED_SORT_FIELDS.includes(query.sortBy || '')
      ? query.sortBy!
      : 'name';
    const where: Prisma.CompositeItemWhereInput = { organizationId };
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
      ];
    }
    return cursorPaginate(
      this.prisma.compositeItem,
      where,
      { [sortBy]: sortOrder },
      {
        cursor,
        take,
        include: {
          components: {
            include: { item: { select: { id: true, name: true, sku: true } } },
          },
        },
      },
    );
  }

  async findAll(organizationId: string, query: PaginationDto) {
    const { page = 1, limit = 20, search, sortBy = 'name', sortOrder = 'asc' } = query;
    const where: Prisma.CompositeItemWhereInput = { organizationId };
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.compositeItem.findMany({
        where,
        include: {
          components: {
            include: { item: { select: { id: true, name: true, sku: true } } },
          },
        },
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.compositeItem.count({ where }),
    ]);

    return { data: items, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(organizationId: string, id: string) {
    const item = await this.prisma.compositeItem.findFirst({
      where: { id, organizationId },
      include: {
        components: {
          include: {
            item: {
              select: {
                id: true,
                name: true,
                sku: true,
                unit: true,
                costPrice: true,
                currentStock: true,
              },
            },
          },
        },
      },
    });
    if (!item) throw new NotFoundException('Composite item not found');
    return item;
  }

  async update(organizationId: string, id: string, dto: UpdateCompositeItemDto) {
    await this.findOne(organizationId, id);

    if (dto.sku) {
      const existing = await this.prisma.compositeItem.findFirst({
        where: { sku: dto.sku, organizationId, id: { not: id } },
      });
      if (existing) throw new BadRequestException('SKU already exists');
    }

    if (dto.components) await this.assertComponentsInOrg(organizationId, dto.components);

    // Explicit fields only. Required columns ignore `null`; a new component list replaces the
    // old one in the same transaction, so a failed update never leaves the bundle empty.
    const data: Prisma.CompositeItemUpdateInput = {};
    if (dto.name != null) data.name = dto.name;
    if (dto.sku != null) data.sku = dto.sku;
    if (dto.sellingPrice != null) data.sellingPrice = new Decimal(dto.sellingPrice);
    if (dto.description !== undefined) data.description = dto.description;
    const components = dto.components;
    if (components) {
      data.components = {
        create: components.map((comp) => ({ itemId: comp.itemId, quantity: comp.quantity })),
      };
    }

    return this.prisma.$transaction(async (tx) => {
      if (components) {
        await tx.compositeItemComponent.deleteMany({ where: { compositeItemId: id } });
      }
      return tx.compositeItem.update({
        where: { id },
        data,
        include: {
          components: {
            include: {
              item: {
                select: {
                  id: true,
                  name: true,
                  sku: true,
                  unit: true,
                  costPrice: true,
                  currentStock: true,
                },
              },
            },
          },
        },
      });
    });
  }

  async remove(organizationId: string, id: string) {
    await this.findOne(organizationId, id);
    await this.prisma.compositeItemComponent.deleteMany({ where: { compositeItemId: id } });
    await this.prisma.compositeItem.delete({ where: { id } });
    return { message: 'Composite item deleted' };
  }

  /**
   * Check if all component items have sufficient stock to assemble the given quantity.
   */
  async checkAvailability(organizationId: string, id: string, quantity = 1) {
    const composite = await this.findOne(organizationId, id);

    const components: Array<{
      item: { id: string; name: string; sku: string };
      required: number;
      available: number;
      shortfall: number;
    }> = [];
    let isAvailable = true;

    for (const comp of composite.components) {
      const required = comp.quantity * quantity;
      const available = comp.item.currentStock;
      const shortfall = Math.max(0, required - available);
      if (shortfall > 0) isAvailable = false;

      components.push({
        item: { id: comp.item.id, name: comp.item.name, sku: comp.item.sku },
        required,
        available,
        shortfall,
      });
    }

    return { isAvailable, quantity, components };
  }

  /**
   * Calculate the cost of a composite item as the sum of component costs.
   */
  async calculateCost(organizationId: string, id: string) {
    const composite = await this.findOne(organizationId, id);

    let totalCost = new Decimal(0);
    const breakdown: Array<{
      itemId: string;
      itemName: string;
      quantity: number;
      costPerUnit: number;
      lineCost: number;
    }> = [];

    for (const comp of composite.components) {
      const costPerUnit = parseFloat(comp.item.costPrice.toString());
      const lineCost = costPerUnit * comp.quantity;
      totalCost = totalCost.add(new Decimal(lineCost));

      breakdown.push({
        itemId: comp.item.id,
        itemName: comp.item.name,
        quantity: comp.quantity,
        costPerUnit,
        lineCost,
      });
    }

    return {
      compositeItemId: id,
      name: composite.name,
      totalCost: parseFloat(totalCost.toString()),
      breakdown,
    };
  }

  /**
   * Assemble a composite item by consuming component stock.
   * Creates OUT inventory movements for each component.
   */
  async assemble(organizationId: string, id: string, dto: AssembleCompositeItemDto) {
    const composite = await this.findOne(organizationId, id);
    const { quantity, warehouseId } = dto;

    // Validate warehouse
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id: warehouseId, organizationId, deletedAt: null },
    });
    if (!warehouse) throw new NotFoundException('Warehouse not found');

    // Check availability
    const availability = await this.checkAvailability(organizationId, id, quantity);
    if (!availability.isAvailable) {
      throw new BadRequestException('Insufficient component stock to assemble bundle');
    }

    // Consume component stock
    return this.prisma.$transaction(async (tx) => {
      for (const comp of composite.components) {
        const consumeQty = comp.quantity * quantity;

        // Create OUT movement for each component
        await tx.inventoryMovement.create({
          data: {
            itemId: comp.itemId,
            warehouseId,
            quantity: new Decimal(consumeQty),
            type: 'assembly',
            movementType: 'OUT',
            referenceType: 'compositeItem',
            referenceId: id,
            organizationId,
          },
        });

        // Update item stock
        await tx.item.update({
          where: { id: comp.itemId },
          data: { currentStock: { decrement: consumeQty } },
        });

        // Update inventory level
        await tx.inventoryLevel.upsert({
          where: { itemId_warehouseId: { itemId: comp.itemId, warehouseId } },
          update: { quantity: { decrement: consumeQty } },
          create: {
            itemId: comp.itemId,
            warehouseId,
            quantity: new Decimal(-consumeQty),
            organizationId,
          },
        });
      }

      return {
        compositeItemId: id,
        name: composite.name,
        quantityAssembled: quantity,
        componentsConsumed: composite.components.map((comp) => ({
          itemId: comp.itemId,
          itemName: comp.item.name,
          quantityConsumed: comp.quantity * quantity,
        })),
      };
    });
  }
}
