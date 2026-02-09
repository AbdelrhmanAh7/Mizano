import { Injectable, NotFoundException } from '@nestjs/common';
import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { cursorPaginate } from '../../../common/utils/cursor-paginate';
import { PrismaService } from '../../../prisma/prisma.service';
import { ItemsService } from './items.service';

@Injectable()
export class AdjustmentsService {
  constructor(
    private prisma: PrismaService,
    private itemsService: ItemsService,
  ) {}

  async create(organizationId: string, dto: any) {
    const adjustmentNumber = await this.generateNumber(organizationId);

    const adjustment = await this.prisma.inventoryAdjustment.create({
      data: {
        adjustmentNumber,
        date: new Date(dto.date),
        warehouseId: dto.warehouseId,
        itemId: dto.itemId,
        type: dto.type,
        quantity: dto.quantity,
        reason: dto.reason,
        accountId: dto.accountId,
        notes: dto.notes,
        organizationId,
      },
      include: {
        item: { select: { id: true, name: true } },
        warehouse: { select: { id: true, name: true } },
      },
    });

    await this.itemsService.updateStock(
      dto.itemId,
      dto.quantity,
      dto.type === 'INCREASE' ? 'increase' : 'decrease',
    );
    return adjustment;
  }

  async findAll(organizationId: string, query: PaginationDto) {
    const { page = 1, limit = 20, sortBy = 'date', sortOrder = 'desc' } = query;
    const where = { organizationId };
    const [adjustments, total] = await Promise.all([
      this.prisma.inventoryAdjustment.findMany({
        where,
        include: {
          item: { select: { id: true, name: true } },
          warehouse: { select: { id: true, name: true } },
        },
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.inventoryAdjustment.count({ where }),
    ]);
    return {
      data: adjustments,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findAllCursor(organizationId: string, query: CursorPaginationDto) {
    const { cursor, take, sortBy = 'date', sortOrder = 'desc' } = query;
    const where = { organizationId };
    return cursorPaginate(
      this.prisma.inventoryAdjustment,
      where,
      { [sortBy]: sortOrder },
      {
        cursor,
        take,
        include: {
          item: { select: { id: true, name: true } },
          warehouse: { select: { id: true, name: true } },
        },
      },
    );
  }

  async findOne(organizationId: string, id: string) {
    const adjustment = await this.prisma.inventoryAdjustment.findFirst({
      where: { id, organizationId },
      include: { item: true, warehouse: true, account: true },
    });
    if (!adjustment) throw new NotFoundException('Adjustment not found');
    return adjustment;
  }

  private async generateNumber(organizationId: string): Promise<string> {
    const last = await this.prisma.inventoryAdjustment.findFirst({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      select: { adjustmentNumber: true },
    });
    if (!last) return 'ADJ-001';
    const num = parseInt(last.adjustmentNumber.split('-')[1], 10);
    return `ADJ-${String(num + 1).padStart(3, '0')}`;
  }
}
