import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateWarehouseDto } from '../dto/create-warehouse.dto';
import { UpdateWarehouseDto } from '../dto/update-warehouse.dto';

@Injectable()
export class WarehousesService {
  constructor(private prisma: PrismaService) {}

  async create(organizationId: string, dto: CreateWarehouseDto) {
    const existing = await this.prisma.warehouse.findFirst({
      where: { code: dto.code, organizationId },
    });
    if (existing) throw new ConflictException('Warehouse code exists');

    if (dto.isDefault) {
      await this.prisma.warehouse.updateMany({
        where: { organizationId, isDefault: true },
        data: { isDefault: false },
      });
    }

    return this.prisma.warehouse.create({
      data: { ...dto, organizationId },
    });
  }

  async findAll(organizationId: string) {
    return this.prisma.warehouse.findMany({
      where: { organizationId, isActive: true, deletedAt: null },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(organizationId: string, id: string) {
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id, organizationId, deletedAt: null },
    });
    if (!warehouse) throw new NotFoundException('Warehouse not found');
    return warehouse;
  }

  async update(organizationId: string, id: string, dto: UpdateWarehouseDto) {
    await this.findOne(organizationId, id);
    if (dto.isDefault) {
      await this.prisma.warehouse.updateMany({
        where: { organizationId, isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
    }
    return this.prisma.warehouse.update({ where: { id }, data: dto });
  }

  async remove(organizationId: string, id: string) {
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id, organizationId },
      include: { _count: { select: { inventoryMovements: true } } },
    });
    if (!warehouse) throw new NotFoundException('Warehouse not found');
    if (warehouse._count.inventoryMovements > 0)
      throw new BadRequestException('Warehouse has movements');
    await this.prisma.warehouse.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return { message: 'Warehouse deleted' };
  }
}
