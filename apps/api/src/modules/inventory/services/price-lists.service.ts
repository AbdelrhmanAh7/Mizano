import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { DecimalUtils } from '../../../common/utils/decimal';
import { CreatePriceListDto, UpdatePriceListDto } from '../dto/price-list.dto';

@Injectable()
export class PriceListsService {
  constructor(private prisma: PrismaService) {}

  async create(organizationId: string, dto: CreatePriceListDto) {
    const items = dto.items ?? [];
    await this.assertItemsBelongToOrg(
      organizationId,
      items.map((item) => item.itemId),
    );
    return this.prisma.priceList.create({
      data: {
        name: dto.name,
        description: dto.description,
        type: dto.type,
        adjustment: DecimalUtils.parseInput(dto.adjustment, 'adjustment'),
        organizationId,
        items: items.length
          ? {
              create: items.map((item) => ({
                itemId: item.itemId,
                customPrice: DecimalUtils.parseInput(item.customPrice, 'customPrice'),
              })),
            }
          : undefined,
      },
      include: { items: { include: { item: { select: { id: true, name: true } } } } },
    });
  }

  /** A price list may only price the tenant's own, live items. */
  private async assertItemsBelongToOrg(organizationId: string, itemIds: string[]): Promise<void> {
    const unique = [...new Set(itemIds)];
    if (unique.length !== itemIds.length) {
      throw new BadRequestException('Each item can appear only once in a price list');
    }
    if (!unique.length) return;
    const found = await this.prisma.item.count({
      where: { id: { in: unique }, organizationId, deletedAt: null },
    });
    if (found !== unique.length) throw new BadRequestException('Item not found');
  }

  /** Admin list: every list of the tenant with its isActive flag; activeOnly restores the old filter. */
  async findAll(organizationId: string, activeOnly = false) {
    return this.prisma.priceList.findMany({
      where: { organizationId, ...(activeOnly ? { isActive: true } : {}) },
      orderBy: { name: 'asc' },
      include: { _count: { select: { items: true } } },
    });
  }

  async findOne(organizationId: string, id: string) {
    const priceList = await this.prisma.priceList.findFirst({
      where: { id, organizationId },
      include: { items: { include: { item: true } } },
    });
    if (!priceList) throw new NotFoundException('Price list not found');
    return priceList;
  }

  async update(organizationId: string, id: string, dto: UpdatePriceListDto) {
    await this.findOne(organizationId, id);
    // Only the list's own fields: never its tenant, items or customers (mass assignment).
    const data: Prisma.PriceListUpdateInput = {
      name: dto.name,
      description: dto.description,
      type: dto.type,
      isActive: dto.isActive,
      adjustment:
        dto.adjustment === undefined
          ? undefined
          : DecimalUtils.parseInput(dto.adjustment, 'adjustment'),
    };
    return this.prisma.priceList.update({ where: { id }, data });
  }

  async remove(organizationId: string, id: string) {
    await this.findOne(organizationId, id);
    await this.prisma.priceList.delete({ where: { id } });
    return { message: 'Price list deleted' };
  }
}
