import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { cursorPaginate } from '../../../common/utils/cursor-paginate';

@Injectable()
export class InventoryMovementsService {
  constructor(private prisma: PrismaService) {}

  async findAll(
    organizationId: string,
    query: {
      page?: number;
      limit?: number;
      itemId?: string;
      warehouseId?: string;
      type?: string;
      dateFrom?: string;
      dateTo?: string;
      sortBy?: string;
      sortOrder?: string;
    },
  ) {
    const {
      page = 1,
      limit = 20,
      itemId,
      warehouseId,
      type,
      dateFrom,
      dateTo,
      sortOrder = 'desc',
    } = query;
    const sortBy = InventoryMovementsService.ALLOWED_SORT_FIELDS.includes(query.sortBy || '')
      ? query.sortBy!
      : 'createdAt';
    const where: Prisma.InventoryMovementWhereInput = { organizationId };
    if (itemId) where.itemId = itemId;
    if (warehouseId) where.warehouseId = warehouseId;
    if (type) where.type = type;
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo) where.createdAt.lte = new Date(dateTo);
    }

    const [movements, total] = await Promise.all([
      this.prisma.inventoryMovement.findMany({
        where,
        include: {
          item: { select: { id: true, name: true, sku: true, unit: true } },
          warehouse: { select: { id: true, name: true, code: true } },
        },
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.inventoryMovement.count({ where }),
    ]);

    return {
      data: movements,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  private static readonly ALLOWED_SORT_FIELDS = [
    'id',
    'itemId',
    'warehouseId',
    'type',
    'movementType',
    'quantity',
    'createdAt',
  ];

  async findAllCursor(
    organizationId: string,
    query: {
      cursor?: string;
      take?: number;
      itemId?: string;
      warehouseId?: string;
      type?: string;
      sortBy?: string;
      sortOrder?: string;
    },
  ) {
    const { cursor, take, itemId, warehouseId, type, sortOrder = 'desc' } = query;
    const sortBy = InventoryMovementsService.ALLOWED_SORT_FIELDS.includes(query.sortBy || '')
      ? query.sortBy!
      : 'createdAt';
    const where: Prisma.InventoryMovementWhereInput = { organizationId };
    if (itemId) where.itemId = itemId;
    if (warehouseId) where.warehouseId = warehouseId;
    if (type) where.type = type;

    return cursorPaginate(
      this.prisma.inventoryMovement,
      where,
      { [sortBy]: sortOrder },
      {
        cursor,
        take,
        include: {
          item: { select: { id: true, name: true, sku: true, unit: true } },
          warehouse: { select: { id: true, name: true, code: true } },
        },
      },
    );
  }
}
