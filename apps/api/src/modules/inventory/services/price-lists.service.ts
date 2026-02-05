import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class PriceListsService {
  constructor(private prisma: PrismaService) {}

  async create(organizationId: string, dto: any) {
    return this.prisma.priceList.create({
      data: {
        name: dto.name,
        description: dto.description,
        type: dto.type,
        adjustment: new Decimal(dto.adjustment),
        organizationId,
        items: dto.items ? {
          create: dto.items.map((item: any) => ({ itemId: item.itemId, customPrice: new Decimal(item.customPrice) })),
        } : undefined,
      },
      include: { items: { include: { item: { select: { id: true, name: true } } } } },
    });
  }

  async findAll(organizationId: string) {
    return this.prisma.priceList.findMany({ where: { organizationId, isActive: true }, orderBy: { name: 'asc' } });
  }

  async findOne(organizationId: string, id: string) {
    const priceList = await this.prisma.priceList.findFirst({
      where: { id, organizationId },
      include: { items: { include: { item: true } } },
    });
    if (!priceList) throw new NotFoundException('Price list not found');
    return priceList;
  }

  async update(organizationId: string, id: string, dto: any) {
    await this.findOne(organizationId, id);
    return this.prisma.priceList.update({ where: { id }, data: dto });
  }

  async remove(organizationId: string, id: string) {
    await this.findOne(organizationId, id);
    await this.prisma.priceList.delete({ where: { id } });
    return { message: 'Price list deleted' };
  }
}
