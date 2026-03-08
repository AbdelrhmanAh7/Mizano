import { Prisma } from '@prisma/client';
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ChallanStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
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
    // Validate customer
    const customer = await this.prisma.customer.findFirst({
      where: { id: dto.customerId, organizationId, deletedAt: null },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    // Validate invoice if provided
    if (dto.invoiceId) {
      const invoice = await this.prisma.invoice.findFirst({
        where: { id: dto.invoiceId, organizationId, deletedAt: null },
      });
      if (!invoice) {
        throw new NotFoundException('Invoice not found');
      }
    }

    // Validate items
    for (const line of dto.lines) {
      const item = await this.prisma.item.findFirst({
        where: { id: line.itemId, organizationId, deletedAt: null },
      });
      if (!item) {
        throw new NotFoundException(`Item ${line.itemId} not found`);
      }
    }

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

    // Update lines if provided
    if (dto.lines) {
      // Delete existing lines
      await this.prisma.deliveryChallanLine.deleteMany({
        where: { challanId: id },
      });
    }

    return this.prisma.deliveryChallan.update({
      where: { id },
      data: {
        customerId: dto.customerId,
        invoiceId: dto.invoiceId,
        challanType: dto.challanType,
        date: dto.date ? new Date(dto.date) : undefined,
        notes: dto.notes,
        ...(dto.lines && {
          lines: {
            create: dto.lines.map((line) => ({
              itemId: line.itemId,
              quantity: new Decimal(line.quantity),
              description: line.description,
              warehouseId: line.warehouseId,
            })),
          },
        }),
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
    const challan = await this.findOne(organizationId, id);

    if (challan.status !== ChallanStatus.DRAFT) {
      throw new BadRequestException('Only draft challans can be issued');
    }

    // Check inventory availability for tracked items
    for (const line of challan.lines) {
      const item = await this.prisma.item.findUnique({
        where: { id: line.itemId },
      });

      if (item?.trackInventory) {
        const warehouseId = line.warehouseId;
        const currentStock = await this.getItemStock(line.itemId, warehouseId);

        if (currentStock < parseFloat(line.quantity.toString())) {
          throw new BadRequestException(
            `Insufficient stock for item ${line.item?.name || line.itemId}. Available: ${currentStock}, Required: ${line.quantity}`,
          );
        }
      }
    }

    // Decrease inventory
    for (const line of challan.lines) {
      const item = await this.prisma.item.findUnique({
        where: { id: line.itemId },
      });

      if (item?.trackInventory) {
        await this.decreaseInventory(
          organizationId,
          line.itemId,
          parseFloat(line.quantity.toString()),
          line.warehouseId,
          `Delivery Challan ${challan.challanNumber}`,
        );
      }
    }

    // Update status
    return this.prisma.deliveryChallan.update({
      where: { id },
      data: { status: ChallanStatus.ISSUED },
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

  // ============ Mark as Returned (Reverses Inventory) ============

  async markReturned(organizationId: string, id: string) {
    const challan = await this.findOne(organizationId, id);

    if (challan.status !== ChallanStatus.ISSUED) {
      throw new BadRequestException('Only issued challans can be marked as returned');
    }

    // Increase inventory (reverse the decrease)
    for (const line of challan.lines) {
      const item = await this.prisma.item.findUnique({
        where: { id: line.itemId },
      });

      if (item?.trackInventory) {
        await this.increaseInventory(
          organizationId,
          line.itemId,
          parseFloat(line.quantity.toString()),
          line.warehouseId,
          `Return from Delivery Challan ${challan.challanNumber}`,
        );
      }
    }

    // Update status
    return this.prisma.deliveryChallan.update({
      where: { id },
      data: { status: ChallanStatus.RETURNED },
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

  // ============ Helper Methods ============

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

  private async getItemStock(itemId: string, warehouseId?: string | null): Promise<number> {
    const where: Prisma.InventoryLevelWhereInput = { itemId };
    if (warehouseId) {
      where.warehouseId = warehouseId;
    }

    const stock = await this.prisma.inventoryLevel.aggregate({
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
  ) {
    // Find or create inventory level
    const where: Prisma.InventoryLevelWhereInput = { itemId, organizationId };
    if (warehouseId) {
      where.warehouseId = warehouseId;
    }

    let inventoryLevel = await this.prisma.inventoryLevel.findFirst({ where });

    if (!inventoryLevel) {
      // Get default warehouse
      const defaultWarehouse = await this.prisma.warehouse.findFirst({
        where: { organizationId, isDefault: true },
      });

      inventoryLevel = await this.prisma.inventoryLevel.create({
        data: {
          itemId,
          warehouseId: warehouseId || defaultWarehouse?.id || '',
          quantity: new Decimal(0),
          organizationId,
        },
      });
    }

    // Update inventory level
    await this.prisma.inventoryLevel.update({
      where: { id: inventoryLevel.id },
      data: {
        quantity: {
          decrement: new Decimal(quantity),
        },
      },
    });

    // Create movement record
    await this.prisma.inventoryMovement.create({
      data: {
        itemId,
        warehouseId: inventoryLevel.warehouseId,
        quantity: new Decimal(-quantity),
        type: 'delivery_challan',
        movementType: 'OUT',
        reference,
        organizationId,
      },
    });
  }

  private async increaseInventory(
    organizationId: string,
    itemId: string,
    quantity: number,
    warehouseId: string | null | undefined,
    reference: string,
  ) {
    const where: Prisma.InventoryLevelWhereInput = { itemId, organizationId };
    if (warehouseId) {
      where.warehouseId = warehouseId;
    }

    let inventoryLevel = await this.prisma.inventoryLevel.findFirst({ where });

    if (!inventoryLevel) {
      const defaultWarehouse = await this.prisma.warehouse.findFirst({
        where: { organizationId, isDefault: true },
      });

      inventoryLevel = await this.prisma.inventoryLevel.create({
        data: {
          itemId,
          warehouseId: warehouseId || defaultWarehouse?.id || '',
          quantity: new Decimal(0),
          organizationId,
        },
      });
    }

    await this.prisma.inventoryLevel.update({
      where: { id: inventoryLevel.id },
      data: {
        quantity: {
          increment: new Decimal(quantity),
        },
      },
    });

    await this.prisma.inventoryMovement.create({
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
  }
}
