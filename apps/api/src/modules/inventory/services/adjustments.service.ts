import { Injectable, NotFoundException } from '@nestjs/common';
import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { cursorPaginate } from '../../../common/utils/cursor-paginate';
import { PrismaService } from '../../../prisma/prisma.service';
import { JournalsService } from '../../accounting/services/journals.service';
import { ItemsService } from './items.service';

export interface CreateAdjustmentData {
  date: string;
  warehouseId: string;
  itemId: string;
  type: 'INCREASE' | 'DECREASE';
  quantity: number;
  reason: 'DAMAGED' | 'STOLEN' | 'STOCKTAKE' | 'RETURNED' | 'EXPIRED' | 'OTHER';
  accountId: string;
  notes?: string;
}

@Injectable()
export class AdjustmentsService {
  constructor(
    private prisma: PrismaService,
    private itemsService: ItemsService,
    private journalsService: JournalsService,
  ) {}

  async create(organizationId: string, dto: CreateAdjustmentData) {
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

    // Create accounting entry for inventory adjustment
    if (dto.accountId) {
      const item = await this.prisma.item.findUnique({
        where: { id: dto.itemId },
        select: { costPrice: true, inventoryAccountId: true },
      });

      if (item?.inventoryAccountId && item.costPrice) {
        const amount = dto.quantity * parseFloat(item.costPrice.toString());
        const debitAccountId = dto.type === 'INCREASE' ? item.inventoryAccountId : dto.accountId;
        const creditAccountId = dto.type === 'INCREASE' ? dto.accountId : item.inventoryAccountId;

        await this.journalsService.create(organizationId, {
          date: new Date(dto.date).toISOString(),
          reference: `Adjustment ${adjustment.adjustmentNumber}`,
          notes: `Inventory adjustment ${adjustment.adjustmentNumber}`,
          lines: [
            {
              accountId: debitAccountId,
              debit: amount.toFixed(4),
              credit: '0',
              description: `${adjustment.adjustmentNumber} - ${dto.type === 'INCREASE' ? 'Inventory' : 'Adjustment variance'}`,
            },
            {
              accountId: creditAccountId,
              debit: '0',
              credit: amount.toFixed(4),
              description: `${adjustment.adjustmentNumber} - ${dto.type === 'INCREASE' ? 'Adjustment variance' : 'Inventory'}`,
            },
          ],
        });
      }
    }

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
