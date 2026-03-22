import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { PaginationDto } from '../../../common/dto/pagination.dto';
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

  async findAll(organizationId: string, query: PaginationDto) {
    const { page = 1, limit = 20, search, sortBy = 'name', sortOrder = 'asc' } = query;
    const where: Prisma.WarehouseWhereInput = { organizationId, isActive: true, deletedAt: null };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [warehouses, total] = await Promise.all([
      this.prisma.warehouse.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
        include: { _count: { select: { inventoryMovements: true } } },
      }),
      this.prisma.warehouse.count({ where }),
    ]);

    return { data: warehouses, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(organizationId: string, id: string) {
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id, organizationId, deletedAt: null },
    });
    if (!warehouse) throw new NotFoundException('Warehouse not found');
    return warehouse;
  }

  async getStock(organizationId: string, id: string) {
    await this.findOne(organizationId, id);
    return this.prisma.inventoryLevel.findMany({
      where: { warehouseId: id, organizationId },
      include: {
        item: { select: { id: true, name: true, sku: true, unit: true } },
      },
    });
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
