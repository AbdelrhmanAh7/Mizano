import { Prisma } from '@prisma/client';
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ChallanStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { BulkResultDto } from '../../../common/dto/bulk-result.dto';
import { runBulk } from '../../../common/utils/run-bulk';
import {
  CreateDeliveryChallanDto,
  UpdateDeliveryChallanDto,
  ChallanQueryDto,
} from '../dto/delivery-challan.dto';

@Injectable()
export class DeliveryChallansService {
  constructor(private prisma: PrismaService) {}

  // ============ CRUD Operations ============

  async create(organizationId: string, dto: CreateDeliveryChallanDto) {
    await this.assertReferencesInOrg(organizationId, dto);

    // Generate challan number
    const challanNumber = await this.generateChallanNumber(organizationId);

    return this.prisma.deliveryChallan.create({
      data: {
        challanNumber,
        customerId: dto.customerId,
        invoiceId: dto.invoiceId,
        challanType: dto.challanType,
        date: new Date(dto.date),
        notes: dto.notes,
        organizationId,
        lines: {
          create: dto.lines.map((line) => ({
            itemId: line.itemId,
            quantity: new Decimal(line.quantity),
            description: line.description,
            warehouseId: line.warehouseId,
          })),
        },
      },
      include: {
        customer: { select: { id: true, name: true } },
        invoice: { select: { id: true, invoiceNumber: true } },
        lines: {
          include: {
            item: { select: { id: true, name: true, sku: true } },
            warehouse: { select: { id: true, name: true } },
          },
        },
      },
    });
  }

