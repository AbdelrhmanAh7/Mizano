import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';
import { CreatePriceListDto, UpdatePriceListDto } from '../dto/price-list.dto';

@Injectable()
export class PriceListsService {
  constructor(private prisma: PrismaService) {}

  async create(organizationId: string, dto: CreatePriceListDto) {
    await this.assertItemsBelongToOrg(organizationId, dto.items ?? []);
    return this.prisma.priceList.create({
      data: {
        name: dto.name,
        description: dto.description,
        type: dto.type,
        adjustment: new Decimal(dto.adjustment),
        organizationId,
        items: dto.items
          ? {
              create: dto.items.map((item) => ({
                itemId: item.itemId,
                customPrice: new Decimal(item.customPrice),
              })),
            }
          : undefined,
      },
      include: { items: { include: { item: { select: { id: true, name: true } } } } },
    });
  }

  async findAll(organizationId: string) {
    return this.prisma.priceList.findMany({
      where: { organizationId },
      orderBy: { name: 'asc' },
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
    return this.prisma.priceList.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        type: dto.type,
        adjustment: dto.adjustment === undefined ? undefined : new Decimal(dto.adjustment),
        isActive: dto.isActive,
      },
    });
  }

  async remove(organizationId: string, id: string) {
    await this.findOne(organizationId, id);
    await this.prisma.priceList.delete({ where: { id } });
    return { message: 'Price list deleted' };
  }

  /** Every priced item must be a live item of the caller's organization, listed once. */
  private async assertItemsBelongToOrg(
    organizationId: string,
    items: Array<{ itemId: string }>,
  ): Promise<void> {
    const itemIds = items.map((i) => i.itemId);
    if (itemIds.length === 0) return;
    if (new Set(itemIds).size !== itemIds.length) {
      throw new BadRequestException('An item can only be priced once per price list');
    }
    const found = await this.prisma.item.count({
      where: { id: { in: itemIds }, organizationId, deletedAt: null },
    });
    if (found !== itemIds.length) throw new BadRequestException('Item not found');
  }
}
