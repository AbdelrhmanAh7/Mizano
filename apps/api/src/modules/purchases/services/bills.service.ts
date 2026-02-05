import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../../prisma/prisma.service';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { BillStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class BillsService {
  constructor(private prisma: PrismaService) {}

  async create(organizationId: string, dto: any) {
    const vendor = await this.prisma.vendor.findFirst({ where: { id: dto.vendorId, organizationId, deletedAt: null } });
    if (!vendor) throw new BadRequestException('Vendor not found');

    let subtotal = 0, taxAmount = 0;
    const lines = dto.lines.map((line: any) => {
      const qty = parseFloat(line.quantity);
      const rate = parseFloat(line.rate);
      const tax = parseFloat(line.taxRate || '0');
      const lineTotal = qty * rate;
      subtotal += lineTotal;
      taxAmount += lineTotal * (tax / 100);
      return { ...line, amount: lineTotal.toFixed(4) };
    });

    return this.prisma.bill.create({
      data: {
        billNumber: dto.billNumber,
        vendorId: dto.vendorId,
        date: new Date(dto.date),
        dueDate: new Date(dto.dueDate),
        subtotal: new Decimal(subtotal),
        taxAmount: new Decimal(taxAmount),
        grandTotal: new Decimal(subtotal + taxAmount),
        balanceDue: new Decimal(subtotal + taxAmount),
        notes: dto.notes,
        projectId: dto.projectId,
        organizationId,
        lines: {
          create: lines.map((line: any) => ({
            itemId: line.itemId,
            accountId: line.accountId,
            description: line.description,
            quantity: new Decimal(line.quantity),
            rate: new Decimal(line.rate),
            taxRate: new Decimal(line.taxRate || '0'),
            amount: new Decimal(line.amount),
          })),
        },
      },
      include: { vendor: { select: { id: true, name: true } }, lines: true },
    });
  }

  async findAll(organizationId: string, query: PaginationDto) {
    const { page = 1, limit = 20, sortBy = 'date', sortOrder = 'desc' } = query;
    const where = { organizationId, deletedAt: null };
    const [bills, total] = await Promise.all([
      this.prisma.bill.findMany({
        where,
        include: { vendor: { select: { id: true, name: true } } },
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.bill.count({ where }),
    ]);
    return { data: bills, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(organizationId: string, id: string) {
    const bill = await this.prisma.bill.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: { vendor: true, lines: true, billAllocations: true },
    });
    if (!bill) throw new NotFoundException('Bill not found');
    return bill;
  }

  async update(organizationId: string, id: string, dto: any) {
    const bill = await this.prisma.bill.findFirst({ where: { id, organizationId, deletedAt: null } });
    if (!bill) throw new NotFoundException('Bill not found');
    if (bill.status !== 'DRAFT') throw new BadRequestException('Only draft bills can be updated');
    return this.prisma.bill.update({ where: { id }, data: dto });
  }

  async updateBalanceDue(billId: string) {
    const bill = await this.prisma.bill.findUnique({
      where: { id: billId },
      include: { billAllocations: true },
    });
    if (!bill) return;

    const totalPayments = bill.billAllocations.reduce((sum, a) => sum + parseFloat(a.amount.toString()), 0);
    const balanceDue = parseFloat(bill.grandTotal.toString()) - totalPayments;
    let status = bill.status;
    if (balanceDue <= 0) status = BillStatus.PAID;
    else if (totalPayments > 0) status = BillStatus.PARTIALLY_PAID;

    await this.prisma.bill.update({ where: { id: billId }, data: { balanceDue: new Decimal(Math.max(0, balanceDue)), status } });
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async markOverdueBills() {
    const today = new Date();
    await this.prisma.bill.updateMany({
      where: { status: { in: [BillStatus.OPEN, BillStatus.PARTIALLY_PAID] }, dueDate: { lt: today }, deletedAt: null },
      data: { status: BillStatus.OVERDUE },
    });
  }
}
