import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class WarehousesService {
  constructor(private prisma: PrismaService) {}

  async create(organizationId: string, dto: any) {
    const existing = await this.prisma.warehouse.findFirst({ where: { code: dto.code, organizationId } });
    if (existing) throw new ConflictException('Warehouse code exists');

    if (dto.isDefault) {
      await this.prisma.warehouse.updateMany({ where: { organizationId, isDefault: true }, data: { isDefault: false } });
    }

    return this.prisma.warehouse.create({
      data: { ...dto, organizationId },
    });
  }

  async findAll(organizationId: string) {
    return this.prisma.warehouse.findMany({ where: { organizationId, isActive: true }, orderBy: { name: 'asc' } });
  }

  async findOne(organizationId: string, id: string) {
    const warehouse = await this.prisma.warehouse.findFirst({ where: { id, organizationId } });
    if (!warehouse) throw new NotFoundException('Warehouse not found');
    return warehouse;
  }

  async update(organizationId: string, id: string, dto: any) {
    await this.findOne(organizationId, id);
    if (dto.isDefault) {
      await this.prisma.warehouse.updateMany({ where: { organizationId, isDefault: true, id: { not: id } }, data: { isDefault: false } });
    }
    return this.prisma.warehouse.update({ where: { id }, data: dto });
  }

  async remove(organizationId: string, id: string) {
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id, organizationId },
      include: { inventoryMovements: { take: 1 } },
    });
    if (!warehouse) throw new NotFoundException('Warehouse not found');
    if (warehouse.inventoryMovements.length > 0) throw new BadRequestException('Warehouse has movements');
    await this.prisma.warehouse.delete({ where: { id } });
    return { message: 'Warehouse deleted' };
  }
}
