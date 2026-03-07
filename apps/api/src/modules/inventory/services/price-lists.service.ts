import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PriceListType } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';
import { CreatePriceListDto, UpdatePriceListDto } from '../dto/price-list.dto';

@Injectable()
export class PriceListsService {
  constructor(private prisma: PrismaService) {}

  async create(organizationId: string, dto: CreatePriceListDto) {
    return this.prisma.priceList.create({
      data: {
        name: dto.name,
        description: dto.description,
        type: dto.type as PriceListType,
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
      where: { organizationId, isActive: true },
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
      data: dto as unknown as Prisma.PriceListUpdateInput,
    });
  }

  async remove(organizationId: string, id: string) {
    await this.findOne(organizationId, id);
    await this.prisma.priceList.delete({ where: { id } });
    return { message: 'Price list deleted' };
  }
}