  async findAll(organizationId: string, query: ChallanQueryDto) {
    const {
      page = 1,
      limit = 20,
      status,
      challanType,
      customerId,
      search,
      dateFrom,
      dateTo,
    } = query;

    const where: Prisma.DeliveryChallanWhereInput = { organizationId, deletedAt: null };

    if (status) where.status = status;
    if (challanType) where.challanType = challanType;
    if (customerId) where.customerId = customerId;

    if (search) {
      where.OR = [
        { challanNumber: { contains: search, mode: 'insensitive' } },
        { customer: { name: { contains: search, mode: 'insensitive' } } },
      ];
    }

    if (dateFrom || dateTo) {
      where.date = {};
      if (dateFrom) where.date.gte = new Date(dateFrom);
      if (dateTo) where.date.lte = new Date(dateTo);
    }

    const [data, total] = await Promise.all([
      this.prisma.deliveryChallan.findMany({
        where,
        include: {
          customer: { select: { id: true, name: true } },
          invoice: { select: { id: true, invoiceNumber: true } },
          lines: {
            include: {
              item: { select: { id: true, name: true, sku: true } },
            },
          },
        },
        orderBy: { date: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.deliveryChallan.count({ where }),
    ]);

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(organizationId: string, id: string) {
    const challan = await this.prisma.deliveryChallan.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: {
        customer: true,
        invoice: { select: { id: true, invoiceNumber: true, status: true } },
        lines: {
          include: {
            item: { select: { id: true, name: true, sku: true } },
            warehouse: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!challan) {
      throw new NotFoundException('Delivery challan not found');
    }

    return challan;
  }

  async update(organizationId: string, id: string, dto: UpdateDeliveryChallanDto) {
    const challan = await this.findOne(organizationId, id);

    if (challan.status !== ChallanStatus.DRAFT) {
      throw new BadRequestException('Only draft challans can be updated');
    }

    // Validate before touching the existing lines
    await this.assertReferencesInOrg(organizationId, dto);

    return this.prisma.$transaction(async (tx) => {
      // Re-check DRAFT + org atomically to close the race with issue()
      const res = await tx.deliveryChallan.updateMany({
        where: { id, organizationId, deletedAt: null, status: ChallanStatus.DRAFT },
        data: {
          customerId: dto.customerId,
          invoiceId: dto.invoiceId,
          challanType: dto.challanType,
          date: dto.date ? new Date(dto.date) : undefined,
          notes: dto.notes,
        },
      });
      if (res.count !== 1) {
        throw new ConflictException('Only draft challans can be updated');
      }

      if (dto.lines) {
        await tx.deliveryChallanLine.deleteMany({ where: { challanId: id } });
        await tx.deliveryChallanLine.createMany({
          data: dto.lines.map((line) => ({
            challanId: id,
            itemId: line.itemId,
            quantity: new Decimal(line.quantity),
            description: line.description,
            warehouseId: line.warehouseId,
          })),
        });
      }

      return tx.deliveryChallan.findFirst({
        where: { id, organizationId },
        include: {
          customer: { select: { id: true, name: true } },
          invoice: { select: { id: true, invoiceNumber: true } },
          lines: {
            include: {
              item: { select: { id: true, name: true, sku: true } },
              warehouse: { select: { id: true, name: true } },
            },
          },
        },
      });
    });
  }

  async remove(organizationId: string, id: string) {
    const challan = await this.findOne(organizationId, id);

    if (challan.status !== ChallanStatus.DRAFT) {
      throw new BadRequestException('Only draft challans can be deleted');
    }

    await this.prisma.deliveryChallan.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return { message: 'Delivery challan deleted' };
  }

  // ============ Issue Challan (Decreases Inventory) ============

  async issue(organizationId: string, id: string) {
    return this.prisma.$transaction(async (tx) => {
      // Atomically guard: only DRAFT challans in this org can be issued
      const res = await tx.deliveryChallan.updateMany({
        where: { id, organizationId, deletedAt: null, status: ChallanStatus.DRAFT },
        data: { status: ChallanStatus.ISSUED },
      });
      if (res.count !== 1) {
        await this.rejectTransition(
          tx,
          organizationId,
          id,
          ChallanStatus.DRAFT,
          'Only draft challans can be issued',
        );
      }

      // Reload challan with lines for inventory operations
      const challan = await tx.deliveryChallan.findFirst({
        where: { id, organizationId },
        include: {
          lines: {
            include: {
              item: { select: { id: true, name: true, trackInventory: true } },
            },
          },
        },
      });
      if (!challan) {
        throw new NotFoundException('Delivery challan not found');
      }

      const tracked = await this.trackedLineItems(organizationId, challan.lines);

      // Check inventory availability for tracked items
      for (const line of challan.lines) {
        if (tracked.has(line.itemId)) {
          const warehouseId = line.warehouseId;
          const currentStock = await this.getItemStock(
            organizationId,
            line.itemId,
            warehouseId,
            tx,
          );

          if (currentStock < parseFloat(line.quantity.toString())) {
            throw new BadRequestException(
              `Insufficient stock for item ${line.item?.name || line.itemId}. Available: ${currentStock}, Required: ${line.quantity}`,
            );
          }
        }
      }

      // Decrease inventory
      for (const line of challan.lines) {
        if (tracked.has(line.itemId)) {
          await this.decreaseInventory(
            organizationId,
            line.itemId,
            parseFloat(line.quantity.toString()),
            line.warehouseId,
            `Delivery Challan ${challan.challanNumber}`,
            tx,
          );
        }
      }

      // Return updated challan
      return tx.deliveryChallan.findFirst({
        where: { id, organizationId },
        include: {
          customer: { select: { id: true, name: true } },
          invoice: { select: { id: true, invoiceNumber: true } },
          lines: {
            include: {
              item: { select: { id: true, name: true, sku: true } },
            },
          },
        },
      });
    });
  }

  // ============ Mark as Returned (Reverses Inventory) ============

  async markReturned(organizationId: string, id: string) {
    return this.prisma.$transaction(async (tx) => {
      // Atomically guard: only ISSUED challans in this org can be returned
      const res = await tx.deliveryChallan.updateMany({
        where: { id, organizationId, deletedAt: null, status: ChallanStatus.ISSUED },
        data: { status: ChallanStatus.RETURNED },
      });
      if (res.count !== 1) {
        await this.rejectTransition(
          tx,
          organizationId,
          id,
          ChallanStatus.ISSUED,
          'Only issued challans can be marked as returned',
        );
      }

      // Reload challan with lines for inventory operations
      const challan = await tx.deliveryChallan.findFirst({
        where: { id, organizationId },
        include: {
          lines: {
            include: {
              item: { select: { id: true, name: true, trackInventory: true } },
            },
          },
        },
      });
      if (!challan) {
        throw new NotFoundException('Delivery challan not found');
      }

      const tracked = await this.trackedLineItems(organizationId, challan.lines);

      // Increase inventory (reverse the decrease)
      for (const line of challan.lines) {
        if (tracked.has(line.itemId)) {
          await this.increaseInventory(
            organizationId,
            line.itemId,
            parseFloat(line.quantity.toString()),
            line.warehouseId,
            `Return from Delivery Challan ${challan.challanNumber}`,
            tx,
          );
        }
      }

      // Return updated challan
      return tx.deliveryChallan.findFirst({
        where: { id, organizationId },
        include: {
          customer: { select: { id: true, name: true } },
          invoice: { select: { id: true, invoiceNumber: true } },
          lines: {
            include: {
              item: { select: { id: true, name: true, sku: true } },
            },
          },
        },
      });
    });
  }

  // ============ Create from Invoice ============

  async createFromInvoice(organizationId: string, invoiceId: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, organizationId, deletedAt: null },
      include: {
        customer: true,
        lines: {
          include: {
            item: { select: { id: true, name: true, type: true } },
          },
        },
      },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    // Filter only goods items (not services)
    const goodsLines = invoice.lines.filter((line) => line.item?.type === 'GOODS');

    if (goodsLines.length === 0) {
      throw new BadRequestException('Invoice has no deliverable goods items');
    }

    const challanNumber = await this.generateChallanNumber(organizationId);

    return this.prisma.deliveryChallan.create({
      data: {
        challanNumber,
        customerId: invoice.customerId,
        invoiceId,
        challanType: 'SUPPLY',
        date: new Date(),
        organizationId,
        lines: {
          create: goodsLines.map((line) => ({
            itemId: line.itemId!,
            quantity: line.quantity,
            description: line.description,
          })),
        },
      },
      include: {
        customer: { select: { id: true, name: true } },
        invoice: { select: { id: true, invoiceNumber: true } },
        lines: {
          include: {
            item: { select: { id: true, name: true, sku: true } },
          },
        },
      },
    });
  }

  // ============ Bulk Operations ============

  // Bulk actions reuse the single-record commands: same tenant checks, status rules and stock moves.
  async bulkDelete(organizationId: string, ids: string[]): Promise<BulkResultDto> {
    return runBulk(ids, (id) => this.remove(organizationId, id));
  }

  async bulkIssue(organizationId: string, ids: string[]): Promise<BulkResultDto> {
    return runBulk(ids, (id) => this.issue(organizationId, id));
  }

  /**
   * The guarded status update matched no row: a challan missing from this organization is a 404,
   * one in another status a 400 (same answers as update/remove); only a lost race stays a 409.
   */
  private async rejectTransition(
    tx: Prisma.TransactionClient,
    organizationId: string,
    id: string,
    expected: ChallanStatus,
    message: string,
  ): Promise<never> {
    const current = await tx.deliveryChallan.findFirst({
      where: { id, organizationId, deletedAt: null },
      select: { status: true },
    });
    if (!current) throw new NotFoundException('Delivery challan not found');
    if (current.status !== expected) throw new BadRequestException(message);
    throw new ConflictException(message);
  }

  // ============ Helper Methods ============

  /** Every customer, invoice, item and warehouse id in the payload must belong to the org (an unknown or foreign body id is a 400). */
  private async assertReferencesInOrg(
    organizationId: string,
    dto: UpdateDeliveryChallanDto,
  ): Promise<void> {
    if (dto.customerId !== undefined) {
      const customer = await this.prisma.customer.findFirst({
        where: { id: dto.customerId, organizationId, deletedAt: null },
      });
      if (!customer) {
        throw new BadRequestException('Customer not found');
      }
    }

    if (dto.invoiceId) {
      const invoice = await this.prisma.invoice.findFirst({
        where: { id: dto.invoiceId, organizationId, deletedAt: null },
      });
      if (!invoice) {
        throw new BadRequestException('Invoice not found');
      }
    }

    for (const line of dto.lines ?? []) {
      const item = await this.prisma.item.findFirst({
        where: { id: line.itemId, organizationId, deletedAt: null },
      });
      if (!item) {
        throw new BadRequestException(`Item ${line.itemId} not found`);
      }
      if (line.warehouseId) {
        const warehouse = await this.prisma.warehouse.findFirst({
          where: { id: line.warehouseId, organizationId, deletedAt: null },
        });
        if (!warehouse) {
          throw new BadRequestException(`Warehouse ${line.warehouseId} not found`);
        }
      }
    }
  }

  /**
   * Ids of the inventory-tracked items on the lines, checked against the org before any stock
   * moves. Soft-deleted items and warehouses still count, so older challans can be returned.
   */
  private async trackedLineItems(
    organizationId: string,
    lines: Array<{
      itemId: string;
      warehouseId: string | null;
      item?: { trackInventory: boolean };
    }>,
    tx?: Prisma.TransactionClient,
  ): Promise<Set<string>> {
    const client = tx ?? this.prisma;
    const tracked = new Set<string>();
    for (const line of lines) {
      const item = await client.item.findFirst({
        where: { id: line.itemId, organizationId },
      });
      if (!item) {
        throw new NotFoundException(`Item ${line.itemId} not found`);
      }
      if (line.warehouseId) {
        const warehouse = await client.warehouse.findFirst({
          where: { id: line.warehouseId, organizationId },
        });
        if (!warehouse) {
          throw new NotFoundException(`Warehouse ${line.warehouseId} not found`);
        }
      }
      if (item.trackInventory) {
        tracked.add(item.id);
      }
    }
    return tracked;
  }

  private async generateChallanNumber(organizationId: string): Promise<string> {
    const lastChallan = await this.prisma.deliveryChallan.findFirst({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      select: { challanNumber: true },
    });

    if (!lastChallan) {
      return 'DC-001';
    }

    const lastNumber = parseInt(lastChallan.challanNumber.split('-')[1], 10);
    return `DC-${String(lastNumber + 1).padStart(3, '0')}`;
  }

  private async getItemStock(
    organizationId: string,
    itemId: string,
    warehouseId?: string | null,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    const client = tx ?? this.prisma;
    const where: Prisma.InventoryLevelWhereInput = { itemId, organizationId };
    if (warehouseId) {
      where.warehouseId = warehouseId;
    }

    const stock = await client.inventoryLevel.aggregate({
      where,
      _sum: { quantity: true },
    });

    return parseFloat(stock._sum.quantity?.toString() || '0');
  }

  private async decreaseInventory(
    organizationId: string,
    itemId: string,
    quantity: number,
    warehouseId: string | null | undefined,
    reference: string,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    assertWholeUnits(quantity);
    // Find or create inventory level
    const where: Prisma.InventoryLevelWhereInput = { itemId, organizationId };
    if (warehouseId) {
      where.warehouseId = warehouseId;
    }

    let inventoryLevel = await client.inventoryLevel.findFirst({ where });

    if (!inventoryLevel) {
      // Get default warehouse
      const defaultWarehouse = await client.warehouse.findFirst({
        where: { organizationId, isDefault: true },
      });

      inventoryLevel = await client.inventoryLevel.create({
        data: {
          itemId,
          warehouseId: warehouseId || defaultWarehouse?.id || '',
          quantity: new Decimal(0),
          organizationId,
        },
      });
    }

    // Update inventory level
    await client.inventoryLevel.update({
      where: { id: inventoryLevel.id },
      data: {
        quantity: {
          decrement: new Decimal(quantity),
        },
      },
    });

    // Create movement record
    await client.inventoryMovement.create({
      data: {
        itemId,
        warehouseId: inventoryLevel.warehouseId,
        quantity: new Decimal(quantity),
        type: 'delivery_challan',
        movementType: 'OUT',
        reference,
        organizationId,
      },
    });

    // Keep the item total (Item.currentStock, what /items shows) in step with the warehouse level
    await client.item.updateMany({
      where: { id: itemId, organizationId },
      data: { currentStock: { decrement: quantity } },
    });
  }

  private async increaseInventory(
    organizationId: string,
    itemId: string,
    quantity: number,
    warehouseId: string | null | undefined,
    reference: string,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    assertWholeUnits(quantity);
    const where: Prisma.InventoryLevelWhereInput = { itemId, organizationId };
    if (warehouseId) {
      where.warehouseId = warehouseId;
    }

    let inventoryLevel = await client.inventoryLevel.findFirst({ where });

    if (!inventoryLevel) {
      const defaultWarehouse = await client.warehouse.findFirst({
        where: { organizationId, isDefault: true },
      });

      inventoryLevel = await client.inventoryLevel.create({
        data: {
          itemId,
          warehouseId: warehouseId || defaultWarehouse?.id || '',
          quantity: new Decimal(0),
          organizationId,
        },
      });
    }

    await client.inventoryLevel.update({
      where: { id: inventoryLevel.id },
      data: {
        quantity: {
          increment: new Decimal(quantity),
        },
      },
    });

    await client.inventoryMovement.create({
      data: {
        itemId,
        warehouseId: inventoryLevel.warehouseId,
        quantity: new Decimal(quantity),
        type: 'delivery_challan',
        movementType: 'IN',
        reference,
        organizationId,
      },
    });

    await client.item.updateMany({
      where: { id: itemId, organizationId },
      data: { currentStock: { increment: quantity } },
    });
  }
}

/** Stock is kept in whole units (Item.currentStock is an Int; adjustments accept whole units only). */
function assertWholeUnits(quantity: number): void {
  if (!Number.isInteger(quantity)) {
    throw new BadRequestException(
      `Quantity ${quantity} of a stock-tracked item must be a whole number of units`,
    );
  }
}
