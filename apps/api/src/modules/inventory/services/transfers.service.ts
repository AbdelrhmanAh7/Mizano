import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { TransferStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class TransfersService {
  constructor(private prisma: PrismaService) {}

  async create(organizationId: string, dto: any) {
    const { fromWarehouseId, toWarehouseId, date, notes, lines } = dto;

    if (fromWarehouseId === toWarehouseId) {
      throw new BadRequestException('Source and destination warehouses must be different');
    }

    // Validate warehouses
    const [fromWarehouse, toWarehouse] = await Promise.all([
      this.prisma.warehouse.findFirst({ where: { id: fromWarehouseId, organizationId } }),
      this.prisma.warehouse.findFirst({ where: { id: toWarehouseId, organizationId } }),
    ]);
    if (!fromWarehouse) throw new NotFoundException('Source warehouse not found');
    if (!toWarehouse) throw new NotFoundException('Destination warehouse not found');

    // Validate items
    for (const line of lines || []) {
      const item = await this.prisma.item.findFirst({
        where: { id: line.itemId, organizationId, deletedAt: null },
      });
      if (!item) throw new NotFoundException(`Item ${line.itemId} not found`);
    }

    const transferNumber = await this.generateTransferNumber(organizationId);

    return this.prisma.inventoryTransfer.create({
      data: {
        transferNumber,
        fromWarehouseId,
        toWarehouseId,
        date: new Date(date),
        notes,
        organizationId,
        lines: {
          create: (lines || []).map((line: any) => ({
            itemId: line.itemId,
            quantity: new Decimal(line.quantity),
          })),
        },
      },
      include: {
        fromWarehouse: { select: { id: true, name: true, code: true } },
        toWarehouse: { select: { id: true, name: true, code: true } },
        lines: {
          include: { item: { select: { id: true, name: true, sku: true, unit: true } } },
        },
      },
    });
  }

  async findAll(organizationId: string, query: PaginationDto & { status?: string; fromWarehouseId?: string; toWarehouseId?: string }) {
    const { page = 1, limit = 20, sortBy = 'date', sortOrder = 'desc', status, fromWarehouseId, toWarehouseId } = query;
    const where: any = { organizationId };
    if (status) where.status = status;
    if (fromWarehouseId) where.fromWarehouseId = fromWarehouseId;
    if (toWarehouseId) where.toWarehouseId = toWarehouseId;

    const [transfers, total] = await Promise.all([
      this.prisma.inventoryTransfer.findMany({
        where,
        include: {
          fromWarehouse: { select: { id: true, name: true, code: true } },
          toWarehouse: { select: { id: true, name: true, code: true } },
          lines: {
            include: { item: { select: { id: true, name: true, sku: true } } },
          },
        },
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.inventoryTransfer.count({ where }),
    ]);

    return { data: transfers, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(organizationId: string, id: string) {
    const transfer = await this.prisma.inventoryTransfer.findFirst({
      where: { id, organizationId },
      include: {
        fromWarehouse: { select: { id: true, name: true, code: true } },
        toWarehouse: { select: { id: true, name: true, code: true } },
        lines: {
          include: { item: { select: { id: true, name: true, sku: true, unit: true } } },
        },
      },
    });
    if (!transfer) throw new NotFoundException('Transfer not found');
    return transfer;
  }

  async complete(organizationId: string, id: string) {
    const transfer = await this.findOne(organizationId, id);

    if (transfer.status !== TransferStatus.PENDING && transfer.status !== TransferStatus.IN_TRANSIT) {
      throw new BadRequestException('Only pending or in-transit transfers can be completed');
    }

    return this.prisma.$transaction(async (tx) => {
      // Process each transfer line
      for (const line of transfer.lines) {
        const qty = parseFloat(line.quantity.toString());

        // Create OUT movement from source warehouse
        await tx.inventoryMovement.create({
          data: {
            itemId: line.itemId,
            warehouseId: transfer.fromWarehouseId,
            quantity: new Decimal(-qty),
            type: 'transfer',
            movementType: 'OUT',
            referenceType: 'transfer',
            referenceId: transfer.id,
            reference: transfer.transferNumber,
            organizationId,
          },
        });

        // Create IN movement to destination warehouse
        await tx.inventoryMovement.create({
          data: {
            itemId: line.itemId,
            warehouseId: transfer.toWarehouseId,
            quantity: new Decimal(qty),
            type: 'transfer',
            movementType: 'IN',
            referenceType: 'transfer',
            referenceId: transfer.id,
            reference: transfer.transferNumber,
            organizationId,
          },
        });

        // Update InventoryLevel for source warehouse (decrease)
        await tx.inventoryLevel.upsert({
          where: {
            itemId_warehouseId: { itemId: line.itemId, warehouseId: transfer.fromWarehouseId },
          },
          update: { quantity: { decrement: qty } },
          create: {
            itemId: line.itemId,
            warehouseId: transfer.fromWarehouseId,
            quantity: new Decimal(-qty),
            organizationId,
          },
        });

        // Update InventoryLevel for destination warehouse (increase)
        await tx.inventoryLevel.upsert({
          where: {
            itemId_warehouseId: { itemId: line.itemId, warehouseId: transfer.toWarehouseId },
          },
          update: { quantity: { increment: qty } },
          create: {
            itemId: line.itemId,
            warehouseId: transfer.toWarehouseId,
            quantity: new Decimal(qty),
            organizationId,
          },
        });
      }

      // Update transfer status to COMPLETED
      return tx.inventoryTransfer.update({
        where: { id },
        data: { status: TransferStatus.COMPLETED },
        include: {
          fromWarehouse: { select: { id: true, name: true, code: true } },
          toWarehouse: { select: { id: true, name: true, code: true } },
          lines: {
            include: { item: { select: { id: true, name: true, sku: true } } },
          },
        },
      });
    });
  }

  async cancel(organizationId: string, id: string) {
    const transfer = await this.findOne(organizationId, id);

    if (transfer.status !== TransferStatus.PENDING && transfer.status !== TransferStatus.IN_TRANSIT) {
      throw new BadRequestException('Only pending or in-transit transfers can be cancelled');
    }

    return this.prisma.inventoryTransfer.update({
      where: { id },
      data: { status: TransferStatus.CANCELLED },
      include: {
        fromWarehouse: { select: { id: true, name: true, code: true } },
        toWarehouse: { select: { id: true, name: true, code: true } },
        lines: {
          include: { item: { select: { id: true, name: true, sku: true } } },
        },
      },
    });
  }

  private async generateTransferNumber(organizationId: string): Promise<string> {
    const last = await this.prisma.inventoryTransfer.findFirst({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      select: { transferNumber: true },
    });
    if (!last) return 'TRF-001';
    const num = parseInt(last.transferNumber.split('-')[1], 10);
    return `TRF-${String(num + 1).padStart(3, '0')}`;
  }
}
