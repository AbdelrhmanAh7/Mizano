import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ItemType, Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { cursorPaginate } from '../../../common/utils/cursor-paginate';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateItemDto } from '../dto/create-item.dto';
import { UpdateItemDto } from '../dto/update-item.dto';

@Injectable()
export class ItemsService {
  constructor(private prisma: PrismaService) {}

  async create(organizationId: string, dto: CreateItemDto) {
    const existing = await this.prisma.item.findFirst({ where: { sku: dto.sku, organizationId } });
    if (existing) throw new ConflictException('SKU already exists');

    return this.prisma.item.create({
      data: {
        name: dto.name,
        sku: dto.sku,
        type: dto.type,
        unit: dto.unit,
        sellingPrice: new Decimal(dto.sellingPrice),
        salesAccountId: dto.salesAccountId,
        costPrice: new Decimal(dto.costPrice || '0'),
        purchaseAccountId: dto.purchaseAccountId,
        inventoryAccountId: dto.inventoryAccountId,
        description: dto.description,
        reorderPoint: dto.reorderPoint,
        currentStock: dto.openingStock || 0,
        organizationId,
      },
    });
  }

  async findAll(organizationId: string, query: PaginationDto) {
    const { page = 1, limit = 20, search, sortBy = 'name', sortOrder = 'asc', type } = query;
    const where: Prisma.ItemWhereInput = { organizationId, deletedAt: null };
    if (type) where.type = type as ItemType;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.item.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.item.count({ where }),
    ]);

    return { data: items, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async findAllCursor(organizationId: string, query: CursorPaginationDto) {
    const { cursor, take, search, sortBy = 'name', sortOrder = 'asc' } = query;
    const where: Prisma.ItemWhereInput = { organizationId, deletedAt: null };
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
      ];
    }
    return cursorPaginate(this.prisma.item, where, { [sortBy]: sortOrder }, { cursor, take });
  }

  async findOne(organizationId: string, id: string) {
    const item = await this.prisma.item.findFirst({
      where: { id, organizationId, deletedAt: null },
    });
    if (!item) throw new NotFoundException('Item not found');
    return item;
  }

  async update(organizationId: string, id: string, dto: UpdateItemDto) {
    await this.findOne(organizationId, id);
    if (dto.sku) {
      const existing = await this.prisma.item.findFirst({
        where: { sku: dto.sku, organizationId, id: { not: id } },
      });
      if (existing) throw new ConflictException('SKU already exists');
    }
    return this.prisma.item.update({ where: { id }, data: dto });
  }

  async remove(organizationId: string, id: string) {
    const item = await this.prisma.item.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: { _count: { select: { invoiceLines: true, billLines: true } } },
    });
    if (!item) throw new NotFoundException('Item not found');
    if (item._count.invoiceLines > 0 || item._count.billLines > 0)
      throw new BadRequestException('Item has transactions');
    await this.prisma.item.update({ where: { id }, data: { deletedAt: new Date() } });
    return { message: 'Item deleted' };
  }

  async updateStock(itemId: string, quantity: number, type: 'increase' | 'decrease') {
    const item = await this.prisma.item.findUnique({ where: { id: itemId } });
    if (!item) throw new NotFoundException(`Item ${itemId} not found for stock update`);
    const newStock =
      type === 'increase' ? item.currentStock + quantity : item.currentStock - quantity;
    await this.prisma.item.update({
      where: { id: itemId },
      data: { currentStock: Math.max(0, newStock) },
    });
  }
}
